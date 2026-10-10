/* Microphone listening for practice: the whole piano range (A0–C8) and chords.
   pitch(samples, rate) finds the one clearest note (McLeod normalised square difference, computed with
   an FFT so long windows for low notes stay cheap). MicListener follows a performance strike by strike and
   reports the notes the score wants, any wrong note, and when each was struck. Audio is analysed on the
   device and never stored. Shared by the browser and tests. */
(function(root){
'use strict';
const A4=440,LOW=21,HIGH=108;
const freq=m=>A4*2**((m-69)/12);
const twiddles=new Map();
// In-place radix-2 FFT of (re, im); length must be a power of two.
function fft(re,im,inverse=false){
 const n=re.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
 let tw=twiddles.get(n);if(!tw){tw={c:new Float64Array(n/2),s:new Float64Array(n/2)};for(let k=0;k<n/2;k++){tw.c[k]=Math.cos(2*Math.PI*k/n);tw.s[k]=-Math.sin(2*Math.PI*k/n);}twiddles.set(n,tw);}
 const sign=inverse?-1:1;
 for(let len=2;len<=n;len<<=1){const half=len>>1,step=n/len;
  for(let i=0;i<n;i+=len)for(let k=0;k<half;k++){const wr=tw.c[k*step],wi=sign*tw.s[k*step],a=i+k,b=a+half;const xr=re[b]*wr-im[b]*wi,xi=re[b]*wi+im[b]*wr;re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;}}
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
const pow2=n=>{let p=1;while(p<n)p<<=1;return p;};
function rmsOf(samples){let s=0;for(let i=0;i<samples.length;i++)s+=samples[i]*samples[i];return Math.sqrt(s/samples.length);}

// The clearest single pitch in the window, A0–C8, or null.
function pitch(samples,rate,{gate=.006,clarityMin=.72}={}){
 const n=samples.length,rms=rmsOf(samples);if(rms<gate)return null;
 let mean=0;for(let i=0;i<n;i++)mean+=samples[i];mean/=n;
 const size=pow2(2*n),re=new Float64Array(size),im=new Float64Array(size);for(let i=0;i<n;i++)re[i]=samples[i]-mean;
 fft(re,im);for(let i=0;i<size;i++){re[i]=re[i]*re[i]+im[i]*im[i];im[i]=0;}fft(re,im,true);// re[τ] = autocorrelation
 const minLag=Math.max(2,Math.floor(rate/(freq(HIGH)*1.03))),maxLag=Math.min(Math.ceil(rate/(freq(LOW)*.97)),Math.floor(n*.6));
 const nsdf=new Float64Array(maxLag+2);let m=0;for(let i=0;i<n;i++){const x=samples[i]-mean;m+=2*x*x;}
 for(let lag=0;lag<=maxLag+1;lag++){if(lag>0){const a=samples[lag-1]-mean,b=samples[n-lag]-mean;m-=a*a+b*b;}nsdf[lag]=m>0?2*re[lag]/m:0;}
 // Key maxima: the highest point of each positive stretch after the first negative-going crossing.
 const peaks=[];let lag=1;while(lag<maxLag&&nsdf[lag]>0)lag++;
 while(lag<maxLag){while(lag<maxLag&&nsdf[lag]<=0)lag++;let best=-1;while(lag<maxLag&&nsdf[lag]>0){if(lag>=minLag&&(best<0||nsdf[lag]>nsdf[best]))best=lag;lag++;}if(best>0)peaks.push(best);}
 if(!peaks.length)return null;const top=Math.max(...peaks.map(p=>nsdf[p]));if(top<clarityMin)return null;
 const chosen=peaks.find(p=>nsdf[p]>=top*.9);const a=nsdf[chosen-1],b=nsdf[chosen],c=nsdf[chosen+1],d=a-2*b+c,shift=d?Math.max(-1,Math.min(1,(a-c)/(2*d))):0;
 const frequency=rate/(chosen+shift),exact=69+12*Math.log2(frequency/A4),midi=Math.round(exact);
 if(midi<LOW||midi>HIGH||Math.abs(exact-midi)>.4)return null;
 return {midi,frequency,rms,clarity:b};
}

// Piano strings are slightly stiff: upper partials run sharp, more so in the treble.
const stretch=m=>.00012*2**((m-21)/22);
// Pianos are tuned stretched: the bass a little flat, the treble sharp (about +30 cents at the top).
const railsback=m=>m<69?-15*((69-m)/48)**2:30*((m-69)/39)**2;
const partialFreq=(m,k)=>k*freq(m)*2**(railsback(m)/1200)*Math.sqrt(1+stretch(m)*k*k);

/* MicListener: listens strike by strike, the way a piano sounds.
   1. Strikes: a sudden rise across the frequencies that are sounding (checked every ~11 ms, against the
      room's own noise, so loud and quiet rooms behave alike).
   2. About 0.1 s after a strike (longer in the bass, or as soon as the next strike comes) it compares the
      spectrum of the stretch just after the strike with the stretch just before it. Only what got louder is
      new; notes still ringing (or held with the pedal) cancel out, and a swell of ringing strings is too
      little to count as a strike.
   3. In that new sound it checks the notes the score wants now, highest first, each removing the partials it
      explains. A note must show its own partials: a note an octave or a twelfth too low (whose overtones look
      like the wanted note) and a note only on the even partials (an octave too high) do not count. Then the
      next group's notes (a quick next note or grace note in the same strike), then any other clear note,
      which is a wrong note.
   4. A note struck again while it rings counts again. Each report says how long ago the strike was, so the
      timing score is measured from the strike, not from when the analysis finished. */
class MicListener{
 constructor(rate,{size=8192,gate=.0003}={}){this.rate=rate;this.size=size;this.gate=gate;
  this.fftSize=pow2(size*2);this.bin=rate/this.fftSize;this.window=hann(size);this.re=new Float64Array(this.fftSize);this.im=new Float64Array(this.fftSize);
  // Strike detection: spectra of 2048 samples every 512 samples (about 11 ms), 80 Hz to 6 kHz.
  this.shortSize=2048;this.hop=512;this.swin=hann(this.shortSize);this.sre=new Float64Array(this.shortSize);this.sim=new Float64Array(this.shortSize);
  this.sLo=Math.floor(80*this.shortSize/rate);this.sHi=Math.ceil(6000*this.shortSize/rate);
  this.layout();
  this.reset();}
 // Partial frequencies (and weights) for every key.
 layout(){this.notes=[];for(let m=LOW;m<=HIGH;m++){const ps=[];for(let k=1;k<=16;k++){const f=partialFreq(m,k);if(f>Math.min(8000,this.rate*.45))break;ps.push({k,f,w:(freq(m)+27)/(k*freq(m)+320)});}this.notes[m]=ps;}}
 reset(){this.held=new Map();this.pending=null;this.recent=new Map();this.lastStrike=null;this.noise=null;this.start=null;this.specs=[];this.flux=[];this.done=null;this.t=0;this.calls=0;this.lastOnset=-1;}
 // Power spectrum of the long window (2.9 Hz bins at 48 kHz).
 spectrum(samples){const {re,im,window,size}=this;re.fill(0);im.fill(0);const start=samples.length-size;for(let i=0;i<size;i++)re[i]=(samples[start+i]||0)*window[i];fft(re,im);const p=new Float64Array(this.fftSize/2);for(let i=0;i<p.length;i++)p[i]=re[i]*re[i]+im[i]*im[i];return p;}
 // Log power (dB) of 2048 samples ending at index `end`, 80 Hz–6 kHz.
 shortSpectrum(samples,end){const {sre,sim,swin,shortSize}=this;sim.fill(0);for(let i=0;i<shortSize;i++)sre[i]=(samples[end-shortSize+i]||0)*swin[i];fft(sre,sim);
  const o=new Float64Array(this.sHi-this.sLo);for(let b=this.sLo;b<this.sHi;b++)o[b-this.sLo]=10*Math.log10(sre[b]*sre[b]+sim[b]*sim[b]+1e-10);return o;}
 /* Strikes in the audio that arrived since the last call (times in seconds). Spectral flux: how much each
    frequency rose above where it (or its neighbour) was ~21 ms before, summed over the frequencies that are
    clearly sounding: within 35 dB of the loudest and well above the room's own noise there (followed per
    frequency, so a quiet piano in a quiet room and a loud one in a noisy room behave the same). A strike is a
    peak of that flux well above its recent typical level. */
 strikes(samples,now){const H=this.hop,N=this.shortSize,end=Math.round(now*this.rate),out=[];if(this.done==null||end-this.done>samples.length)this.done=end-Math.min(samples.length-N,H*4);
  while(this.done+H<=end){this.done+=H;const idx=samples.length-(end-this.done);if(idx<N)continue;const sp=this.shortSpectrum(samples,idx);let rms=0;for(let i=idx-N;i<idx;i++)rms+=samples[i]*samples[i];rms=Math.sqrt(rms/N);
   // room noise per frequency: the lowest level lately (it creeps up 2 dB a second)
   if(!this.noise)this.noise=Float64Array.from(sp);else for(let b=0;b<sp.length;b++)this.noise[b]=Math.min(sp[b],this.noise[b]+.02);
   const top=Math.max(...sp),prev=this.specs.length>=2?this.specs[this.specs.length-2]:null;
   let f=0;if(prev&&rms>this.gate)for(let b=1;b<sp.length-1;b++){if(sp[b]<top-35||sp[b]<this.noise[b]+18)continue;const d=sp[b]-Math.max(prev[b-1],prev[b],prev[b+1]);if(d>2)f+=Math.min(d,30)-2;}
   this.specs.push(sp);if(this.specs.length>3)this.specs.shift();this.flux.push({f:f/100,t:this.done/this.rate-N/this.rate/2});if(this.flux.length>64)this.flux.shift();
   // the previous step is a strike if it is a peak above the threshold
   const n=this.flux.length;if(n<3)continue;const p=this.flux[n-2],hist=this.flux.slice(0,n-2).map(x=>x.f).sort((x,y)=>x-y),med=hist.length?hist[hist.length>>1]:0;
   if(p.f>Math.max(1.5,med*1.5+1.5)&&p.f>=this.flux[n-3].f&&p.f>this.flux[n-1].f&&p.t-this.lastOnset>.05){out.push(p.t);this.lastOnset=p.t;this.lastFlux=p.f/Math.max(1.5,med*1.5+1.5);}}
  return out;}
 // The real peak nearest a frequency in a magnitude spectrum: a local maximum whose (interpolated) frequency
 // lies within `spread` of f. The skirt of a loud neighbouring note does not count.
 peak(mag,f,spread){const bin=this.bin,c=f/bin,a=Math.max(2,Math.floor(c*(1-spread))-2),b=Math.min(mag.length-3,Math.ceil(c*(1+spread))+2);let best=0,at=-1;
  for(let i=a;i<=b;i++){const v=mag[i];if(v<=best||v<mag[i-1]||v<mag[i+1]||v<mag[i-2]||v<mag[i+2])continue;const l=mag[i-1],r=mag[i+1],d=l-2*v+r,x=d?Math.max(-.5,Math.min(.5,(l-r)/(2*d))):0;if(Math.abs((i+x)*bin-f)>f*spread+bin*.5)continue;best=v;at=i;}
  return {value:best,at};}
 // How far a partial may sit from where it should: about 40 cents (a home piano's strings are often that far
 // off), more for high partials and in the bass, whose strings are less regular.
 spreadFor(m,k){return .023+(m<48?.012*(48-m)/27:0)+(k>4?.004*(k-4)*Math.min(1,stretch(m)/.001):0);}
 salience(mag,m){let s=0;for(const p of this.notes[m])s+=p.w*this.peak(mag,p.f,this.spreadFor(m,p.k)).value;return s;}
 // Partial levels of note m in a magnitude spectrum, relative to its loudest peak (`top`).
 partialPeaks(mag,m){return this.notes[m].map(p=>({k:p.k,...this.peak(mag,p.f,this.spreadFor(m,p.k))}));}
 // Which notes were struck, from a spectrum of new sound (magnitudes). Wanted notes are checked first, highest
 // to lowest, each removing what it explains; then the next group's notes; then any other clear note is a
 // candidate wrong note. heard: magnitudes of everything heard after the strike.
 analyse(mag,expected,current=expected,heard=null){const lo=Math.floor(45/this.bin),hi=Math.ceil(5000/this.bin);let top=0;const part=[];for(let i=lo;i<hi;i++){part.push(mag[i]);if(mag[i]>top)top=mag[i];}part.sort((a,b)=>a-b);
  const floor=Math.max(part[Math.floor(part.length*.5)]||0,top*1e-3);if(top<=0)return [];
  const clearAt=x=>x>=Math.max(4*floor,top*.03);const orig=Float64Array.from(mag);
  const found=[];const known=new Set(expected);this.why={};
  // Highest first: an upper note takes its partials, and the lower note keeps its own odd ones. The notes wanted
  // now come first; the next group's notes are then checked on what is left, and must not be overtones of the
  // notes wanted now (found or not).
  const verify=(m,threshold)=>{const ps=this.partialPeaks(mag,m),first=ps.filter(p=>p.k<=6),clear=first.filter(p=>clearAt(p.value));
   const v=k=>ps.find(p=>p.k===k)?.value||0,lowBest=Math.max(v(1),v(2),v(3)),oddBest=Math.max(v(1),v(3),m<45?v(5):0),evenBest=Math.max(v(2),v(4),v(6));
   // Partials that another wanted note also has prove nothing either way: when the note has partials of its own,
   // those must show (a chord's lower note supplies the shared ones). Deep notes have more partials to look at,
   // since the microphone loses their fundamental.
   const now=current.includes(m),others=(now?current:expected).filter(o=>o!==m&&this.notes[o]?.length),near=(p,list)=>list.some(o=>this.notes[o].some(q=>Math.abs(q.f-p.f)/p.f<.015));
   const n=m<45?10:m<57?8:6,shared=p=>near(p,found.map(f=>f.m)),
    own=ps.filter(p=>p.k<=n&&!shared(this.notes[m][p.k-1])),sharing=m<57&&now&&own.length<ps.filter(p=>p.k<=n).length;
   const ownBest=f=>Math.max(0,...own.filter(f).map(p=>p.value));
   // a chord note with low partials of its own (not shared with the other notes) must show at least one of them
   const harmonic=(k,o)=>{const r=k*freq(m)/freq(o),j=Math.round(r);return j>=1&&Math.abs(1200*Math.log2(r/j))<25;},mine=ps.filter(p=>p.k<=4&&!others.some(o=>harmonic(p.k,o))),unproven=m>=57&&others.length&&mine.length&&mine.length<4&&!mine.some(p=>clearAt(p.value)&&p.value>=top*threshold*.5);
   const why=sharing?(own.filter(p=>clearAt(p.value)).length<Math.min(2,own.length)?'partials':ownBest(()=>true)<top*threshold*.5?'weak'
     :ownBest(p=>p.k%2)<Math.max(top*.04,ownBest(p=>p.k%2===0)*.12)?'even-only':this.undertone(orig,m,current.includes(m)?new Set(current):known)?'undertone':'')
    :clear.length<Math.min(2,first.length)?'partials':lowBest<top*threshold?'weak'
    // a note an octave above sounds only on the even partials: the fundamental or the third must be there too
    :oddBest<Math.max(top*.04,evenBest*.12)?'even-only'
    // and the note must not be an overtone of a lower note that was struck instead (octave, twelfth, two octaves)
    :this.undertone(orig,m,current.includes(m)?new Set(current):known)?'undertone':unproven?'shared':'';const ok=!why;if(this.debug)this.debug[m]=why||'ok';this.why[m]=why;
   if(ok){found.push({m,expected:true,strength:Math.max(lowBest,...own.map(p=>p.value))/top,shared:sharing});this.remove(mag,m);}
};
  for(const m of [...current].sort((a,b)=>b-a))if(this.notes[m]?.length)verify(m,m>=96?.03:.1);
  // An upper note on a harmonic of a lower found note (an octave, a twelfth…) must stand clearly above that
  // note's neighbouring harmonics, or it is only the lower note's overtone.
  for(const f of [...found]){const m=f.m,f0=this.notes[m][0].f,at=this.peak(orig,f0,.023).value;
   for(const g of found){if(g.m>=m||g.shared)continue;const r=f0/this.notes[g.m][0].f,j=Math.round(r);if(j<2||Math.abs(r-j)/j>.03)continue;
    const h=k=>this.notes[g.m][k-1]?this.peak(orig,this.notes[g.m][k-1].f,this.spreadFor(g.m,k)).value:0;const ref=j===2?Math.max(h(3),h(5)*1.5):Math.max(h(j-1),h(j+1));
    if(at<ref*.5){found.splice(found.indexOf(f),1);break;}}}
  const overtone=m=>current.some(c=>this.notes[c].some(q=>Math.abs(q.f-this.notes[m][0].f)/q.f<.02));
  for(const m of expected.filter(x=>!current.includes(x)).sort((a,b)=>b-a))if(this.notes[m]?.length&&!overtone(m))verify(m,.25);
  // A wanted note taken for an overtone of a lower note can be cleared by the next notes found in the same strike
  // (a quick grace note or chord right after explains those partials).
  const soon=found.filter(f=>!current.includes(f.m)).map(f=>f.m);
  if(soon.length)for(const m of current)if(this.why?.[m]==='undertone'&&!this.undertone(orig,m,new Set(current),[...current,...soon])){if(this.debug)this.debug[m]='ok';found.push({m,expected:true,strength:this.peak(orig,freq(m),.023).value/top});this.remove(mag,m);}
  // Other notes: only clear, harmonic ones count as wrong notes.
  const explained=f0=>found.some(f=>this.notes[f.m].length&&Array.from({length:24},(_,i)=>partialFreq(f.m,i+1)).some(x=>Math.abs(x-f0)/f0<.015));
  for(let round=0;round<3;round++){let best=-1,bestS=0;for(let m=LOW;m<=HIGH;m++){if(known.has(m)||found.some(f=>f.m===m))continue;const sal=this.salience(mag,m);if(sal>bestS){bestS=sal;best=m;}}if(best<0)break;
   const ps=this.partialPeaks(mag,best),need=ps.slice(0,3);
   // its fundamental must be a real peak of what is heard, not the edge of a note that changed loudness
   const real=!heard||ps.slice(0,2).every(p=>{const h=this.peak(heard,this.notes[best][p.k-1].f,this.spreadFor(best,p.k));return h.at>=0&&Math.abs(h.at-p.at)<=1;});
   if(!(ps[0].value>=top*.3&&need.every(p=>clearAt(p.value))&&!explained(freq(best))&&real))break;
   found.push({m:best,expected:false,strength:ps[0].value/top});this.remove(mag,best);}
  return found;}
 // Was a lower note u (an octave, a twelfth or two octaves below m) struck, rather than m? u shows on its own
 // partials that m cannot explain (for an octave: f/2 and 3f/2).
 undertone(mag,m,known,cover=known){const base=this.peak(mag,freq(m),.012).value||Math.max(...this.partialPeaks(mag,m).slice(0,3).map(p=>p.value));if(!base)return false;
  const others=[...cover].filter(x=>x!==m),covered=(f,list)=>list.some(o=>{for(let k=1;k<=24;k++){const x=partialFreq(o,k);if(x>f*1.03)return false;if(Math.abs(x-f)/f<.012)return true;}return false;});
  for(const [d,r] of [[12,2],[19,3],[24,4]]){const u=m-d;if(u<LOW||known.has(u))continue;const o2=others.filter(x=>x!==u);
   // u's own partials (not shared with m, not explained by another expected note); its fundamental (or, deep in
   // the bass, its third partial) must be among them
   const own=this.notes[u].slice(0,8).filter(q=>q.k%r!==0&&!covered(q.f,o2)).map(q=>({k:q.k,v:this.peak(mag,q.f,.012).value}));
   const strong=own.filter(q=>q.v>=base*.3);if(strong.length>=2&&strong.some(q=>q.k<=3))return true;
   // an octave below shows its own fundamental clearly (its odd partials can be faint)
   if(r===2&&own.some(q=>q.k===1&&q.v>=base*.3))return true;}
  return false;}
 // Take a found note's partials out of the spectrum, keeping what is louder than its smooth partial envelope
 // (that excess belongs to another note on the same frequency).
 remove(mag,m){const ps=this.notes[m],amp=ps.map(p=>this.peak(mag,p.f,this.spreadFor(m,p.k)));
  for(let i=0;i<ps.length;i++){const a=amp[i].value;if(!a)continue;const nb=[amp[i-1]?.value,amp[i+1]?.value].filter(x=>x!==undefined);const smooth=nb.length?Math.min(a,Math.max(...nb)*3):a;const keep=i===0?0:Math.max(0,a-smooth),scale=keep/a;
   // the whole peak, down both of its slopes (a short window makes peaks wide)
   const c=amp[i].at;let lo=c,hi=c;while(lo>1&&c-lo<12&&mag[lo-1]<=mag[lo]&&mag[lo-1]>0)lo--;while(hi<mag.length-2&&hi-c<12&&mag[hi+1]<=mag[hi]&&mag[hi+1]>0)hi++;
   for(let j=Math.max(0,Math.min(lo,c-2));j<=Math.min(mag.length-1,Math.max(hi,c+2));j++)mag[j]*=scale;}}
 level(power,m){let e=0;for(const p of this.notes[m].slice(0,4))e+=this.peak(power,p.f,this.spreadFor(m,p.k)).value;return 10*Math.log10(e+1e-14);}
 // Power spectrum of `len` samples starting at `from` (Hann window of that length, same bins as spectrum()).
 segment(samples,from,len){const {re,im}=this;re.fill(0);im.fill(0);len=Math.min(len,this.fftSize);const w=this.hannCache||(this.hannCache=new Map());let win=w.get(len);if(!win){win=hann(len);w.set(len,win);}
  for(let i=0;i<len;i++)re[i]=(samples[from+i]||0)*win[i];fft(re,im);const p=new Float64Array(this.fftSize/2);for(let i=0;i<p.length;i++)p[i]=re[i]*re[i]+im[i]*im[i];return p;}
 // The exact sample where a strike begins, near index `guess`: the steepest rise of energy in 2.5 ms blocks.
 strikeAt(samples,guess,after=0){const b=Math.round(this.rate*.0025),from=Math.max(b*5,after,guess-Math.round(this.rate*.03)),to=Math.min(samples.length-b,guess+Math.round(this.rate*.03));let best=-1,at=guess;if(from>=to)return Math.max(guess,after);
  const e=i=>{let s=0;for(let j=i;j<i+b;j++){const d=samples[j]-(samples[j-1]||0);s+=d*d;}return s;};
  for(let i=from;i<to;i+=b){const prev=(e(i-b)+e(i-2*b)+e(i-3*b)+e(i-4*b))/4+1e-12,cur=e(i)+e(i+b);const r=cur/prev;if(r>best){best=r;at=i;}}return at;}
 // Spectra of equal stretches just before and just after a strike at sample `at` (after starts 4 ms in, past
 // the hammer). Short stretches keep the notes that were already sounding out of the new sound, and starting
 // at the strike keeps the spectrum clean, so a neighbouring key is not confused with the played one.
 strikeSpectra(samples,at,len){const skip=Math.round(this.rate*.004);len=Math.max(256,Math.min(len,samples.length-at-skip,at));
  // Spectra are scaled to their window, so a steady note has the same peak in each. "Before" takes, frequency by
  // frequency, the lower of the whole stretch and its last half: a note fading out (its key let go) counts at
  // the level it has fallen to by the strike.
  const half=len>>1,before=this.segment(samples,at-len,len),last=this.segment(samples,at-half,half),after=this.segment(samples,at+skip,len);
  const gb=(len/2)**2,gh=(half/2)**2;for(let i=0;i<before.length;i++){const x=before[i]/gb,y=last[i]/gh;before[i]=Math.min(x,y);after[i]/=gb;}return {before,after,len};}
 // One analysis step. samples: the latest audio (at least `size` samples; more lets the analysis look further
 // back); expected: MIDI notes the score wants now; t: the audio time of the end of the samples in seconds;
 // upcoming: the notes of the next group (and of any group right after it), so a quick next note or a grace
 // note heard in the same strike counts, in order.
 // Each event is [note, on, ago]: ago is how many seconds before t the note was struck.
 frame(samples,expected=[],t,upcoming=[]){this.calls++;const now=t??this.calls*.045;this.t=now;
  const out={events:[],heard:[],pitch:null,rms:rmsOf(samples.subarray(samples.length-2048))};const want=[...new Set(expected)].filter(m=>m>=LOW&&m<=HIGH);
  const next=[...new Set(upcoming)].filter(m=>m>=LOW&&m<=HIGH);const power=this.spectrum(samples);
  // 1 · strikes; each one is analysed when the next arrives or about 0.1 s after it (longer in the bass)
  // (the first moments only learn the room: a microphone switching on is no strike)
  if(this.start==null)this.start=now;const found=this.strikes(samples,now).filter(at=>at>this.start);
  for(const at of found){let want2=want;if(this.pending){const n=out.events.length;this.resolve(this.pending,samples,now,want,out,next,at,power);
    // notes this strike just answered are no longer wanted from the next one (the score moves on)
    const got=new Set(out.events.slice(n).filter(e=>e[1]).map(e=>e[0]));want2=want.filter(m=>!got.has(m));}
   this.pending={t:at,want:want2,next,flux:this.lastFlux};}
  if(this.pending){const p=this.pending,low=Math.min(...p.want,...want,108),wait=low<45?.16:low<57?.12:.1;if(now-p.t>=wait+.004){this.resolve(p,samples,now,want,out,next,null,power);this.pending=null;}}
  // 2 · notes fade: a held note ends when it has fallen far below its strike (or the room goes quiet)
  const loud=out.rms>this.gate;
  for(const [m,h] of this.held){const lv=this.level(power,m);if(!loud||lv<h.level-20||now-h.t>6){this.held.delete(m);out.events.push([m,false,0]);}}
  out.heard=[...this.held.keys()];return out;}
 // Which notes a strike holds. before/after: power spectra just before and just after the strike;
 // expected: the notes wanted now; ahead: the next group's notes; young: notes struck so shortly before that
 // they are still starting; ringing: notes played in the last moments (they may swell, not wrong notes).
 judge(before,after,expected,ahead=[],young=[],ringing=[],strength=1){const n=after.length,mag=new Float64Array(n);let fresh=0,all=0;
  // New sound: what got at least twice as loud (3 dB) as just before the strike. Ringing notes that swell a
  // little (their strings beat) stay out.
  for(let i=0;i<n;i++){const d=after[i]-before[i]*2;mag[i]=d>0?Math.sqrt(d):0;fresh+=d>0?d:0;all+=after[i];}
  // A strike brings plenty of new sound: in the octave where the struck note is loudest, most of the sound is
  // new (a ringing string that swells brings only a little). Too little is no strike; a wrong note needs a clear one.
  // `strength`: how far the strike stood out when it was detected (1 = just at the threshold).
  let share=0;for(let lo=80;lo<6000;lo*=2){const a=Math.round(lo/this.bin),b=Math.min(n,Math.round(lo*2/this.bin));let fb=0,ab=0;for(let i=a;i<b;i++){const d=after[i]-before[i]*2;if(d>0)fb+=d;ab+=after[i];}if(ab>=all*.01)share=Math.max(share,fb/ab);}
  this.lastFresh=share;const clear=share*Math.sqrt(Math.min(4,strength));if(clear<.3)return {ok:[],wrong:[]};
  // A wanted note played again a moment ago (its damper was still stopping it just before): any growth counts.
  for(const m of expected)if(ringing.includes(m)&&!young.includes(m))for(const q of this.notes[m].slice(0,8)){const c=Math.round(q.f/this.bin),w=Math.ceil(q.f*.012/this.bin)+2;for(let j=Math.max(0,c-w);j<=Math.min(n-1,c+w);j++){const d=after[j]-before[j]*1.2;mag[j]=Math.max(mag[j],d>0?Math.sqrt(d):0);}}
  for(const m of young)for(const q of this.notes[m]){const c=Math.round(q.f/this.bin),w=Math.ceil(q.f*this.spreadFor(m,q.k)/this.bin)+2;for(let j=Math.max(0,c-w);j<=Math.min(n-1,c+w);j++)mag[j]=0;}
  ahead=ahead.filter(m=>!expected.includes(m));
  const found=this.analyse(mag,[...expected,...ahead],expected,after.map(Math.sqrt)),ok=found.filter(f=>f.expected);
  const wrong=share<.45?[]:found.filter(f=>!f.expected&&
   // an overtone or undertone of a struck expected note is not a separate note
   !(ok.some(o=>[12,19,24,28,31,36,-12,-19,-24].includes(f.m-o.m))&&f.strength<.7)&&
   // nor is a note played a moment ago that is still sounding
   !(ringing.includes(f.m)&&f.strength<.6));
  // the notes of the current group first, then those of the next one
  return {ok:[...ok.filter(f=>expected.includes(f.m)),...ok.filter(f=>!expected.includes(f.m)).sort((x,y)=>ahead.indexOf(x.m)-ahead.indexOf(y.m))],wrong};}
 // Judge a pending strike. `cut`: the time the next strike began (the stretch after this one must end there).
 resolve(p,samples,now,want,out,next=[],cut=null,power=null){
  // the exact start, not earlier than just after the previous strike
  const end=samples.length,guess=end-Math.round((now-p.t)*this.rate),prev=this.lastStrike!=null?end-Math.round((now-this.lastStrike-.02)*this.rate):0,at=this.strikeAt(samples,guess,prev),t=now-(end-at)/this.rate;
  const avail=end-at-Math.round(this.rate*.004)-(cut!=null?Math.max(0,Math.round((now-cut)*this.rate)):0);
  // the stretch before the strike starts after the previous strike's attack, so that note is already whole in it
  const since=this.lastStrike!=null?t-this.lastStrike:9,room=Math.round(Math.max(.04,since-.015)*this.rate);
  const {before,after,len}=this.strikeSpectra(samples,at,Math.min(avail,room,Math.round(this.rate*.16)));this.lastStrike=t;
  const expected=[...new Set([...p.want,...want])],ahead=[...new Set([...(p.next||[]),...next])];
  // notes struck so shortly before that they are still starting in that stretch are left out
  const young=[...this.recent].filter(([,s])=>t-s<Math.max(.1,len/this.rate+.008)&&t-s>=0).map(([m])=>m),ringing=[...this.recent].filter(([,s])=>now-s<1.5).map(([m])=>m);
  const {ok,wrong}=this.judge(before,after,expected,ahead,young,ringing,p.flux??1);const ago=Math.max(0,now-t);
  // Wrong notes go first, so a wrong note can never be taken for the next note of the score.
  for(const f of wrong)out.events.push([f.m,true,ago],[f.m,false,ago]);
  for(const f of ok){if(this.held.has(f.m)){out.events.push([f.m,false,ago]);this.held.delete(f.m);}out.events.push([f.m,true,ago]);this.held.set(f.m,{t,level:this.level(power||this.spectrum(samples),f.m)});this.recent.set(f.m,t);}
 }

}
function hann(n){const w=new Float64Array(n);for(let i=0;i<n;i++)w[i]=.5-.5*Math.cos(2*Math.PI*i/(n-1));return w;}
const api={fft,pitch,MicListener,freq,range:[LOW,HIGH]};
if(typeof module!=='undefined')module.exports=api;else root.PianoListen=api;
})(typeof window!=='undefined'?window:globalThis);
