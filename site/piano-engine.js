/* Local score decoding and pitch matching; shared by browser and tests. */
(function(root){
'use strict';
const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const noteName=n=>names[n%12]+(Math.floor(n/12)-1);
function pitch(samples,rate){
 let rms=0;for(const x of samples)rms+=x*x;rms=Math.sqrt(rms/samples.length);if(rms<.008)return null;
 const min=Math.floor(rate/2200),max=Math.min(Math.floor(rate/32.7),Math.floor(samples.length/2));const diff=new Float64Array(max+1);let sum=0,best=0;
 for(let lag=1;lag<=max;lag++){let d=0;for(let i=0;i<samples.length-max;i++){const x=samples[i]-samples[i+lag];d+=x*x;}sum+=d;diff[lag]=sum?d*lag/sum:1;}
 for(let lag=min;lag<max-1;lag++){if(diff[lag]<.12){while(lag+1<max&&diff[lag+1]<diff[lag])lag++;best=lag;break;}}
 if(!best)return null;const a=diff[best-1],b=diff[best],c=diff[best+1],offset=(a-c)/(2*(a-2*b+c)||1);const frequency=rate/(best+Math.max(-1,Math.min(1,offset)));const exact=69+12*Math.log2(frequency/440),midi=Math.round(exact);if(midi<24||midi>96||Math.abs(exact-midi)>.35)return null;return {midi,frequency,rms};
}
function parseMidi(buffer){
 const data=new DataView(buffer);let pos=0;const need=n=>{if(pos+n>data.byteLength)throw Error('Truncated MIDI file.');};const u8=()=>{need(1);return data.getUint8(pos++);};const u16=()=>{need(2);const v=data.getUint16(pos);pos+=2;return v;};const u32=()=>{need(4);const v=data.getUint32(pos);pos+=4;return v;};const tag=()=>String.fromCharCode(u8(),u8(),u8(),u8());const vlq=()=>{let n=0;for(let i=0;i<4;i++){const b=u8();n=n*128+(b&127);if(!(b&128))return n;}throw Error('Invalid MIDI timing.');};
 if(tag()!=='MThd')throw Error('Choose a standard .mid file.');const size=u32();if(size<6)throw Error('Invalid MIDI header.');need(size);const format=u16(),tracks=u16(),division=u16();pos+=size-6;if(format>1||division&0x8000||!division||!tracks||tracks>128)throw Error('Use a format 0/1 MIDI file with beat-based timing.');
 const notes=[];let endTick=0;for(let t=0;t<tracks;t++){if(tag()!=='MTrk')throw Error('Invalid MIDI track.');const length=u32();need(length);const end=pos+length;let tick=0,running=0;const active=new Map();while(pos<end){tick+=vlq();let status=u8();if(status<128){if(!running)throw Error('Invalid MIDI event.');pos--;status=running;}else if(status<240)running=status;
 if(status===255){running=0;u8();const n=vlq();need(n);pos+=n;}else if(status===240||status===247){running=0;const n=vlq();need(n);pos+=n;}else if(status>=128&&status<240){const type=status&240,ch=status&15,a=u8(),b=(type===192||type===208)?0:u8();if(a>127||b>127)throw Error('Invalid MIDI note data.');const k=ch+':'+a;if(ch!==9&&type===144&&b>0){if(active.has(k)){const old=active.get(k);notes.push({...old,duration:(tick-old.tick)/division});}active.set(k,{midi:a,tick,beat:tick/division,track:t,channel:ch});}else if((type===128||(type===144&&!b))&&active.has(k)){const old=active.get(k);notes.push({...old,duration:(tick-old.tick)/division});active.delete(k);}}else throw Error('Unsupported MIDI event.');if(pos>end)throw Error('Invalid MIDI track length.');}endTick=Math.max(endTick,tick);for(const old of active.values())notes.push({...old,duration:Math.max(.25,(tick-old.tick)/division)});}
 if(!notes.length)throw Error('No pitched notes found in this MIDI file.');if(notes.length>20000)throw Error('Choose a shorter MIDI file (up to 20,000 notes).');Object.defineProperty(notes,'endBeat',{value:endTick/division});return notes.sort((a,b)=>a.beat-b.beat||a.midi-b.midi);
}
function groups(notes,voice='melody'){
 const hand=voice.startsWith('right')?'right':voice.startsWith('left')?'left':null;
 const selected=hand?notes.filter(n=>n.hand===hand):notes;
 const events=[];for(const n of selected){let last=events[events.length-1];if(!last||Math.abs(last.beat-n.beat)>.000001){last={beat:n.beat,notes:[],members:[],duration:n.duration};events.push(last);}last.notes.push(n.midi);last.members.push(n);last.duration=Math.max(last.duration,n.duration);}
 return events.map(e=>({...e,notes:['melody','rightMelody'].includes(voice)?[Math.max(...e.notes)]:['bass','leftBass'].includes(voice)?[Math.min(...e.notes)]:[...new Set(e.notes)].sort((a,b)=>a-b)}));
}
// Copy only checked printed annotations; blank notes stay blank.
function editorialFingering(events,hand,source,sections=[]){
 return events.map(e=>{let beat=e.beat;const part=sections?.find(s=>beat>=s.start&&beat<s.end);
  const repeats={'a2':32,'a-return':128,'b2':32,'c2':32,'d2':32};if(part&&repeats[part.id])beat-=repeats[part.id];
  const printed=source?.anchors?.[beat]?.[hand]||{};
  return {fingers:Object.fromEntries(Object.entries(printed).filter(([n])=>e.notes.includes(Number(n))&&(!e.members?.length||e.members.some(m=>m.midi===Number(n)&&m.hand===hand)))),warning:'',source:'editorial'};
 });
}
class Matcher{
 constructor(events){this.events=events;this.index=0;this.errors=0;this.held=new Set();this.releaseRequired=new Set();}
 input(midi,on){if(!on){this.held.delete(midi);this.releaseRequired.delete(midi);return 'release';}if(this.held.has(midi))return 'held';this.held.add(midi);if(this.index>=this.events.length)return 'complete';const expected=this.events[this.index].notes;if(!expected.includes(midi)){this.errors++;return 'wrong';}if(this.releaseRequired.has(midi))return 'release-first';if(expected.every(n=>this.held.has(n)&&!this.releaseRequired.has(n))){expected.forEach(n=>this.releaseRequired.add(n));this.index++;return this.index===this.events.length?'complete':'correct';}return 'partial';}
}
class TimedMatcher {
 constructor(events,bpm=60,windowSeconds=.16,startBeat=null){this.events=events;this.startBeat=startBeat??events[0].beat;this.bpm=bpm;this.window=windowSeconds;this.hits=events.map(()=>new Set());this.states=events.map(()=> 'pending');this.errors=0;this.held=new Set();}
 due(i){return (this.events[i].beat-this.startBeat)*60/this.bpm;}
 advance(seconds){this.states.forEach((state,i)=>{if(state==='pending'&&seconds>this.due(i)+this.window)this.states[i]='missed';});}
 input(midi,on,seconds){if(!on){this.held.delete(midi);return 'release';}if(this.held.has(midi))return 'held';this.held.add(midi);this.advance(seconds);let best=-1,distance=Infinity;this.events.forEach((e,i)=>{const d=Math.abs(seconds-this.due(i));if(this.states[i]==='pending'&&e.notes.includes(midi)&&!this.hits[i].has(midi)&&d<=this.window&&d<distance){best=i;distance=d;}});if(best<0){this.errors++;return 'wrong';}this.hits[best].add(midi);if(this.events[best].notes.every(n=>this.hits[best].has(n)))this.states[best]='hit';return this.states[best]==='hit'?'correct':'partial';}
 result(){const hit=this.states.filter(s=>s==='hit').length,missed=this.states.filter(s=>s==='missed').length,total=this.events.length;return {hit,missed,total,errors:this.errors,accuracy:Math.floor(100*hit/(total+this.errors)),complete:hit+missed===total};}
}
const api={noteName,pitch,parseMidi,groups,editorialFingering,Matcher,TimedMatcher};if(typeof module!=='undefined')module.exports=api;else root.PianoEngine=api;
})(typeof window!=='undefined'?window:globalThis);
