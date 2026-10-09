const {test}=require('node:test');const assert=require('node:assert/strict');
const {render,listen}=require('./piano-audio-synth.cjs');const L=require('../site/piano-listen.js');const E=require('../site/piano-engine.js');
const rate=48000;
const run=(notes,expected,seconds=1.4)=>listen(new L.MicListener(rate),render(notes,{rate,seconds}),expected,{rate});
const heard=(log,m)=>log.some(e=>e.m===m&&e.on);

test('the pitch detector covers the whole piano, A0 to C8, at 44.1 and 48 kHz',()=>{
 for(const r of [44100,48000])for(let m=21;m<=108;m+=2){const a=render([{m,t:.05}],{rate:r,seconds:.4}),end=Math.round(.3*r);assert.equal(L.pitch(a.subarray(end-8192,end),r)?.midi,m,`${r} Hz: ${E.noteName(m)}`);}
 assert.equal(L.pitch(new Float32Array(8192),rate),null,'silence');
});
test('every single note from A0 to C8 is heard when asked for, quickly and without stray notes',()=>{
 for(let m=21;m<=108;m+=3){const log=run([{m,t:.2}],[m],.8);const on=log.find(e=>e.m===m&&e.on);assert.ok(on,E.noteName(m));assert.ok(on.t<=.47,`${E.noteName(m)} late at ${on.t}`);assert.ok(!log.some(e=>e.m!==m&&e.on),`${E.noteName(m)}: stray`);}
});
test('chords and both hands are heard; a missing chord note is not',()=>{
 const chord=[48,52,55,60,64,67];let log=run(chord.map(m=>({m,t:.2,amp:.12})),chord);for(const m of chord)assert.ok(heard(log,m),E.noteName(m));
 log=run([{m:45,t:.2},{m:76,t:.2}],[45,76]);assert.ok(heard(log,45)&&heard(log,76),'A2 + E5');
 log=run([60,64].map(m=>({m,t:.2,amp:.15})),[60,64,67]);assert.ok(!heard(log,67),'G4 was not played');
 log=run([{m:48,t:.2}],[48,67]);assert.ok(!heard(log,67),'G4 is only an overtone of C3');
 log=run([{m:48,t:.2},{m:60,t:.2}],[48,60]);assert.ok(heard(log,48)&&heard(log,60),'octave in one hand');
});
test('a wrong octave or a wrong note does not count, and the wrong note is reported',()=>{
 let log=run([{m:48,t:.2}],[60]);assert.ok(!heard(log,60)&&heard(log,48),'C3 for C4');
 log=run([{m:72,t:.2}],[60]);assert.ok(!heard(log,60),'C5 for C4');
 log=run([{m:62,t:.2}],[60]);assert.ok(!heard(log,60)&&heard(log,62),'D4 for C4');
 assert.equal(run([],[60]).length,0,'silence');
});
test('a repeated note is heard again, even while the first one still rings',()=>{
 assert.equal(run([{m:60,t:.2,dur:.5},{m:60,t:.7}],[60]).filter(e=>e.m===60&&e.on).length,2);
 assert.equal(run([{m:60,t:.2,dur:2},{m:60,t:.8}],[60]).filter(e=>e.m===60&&e.on).length,2);
});
test('wait-mode practice of Für Elise passes by microphone, with pedal, and stops at a skipped note',()=>{
 const groups=[[76],[75],[76],[75],[76],[71],[74],[72],[45,69],[52],[57],[60],[64],[69],[40,71],[52],[56],[64],[68],[71],[45,72],[52],[57],[64]];
 const events=groups.map((g,i)=>({beat:i,notes:[...g].sort((a,b)=>a-b)}));
 const practise=(notes,seconds=8)=>{const m=new E.Matcher(events),mic=new L.MicListener(rate),audio=render(notes,{rate,seconds});
  for(let t=.045;t*rate<audio.length;t+=.045){const end=Math.round(t*rate);if(end<8192)continue;for(const [n,on] of mic.frame(audio.subarray(end-8192,end),m.index<events.length?events[m.index].notes:[]).events)m.input(n,on);}return m;};
 const play=(gs,dur)=>gs.flatMap((g,i)=>g.map(m=>({m,t:.3+i*.3,dur,amp:.2})));
 assert.equal(practise(play(groups,.45)).index,24,'played cleanly');
 const pedal=practise(play(groups,1.2));assert.equal(pedal.index,24,'with notes ringing');assert.equal(pedal.errors,0);
 assert.equal(practise(play(groups.map((g,i)=>i===7?[]:i>7?[]:g),.45)).index,7,'waits at the skipped C5');
});
