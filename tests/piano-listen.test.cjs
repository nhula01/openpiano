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
 log=run([{m:48,t:.2}],[48,65]);assert.ok(!heard(log,65),'F4 shares one overtone with C3 but has its own partials');
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
  for(let t=.045;t*rate<audio.length;t+=.045){const end=Math.round(t*rate),frame=new Float32Array(16384);for(let i=0;i<16384;i++)frame[i]=audio[end-16384+i]||0;
   for(const [n,on] of mic.frame(frame,m.index<events.length?events[m.index].notes:[],t,events[m.index+1]?.notes||[]).events)m.input(n,on);}return m;};
 const play=(gs,dur)=>gs.flatMap((g,i)=>g.map(m=>({m,t:.3+i*.3,dur,amp:.2})));
 assert.equal(practise(play(groups,.45)).index,24,'played cleanly');
 const pedal=practise(play(groups,1.2));assert.equal(pedal.index,24,'with notes ringing');assert.equal(pedal.errors,0);
 assert.equal(practise(play(groups.map((g,i)=>i===7?[]:i>7?[]:g),.45)).index,7,'waits at the skipped C5');
});
test('a neighbouring key is not taken for the wanted note, even while the wanted note still rings',()=>{
 for(const [first,wrong] of [[64,63],[64,65],[60,61],[72,71]]){const log=run([{m:first,t:.2,dur:2,amp:.2},{m:wrong,t:.9,amp:.2}],t=>t<.8?[first]:[first],1.6);
  assert.equal(log.filter(e=>e.m===first&&e.on).length,1,`${E.noteName(wrong)} after ${E.noteName(first)} counted as ${E.noteName(first)}`);assert.ok(heard(log,wrong),`${E.noteName(wrong)} reported`);}
});
test('each note reports when it was struck, to within a few milliseconds',()=>{
 const strikes=[.31,.62,.93,1.24];const log=run(strikes.map((t,i)=>({m:[60,64,67,72][i],t,amp:.2})),t=>{const i=strikes.filter(x=>x<=t).length-1;return i<0?[60]:[[60,64,67,72][i]];},1.8);
 for(const [i,t] of strikes.entries()){const e=log.find(x=>x.on&&x.m===[60,64,67,72][i]);assert.ok(e,E.noteName([60,64,67,72][i]));assert.ok(Math.abs(e.at-t)<.02,`${E.noteName(e.m)} at ${e.at}, struck ${t}`);}
});
test('a quiet piano in a quiet room and a loud one in a noisy room are heard the same',()=>{
 for(const [amp,noise] of [[.01,.00005],[.2,.0015],[.9,.01]]){const log=listen(new L.MicListener(rate),render([{m:57,t:.2,amp},{m:64,t:.6,amp},{m:69,t:1,amp}],{rate,seconds:1.6,noise}),[57,64,69],{rate});
  for(const m of [57,64,69])assert.ok(heard(log,m),`${E.noteName(m)} at level ${amp}`);assert.ok(!log.some(e=>e.on&&![57,64,69].includes(e.m)),`stray note at level ${amp}`);}
});
test('ringing notes alone never make a note count (no strike, no note)',()=>{
 const log=listen(new L.MicListener(rate),render([{m:45,t:.1,dur:3,amp:.3},{m:57,t:.1,dur:3,amp:.2}],{rate,seconds:2.5}),t=>t<.5?[45,57]:[64],{rate});
 assert.ok(!log.some(e=>e.on&&e.m===64),'E4 never played');
});
test('a piano that is out of tune (nearly a quarter tone flat or sharp) is still heard after a few notes',()=>{
 const melody=[60,62,64,65,67,69,71,72,71,69,67,65,64,62,60,64,67,72];
 for(const cents of [-45,45]){const notes=melody.map((m,i)=>({m,t:.3+i*.35,dur:.3,amp:.2}));
  const log=listen(new L.MicListener(rate),render(notes,{rate,seconds:.6+melody.length*.35,cents}),t=>{const i=Math.max(0,Math.min(melody.length-1,Math.floor((t-.3)/.35)));return [melody[i]];},{rate});
  const heardAt=melody.map((m,i)=>log.some(e=>e.on&&e.m===m&&Math.abs(e.at-(.3+i*.35))<.05));
  assert.ok(heardAt.slice(5).every(Boolean),`${cents} cents: missed ${heardAt.map((h,i)=>h?'':E.noteName(melody[i])+'#'+i).filter(Boolean).join(' ')}`);
  assert.ok(!log.some(e=>e.on&&!melody.includes(e.m)),`${cents} cents: stray notes`);}
});
