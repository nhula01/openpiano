// Piano-like test audio: stiff-string partials, a microphone low cut, decay and noise (no recordings needed).
const freq=m=>440*2**((m-69)/12);
function render(notes,{rate=48000,seconds=2,noise=.0015,seed=7,lowcut=90,cents=0}={}){
 const n=Math.round(rate*seconds),out=new Float32Array(n);let s=seed;const rnd=()=>{s=(s*1103515245+12345)%2147483648;return s/2147483648;};
 for(const {m,t=0,dur=10,amp=.25} of notes){const f0=freq(m)*2**(cents/1200),B=.00012*2**((m-21)/22),tau=Math.max(.35,4*2**(-(m-21)/24));
  const ks=[];for(let k=1;k<=40;k++){const f=k*f0*Math.sqrt(1+B*k*k);if(f>rate*.45)break;const cut=f*f/(f*f+lowcut*lowcut);ks.push({f,a:amp*cut/Math.pow(k,1.1)*(k===1&&m<40?.5:1),tau:tau/(1+.25*(k-1)),ph:rnd()*6.28});}
  const i0=Math.round(t*rate),i1=Math.min(n,Math.round((t+dur)*rate));
  for(let i=i0;i<i1;i++){const tt=(i-i0)/rate,att=Math.min(1,tt/.004),rel=i>i1-rate*.05?(i1-i)/(rate*.05):1;let v=0;for(const p of ks)v+=p.a*Math.exp(-tt/p.tau)*Math.sin(2*Math.PI*p.f*tt+p.ph);out[i]+=v*att*rel;}}
 for(let i=0;i<n;i++)out[i]+=noise*(rnd()*2-1);return out;}
// Run a listener over audio the way the player does (the latest 16384 samples every 45 ms, with the audio time),
// asking for `expected(t)`. Each log entry has the frame time t and the strike time `at` the listener reported.
function listen(L,audio,expected,{rate=48000,hop=.045,size=16384,upcoming=[]}={}){const log=[];for(let t=hop;t*rate<audio.length;t+=hop){const end=Math.round(t*rate);const frame=new Float32Array(size);const from=end-size;for(let i=0;i<size;i++)frame[i]=from+i>=0?audio[from+i]:0;const r=L.frame(frame,typeof expected==='function'?expected(t):expected,t,typeof upcoming==='function'?upcoming(t):upcoming);for(const [m,on,ago] of r.events)log.push({t:+t.toFixed(3),m,on,at:+(t-ago).toFixed(3)});}return log;}
module.exports={render,listen,freq};
