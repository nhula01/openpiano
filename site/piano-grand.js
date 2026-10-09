/* FluidR3 sampled acoustic grand, CC BY 3.0. See audio/grand-piano/README.md.
   Every note anywhere on the site sounds through these samples: one recording per key, A0–C8.
   A sample that fails to download is retried once; if it still fails, or a note lies outside the
   88 keys, the nearest recorded key is played at the right pitch, so playback never falls back
   to a synthesized tone. */
(()=>{
 const LOW=21,HIGH=108,cache=new Map(),pending=new Map(),failed=new Set();
 async function fetchSample(context,note){for(let attempt=0;attempt<2;attempt++){try{const r=await fetch(`audio/grand-piano/${note}.mp3`);if(!r.ok)throw Error('HTTP '+r.status);return await context.decodeAudioData(await r.arrayBuffer());}catch(e){if(attempt)throw e;}}}
 async function buffer(context,note){if(cache.has(note))return cache.get(note);if(!pending.has(note))pending.set(note,fetchSample(context,note).then(b=>{cache.set(note,b);return b;},()=>{failed.add(note);return null;}).finally(()=>pending.delete(note)));return pending.get(note);}
 const clamp=note=>Math.max(LOW,Math.min(HIGH,Math.round(note)));
 // Keys whose own sample could not load borrow the closest one that did.
 function source(note){const key=clamp(note);if(cache.has(key))return {sample:cache.get(key),shift:note-key};for(let d=1;d<=HIGH-LOW;d++)for(const k of [key-d,key+d])if(cache.has(k))return {sample:cache.get(k),shift:note-k};return null;}
 async function load(context,notes){const keys=[...new Set(notes.map(clamp))];await Promise.all(keys.map(n=>buffer(context,n)));
  // Make sure a neighbour exists for any key that failed, so every note can sound.
  for(const k of keys)if(!cache.has(k)){for(let d=1;d<=12&&!source(k);d++)for(const n of [k-d,k+d])if(n>=LOW&&n<=HIGH&&!failed.has(n))await buffer(context,n);}
  if(keys.length&&!keys.some(k=>source(k)))throw Error('The grand piano samples could not be downloaded. Check your connection and try again.');}
 function play(context,note,at=context.currentTime,duration=2,velocity=90){const found=source(note);if(!found)throw Error('Grand piano is still loading.');const node=context.createBufferSource(),gain=context.createGain();node.buffer=found.sample;if(found.shift)node.playbackRate.value=Math.pow(2,found.shift/12);const start=Math.max(context.currentTime,at),end=start+Math.max(.05,duration);const level=.48*Math.pow(Math.max(1,Math.min(127,velocity))/127,1.4);gain.gain.setValueAtTime(level,start);gain.gain.setValueAtTime(level,end);gain.gain.linearRampToValueAtTime(0,end+.12);node.connect(gain);gain.connect(context.destination);node.start(start);node.stop(Math.min(start+found.sample.duration/node.playbackRate.value,end+.13));let stopped=false;return {stop(){if(stopped)return;stopped=true;const now=context.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(level,now);gain.gain.linearRampToValueAtTime(0,now+.08);try{node.stop(now+.09);}catch{}},onended:null};}
 window.PianoGrand={load,play,range:[LOW,HIGH]};
})();
