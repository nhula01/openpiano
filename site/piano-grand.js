/* FluidR3 sampled acoustic grand, CC BY 3.0. See audio/grand-piano/README.md. */
(()=>{
 const cache=new Map(),pending=new Map();
 async function buffer(context,note){if(cache.has(note))return cache.get(note);if(!pending.has(note))pending.set(note,(async()=>{const r=await fetch(`audio/grand-piano/${note}.mp3`);if(!r.ok)throw Error('Grand piano sample unavailable: '+note);const decoded=await context.decodeAudioData(await r.arrayBuffer());cache.set(note,decoded);return decoded;})().finally(()=>pending.delete(note)));return pending.get(note);}
 async function load(context,notes){await Promise.all([...new Set(notes)].map(n=>buffer(context,n)));}
 function play(context,note,at=context.currentTime,duration=2,velocity=90){const sample=cache.get(note);if(!sample)throw Error('Grand piano is still loading.');const source=context.createBufferSource(),gain=context.createGain();source.buffer=sample;const start=Math.max(context.currentTime,at),end=start+Math.max(.05,duration);const level=.48*Math.pow(Math.max(1,Math.min(127,velocity))/127,1.4);gain.gain.setValueAtTime(level,start);gain.gain.setValueAtTime(level,end);gain.gain.linearRampToValueAtTime(0,end+.12);source.connect(gain);gain.connect(context.destination);source.start(start);source.stop(Math.min(start+sample.duration,end+.13));let stopped=false;return {stop(){if(stopped)return;stopped=true;const now=context.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(level,now);gain.gain.linearRampToValueAtTime(0,now+.08);try{source.stop(now+.09);}catch{}},onended:null};}
 window.PianoGrand={load,play};
})();
