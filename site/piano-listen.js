/* Microphone listening for practice: the whole piano range (A0–C8) and chords.
   pitch(samples, rate) finds the one clearest note (McLeod normalised square difference, computed with
   an FFT so long windows for low notes stay cheap). MicListener follows a performance strike by strike and
   reports the notes the score wants, any wrong note, and when each was struck. Audio is analysed on the
   device and never stored. Shared by the browser and tests. */
(function(root){
'use strict';
const A4=440,LOW=21,HIGH=108;
// Mistake checks: a neighbouring key wins when its partials explain RIVAL_RATIO times more of the new sound (and at
// least RIVAL_MIN of its loudest peak); a note's odd partials are missing below ODD_MISSING of its even ones, judged
// only where they were below ODD_QUIET of them before the strike.
// A note below C5 whose own even partials are new while every free odd one stays under ODD_GONE of them was struck an
// octave too high; odd peaks more than ODD_CENTS off are strays, and only odd partials quieter than ODD_PRIOR of the
// loudest new sound before the strike can be told missing.
const RIVAL_MIN=.8,RIVAL_RATIO=3,ODD_MISSING=.08,ODD_QUIET=.3,ODD_GONE=.1,ODD_CENTS=20,ODD_PRIOR=.05;
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
const partialFreq=(m,k,cents=0)=>k*freq(m)*2**((railsback(m)+cents)/1200)*Math.sqrt(1+stretch(m)*k*k);

/* MicListener: listens strike by strike, the way a piano sounds.
   1. Strikes: a sudden rise across the frequencies that are sounding, or on the partials of the notes the
      score wants (a soft note over loud ringing ones), checked every ~11 ms against the room's own noise, so
      loud and quiet rooms behave alike. A key let go is no strike. A peak that nearly reaches the threshold still
      counts if a wanted note is plainly new in it (a soft note under the pedal).
   2. About 0.1 s after a strike (longer in the bass, or as soon as the next strike comes) it compares the
      spectrum of the stretch just after the strike with the stretch just before it. Only what got louder is
      new; notes still ringing (or held with the pedal) cancel out, and a swell of ringing strings is too
      little to count as a strike.
   3. In that new sound it checks the notes the score wants now, highest first, each removing the partials it
      explains. A note must show its own partials: a note an octave or a twelfth too low (whose overtones look
      like the wanted note) and a note only on the even partials (an octave too high) do not count. Then the
      next group's notes (a quick next note or grace note in the same strike), then any other clear note,
      which is a wrong note. High notes have almost no overtones, and a real string's fundamental is often weak
      or split by beating, so neither is required on its own.
   Tested on recorded single notes of several real pianos (a Steinway, a Yamaha grand, sampled grands) and on
   concert recordings with exact MIDI.
   4. A note struck again while it rings counts again; a note already reported for the same wanted notes and still
      held is not reported again from a later strike (it is the string still sounding). Each report says how long
      ago the strike was, so the timing score is measured from the strike, not from when the analysis finished. */
class MicListener{
 constructor(rate,{size=8192,gate=.0003}={}){this.rate=rate;this.size=size;this.gate=gate;
  this.fftSize=pow2(size*2);this.bin=rate/this.fftSize;this.window=hann(size);this.re=new Float64Array(this.fftSize);this.im=new Float64Array(this.fftSize);
  // Strike detection: spectra of 2048 samples every 512 samples (about 11 ms), 80 Hz to 6 kHz.
  this.shortSize=2048;this.hop=512;this.swin=hann(this.shortSize);this.sre=new Float64Array(this.shortSize);this.sim=new Float64Array(this.shortSize);
  this.sLo=Math.floor(80*this.shortSize/rate);this.sHi=Math.ceil(6000*this.shortSize/rate);
  this.tune=0;this.tunes=[];this.flips=0;this.slips={down:0,up:0};this.layout();
  this.reset();}
 // Partial frequencies (and weights) for every key.
 layout(){this.notes=[];for(let m=LOW;m<=HIGH;m++){const ps=[];for(let k=1;k<=16;k++){const f=partialFreq(m,k,this.tune);if(f>Math.min(8000,this.rate*.45))break;ps.push({k,f,w:(freq(m)+27)/(k*freq(m)+320)});}this.notes[m]=ps;}}
 reset(){this.reported=new Map();this.wantLog=[];this.soundNow=[];this.swell=[];this.inst=0;this.wantKey=null;this.wantRef=null;this.info=new Map();this.cand=null;this.lastAny=null;this.lastStrong=0;this.held=new Map();this.pending=null;this.recent=new Map();this.lastStrike=null;this.noise=null;this.start=null;this.specs=[];this.flux=[];this.done=null;this.t=0;this.calls=0;this.lastOnset=-1;}
 // Power spectrum of the long window (2.9 Hz bins at 48 kHz).
 spectrum(samples){const {re,im,window,size}=this;re.fill(0);im.fill(0);const start=samples.length-size;for(let i=0;i<size;i++)re[i]=(samples[start+i]||0)*window[i];fft(re,im);const p=new Float64Array(this.fftSize/2);for(let i=0;i<p.length;i++)p[i]=re[i]*re[i]+im[i]*im[i];return p;}
 // Log power (dB) of 2048 samples ending at index `end`, 80 Hz–6 kHz.
 shortSpectrum(samples,end){const {sre,sim,swin,shortSize}=this;sim.fill(0);for(let i=0;i<shortSize;i++)sre[i]=(samples[end-shortSize+i]||0)*swin[i];fft(sre,sim);
  const o=new Float64Array(this.sHi-this.sLo);for(let b=this.sLo;b<this.sHi;b++)o[b-this.sLo]=10*Math.log10(sre[b]*sre[b]+sim[b]*sim[b]+1e-10);return o;}
 /* Strikes in the audio that arrived since the last call (times in seconds). Spectral flux: how much each
    frequency rose above where it (or its neighbour) was ~21 ms before, summed over the frequencies that are
    clearly sounding: within 45 dB of the loudest and well above the room's own noise there (followed per
    frequency, so a quiet piano in a quiet room and a loud one in a noisy room behave the same). A strike is a
    peak of that flux well above its recent typical level. */
 strikes(samples,now,focus=[]){const H=this.hop,N=this.shortSize,end=Math.round(now*this.rate),out=[];if(this.done==null||end-this.done>samples.length)this.done=end-Math.min(samples.length-N,H*4);
  while(this.done+H<=end){this.done+=H;const idx=samples.length-(end-this.done);if(idx<N)continue;const sp=this.shortSpectrum(samples,idx);let rms=0;for(let i=idx-N;i<idx;i++)rms+=samples[i]*samples[i];rms=Math.sqrt(rms/N);
   // room noise per frequency: the lowest level lately (it creeps up 2 dB a second)
   if(!this.noise)this.noise=Float64Array.from(sp);else for(let b=0;b<sp.length;b++)this.noise[b]=Math.min(sp[b],this.noise[b]+.02);
   const top=Math.max(...sp),prev=this.specs.length>=2?this.specs[this.specs.length-2]:null;
   let f=0;if(prev&&rms>this.gate)for(let b=1;b<sp.length-1;b++){if(sp[b]<top-45||sp[b]<this.noise[b]+18)continue;const d=sp[b]-Math.max(prev[b-1],prev[b],prev[b+1]);if(d>2)f+=Math.min(d,30)-2;}
   // and how much the partials of the notes the score wants now (or next) rose: a soft note over loud ringing
   // ones barely moves the whole spectrum, but its own partials jump
   let g=0;if(prev&&rms>this.gate)for(const m of focus){let s=0,n=0;for(const q of this.notes[m].slice(0,6)){const b=Math.round(q.f*N/this.rate)-this.sLo;if(b<1||b>=sp.length-1)continue;if(sp[b]<this.noise[b]+12||sp[b]<top-35)continue;const d=sp[b]-Math.max(prev[b-1],prev[b],prev[b+1]);if(d>5){s+=Math.min(d,24)-5;n++;}}if(n>=(m>=72?1:2))g=Math.max(g,s);}
   this.specs.push(sp);if(this.specs.length>3)this.specs.shift();this.flux.push({f:f/100,g:g/10,t:this.done/this.rate-N/this.rate/2});if(this.flux.length>64)this.flux.shift();
   // the previous step is a strike if it is a peak above the threshold
   // (in the first quarter second the room's noise is not known yet: only a clear strike counts)
   const n=this.flux.length;if(n<3)continue;const early=n<24;const p=this.flux[n-2],hist=this.flux.slice(0,n-2).map(x=>x.f).sort((x,y)=>x-y),med=hist.length?hist[hist.length>>1]:0;
   // a strike: a peak well above the recent typical change (`strength` is how far above); the threshold follows the
   // lower third of the recent change, since in a quick passage the strikes themselves fill the middle of it
   const low=hist.length?hist[Math.floor(hist.length*.3)]:0,ref=Math.max(1.5,med*1.5+1.5),thr=Math.max(.5,low*3+.3),hg=this.flux.slice(0,n-2).map(x=>x.g).sort((x,y)=>x-y),mg=hg.length?hg[hg.length>>1]:0,thg=Math.max(1.2,mg*1.5+1);
   p.thr=thr;p.thg=thg;
   const peakF=p.f>=this.flux[n-3].f&&p.f>this.flux[n-1].f,peakG=p.g>=this.flux[n-3].g&&p.g>this.flux[n-1].g,byAll=p.f>thr&&peakF,byNote=p.g>thg&&peakG;
   // a faint peak (over 60% of the threshold) may be a soft note under the pedal: it counts only if a wanted note
   // is plainly new in it (judge)
   const faint=!byAll&&!byNote&&(p.f>thr*.6&&peakF||p.g>thg*.6&&peakG);
   // (right after a strike its slower low partials still swell: a weak rise then is no new strike, a far stronger one is)
   const sinceLast=p.t-this.lastOnset,strong=Math.max(p.f/ref,p.g/thg);
   // A weak or faint strike waits 80 ms: a far stronger one right after it is the real strike and replaces it (its
   // notes must not be judged on a cut-short stretch). Each strike keeps the notes wanted when it was heard.
   const emit=s=>{out.push(s.t);this.lastAny=s.t;this.info.set(s.t,s);};if(this.cand&&p.t-this.cand.t>.08){emit(this.cand);this.cand=null;}
   if((byAll||byNote)&&(sinceLast>.06&&(sinceLast>.08||strong>1.6)||sinceLast>.035&&strong>Math.max(3,4*this.lastStrong))&&(!early||strong>3)){
    const c=this.cand;if(c&&!c.faint&&!(strong>Math.max(3,4*c.flux)))emit(c);this.cand=null;
    this.lastOnset=p.t;this.lastStrong=strong;const s={t:p.t,flux:strong,byNote:!byAll,want:this.curWant,next:this.curNext};if(strong<1.6)this.cand=s;else emit(s);}
   else if(faint&&!this.cand&&p.t-(this.lastAny??-1)>.1&&!early)this.cand={t:p.t,flux:strong,byNote:true,faint:true,want:this.curWant,next:this.curNext};}
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
 analyse(mag,expected,current=expected,heard=null,ringing=[]){this.ringingNow=ringing;const lo=Math.floor(45/this.bin),hi=Math.ceil(5000/this.bin);let top=0;const part=[];for(let i=lo;i<hi;i++){part.push(mag[i]);if(mag[i]>top)top=mag[i];}part.sort((a,b)=>a-b);
  // a partial must stand out from the new sound and from everything heard (the room's noise and echo)
  let hf=0;if(heard){const hp=[];for(let i=lo;i<hi;i++)hp.push(heard[i]);hp.sort((a,b)=>a-b);hf=hp[hp.length>>1]||0;}
  const floor=Math.max(part[Math.floor(part.length*.5)]||0,top*1e-3,hf*1.5);if(top<=0)return [];
  const clearAt=x=>x>=Math.max(4*floor,top*.03);const orig=Float64Array.from(mag);
  const found=[];const known=new Set(expected);this.why={};
  // notes wanted a moment ago, not now: still sounding, they may swell (see undertone)
  this.swell=this.soundNow.filter(r=>!known.has(r));
  // Highest first: an upper note takes its partials, and the lower note keeps its own odd ones. The notes wanted
  // now come first; the next group's notes are then checked on what is left, and must not be overtones of the
  // notes wanted now (found or not).
  // a peak found for a partial of m that sits nearer a partial of another wanted note belongs to that note
  const nearer=(m,k,at)=>{if(at<0)return false;const f=at*this.bin,d=Math.abs(this.notes[m][k-1].f-f);return current.some(o=>o!==m&&this.notes[o]?.some(x=>x.k<=8&&Math.abs(x.f-f)<d&&Math.abs(x.f-this.notes[m][k-1].f)/x.f>.006));};
  const verify=(m,threshold)=>{const ps=this.partialPeaks(mag,m).map(p=>nearer(m,p.k,p.at)?{...p,value:0}:p),first=ps.filter(p=>p.k<=6),clear=first.filter(p=>clearAt(p.value));
   // an odd partial that a note already found also has counts at half its original height (it cannot be told apart)
   const sh=k=>this.notes[m][k-1]&&found.some(f=>this.notes[f.m].some(q=>Math.abs(q.f-this.notes[m][k-1].f)/q.f<.015));
   const v=k=>ps.find(p=>p.k===k)?.value||0,vo=k=>sh(k)?Math.max(v(k),.5*this.peak(orig,this.notes[m][k-1].f,this.spreadFor(m,k)).value):v(k);
   const lowBest=Math.max(v(1),v(2),v(3)),oddBest=Math.max(vo(1),vo(3),vo(5)),evenBest=Math.max(v(2),v(4),v(6));
   // Partials that another wanted note also has prove nothing either way: when the note has partials of its own,
   // those must show (a chord's lower note supplies the shared ones). Deep notes have more partials to look at,
   // since the microphone loses their fundamental.
   const now=current.includes(m),others=(now?current:expected).filter(o=>o!==m&&this.notes[o]?.length),near=(p,list)=>list.some(o=>this.notes[o].some(q=>Math.abs(q.f-p.f)/p.f<.015));
   const n=m<45?10:m<57?8:6,shared=p=>near(p,found.map(f=>f.m)),
    own=ps.filter(p=>p.k<=n&&!shared(this.notes[m][p.k-1])),sharing=now&&own.length<ps.filter(p=>p.k<=n).length;
   const ownBest=f=>Math.max(0,...own.filter(f).map(p=>p.value));
   // a chord note with low partials of its own (not shared with the other notes) must show at least one of them
   const harmonic=(k,o)=>{const r=k*freq(m)/freq(o),j=Math.round(r);return j>=1&&Math.abs(1200*Math.log2(r/j))<25;},mine=ps.filter(p=>p.k<=4&&!others.some(o=>harmonic(p.k,o))),unproven=m>=57&&others.length&&mine.length&&mine.length<4&&!mine.some(p=>clearAt(p.value)&&p.value>=top*threshold*.5);
   // An odd partial shared with another note may be all that keeps the note from looking an octave too high. Then
   // its own odd partials must not be missing: a struck string (not one still ringing) shows its third, or its
   // fundamental where the microphone hears it, wherever no other note sits.
   const rawOdd=Math.max(0,...[1,3,5].filter(k=>!sh(k)).map(v),sharing?ownBest(p=>p.k%2):0),evenRef=sharing?ownBest(p=>p.k%2===0):evenBest,
    octaveUp=()=>now&&rawOdd<Math.max(top*.04,evenRef*.12)&&!(this.ringNow||[]).includes(m)&&this.oddMissing(orig,m,current.filter(o=>o!==m))||oddGone();
   // A struck string sounds its own odd partials (fundamental, third, fifth, seventh) wherever no other wanted note
   // has a partial; the fundamental is looked for more widely, since a real string's often beats and splits.
   const oddGone=()=>{if(!now||m>=72)return false;const oth=current.filter(o=>o!==m),free=f=>!oth.some(o=>this.notes[o].some(x=>Math.abs(x.f-f)<f*.015+18));
    const lv=k=>{const q=this.notes[m][k-1];if(!q||!free(q.f))return null;const w=k===1?.045:this.spreadFor(m,k),p=this.peak(orig,q.f,w);
     return {k,v:p.value,c:p.at>=0?1200*Math.log2(p.at*this.bin/q.f):0,quiet:!this.priorNow||this.peak(this.priorNow,q.f,w).value<top*ODD_PRIOR};};
    const ev=[2,4,6].map(lv).filter(Boolean),e=ev.reduce((a,x)=>x.v>a.v?x:a,{v:0,c:0}),odd=[1,3,5,7].map(lv).filter(Boolean);
    // (an odd peak far both from its place and from where the loudest even partial puts it is a stray)
    const v=x=>x.k>1&&Math.min(Math.abs(x.c),Math.abs(x.c-e.c))>ODD_CENTS?0:x.v;
    return e.v>=top*.1&&odd.every(x=>v(x)<e.v*ODD_GONE)&&odd.filter(x=>x.quiet).length>=2;};
   // A struck string from C3 to B4 sounds several partials: a faint note (under a tenth of the loudest new sound) with at
   // most one partial in reach is a string still ringing or swelling in sympathy (a chord note left out).
   const swell=()=>now&&m>=48&&m<72&&Math.max(lowBest,...own.map(p=>p.value))<top*.1&&first.filter(p=>p.value>=top*.02).length<=1;
   // (below C5 a struck string shows more than its fundamental: a lone fundamental that was already sounding before
   // the strike is a string still ringing, swelling as it beats)
   const p1=ps.find(p=>p.k===1),lone=m<72&&p1&&p1.at>0&&this.priorNow&&Math.max(this.priorNow[p1.at-1],this.priorNow[p1.at],this.priorNow[p1.at+1])>=.5*p1.value&&own.some(p=>p.k===2)&&own.filter(p=>clearAt(p.value)).every(p=>p.k===1)&&Math.max(0,...own.filter(p=>p.k>1&&p.k<=4).map(p=>p.value))<.2*v(1);
   const why=swell()?'weak':sharing?(own.filter(p=>clearAt(p.value)).length<Math.min(m<57?2:1,own.length)||lone?'partials':ownBest(()=>true)<top*threshold*.5?'weak'
     :Math.max(oddBest,ownBest(p=>p.k%2))<Math.max(top*.04,ownBest(p=>p.k%2===0)*.12)||octaveUp()?'even-only':!this.clipNow&&this.undertone(orig,m,current.includes(m)?new Set(current):known,undefined,Math.max(4*floor,top*.03))?'undertone':'')
    // (a soft note can have nearly no overtones: a wanted note's clear, strong fundamental is enough)
    :clear.length<Math.min(m>=72||now&&clearAt(v(1))&&v(1)>=top*.1?1:2,first.length)?'partials':lowBest<top*threshold?'weak'
    // a note an octave above sounds only on the even partials: the fundamental or the third must be there too
    :oddBest<Math.max(top*.04,evenBest*.12)||octaveUp()?'even-only'
    // and the note must not be an overtone of a lower note that was struck instead (octave, twelfth, two octaves)
    :!this.clipNow&&this.undertone(orig,m,current.includes(m)?new Set(current):known,undefined,Math.max(4*floor,top*.03))?'undertone':unproven?'shared'
    // a next-group note must show its own fundamental or octave (not only higher partials, which a played note may own)
    :!now&&Math.max(v(1),v(2))<top*.15?'ahead-weak':'';const ok=!why;if(this.debug)this.debug[m]=why||'ok';this.why[m]=why;
   if(ok){found.push({m,expected:true,strength:Math.max(lowBest,...own.map(p=>p.value))/top,shared:sharing});this.remove(mag,m);}
};
  for(const m of [...current].sort((a,b)=>b-a))if(this.notes[m]?.length)verify(m,m>=96?.03:.1);
  // An upper note on a harmonic of a lower found note (an octave, a twelfth…) must stand clearly above that
  // note's neighbouring harmonics, or it is only the lower note's overtone.
  for(const f of [...found]){const m=f.m,f0=this.notes[m][0].f,at=this.peak(orig,f0,.023).value;
   for(const g of found){if(g.m>=m||g.shared)continue;const r=f0/this.notes[g.m][0].f,j=Math.round(r);if(j<2||Math.abs(r-j)/j>.03)continue;
    const h=k=>this.notes[g.m][k-1]?this.peak(orig,this.notes[g.m][k-1].f,this.spreadFor(g.m,k)).value:0;const ref=j===2?Math.max(h(3),h(5)*1.5):Math.max(h(j-1),h(j+1));
    if(at<ref*.5){found.splice(found.indexOf(f),1);break;}}}
  // A wanted note is not taken when a key a step or two away explains far more of the new sound than it does
  // (a slip of the finger: the neighbour's partials are loud and the wanted note shows only a stray peak, such as
  // one half of the neighbour's beating fundamental). Partials the other wanted notes have are left out of both.
  for(const f of [...found]){const m=f.m,oth=current.filter(o=>o!==m),e=this.comb(orig,m,oth);
   for(const d of [-2,-1,1,2]){const r=m+d;if(r<LOW||r>HIGH||current.includes(r))continue;const v=this.comb(orig,r,oth);if(v>=top*RIVAL_MIN&&v>=e*RIVAL_RATIO){found.splice(found.indexOf(f),1);this.why[m]='rival';if(this.debug)this.debug[m]='rival';break;}}}
  const overtone=m=>current.some(c=>this.notes[c].some(q=>Math.abs(q.f-this.notes[m][0].f)/q.f<.02));
  for(const m of expected.filter(x=>!current.includes(x)).sort((a,b)=>b-a))if(this.notes[m]?.length&&!overtone(m))verify(m,.25);
  // Other notes: only clear, harmonic ones count as wrong notes.
  // (partials of a wanted note count as explained even when that note was not confirmed: a deep note the
  // microphone barely hears must not turn into wrong notes on its upper partials)
  const explained=f0=>[...found.map(f=>f.m),...current].some(o=>this.notes[o]?.length&&Array.from({length:24},(_,i)=>partialFreq(o,i+1,this.tune)).some((x,i)=>Math.abs(x-f0)/f0<(i<5?.015:.03)));
  for(let round=0;round<3;round++){let best=-1,bestS=0;for(let m=LOW;m<=HIGH;m++){if(known.has(m)||found.some(f=>f.m===m))continue;const sal=this.salience(mag,m);if(sal>bestS){bestS=sal;best=m;}}if(best<0)break;
   // (high notes have nearly no overtones: their fundamental must stand alone)
   const ps=this.partialPeaks(mag,best),need=ps.slice(0,best>=76?1:3);
   // its fundamental must be a real peak of what is heard, not the edge of a note that changed loudness
   const real=!heard||ps.slice(0,2).every(p=>{const h=this.peak(heard,this.notes[best][p.k-1].f,this.spreadFor(best,p.k));return h.at>=0&&Math.abs(h.at-p.at)<=1;});
   // a note far above a struck deep note cannot be told from that note's dense upper partials
   const dense=[...found.map(f=>f.m),...current].some(o=>freq(o)<freq(best)/10);
   if(!(ps[0].value>=top*.3&&need.every(p=>clearAt(p.value))&&!explained(this.notes[best][0].f)&&real&&!dense))break;
   found.push({m:best,expected:false,strength:ps[0].value/top});this.remove(mag,best);}
  return found;}
 // How much of the new sound note m's partials explain: the sum of its first 8 partial peaks (relative), leaving out
 // partials that another note in `others` also has, and peaks that sit nearer another note's partial than m's.
 comb(mag,m,others){let s=0;for(const q of this.notes[m].slice(0,8)){if(others.some(o=>this.notes[o].some(x=>Math.abs(x.f-q.f)/q.f<.015)))continue;const p=this.peak(mag,q.f,this.spreadFor(m,q.k));if(p.at<0)continue;const f=p.at*this.bin;if(others.some(o=>this.notes[o].some(x=>Math.abs(x.f-f)<Math.abs(q.f-f))&&this.notes[o].some(x=>Math.abs(x.f-f)/f<this.spreadFor(o,x.k))))continue;s+=p.value;}return s;}
 // Are note m's own odd partials missing from the new sound (an octave above was struck)? Its fundamental (where
 // a small microphone hears it, above ~250 Hz) and third, where no other note in `others` has a partial, were quiet
 // before the strike and stayed below a tenth of its even partials (and so did its fifth, in the bass).
 oddMissing(mag,m,others){const ps=this.notes[m],near=f=>others.some(o=>this.notes[o].some(x=>Math.abs(x.f-f)<f*.023+18)),pk=(k,s=mag)=>ps[k-1]?this.peak(s,ps[k-1].f,this.spreadFor(m,k)).value:0;
  const even=Math.max(pk(2),pk(4),pk(6)),lim=even*ODD_MISSING;if(!even)return false;
  const own=[1,3,5].filter(k=>ps[k-1]&&ps[k-1].f>=120&&!near(ps[k-1].f)),test=own.filter(k=>(k===1&&ps[0].f>=250)||(k===3&&ps[2].f>=200));
  if(!test.length||own.filter(k=>k<5||m<55).some(k=>pk(k)>=lim))return false;
  return !this.priorNow||test.some(k=>pk(k,this.priorNow)<even*ODD_QUIET);}
 // Was a lower note u (an octave, a twelfth or two octaves below m) struck, rather than m? u shows on its own
 // partials that m cannot explain (for an octave: f/2 and 3f/2).
 undertone(mag,m,known,cover=known,minV=0){
  // the note's own strength: its fundamental, or half its next partials (a small microphone loses deep fundamentals)
  const pp=this.partialPeaks(mag,m),base=Math.max(this.peak(mag,this.notes[m][0].f,.012).value,.5*Math.max(pp[1]?.value||0,pp[2]?.value||0));if(!base)return false;
  const others=[...cover].filter(x=>x!==m),covered=(f,list,tol=.012)=>list.some(o=>{for(let k=1;k<=24;k++){const x=partialFreq(o,k,this.tune);if(x>f*(1+tol))return false;if(Math.abs(x-f)/f<tol)return true;}return false;});
  for(const [d,r] of [[12,2],[19,3],[24,4]]){const u=m-d;if(u<LOW||known.has(u))continue;
   // a note played a moment ago still settles (its fundamental builds up): its partials then prove less
   const x=(this.ringingNow||[]).includes(u)?2:1;
   // (so may notes wanted a moment ago that still swell: one of their two lowest partials is new and is not one of u's
   // own, as a note struck a moment before can still be building up)
   const uo=this.notes[u].slice(0,8).filter(q=>q.k%r!==0),sw=this.swell.filter(s=>s!==u&&s!==m&&this.notes[s].slice(0,2).some(q=>!uo.some(p=>Math.abs(p.f-q.f)/q.f<.015)&&this.peak(mag,q.f,this.spreadFor(s,q.k)).value>=minV)),o2=[...others.filter(x=>x!==u),...sw];
   // u's own partials (not shared with m, not explained by another expected note); its fundamental (or, deep in
   // the bass, its third partial) must be among them. A real string's fundamental often beats, which splits its
   // peak in two a few per cent either side, so the fundamental is looked for more widely.
   // (a partial near another wanted note's partial may be that note's split, beating peak: within about 18 Hz of it,
   // beyond the width searched; the other note's distant high partials do not hide u's)
   // (and a partial counts only where it rose well above its level before the strike: in a live room the echo of
   // notes played before wavers, and may look new here and there)
   const own=this.notes[u].slice(0,8).filter(q=>q.k%r!==0&&!covered(q.f,o2,(q.k===1?.045:.012)+18/q.f)).map(q=>{const p=this.peak(mag,q.f,q.k===1?.045:.012),pr=p.at>0&&this.priorNow?Math.max(this.priorNow[p.at-1],this.priorNow[p.at],this.priorNow[p.at+1]):0,v=p.value>=pr?p.value:0;return {k:q.k,v:v>=minV?v:0};});
   const strong=own.filter(q=>q.v>=base*.3*x);if(this.debug)(this.debugU=this.debugU||[]).push([m,u,own.map(q=>q.k+':'+(q.v/base).toFixed(2)).join(' ')]);if(strong.length>=2&&strong.some(q=>q.k<=3))return true;
   // or several of its own partials together (a real piano's lower partials can each be faint)
   const some=own.filter(q=>q.v>=base*.1*x);if(some.length>=2&&some.some(q=>q.k<=3)&&some.reduce((a,q)=>a+q.v,0)>=base*x*(known.size>1?1:.5))return true;
   // an octave below shows its own fundamental clearly (its odd partials can be faint)
   // (or, fainter, its fundamental together with another of its own odd partials)
   if(r===2&&own.some(q=>q.k===1&&q.v>=base*.3*x))return true;
   if(r===2&&own.some(q=>q.k===1&&q.v>=base*.15*x)&&own.some(q=>q.k>1&&q.v>=base*.1*x))return true;
   // (a high note sounds little but its fundamental: the octave below's third far above it gives that octave away)
   if(r===2&&m>=72&&own.some(q=>q.k===3&&q.v>=base*1.5*x))return true;
   // or, from F4 up, its own third, fifth and seventh all plainly there (its fundamental can merge with a neighbouring
   // wanted note's in a short stretch); partials far up a deep wanted note's dense series prove nothing
   if(r===2&&m>=65){const lo=Math.min(1e9,...o2.map(freq)),q=own.filter(q=>q.k>=3&&q.k<=7&&this.notes[u][q.k-1].f<lo*20);
    if(q.length>=2&&q.every(p=>p.v>=base*.07*x)&&q.reduce((a,p)=>a+p.v,0)>=base*.3*x)return true;}}
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
  // the score has moved on when the wanted notes change (a new group, even of the same notes)
  const key=want.slice().sort().join();if(key!==this.wantKey||expected!==this.wantRef){this.wantKey=key;this.wantRef=expected;this.inst++;}
  // 1 · strikes; each one is analysed when the next arrives or about 0.1 s after it (longer in the bass)
  // (the first moments only learn the room: a microphone switching on is no strike)
  if(this.start==null)this.start=now;this.curWant=want;this.curNext=next;const found=this.strikes(samples,now,[...new Set([...want,...next])]);
  for(const at of found){const s=this.info.get(at);this.info.delete(at);if(at<=this.start)continue;let want2=s.want;if(this.pending){const n=out.events.length;this.resolve(this.pending,samples,now,want,out,next,at,power);
    // notes this strike just answered are no longer wanted from the next one (the score moves on)
    const got=new Set(out.events.slice(n).filter(e=>e[1]).map(e=>e[0]));want2=want2.filter(m=>!got.has(m));}
   this.pending={t:at,want:want2,next:s.next,flux:s.flux,byNote:s.byNote,faint:s.faint,inst:this.inst,insts:[this.inst]};}
  // (the stretch after it ends at any clear rise since: a strike not confirmed yet, or too faint to count)
  if(this.pending){const p=this.pending;if(!p.insts.includes(this.inst))p.insts.push(this.inst);const low=Math.min(...p.want,...want,108),wait=low<45?.16:low<57?.12:.1;if(now-p.t>=wait+.004){this.resolve(p,samples,now,want,out,next,this.laterRise(p.t),power);this.pending=null;}}
  // 2 · notes fade: a held note ends when it has fallen far below its strike (or the room goes quiet)
  const loud=out.rms>this.gate;
  for(const [m,h] of this.held){const lv=this.level(power,m);if(!loud||lv<h.level-20||now-h.t>6){this.held.delete(m);out.events.push([m,false,0]);}}
  out.heard=[...this.held.keys()];return out;}
 // The first clear rise of the spectral flux more than 70 ms after a strike at t, or null.
 laterRise(t){const fl=this.flux;for(let i=1;i<fl.length;i++){const x=fl[i],thr=x.thr??fl[i-1].thr,thg=x.thg??fl[i-1].thg;if(x.t<t+.07||thr==null)continue;if(x.f>thr*1.5||x.g>thg*1.5)return x.t;}return null;}
 // Which notes a strike holds. before/after: power spectra just before and just after the strike;
 // expected: the notes wanted now; ahead: the next group's notes; young: notes struck so shortly before that
 // they are still starting; ringing: notes played in the last moments (they may swell, not wrong notes);
 // faint: a strike that only nearly reached the threshold.
 judge(before,after,expected,ahead=[],young=[],ringing=[],strength=1,faint=false){const n=after.length,mag=new Float64Array(n);let fresh=0,all=0;
  // New sound: what got at least twice as loud (3 dB) as just before the strike. Ringing notes that swell a
  // little (their strings beat) stay out.
  let prior=0;for(let i=0;i<n;i++){const d=after[i]-before[i]*2;mag[i]=d>0?Math.sqrt(d):0;fresh+=d>0?d:0;all+=after[i];prior+=before[i];}
  // a note stopping (its key let go) is not a strike: the new sound must be more than a click next to what was sounding
  this.lastPriorShare=fresh/Math.max(prior,1e-30);if(fresh<prior*.008)return {ok:[],wrong:[]};
  // A strike brings plenty of new sound: in the octave where the struck note is loudest, most of the sound is
  // new (a ringing string that swells brings only a little). Too little is no strike; a wrong note needs a clear one.
  // `strength`: how far the strike stood out when it was detected (1 = just at the threshold).
  let share=0;for(let lo=80;lo<6000;lo*=2){const a=Math.round(lo/this.bin),b=Math.min(n,Math.round(lo*2/this.bin));let fb=0,ab=0;for(let i=a;i<b;i++){const d=after[i]-before[i]*2;if(d>0)fb+=d;ab+=after[i];}if(ab>=all*.01)share=Math.max(share,fb/ab);}
  this.lastFresh=share;const clear=share*Math.sqrt(Math.min(4,strength));
  // A note plainly new: nearly all of the sound on its own partials is new, and at least two of them (the fundamental
  // of a high note) rose 9 dB and stand out from the loudest sound. A soft note under the pedal brings little new
  // sound to its octave, yet its own partials leap.
  let amax=0;for(let i=Math.floor(45/this.bin);i<Math.ceil(5000/this.bin);i++)amax=Math.max(amax,after[i]);const was=i=>Math.max(before[i-1],before[i],before[i+1]);
  const plain=m=>{if(young.includes(m))return false;let c=0,sum=0,gain=0;for(const q of this.notes[m].slice(0,6)){const p=this.peak(after,q.f,this.spreadFor(m,q.k));if(p.at<0)continue;const a=p.value,b=was(p.at);sum+=a;gain+=Math.max(0,a-2*b);if(a>=8*b&&a>=amax*1e-3)c++;}return c>=(m>=72?1:2)&&gain>=sum*.7;};
  // too little new sound (or a faint strike) counts only for the wanted notes plainly new in it, never for a wrong note
  const weak=faint||clear<.3||(strength<1.3&&share<.6);if(weak&&!expected.some(plain))return {ok:[],wrong:[]};
  // A wanted note played again a moment ago (its damper was still stopping it just before): any growth counts, once
  // one of its partials at least doubled (a string still ringing from before only wavers).
  // (a partial that another wanted note also has proves nothing: that note's strike may be what grew there)
  const grew=m=>this.notes[m].slice(0,6).some(q=>{if(expected.some(o=>o!==m&&this.notes[o].slice(0,8).some(x=>Math.abs(x.f-q.f)/q.f<.015)))return false;const p=this.peak(after,q.f,this.spreadFor(m,q.k));return p.at>=0&&p.value>=amax*1e-4&&p.value>=2*was(p.at);});
  for(const m of expected)if(ringing.includes(m)&&!young.includes(m)&&grew(m))for(const q of this.notes[m].slice(0,8)){const c=Math.round(q.f/this.bin),w=Math.ceil(q.f*.012/this.bin)+2;for(let j=Math.max(0,c-w);j<=Math.min(n-1,c+w);j++){const d=after[j]-before[j]*1.2;mag[j]=Math.max(mag[j],d>0?Math.sqrt(d):0);}}
  for(const m of young)for(const q of this.notes[m]){const c=Math.round(q.f/this.bin),w=Math.ceil(q.f*this.spreadFor(m,q.k)/this.bin)+2;for(let j=Math.max(0,c-w);j<=Math.min(n-1,c+w);j++)mag[j]=0;}
  ahead=weak?[]:ahead.filter(m=>!expected.includes(m));
  this.priorNow=before.map(Math.sqrt);this.ringNow=ringing;const heard=after.map(Math.sqrt),found=this.analyse(mag,[...expected,...ahead],expected,heard);
  // (a next group's note heard now must be plainly new: not a string still ringing, nor an overtone of this strike)
  const ok=found.filter(f=>f.expected&&(expected.includes(f.m)?!faint||plain(f.m):plain(f.m)));
  const wrong=share<.45||weak?[]:found.filter(f=>!f.expected&&
   // an overtone or undertone of a struck expected note is not a separate note
   !(ok.some(o=>[12,19,24,28,31,36,-12,-19,-24].includes(f.m-o.m))&&f.strength<.7)&&
   // nor is a note played a moment ago that is still sounding
   !(ringing.includes(f.m)&&f.strength<.6));
  // A wanted note heard more faintly than a clear wrong note a step or an octave away was most likely that
  // wrong note (a slip of the finger), not both.
  const okKept=ok.filter(o=>!wrong.some(w=>[1,2,12].includes(Math.abs(w.m-o.m))&&w.strength>o.strength));
  if(okKept.length<ok.length){ok.length=0;ok.push(...okKept);}
  // the notes of the current group first, then those of the next one
  return {ok:[...ok.filter(f=>expected.includes(f.m)),...ok.filter(f=>!expected.includes(f.m)).sort((x,y)=>ahead.indexOf(x.m)-ahead.indexOf(y.m))],wrong};}
 /* How this piano is tuned (a home piano is often 20-50 cents flat or sharp): the loudest peaks of each strike,
    measured against the nearest key, averaged over recent strikes (as directions on a circle, a semitone around). */
 learnTune(power,expected=[]){const lo=Math.ceil(60/this.bin),hi=Math.floor(1500/this.bin);let top=0;for(let i=lo;i<hi;i++)top=Math.max(top,power[i]);if(!top)return;
  const pk=[];for(let i=lo+1;i<hi-1;i++){const v=power[i];if(v<top*.01||v<power[i-1]||v<power[i+1]||v<power[i-2]||v<power[i+2])continue;const l=Math.log(power[i-1]+1e-30),c=Math.log(v),r=Math.log(power[i+1]+1e-30),d=l-2*c+r,x=d?Math.max(-.5,Math.min(.5,(l-r)/(2*d))):0;pk.push({f:(i+x)*this.bin,w:Math.sqrt(v)});}
  pk.sort((a,b)=>b.w-a.w);let X=0,Y=0,W=0;
  for(const p of pk.slice(0,12)){const c=1200*Math.log2(p.f/A4)+6900,m=Math.round(c/100);if(m<LOW||m>HIGH)continue;const dev=c-100*m-railsback(m),a=2*Math.PI*dev/100;X+=p.w*Math.cos(a);Y+=p.w*Math.sin(a);W+=p.w;}
  if(!W)return;this.tunes.push({x:X/W,y:Y/W});if(this.tunes.length>10)this.tunes.shift();
  // (the first strikes count at once when their peaks agree well, so a piano far off is followed from the start)
  let x=0,y=0;for(const t of this.tunes){x+=t.x;y+=t.y;}const R=Math.hypot(x,y)/this.tunes.length;if(R<(this.tunes.length<3?.7:.5))return;
  // (taken the way nearest the tuning in use, so a piano near a quarter tone off does not flip between the two keys)
  const phi=100*Math.atan2(y,x)/(2*Math.PI);let est=phi+100*Math.round((this.tune-phi)/100);
  // A piano near a quarter tone off is as near the key below as the key above: the way that puts the strikes on the
  // notes the score wants is taken, once two strikes in a row agree (at once on the first strikes).
  if(Math.abs(phi)>=35&&expected.length){const K=expected.length<=2?4:2,fit=c=>{let s=0;for(const p of pk.slice(0,8))if(expected.some(m=>{for(let k=1;k<=K;k++)if(Math.abs(1200*Math.log2(p.f/partialFreq(m,k,c)))<25)return true;return false;}))s+=p.w;return s;},
    alt=est-100*Math.sign(est),a=fit(alt),e=fit(est);this.flips=Math.abs(alt)<=150&&a>e*2&&a>W*.5?this.flips+(this.tunes.length<3?2:1):0;if(this.flips>=2){est=alt;this.flips=0;}}
  if(Math.abs(est-this.tune)>3){this.tune=Math.round(est);this.layout();}}
 // A piano more than a quarter tone off sounds nearer the neighbouring key: when the strikes keep landing a
 // semitone from the wanted notes (and nothing else), the tuning is taken to be a semitone further that way.
 checkSlip(expected,ok,wrong){if(ok.length||!wrong.length||Math.abs(this.tune)<20){if(ok.length)this.slips={down:0,up:0};return;}
  if(expected.some(e=>wrong.some(w=>w.m===e-1)))this.slips.down++;else if(expected.some(e=>wrong.some(w=>w.m===e+1)))this.slips.up++;else return;
  const d=this.slips.down>=3?-1:this.slips.up>=3?1:0;if(d&&Math.abs(this.tune+100*d)<=150){this.tune+=100*d;this.slips={down:0,up:0};this.layout();}}
 // Does the new sound slide in pitch, as a voice does (a struck string keeps its pitch)? The loudest new peaks are
 // followed from the first half of the stretch after the strike to the second; a voice moves them all by about the
 // same number of cents, a piano's partials stay (or waver each its own way, as strings beat).
 gliding(samples,at,len,before,after){const h=len>>1,skip=Math.round(this.rate*.004);if(h<this.rate*.03)return 0;
  const lo=Math.ceil(100/this.bin),hi=Math.floor(4000/this.bin),pk=[];for(let i=lo;i<hi;i++){const d=after[i]-2*before[i];if(d<=0||after[i]<after[i-1]||after[i]<after[i+1]||after[i]<after[i-2]||after[i]<after[i+2])continue;pk.push({i,v:d});}
  pk.sort((x,y)=>y.v-x.v);const top=pk.length?pk[0].v:0,use=pk.filter(p=>p.v>=top*.002).slice(0,10);if(use.length<3)return 0;
  const g=(h/2)**2,nw=P=>{for(let i=0;i<P.length;i++)P[i]=Math.max(0,P[i]/g-2*before[i]);return P;},A=nw(this.segment(samples,at+skip,h)),B=nw(this.segment(samples,at+skip+h,h)),fr=(P,i)=>{const l=Math.log(P[i-1]+1e-30),c=Math.log(P[i]+1e-30),r=Math.log(P[i+1]+1e-30),d=l-2*c+r;return (i+(d?Math.max(-.5,Math.min(.5,(l-r)/(2*d))):0))*this.bin;};
  const cs=[],seen=new Set();let ga=0,gb=0;for(const p of use){const f=p.i*this.bin,a=this.peak(A,f,.04),b=this.peak(B,f,.04);if(a.at>0&&b.at>0&&!seen.has(a.at)&&!seen.has(-b.at)){seen.add(a.at);seen.add(-b.at);cs.push(1200*Math.log2(fr(B,b.at)/fr(A,a.at)));ga+=a.value;gb+=b.value;}}if(cs.length<3)return 0;
  cs.sort((x,y)=>x-y);const med=cs[cs.length>>1],agree=tol=>cs.filter(c=>Math.abs(c-med)<=tol).length,grow=10*Math.log10(gb/ga);
  // most peaks slide clearly and alike; or a little, but exactly alike (more so if the sound still swells, as a
  // vowel does). (A piano's partials may waver, each its own way, as its strings beat.)
  return Math.abs(med)>=10&&agree(Math.max(6,Math.abs(med)*.2))>=Math.max(3,cs.length*.7)||Math.abs(med)>=4&&cs.length>=4&&(agree(2.5)>=cs.length*.8&&grow>1.5||Math.abs(med)>=5&&agree(2)>=cs.length*.9);}
 // Is the sound around a strike clipped (the microphone's input too loud)? Its waveform then sits flat at the same
 // highest value on many peaks.
 clipped(samples,from,to){let M=0;from=Math.max(1,from);to=Math.min(samples.length,to);for(let i=from;i<to;i++)M=Math.max(M,Math.abs(samples[i]));if(!M)return false;
  let flats=0,run=0;for(let i=from;i<to;i++){if(samples[i]===samples[i-1]&&Math.abs(samples[i])>=M*.99)run++;else{if(run>=2)flats++;run=0;}}return flats>=6;}
 // Judge a pending strike. `cut`: the time the next strike began (the stretch after this one must end there).
 resolve(p,samples,now,want,out,next=[],cut=null,power=null){
  // the exact start, not earlier than just after the previous strike
  const end=samples.length,guess=end-Math.round((now-p.t)*this.rate),prev=this.lastStrike!=null?end-Math.round((now-this.lastStrike-.02)*this.rate):0,at=this.strikeAt(samples,guess,prev),t=now-(end-at)/this.rate;
  const avail=end-at-Math.round(this.rate*.004)-(cut!=null?Math.max(0,Math.round((now-cut)*this.rate)):0);
  // the stretch before the strike starts after the previous strike's attack, so that note is already whole in it
  const since=this.lastStrike!=null?t-this.lastStrike:9,room=Math.round(Math.max(.04,since-.015)*this.rate);
  const {before,after,len}=this.strikeSpectra(samples,at,Math.min(avail,room,Math.round(this.rate*.16)));
  // a voice (someone talking or singing nearby) is no strike
  if(this.gliding(samples,at,len,before,after))return;const last=this.lastStrike;this.lastStrike=t;
  const expected=[...new Set([...p.want,...want])],ahead=[...new Set([...(p.next||[]),...next])];this.learnTune(after,expected);
  // since) and still held is the string still sounding: it is not reported again, unless it now sounds far stronger.
  // It still takes part in the check, so its partials are not taken for other notes.
  const stale=expected.filter(m=>{const r=this.reported.get(m);return r&&this.held.has(m)&&t-r.t>.03&&t-r.t<1&&r.insts.includes(p.inst)&&!ahead.includes(m);});
  // the notes wanted (or coming next) at the strikes of the last 0.6 s: most likely played, so still sounding
  this.wantLog=this.wantLog.filter(w=>t-w.t<.6);this.soundNow=[...new Set(this.wantLog.filter(w=>t-w.t>.03).flatMap(w=>w.notes))];this.wantLog.push({t,notes:[...p.want,...(p.next||[])]});
  // notes struck so shortly before that they are still starting in that stretch are left out
  const young=[...this.recent].filter(([,s])=>t-s<Math.max(.1,len/this.rate+.008)&&t-s>=0).map(([m])=>m),ringing=[...this.recent].filter(([,s])=>now-s<1.5).map(([m])=>m);
  // (clipping adds tones below the notes played: the check for a lower octave struck instead is left out then)
  this.clipNow=this.clipped(samples,at-len,at+len);
  const {ok:all,wrong:w}=this.judge(before,after,expected,ahead,young,ringing,p.flux??1,p.faint);
  // A note wanted only since the strike (the score moved on meanwhile) that is an overtone of a note this strike holds
  // for the notes wanted at the strike is that note's overtone, not a later strike heard early.
  const own=all.filter(f=>p.want.includes(f.m)&&!stale.includes(f.m)),over=f=>!p.want.includes(f.m)&&own.some(c=>c.m<f.m&&this.notes[c.m].some(q=>(q.k>2||q.k===2&&f.strength<c.strength)&&Math.abs(q.f-this.notes[f.m][0].f)/q.f<.02));
  const ok=all.filter(f=>(!stale.includes(f.m)||f.strength>=.5&&f.strength>=2*this.reported.get(f.m).s)&&!over(f));
  // a faint rise that held no wanted note was no strike
  if(p.faint&&!ok.length){this.lastStrike=last;return;}
  this.checkSlip(expected,ok,w);
  // a strike seen only on the wanted notes' own partials can confirm them, never report a wrong note
  const wrong=p.byNote?[]:w;const ago=Math.max(0,now-t);
  // Wrong notes go first, so a wrong note can never be taken for the next note of the score.
  // (a wrong note is reported pressed and let go at once: it is not held)
  for(const f of wrong){out.events.push([f.m,true,ago],[f.m,false,ago]);this.held.delete(f.m);}
  for(const f of ok){if(this.held.has(f.m)){out.events.push([f.m,false,ago]);this.held.delete(f.m);}out.events.push([f.m,true,ago]);this.reported.set(f.m,{t,s:f.strength,insts:[...p.insts,this.inst]});this.held.set(f.m,{t,level:this.level(power||this.spectrum(samples),f.m)});this.recent.set(f.m,t);}
 }

}
function hann(n){const w=new Float64Array(n);for(let i=0;i<n;i++)w[i]=.5-.5*Math.cos(2*Math.PI*i/(n-1));return w;}
const api={fft,pitch,MicListener,freq,range:[LOW,HIGH]};
if(typeof module!=='undefined')module.exports=api;else root.PianoListen=api;
})(typeof window!=='undefined'?window:globalThis);
