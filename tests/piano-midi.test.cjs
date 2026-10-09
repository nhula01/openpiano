const {test}=require('node:test');const assert=require('node:assert/strict');const {setup}=require('./practice-harness.cjs');
const ode=[64,64,65,67,67,65,64,62,60,60,62,64,64,62,62];
const keyboard=(id,name)=>({id,name,state:'connected'});
const press=(input,n)=>{input.onmidimessage?.({data:[144,n,90]});input.onmidimessage?.({data:[128,n,0]});};

test('every connected keyboard is heard, not only the first one listed',async()=>{
 const a=keyboard('a','USB MIDI Interface'),b=keyboard('b','Digital Piano');const access={inputs:new Map([['a',a],['b',b]])};
 const ui=setup({midi:{access}});ui.api.setInput('MIDI');await ui.api.start('wait');
 assert.match(ui.feedback(),/MIDI ready \(USB MIDI Interface, Digital Piano\)/);
 for(const n of ode.slice(0,4))press(b,n);
 assert.equal(ui.api.index,4,'notes from the second keyboard count');
});
test('a keyboard plugged in after Practice connects by itself',async()=>{
 const access={inputs:new Map(),onstatechange:null};const ui=setup({midi:{access}});ui.api.setInput('MIDI');await ui.api.start('wait');
 assert.match(ui.feedback(),/No MIDI keyboard found/);
 const k=keyboard('k','Roland FP-30');access.inputs.set('k',k);access.onstatechange({port:k});
 assert.match(ui.feedback(),/MIDI ready \(Roland FP-30\)/);press(k,64);assert.equal(ui.api.index,1);
 assert.equal(JSON.stringify(ui.api.inputStatus.midi.devices),'["Roland FP-30"]');
});
test('browsers without MIDI and blocked permission get a clear way forward',async()=>{
 let ui=setup({midi:null});ui.api.setInput('MIDI');await ui.api.start('wait');assert.match(ui.feedback(),/cannot use MIDI keyboards.*Chrome or Edge.*microphone/);
 ui=setup({midi:{request:async()=>{const e=new Error('denied');e.name='SecurityError';throw e;}}});ui.api.setInput('MIDI');await ui.api.start('wait');
 assert.match(ui.feedback(),/MIDI is blocked for this site/);assert.equal(ui.api.inputStatus.midi.permission,'denied');
});
test('checking for keyboards shows keys without starting practice, and the choice of input is remembered',async()=>{
 const k=keyboard('k','Yamaha P-45');const ui=setup({midi:{access:{inputs:new Map([['k',k]])}}});
 assert.equal(await ui.api.probeMidi(),'');assert.equal(JSON.stringify(ui.api.inputStatus.midi.devices),'["Yamaha P-45"]');
 press(k,60);assert.equal(ui.api.inputStatus.midi.last,60);assert.equal(ui.api.index,0,'not practising');
 ui.api.setInput('MIDI');assert.equal(ui.storage.get('openpiano-input-v1'),'MIDI');
});
