// Regression tests from the independent review of the practice core.
const {test}=require('node:test');const assert=require('node:assert/strict');const {setup}=require('./practice-harness.cjs');
const ode=[64,64,65,67];
async function steadyLoop(){const ui=setup();ui.api.setTempo(60);ui.api.setClick(true);ui.api.loopBars(0,0);ui.api.setInput('MIDI');await ui.api.start('play');
 // Count-in is 4 beats (4 s); then play bar 1 exactly in time, three times over.
 const hits=[];for(let l=0;l<3;l++)for(let i=0;i<4;i++)hits.push({t:4+l*4+i,n:ode[i]});let h=0;
 for(let t=0;t<16.4;t+=.02){ui.setTime(+t.toFixed(3));while(h<hits.length&&hits[h].t<=t+1e-9){ui.note(hits[h].n,true);ui.note(hits[h].n,false);h++;}ui.tick();}
 return ui;}
test('a repeating in-time loop stays on the beat: every pass of a steady player scores 100%',async()=>{
 const ui=await steadyLoop();const rs=ui.api.results;assert.ok(rs.length>=3,'three passes recorded');
 for(const r of rs.slice(0,3)){assert.equal(r.accuracy,100);assert.equal(r.wrong,0);assert.equal(r.missed,0);}
 assert.equal(JSON.stringify(ui.api.mistakes),'{}');
});
test('loop clicks stay one beat apart across the repeat, with no doubled downbeat',async()=>{
 const ui=await steadyLoop();const at=ui.clicks.map(c=>c.at).filter(t=>t>=4&&t<16);
 for(let i=1;i<at.length;i++)assert.ok(Math.abs(at[i]-at[i-1]-1)<1e-6,`click gap ${at[i]-at[i-1]} at ${at[i]}`);
 assert.equal(at.length,12);
});
test('pressing Play after stopping past the last note restarts the part, not an instant 0%',async()=>{
 const ui=setup();ui.api.setTempo(60);ui.api.loopBars(0,0);ui.api.setInput('MIDI');await ui.api.start('play');
 // Count-in ends at 4 s; stop at beat 3.5, after the bar's last note (beat 3).
 for(let t=0;t<=7.5;t+=.05){ui.setTime(+t.toFixed(3));ui.tick();}assert.ok(ui.api.position>3.4);ui.api.pause();const before=ui.api.results.length;
 await ui.api.start('play');for(let t=0;t<=4.5;t+=.05){ui.setTime(+t.toFixed(3));ui.tick();}
 assert.equal(ui.api.results.length,before,'no instant result');assert.ok(ui.api.position<1,'restarted from the loop start');
});
test('tap input completes a chord pressed one finger at a time',async()=>{
 const ui=setup();ui.importScore({id:'chord',title:'Chord',caption:'test',notes:[{midi:60,beat:0,duration:1,hand:'right'},{midi:64,beat:0,duration:1,hand:'right'},{midi:67,beat:1,duration:1,hand:'right'}]});
 ui.api.setInput('keys');await ui.api.start('wait');
 ui.api.noteOn(60);ui.api.noteOff(60);ui.api.noteOn(64);assert.equal(ui.api.index,1);ui.api.noteOff(64);
 ui.api.noteOn(67);assert.match(ui.feedback(),/Passed this practice! 100%/);
});
test('the previous-bar step crosses an empty bar',()=>{
 const ui=setup();ui.importScore({id:'gap',title:'Gap',caption:'test',beatsPerMeasure:4,notes:[{midi:60,beat:0,duration:4},{midi:62,beat:8,duration:4},{midi:64,beat:12,duration:4}]});
 ui.api.seek(12);ui.api.seekBars(-1);assert.equal(ui.api.position,8);ui.api.seekBars(-1);assert.equal(ui.api.position,0);
});
test('choosing a section clears a bar loop',()=>{
 const ui=setup();ui.importScore({id:'parts',title:'Parts',caption:'test',beatsPerMeasure:4,sections:[{id:'a',title:'A',start:0,end:4},{id:'b',title:'B',start:4,end:8}],notes:[0,1,2,3,4,5,6,7].map(b=>({midi:60+b,beat:b,duration:1}))});
 ui.api.loopBars(0,0);assert.equal(ui.api.events.length,4);const section=ui.nodes.find(n=>n.id==='trainer-section');section.value='b';section.onchange();
 assert.equal(ui.api.loop,null);assert.equal(ui.api.events[0].beat,4);
});
