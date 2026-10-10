const {test}=require('node:test');const assert=require('node:assert/strict');const E=require('../site/piano-engine.js');const {setup}=require('./practice-harness.cjs');
const ode=[64,64,65,67];
test('a note played a little early or late still counts; the timing score shows how close it was',()=>{
 const events=[{beat:0,notes:[60]},{beat:1,notes:[62]},{beat:2,notes:[64]},{beat:3,notes:[65]}],w=E.timingWindow(60);assert.equal(w,.35);
 const m=new E.TimedMatcher(events,60,w,0);
 assert.equal(m.input(60,true,.02),'correct');m.input(60,false,.1);
 assert.equal(m.input(62,true,1.25),'correct','a quarter of a second late passes');m.input(62,false,1.3);
 assert.equal(m.input(64,true,1.82),'correct','early passes');m.input(64,false,1.9);
 assert.equal(m.input(65,true,3.5),'wrong','half a second late is outside the window');m.advance(4);
 const r=m.result();assert.equal(r.hit,3);assert.equal(r.missed,1);assert.equal(r.accuracy,60);
 assert.equal(E.timingScore(.02,w),100);assert.equal(E.timingScore(.25,w),33);assert.equal(r.timing,Math.round((100+33+E.timingScore(-.18,w))/3));assert.equal(r.late,1);assert.equal(r.early,1);
 assert.equal(E.timingWindow(200),.2);assert.equal(E.timingWindow(100),.3);
});
test('in-time practice reports accuracy and timing, and slightly late playing still passes',async()=>{
 const ui=setup();ui.api.setTempo(60);ui.api.loopBars(0,0);ui.api.setInput('MIDI');await ui.api.start('play');
 const hits=ode.map((n,i)=>({t:4+i+(i%2?.2:0),n}));let h=0;
 for(let t=0;t<9;t+=.02){ui.setTime(+t.toFixed(3));while(h<hits.length&&hits[h].t<=t+1e-9){ui.note(hits[h].n,true);ui.note(hits[h].n,false);h++;}ui.tick();}
 const r=ui.api.results[0];assert.equal(r.accuracy,100,'all four count');assert.ok(r.timing<100&&r.timing>50,`timing ${r.timing}`);assert.equal(r.late,2);
});
test('Wait mode moves the line at the tempo like Listen, stops at a note until it is played, and never jumps',async()=>{
 const ui=setup();ui.api.setTempo(60);ui.api.loopBars(0,0);ui.api.setInput('MIDI');await ui.api.start('wait'); // the normal page view
 const at=t=>{ui.setTime(t);ui.tick();return ui.api.position;};
 assert.equal(at(0),0,'the line waits at the first note');
 ui.setTime(.1);ui.note(64,true);ui.note(64,false);assert.equal(ui.api.index,1,'first note, on the line');
 assert.ok(Math.abs(at(.6)-.5)<1e-9,'then it moves at the tempo');
 assert.equal(at(1.5),1,'and stops at the next note, which has not been played');
 assert.equal(at(2.5),1,'it keeps waiting there');
 ui.note(64,true);ui.note(64,false);assert.equal(ui.api.index,2,'played late: counted');
 assert.ok(Math.abs(at(2.75)-1.25)<1e-9,'it moves on from the note, at the tempo, without a jump');
 ui.note(65,true);ui.note(65,false);assert.equal(ui.api.index,3,'a note played before the line reached it counts');
 const p=at(2.85);assert.ok(p>1.3&&p<2,`the line glides up to it (at ${p}), it does not jump`);
 assert.ok(Math.abs(at(3.2)-(2+(3.2-2.75-.75/4)))<1e-9,'then it is back at the tempo');
 assert.equal(ui.api.state,'wait');
 const t=ui.api.stats.timing;assert.equal(t,Math.round((E.timingScore(.1,.35)+E.timingScore(1.5,.35)+E.timingScore(-.75,.35))/3),`timing ${t}`);
});
