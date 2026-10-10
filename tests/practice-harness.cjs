const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const E=require('../site/piano-engine.js');
const SITE=path.join(__dirname,'..','site');
function setup({repertoire=false,midi,progress=false,storage:seed}={}){
 const nodes=[];class Element{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.textContent='';this._value='';this.listeners={};nodes.push(this);}append(...n){this.children.push(...n);}insertBefore(n,b){this.children.splice(this.children.indexOf(b),0,n);}replaceChildren(...n){this.children=n;}setAttribute(k,v){this.attrs[k]=v;}get value(){return this._value||this.children.find(n=>n.tag==='option')?.value||'';}set value(v){this._value=v;}get options(){return this.children;}addEventListener(t,f){(this.listeners[t]=this.listeners[t]||[]).push(f);}click(){return this.onclick?.();}scrollIntoView(){}}
 const root=new Element('section'),tempo=new Element('input'),metronome=new Element('button');tempo.value='60';metronome.textContent='Start metronome';let audio,frame=null;
 const input={id:'keyboard',name:'Test keyboard',state:'connected'},access={inputs:new Map([['keyboard',input]])};const storage=new Map(seed?Object.entries(seed):[]);
 const plays=[],clicks=[];
 class AudioContext{constructor(){audio=this;this.sampleRate=48000;this.currentTime=0;}resume(){return Promise.resolve();}close(){this.closed=true;return Promise.resolve();}}
 const docListeners={};
 const winListeners={};const window={PianoEngine:E,PianoListen:require('../site/piano-listen.js'),addEventListener(t,f){(winListeners[t]=winListeners[t]||[]).push(f);},PianoGrand:{load:async()=>{},play:(c,n,at,dur,vel)=>{const r={n,at,dur,vel,stopped:false,stop(){r.stopped=true;}};plays.push(r);return r;}},PianoClick:{at:(c,at,accent)=>{const r={at,accent,stop(){r.stopped=true;}};clicks.push(r);return r;}},dispatchEvent(){}};
 const context={window,document:{createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),querySelector:s=>s==='#note-trainer'?root:s==='#tempo'?tempo:s==='#metronome'?metronome:null,addEventListener(t,f){(docListeners[t]=docListeners[t]||[]).push(f);},body:{dataset:{}}},navigator:midi===null?{}:{requestMIDIAccess:midi?.request||(async()=>midi?.access||access)},AudioContext,Float32Array,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame:cb=>(frame=cb,1),cancelAnimationFrame:()=>{frame=null;},setTimeout,clearTimeout,console,CustomEvent:class{constructor(t,o){this.type=t;this.detail=o?.detail;}}};
 if(repertoire)vm.runInNewContext(fs.readFileSync(SITE+'/piano-repertoire.js','utf8'),context);
 vm.runInNewContext(fs.readFileSync(SITE+'/piano-fingering.js','utf8'),context);
 if(progress)vm.runInNewContext(fs.readFileSync(SITE+'/piano-progress.js','utf8'),context);
 vm.runInNewContext(fs.readFileSync(SITE+'/piano-player.js','utf8'),context);
 const button=text=>nodes.find(n=>n.tag==='button'&&n.textContent===text),feedback=()=>nodes.find(n=>n.className==='trainer-feedback').textContent;
 const note=(n,on=true)=>input.onmidimessage?.({data:[on?144:128,n,on?100:0]});
 const key=(type,k,extra={})=>{const e={key:k,target:{tagName:'BODY'},preventDefault(){},...extra};for(const f of docListeners[type]||[])f(e);};
 const importScore=s=>{for(const f of winListeners['piano-import-score']||[])f({detail:s});};return {importScore,api:window.PianoPractice,window,button,feedback,storage,input,note,plays,clicks,nodes,key,tempo,get audio(){return audio;},setTime(t){audio.currentTime=t;},tick(){const cb=frame;frame=null;cb?.();},get frame(){return frame;}};
}
module.exports={setup,E};
