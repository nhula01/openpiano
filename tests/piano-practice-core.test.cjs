const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const E=require('../site/piano-engine.js');
// Same minimal DOM as piano-player.test.cjs, plus access to window.PianoPractice.
function setup(){
 const nodes=[];class Element{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.textContent='';this._value='';nodes.push(this);}append(...n){this.children.push(...n);}insertBefore(n,b){this.children.splice(this.children.indexOf(b),0,n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this.attrs[k]=v;}get value(){return this._value||this.children.find(n=>n.tag==='option')?.value||'';}set value(v){this._value=v;}get options(){return this.children;}addEventListener(){}click(){return this.onclick?.();}}
 const root=new Element('section'),tempo=new Element('input'),metronome=new Element('button');tempo.value='60';metronome.textContent='Start metronome';let audio;
 const input={id:'keyboard',name:'Test keyboard',state:'connected'},access={inputs:new Map([['keyboard',input]])};const storage=new Map();
 class AudioContext{constructor(){audio=this;this.sampleRate=48000;this.currentTime=0;}resume(){return Promise.resolve();}close(){return Promise.resolve();}}
 const window={PianoEngine:E,addEventListener(){}};
 const context={window,document:{createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),querySelector:s=>s==='#note-trainer'?root:s==='#tempo'?tempo:s==='#metronome'?metronome:null,addEventListener(){}},navigator:{requestMIDIAccess:async()=>access},AudioContext,Float32Array,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},setTimeout,clearTimeout,console};
 vm.runInNewContext(fs.readFileSync('site/piano-fingering.js','utf8'),context);
 vm.runInNewContext(fs.readFileSync('site/piano-player.js','utf8'),context);
 const button=text=>nodes.find(n=>n.tag==='button'&&n.textContent===text),feedback=()=>nodes.find(n=>n.className==='trainer-feedback').textContent;
 const play=notes=>{for(const n of notes){input.onmidimessage({data:[144,n,100]});input.onmidimessage({data:[128,n,0]});}};
 return {api:window.PianoPractice,button,feedback,storage,input,play,tempo};
}
// Ode to Joy built-in excerpt: 4 beats per bar; bars 1–2 are the first eight notes.
const ode=[64,64,65,67,67,65,64,62,60,60,62,64,64,62,62];

test('a bar loop repeats without stopping and never stores a piece pass',async()=>{
 const ui=setup();ui.api.loopBars(0,1);assert.equal(ui.api.events.length,8);assert.equal(ui.api.loop.title,'Bars 1–2');
 await ui.button('Connect MIDI').onclick();ui.play(ode.slice(0,8));
 assert.match(ui.feedback(),/Loop 1 · 100%/);assert.equal(ui.api.state,'wait');assert.equal(ui.api.index,0);
 ui.play(ode.slice(0,8));assert.match(ui.feedback(),/Loop 2 · 100%/);
 assert.equal(ui.api.results.length,2);assert.equal(ui.storage.get('journey-note-passes-v1'),undefined);
 ui.api.clearLoop();assert.equal(ui.api.events.length,15);assert.equal(ui.api.loop,null);
});

test('the speed trainer raises tempo after each clean loop until the target',async()=>{
 const ui=setup();ui.api.setTempo(60);ui.api.setSpeedTrainer({on:true,step:4,target:66});ui.api.loopBars(0,0);
 await ui.button('Connect MIDI').onclick();
 ui.play(ode.slice(0,4));assert.equal(ui.api.tempo,64);
 ui.play(ode.slice(0,4));assert.equal(ui.api.tempo,66);
 ui.play(ode.slice(0,4));assert.equal(ui.api.tempo,66,'stops at the target');
 assert.equal(ui.tempo.value,'66','sidebar metronome follows');
});

test('a loop below 90% does not speed up, and wrong notes are counted on their bar',async()=>{
 const ui=setup();ui.api.setTempo(60);ui.api.setSpeedTrainer({on:true,step:4,target:80});ui.api.loopBars(1,1);
 await ui.button('Connect MIDI').onclick();
 ui.play([50]);ui.play(ode.slice(4,8));
 assert.equal(ui.api.tempo,60);assert.equal(JSON.stringify(ui.api.mistakes),'{"1":1}');assert.equal(ui.api.results[0].accuracy,80);
});

test('tap input plays through the same matcher and can pass the piece',async()=>{
 const ui=setup();ui.api.setInput('keys');await ui.api.start('wait');assert.equal(ui.api.mode,'keys');
 for(const n of ode){ui.api.noteOn(n);ui.api.noteOff(n);}
 assert.match(ui.feedback(),/Passed this practice! 100%/);assert.match(ui.storage.get('journey-note-passes-v1'),/keys/);
 const log=JSON.parse(ui.storage.get('openpiano-practice-log-v1'));assert.equal(log.pieces.ode.attempts,1);assert.equal(log.pieces.ode.best,100);
});

test('seeking by bars moves the start to the first note of that bar',()=>{
 const ui=setup();ui.api.seekBars(2);assert.equal(ui.api.position,8);assert.match(ui.feedback(),/Ready here · C4/);ui.api.seekBars(-1);assert.equal(ui.api.position,4);
});
