/* Microphone listening for practice: the whole piano range (A0–C8) and chords.
   pitch(samples, rate) finds the one clearest note (McLeod normalised square difference, computed with
   an FFT so long windows for low notes stay cheap). MicListener checks the notes the score expects
   right now, one by one, in the spectrum: each must show its own partials, and a note an octave too low
   does not count. It reports note starts (including a repeated strike of a sounding note) and ends, and
   reports any other clear note as a wrong note. Audio is analysed on the device and never stored.
   Shared by the browser and tests. */
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

class MicListener{
 constructor(rate,{size=8192,gate=.004}={}){this.rate=rate;this.size=size;this.gate=gate;this.fftSize=pow2(size*2);this.window=new Float64Array(size);for(let i=0;i<size;i++)this.window[i]=.5-.5*Math.cos(2*Math.PI*i/(size-1));
  this.re=new Float64Array(this.fftSize);this.im=new Float64Array(this.fftSize);this.db=new Float64Array(this.fftSize/2);
  // A short window (about 40 ms) to see strikes: a note struck again gets louder in its own partials.
  this.shortSize=2048;this.shortFft=4096;this.sre=new Float64Array(this.shortFft);this.sim=new Float64Array(this.shortFft);this.spow=new Float64Array(this.shortFft/2);this.swin=new Float64Array(this.shortSize);for(let i=0;i<this.shortSize;i++)this.swin[i]=.5-.5*Math.cos(2*Math.PI*i/(this.shortSize-1));this.notes=new Map();this.mono={candidate:null,count:0,on:null,gone:0};}
 reset(){for(const s of this.notes.values())s.on=false;this.notes.clear();this.mono={candidate:null,count:0,on:null,gone:0};}
 spectrum(samples){const {re,im,db,window,size}=this;re.fill(0);im.fill(0);const start=samples.length-size;for(let i=0;i<size;i++)re[i]=(samples[start+i]||0)*window[i];fft(re,im);
  for(let i=0;i<db.length;i++)db[i]=10*Math.log10(re[i]*re[i]+im[i]*im[i]+1e-14);
  // Noise floor: the median level from 40 Hz to 5 kHz.
  const lo=Math.floor(40/this.bin),hi=Math.min(db.length-1,Math.ceil(5000/this.bin));const part=Array.from(db.subarray(lo,hi)).sort((a,b)=>a-b);this.floor=part[Math.floor(part.length/2)];this.top=part[part.length-1]-this.floor;}
 get bin(){return this.rate/this.fftSize;}
 shortSpectrum(samples){const {sre,sim,spow,swin,shortSize}=this;sre.fill(0);sim.fill(0);const start=samples.length-shortSize;for(let i=0;i<shortSize;i++)sre[i]=(samples[start+i]||0)*swin[i];fft(sre,sim);for(let i=0;i<spow.length;i++)spow[i]=sre[i]*sre[i]+sim[i]*sim[i];}
 // Power of a note's first partials in the short window.
 band(m){const bin=this.rate/this.shortFft,f0=freq(m);let sum=0;for(let k=1;k<=4;k++){const f=k*f0*Math.sqrt(1+stretch(m)*k*k);if(f>this.rate*.45)break;const a=Math.max(1,Math.floor(f*.97/bin)),b=Math.min(this.spow.length-1,Math.ceil(f*1.03/bin));let best=0;for(let i=a;i<=b;i++)if(this.spow[i]>best)best=this.spow[i];sum+=best;}return sum;}
 // Strongest level near a frequency (in dB above the floor), searching a small band.
 // Only a real peak counts: the slope of a loud neighbouring note leaking into the band does not.
 level(f,spread=.012){if(f<30||f>this.rate/2-200)return -99;const {db,bin}=this;const a=Math.max(4,Math.floor(f*(1-spread)/bin)),b=Math.min(db.length-5,Math.ceil(f*(1+spread)/bin));let best=-1e9;
  for(let i=a;i<=b;i++){const v=db[i];if(v<=best)continue;let peak=true;for(let d=1;d<=3&&peak;d++)if(db[i-d]>v||db[i+d]>v)peak=false;if(peak)best=v;}return best>-1e8?best-this.floor:-99;}
 partials(m){const f0=freq(m),B=stretch(m),out=[];for(let k=1;k<=10;k++){const f=k*f0*Math.sqrt(1+B*k*k);if(f>Math.min(10000,this.rate*.45))break;const db=this.level(f,Math.max(k<=4?.007:.012,2*this.bin/f));out.push({k,f,db:db>=this.top-30?db:-99});}return out;}
 // How clearly note m is sounding: the mean level of its first partials above the floor.
 salience(m,others=[]){const ps=this.partials(m).filter(p=>!others.length||!this.explained(p.f,others));if(!ps.length)return {score:0,strong:0,odd:false,energy:-99,ps};let sum=0,w=0,strong=0,energy=0;
  for(const p of ps){const weight=p.k<=3?1:p.k<=5?.7:.45;sum+=weight*Math.max(0,Math.min(30,p.db-8));w+=weight;if(p.k<=4&&p.db>=14)strong++;energy+=10**(Math.max(-20,p.db)/10);}
  // The fundamental or the third partial must be there: a note an octave above shares only the even ones.
  const odd=ps.some(p=>(p.k===1||p.k===3)&&p.db>=12);
  return {score:sum/w,strong,need:Math.min(2,ps.filter(p=>p.k<=4).length),odd,energy:10*Math.log10(energy+1e-9),ps};}
 // A note whose partials all sit on the overtones of a lower sounding note (an octave, a twelfth…) must
 // stand out above that note's own neighbouring overtones to count as played.
 hidden(m,lower,present){const f0=freq(m),at=this.level(f0);for(const o of lower){const r=f0/freq(o),j=Math.round(r);if(j<2||Math.abs(r-j)/j>.015)continue;
   // Compare with o's own overtones next to it, skipping any that another sounding note also covers.
   const others=present.filter(x=>x!==o&&x!==m),fo=k=>freq(o)*k*Math.sqrt(1+stretch(o)*k*k);
   const refs=(j===2?[3,5]:[j-1,j+1]).map(fo).filter(f=>!this.explained(f,others));if(!refs.length)continue;
   const ref=j===2?this.level(refs[0])+8:Math.max(...refs.map(f=>this.level(f)))+4;if(at<ref)return true;}return false;}
 // Partials of the other notes that may be sounding, to tell their overtones from a played note.
 explained(f,others){for(const o of others){const f0=freq(o),B=stretch(o);for(let k=1;k<=24;k++){const fk=k*f0*Math.sqrt(1+B*k*k);if(fk>f*1.02)break;if(Math.abs(fk-f)/f<.012)return true;}}return false;}
 octaveLow(m,expected){if(expected.includes(m-12)||m-12<LOW)return false;
  // A lower octave that was played a moment ago may simply still be ringing.
  if(this.frameNo-(this.recent?.get(m-12)??-1e9)<45)return false;const f0=freq(m),others=expected.filter(x=>x!==m);
  const half=this.level(f0/2),threeHalves=this.level(1.5*f0);if(half<14||threeHalves<10)return false;
  if(this.explained(f0/2,others)||this.explained(1.5*f0,others))return false;return true;}
 // One analysis frame. samples: the latest audio (at least `size` samples). expected: MIDI notes the score wants now.
 frame(samples,expected=[]){const out={events:[],heard:[],pitch:null,rms:rmsOf(samples)};
  const want=[...new Set(expected)].filter(m=>m>=LOW&&m<=HIGH);
  if(out.rms<this.gate){for(const [m,s] of this.notes)if(s.on){s.on=false;out.events.push([m,false]);}this.notes.clear();if(this.mono.on!==null){out.events.push([this.mono.on,false]);this.mono.on=null;}this.mono.candidate=null;this.mono.count=0;return out;}
  this.spectrum(samples);const p=pitch(samples,this.rate,{gate:this.gate*1.5});out.pitch=p;
  // A strike shows as a jump in loudness over the last 20 ms or so.
  this.shortSpectrum(samples);this.frameNo=(this.frameNo||0)+1;
  const tracked=new Set([...want,...[...this.notes].filter(([,s])=>s.on).map(([m])=>m)]);
  // Evidence for a note comes from its own partials: those shared with another note that is sounding,
  // ringing from a moment ago or also asked for do not count. A note with no partials of its own (an
  // octave above another) is judged by how far it stands out (see hidden()).
  this.recent=this.recent||new Map();const ringingNow=[...this.recent].filter(([,f])=>this.frameNo-f<45).map(([m])=>m);
  const basic=new Map();for(const m of tracked){const sal=this.salience(m);basic.set(m,(sal.score>=7&&sal.strong>=sal.need&&sal.odd));}
  const info=new Map();for(const m of tracked){const monoHit=!!p&&p.midi===m&&p.clarity>=.8;const others=[...new Set([...ringingNow,...[...this.notes].filter(([,s])=>s.on).map(([o])=>o),...tracked].filter(o=>o!==m&&(basic.get(o)??true)))];
   const own=this.salience(m,others),full=this.salience(m);let present,shared=false;
   if(own.ps.some(x=>x.k===1||x.k===3))present=own.score>=7&&own.strong>=own.need&&own.odd;else{present=full.score>=7&&full.strong>=full.need&&full.odd;shared=true;}
   info.set(m,{sal:full,monoHit,shared,present:present||(monoHit&&full.score>=3)});}
  const sorted=[...tracked].sort((a,b)=>a-b);
  for(const m of sorted){const s=this.notes.get(m)||{on:false,below:0,since:0,band:[]};this.notes.set(m,s);const {sal,monoHit,present}=info.get(m),expectedNow=want.includes(m);
   const band=this.band(m),before=s.band.length?Math.min(...s.band.slice(-2)):Infinity,onset=band>before*(m<30?2.6:1.5);s.band.push(band);if(s.band.length>3)s.band.shift();
   const lower=sorted.filter(o=>o<m&&info.get(o).present);
   const accepted=present&&!this.octaveLow(m,want)&&!(lower.length&&!monoHit&&this.hidden(m,lower,sorted.filter(o=>info.get(o).present)));
   if(!s.on){if(accepted&&expectedNow){s.on=true;s.below=0;s.since=this.frameNo;out.events.push([m,true]);}}
   else{
    if(sal.score<3.5||(!present&&!monoHit))s.below++;else s.below=0;
    if(s.below>=2){s.on=false;out.events.push([m,false]);}
    // A fresh strike of a note that is still ringing.
    else if(expectedNow&&accepted&&onset&&this.frameNo-s.since>=3){out.events.push([m,false],[m,true]);s.since=this.frameNo;}
   }
   if(!s.on&&!expectedNow)this.notes.delete(m);
  }
  // A clear note that is not expected (and not an overtone of a sounding note) is a wrong note.
  const sounding=[...this.notes].filter(([,s])=>s.on).map(([m])=>m);
  // Notes played or asked for in the last two seconds may still ring (pedal): they are not wrong notes.
  this.recent=this.recent||new Map();for(const m of [...want,...sounding])this.recent.set(m,this.frameNo);
  const ringing=m=>this.frameNo-(this.recent.get(m)??-1e9)<45;
  this.strayBand=this.strayBand||new Map();let fresh=false;if(p){const b=this.band(p.midi),was=this.strayBand.get(p.midi);fresh=was===undefined||b>was.value*1.5||this.mono.candidate===p.midi;this.strayBand.set(p.midi,{value:b,frame:this.frameNo});}
  for(const [m,v] of this.strayBand)if(this.frameNo-v.frame>3)this.strayBand.delete(m);
  const stray=p&&fresh&&!ringing(p.midi)&&p.clarity>=.85&&!want.includes(p.midi)&&!sounding.some(o=>[12,19,24,28,31,36].includes(Math.abs(p.midi-o)))&&!want.some(o=>[12,19,24].includes(p.midi-o)&&sounding.includes(o))?p.midi:null;
  const mono=this.mono;if(stray!==null&&stray===mono.candidate)mono.count++;else{mono.candidate=stray;mono.count=stray===null?0:1;}
  if(mono.on!==null&&mono.on!==stray){if(++mono.gone>=2){out.events.push([mono.on,false]);mono.on=null;mono.gone=0;}}else mono.gone=0;
  if(stray!==null&&mono.count>=3&&mono.on===null&&!sounding.length){mono.on=stray;out.events.push([stray,true]);}
  out.heard=[...sounding,...(mono.on!==null?[mono.on]:[])];return out;}
}
const api={fft,pitch,MicListener,freq,range:[LOW,HIGH]};
if(typeof module!=='undefined')module.exports=api;else root.PianoListen=api;
})(typeof window!=='undefined'?window:globalThis);
