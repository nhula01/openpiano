/* Metronome click for practice playback: a short tick, never a piano note.
   Kept apart from the player, which only ever sounds the sampled grand piano. */
(()=>{
 function at(context,time,accent){if(!context?.createOscillator)return null;const o=context.createOscillator(),g=context.createGain();o.frequency.value=accent?1760:1320;g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(accent?.32:.2,time+.002);g.gain.exponentialRampToValueAtTime(.001,time+.04);o.connect(g);g.connect(context.destination);o.start(time);o.stop(time+.05);return {stop(){try{o.stop();}catch{}}};}
 window.PianoClick={at};
})();
