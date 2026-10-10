'use strict';
/* Stage. Practice fills the window like a rehearsal stage: one sheet line, falling notes, both,
   or full pages; the piece in parts you tap to loop, with progress per part; a heat-map timeline
   with a draggable playhead; swipe the music to move bar by bar; one floating transport; a summary
   after each run. Navigation shrinks to a slim top bar with piece search. */
(()=>{
const K=window.PianoPracticeKit,P=()=>window.PianoPractice,{el,icon,button,segmented,toggle}=K;
const VIEW_KEY='openpiano-stage-view';
const INPUTS=[['microphone','Microphone','mic'],['MIDI','MIDI keyboard','keys'],['keys','Tap or type','tap']];
const NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const COLORS={right:'#6fa3e0',left:'#e08aa6',rightDim:'rgba(111,163,224,.28)',leftDim:'rgba(224,138,166,.28)',lamp:'#f0b35a',grid:'rgba(236,232,222,.06)',bar:'rgba(236,232,222,.14)'};

// Key geometry matches the engine's keyboard drawing: 52 white keys, 20 units each.
const KEYS=(()=>{const map=new Map();let w=0;for(let n=21;n<=108;n++){if([1,3,6,8,10].includes(n%12))map.set(n,{x:w*20-6,w:12,black:true});else{map.set(n,{x:w*20,w:20,black:false});w++;}}return map;})();

// The keyboard and the falling notes zoom to the piece's range, in whole octaves (at least three).
const view={x0:0,x1:1040};
function fitRange(keyboard){const p=P();if(!p?.score)return;const notes=(p.score.notes||[]).filter(n=>!p.loop||(n.beat>=p.loop.start&&n.beat<p.loop.end)).map(n=>n.midi);if(!notes.length)return;let lo=Math.min(...notes),hi=Math.max(...notes);lo-=lo%12;hi+=11-hi%12;while(hi-lo<35){if(lo>24)lo-=12;else hi+=12;}lo=Math.max(21,lo);hi=Math.min(108,hi);const a=KEYS.get(lo),b=KEYS.get(hi);view.x0=a.black?a.x-4:a.x;view.x1=b.x+(b.black?16:20);keyboard?.setAttribute('viewBox',`${view.x0} 0 ${view.x1-view.x0} 125`);}
function waterfall(canvas){
 const ctx=canvas.getContext('2d');let shown=0,last=0,dpr=1,W=0,H=0;
 const fit=()=>{dpr=Math.min(2,window.devicePixelRatio||1);const r=canvas.getBoundingClientRect();W=r.width;H=r.height;canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);};
 new ResizeObserver(fit).observe(canvas);fit();
 function frame(t){requestAnimationFrame(frame);const p=P();if(!p?.score||canvas.offsetParent===null||!W||!H)return;
  const dt=Math.min(.1,(t-last)/1000);last=t;const target=p.position;
  if(p.state==='idle'||Math.abs(target-shown)>8)shown=target;else shown+=(target-shown)*Math.min(1,dt*(p.state==='wait'?9:30));
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const sx=W/(view.x1-view.x0),ox=view.x0,hit=H-2,beats=Math.max(4,p.meter*4),ppb=(H-8)/beats,m=p.meter;
  // octave guides at each C, bar lines across
  ctx.fillStyle=COLORS.grid;for(const[n,k]of KEYS)if(n%12===0)ctx.fillRect((k.x-ox)*sx,0,1,H);
  ctx.fillStyle=COLORS.bar;for(let b=Math.ceil(shown/m)*m;b<shown+beats;b+=m){const y=hit-(b-shown)*ppb;ctx.fillRect(0,y,W,1);ctx.font='11px "Instrument Sans",sans-serif';ctx.fillStyle='rgba(236,232,222,.4)';ctx.fillText(String(Math.round(b/m)+1),6,y-4);ctx.fillStyle=COLORS.bar;}
  const practiced=p.events,others=p.otherEvents,idx=p.index,loop=p.loop;
  const draw=(list,dim)=>{for(let i=0;i<list.length;i++){const e=list[i];if(e.beat>shown+beats)break;for(const mem of e.members){if(!e.notes.includes(mem.midi))continue;const end=e.beat+(mem.duration??e.duration);if(end<shown-.05)continue;const k=KEYS.get(Math.max(21,Math.min(108,mem.midi)));if(!k)continue;
     const y1=hit-(e.beat-shown)*ppb,y0=hit-(end-shown)*ppb,x=(k.x-ox)*sx+1,w=Math.max(3,k.w*sx-2),top=Math.max(-4,y0),bottom=Math.min(hit,y1);if(bottom<=top)continue;
     const hand=mem.hand==='left'?'left':mem.hand==='right'?'right':(mem.midi<60?'left':'right');const done=!dim&&p.state==='wait'&&i<idx;
     ctx.fillStyle=dim?COLORS[hand+'Dim']:done?'rgba(124,199,154,.55)':COLORS[hand];const r=Math.min(5,w/2);ctx.beginPath();ctx.roundRect?ctx.roundRect(x,top,w,bottom-top,r):ctx.rect(x,top,w,bottom-top);ctx.fill();
     if(!dim&&!done&&bottom-top>18&&w>9){ctx.fillStyle='rgba(20,22,32,.75)';ctx.font=`600 ${Math.min(12,w*.7)}px "Instrument Sans",sans-serif`;ctx.textAlign='center';ctx.fillText(NAMES[mem.midi%12].replace('♯','#'),x+w/2,bottom-5);ctx.textAlign='left';}}}};
  draw(others,true);draw(practiced,false);
  if(loop){const y=hit-(loop.end-shown)*ppb;if(y>0&&y<H){ctx.fillStyle=COLORS.lamp;ctx.globalAlpha=.6;ctx.fillRect(0,y,W,2);ctx.globalAlpha=1;}}
  const g=ctx.createLinearGradient(0,hit-16,0,hit);g.addColorStop(0,'rgba(240,179,90,0)');g.addColorStop(1,'rgba(240,179,90,.35)');ctx.fillStyle=g;ctx.fillRect(0,hit-16,W,16);ctx.fillStyle=COLORS.lamp;ctx.fillRect(0,hit,W,2);}
 requestAnimationFrame(frame);}

// Parts: the piece's practice blocks, or even chunks of 4, 8 or 16 bars.
const PARTS_KEY='openpiano-stage-parts-v1';
const STEPS=[['R','Right hand'],['L','Left hand'],['B','Both hands'],['T','Both hands in time']];
function partsOf(p){const blocks=(p.sections||[]).filter(s=>/^block-/.test(s.id));const m=p.meter,bars=p.barCount;
 if(blocks.length>1)return blocks.map(b=>({start:b.start,end:b.end}));const size=bars<=24?4:bars<=64?8:16,out=[];for(let b=0;b<bars;b+=size)out.push({start:b*m,end:Math.min(bars,b+size)*m});return out;}
function readParts(){try{return JSON.parse(localStorage.getItem(PARTS_KEY))||{};}catch{return {};}}
function stepOf(r){if(r.kind==='play')return r.hands==='BH'?'T':r.hands==='LH'?'L':'R';return r.hands==='BH'?'B':r.hands==='LH'?'L':'R';}
function build(){const p=P();if(!p)return;document.body.dataset.shell='stage';const parts=K.adopt();for(const n of parts.legacy)n.hidden=true;const root=parts.root;
 // Slim top bar: search lives in the navigation.
 const rail=document.querySelector('.rail');if(rail){const search=button('Search pieces',{icon:'search',cls:'sg-search'});search.append(el('kbd',/Mac|iPhone|iPad/.test(navigator.platform)?'⌘K':'Ctrl K'));search.onclick=()=>K.picker().open();rail.querySelector('.tabs')?.after(search);}

 const stage=el('section',undefined,'sg-stage');stage.setAttribute('aria-label','Practice stage');
 const hud=el('div',undefined,'sg-hud');const who=el('div',undefined,'sg-who');const title=el('h1',undefined,'sg-title');const sub=el('p',undefined,'sg-sub');who.append(title,sub);
 let view=(()=>{try{return localStorage.getItem(VIEW_KEY)||'split';}catch{return 'split';}})();
 const views=segmented('View',[['sheet','Sheet'],['notes','Falling notes'],['split','Both'],['full','Full sheet']],v=>{view=v;try{localStorage.setItem(VIEW_KEY,v);}catch{}layout();},'sg-views');
 const live=el('div',undefined,'sg-live');const accBox=el('div',undefined,'sg-stat');const acc=el('strong','—');accBox.append(acc,el('span','accuracy'));const runBox=el('div',undefined,'sg-stat');const runN=el('strong','0');runBox.append(runN,el('span','in a row'));const doneBox=el('div',undefined,'sg-stat');const doneN=el('strong','0');doneBox.append(doneN,el('span','notes'));const timeBox=el('div',undefined,'sg-stat');const timeN=el('strong','—');timeBox.append(timeN,el('span','timing'));timeBox.hidden=true;timeBox.title='How close to the beat: full marks within 50 ms, less the further off';live.append(accBox,timeBox,runBox,doneBox);
 hud.append(who,views.node,live);

 const screen=el('div',undefined,'sg-screen');const sheet=el('div',undefined,'sg-sheet');if(parts.score){parts.score.dataset.stacked='1';sheet.append(parts.score);}const pager=el('div',undefined,'sg-pager');const pv=button('Previous page',{icon:'prev',cls:'sg-icon',iconOnly:true});pv.onclick=()=>p.pages.prev();const nx=button('Next page',{icon:'next',cls:'sg-icon',iconOnly:true});nx.onclick=()=>p.pages.next();const pt=el('span');pager.append(pv,pt,nx);sheet.append(pager);
 const fall=el('canvas',undefined,'sg-fall');fall.setAttribute('role','img');fall.setAttribute('aria-label','Falling notes: each bar drops onto the key to play. Right hand blue, left hand pink.');
 screen.append(sheet,fall);
 const keys=el('div',undefined,'sg-keys');if(parts.keyboard){parts.keyboard.setAttribute('preserveAspectRatio','none');keys.append(parts.keyboard);}
 const line=el('div',undefined,'sg-line');if(parts.feedback){parts.feedback.className='trainer-feedback sg-feedback';line.append(parts.feedback);}
 const timeline=el('div',undefined,'sg-timeline');const ruler=el('div',undefined,'sg-parts');ruler.setAttribute('role','group');ruler.setAttribute('aria-label','Parts of this piece. Tap a part to loop it; tap it again to play the whole piece.');timeline.append(ruler);K.barStrip(timeline,{knob:true});
 stage.append(hud,screen,keys,line,timeline);

 // Floating transport
 const deck=el('div',undefined,'sg-deck');deck.setAttribute('role','toolbar');deck.setAttribute('aria-label','Practice controls');
 let mode='wait';const modes=segmented('How to practise',[['wait','Wait'],['play','In time'],['listen','Listen']],v=>{mode=v;if(p.state!=='idle')p.pause();sync();},'sg-seg');
 modes.buttons[0].title='The line moves at your tempo, like Listen, and stops at a note until you play it right';modes.buttons[1].title='The music keeps moving; notes count if you play them on time';modes.buttons[2].title='Hear the grand piano play';
 const back=button('Back to start',{icon:'restart',cls:'sg-icon',iconOnly:true,title:'Back to start ( R )'});back.onclick=()=>p.restart();
 const prevBar=button('Previous bar',{icon:'prev',cls:'sg-icon',iconOnly:true,title:'Previous bar ( ← )'});prevBar.onclick=()=>p.seekBars(-1);const nextBar=button('Next bar',{icon:'next',cls:'sg-icon',iconOnly:true,title:'Next bar ( → )'});nextBar.onclick=()=>p.seekBars(1);
 const go=el('button',undefined,'sg-go');go.type='button';go.onclick=()=>{if(p.state==='idle')p.start(mode);else p.pause();};
 const hands=segmented('Hands',[['LH','L','','Left hand ( 1 )'],['RH','R','','Right hand ( 2 )'],['BH','Both','','Both hands ( 3 )']],v=>p.setHands(v),'sg-seg small');
 const tempo=el('div',undefined,'sg-tempo');const tm=button('Slower',{cls:'sg-icon',iconOnly:true,title:'Slower ( [ )'});tm.textContent='−';tm.onclick=()=>p.setTempo(p.tempo-5);const tv=el('span',undefined,'sg-tempo-val');const tp=button('Faster',{cls:'sg-icon',iconOnly:true,title:'Faster ( ] )'});tp.textContent='+';tp.onclick=()=>p.setTempo(p.tempo+5);tempo.append(tm,tv,tp);
 const loopB=button('Loop',{icon:'loop',cls:'sg-tog',title:'Loop this bar and the next ( L ), or drag across the timeline'});loopB.onclick=()=>{if(p.loop)p.clearLoop();else{const b=p.barOf(p.position);p.loopBars(b,b+1);}};
 const clickT=toggle('Click','click',v=>p.setClick(v),'sg-tog');const otherT=toggle('Other hand','accompany',v=>p.setAccompany(v),'sg-tog');
 const more=el('details',undefined,'sg-more');const moreSum=el('summary');moreSum.append(icon('settings'),el('span','Settings','sr'));moreSum.title='Input and sheet settings';more.append(moreSum);
 const morePanel=el('div',undefined,'sg-more-panel');const inSeg=segmented('Listen with',INPUTS.map(([v,l,ic])=>[v,l,ic]),v=>{p.setInput(v);sync();},'sg-list');const typeSeg=segmented('Sheet',[['sheet','Pages'],['guide','One scrolling line']],v=>p.setType(v),'sg-list');const fingerT=toggle('Printed fingering','hands',v=>p.setFingering(v),'sg-tog wide');const speedT=toggle('Speed up after clean loops','loop',v=>p.setSpeedTrainer({on:v,step:4,target:Math.min(200,p.tempo+20)}),'sg-tog wide');const keysHelp=button('Keyboard shortcuts',{icon:'keys',cls:'sg-tog wide'});keysHelp.onclick=()=>K.shortcuts().open();
 morePanel.append(el('p','Practice','sg-more-label'),fingerT.node,speedT.node,keysHelp);more.append(morePanel);
 document.addEventListener('click',e=>{if(more.open&&!more.contains(e.target))more.open=false;});
 // Input chooser: MIDI keyboard, microphone or tap, always one click away, with what each can do right now.
 const inputBox=el('details',undefined,'sg-input');const inputSum=el('summary',undefined,'sg-input-sum');const inputDot=el('span',undefined,'sg-input-dot');inputBox.append(inputSum);
 const inputPanel=el('div',undefined,'sg-input-panel');inputPanel.setAttribute('role','group');inputPanel.setAttribute('aria-label','Play with');inputBox.append(inputPanel);
 const inputRows={};for(const [v,l,ic] of INPUTS){const row=el('button',undefined,'sg-input-row');row.type='button';row.dataset.value=v;const txt=el('span',undefined,'sg-input-text');const st=el('span','','sg-input-status');txt.append(el('strong',l),st);row.append(icon(ic),txt);row.onclick=()=>{p.setInput(v);if(v==='MIDI')p.probeMidi?.().then(msg=>{if(msg)midiMsg=msg;renderInput();});sync();renderInput();};inputRows[v]={row,st};inputPanel.append(row);}
 const midiExtra=el('div',undefined,'sg-input-extra');const probe=button('Check for keyboards',{icon:'keys',cls:'sg-tog wide'});probe.onclick=async()=>{probe.disabled=true;midiMsg=await p.probeMidi?.()||'';probe.disabled=false;renderInput();};midiExtra.append(probe);if(parts.device){parts.device.classList.add('sg-input-device');midiExtra.append(parts.device);}inputPanel.append(midiExtra);
 const meter=el('div',undefined,'sg-input-meter');const meterBar=el('span');meter.append(meterBar);meter.setAttribute('aria-hidden','true');inputPanel.append(meter);
 const switchTip=el('button',undefined,'sg-input-switch');switchTip.type='button';switchTip.hidden=true;switchTip.onclick=()=>{p.setInput('MIDI');renderInput();sync();};inputPanel.append(switchTip);
 let midiMsg='',lastHeard=[],lastHeardAt=0;
 const names=ns=>ns.map(n=>window.PianoEngine.noteName(n)).join(' + ');
 function renderInput(){const st=p.inputStatus||{input:p.input,midi:{devices:[]},mic:{}};const cur=st.input||p.input,inp=INPUTS.find(i=>i[0]===cur)||INPUTS[0];
  inputSum.replaceChildren(icon(inp[2]),el('span',cur==='MIDI'?'MIDI':cur==='microphone'?'Mic':'Tap','sg-input-label'),inputDot);inputSum.title='Playing with '+inp[1]+' · change input';
  const m=st.midi||{},devs=m.devices||[];
  inputRows.MIDI.st.textContent=!m.supported?'Not in this browser (Safari, iPhone and iPad). Use Chrome or Edge.':m.permission==='denied'?'Blocked: allow MIDI devices in the site settings.':devs.length?'Connected: '+devs.join(', ')+(m.last!=null?' · last key '+window.PianoEngine.noteName(m.last):''):m.permission==='granted'?'No keyboard found. Plug in USB and switch it on.':'Best for both hands and fast music.';
  inputRows.microphone.st.textContent=st.listening==='microphone'?(lastHeard.length&&Date.now()-lastHeardAt<1500?'Hearing '+names(lastHeard):'Listening…'):st.mic?.supported===false?'Not available here (needs HTTPS).':'Hears the whole piano, both hands and chords.';
  inputRows.keys.st.textContent='On-screen keys or the computer keyboard.';
  for(const [v,{row}] of Object.entries(inputRows))row.setAttribute('aria-pressed',String(v===cur));
  midiExtra.hidden=cur!=='MIDI';meter.hidden=st.listening!=='microphone';
  const ok=cur==='MIDI'?devs.length>0:cur==='microphone'?st.listening==='microphone':true;inputDot.dataset.state=cur==='MIDI'&&!ok&&m.permission!=='unknown'?'warn':ok&&(cur!=='keys')?'ok':'';
  if(midiMsg&&cur==='MIDI'){inputRows.MIDI.st.textContent=midiMsg;}
  switchTip.hidden=!(cur!=='MIDI'&&devs.length&&m.last!=null);switchTip.textContent=`Keyboard detected (${devs[0]||'MIDI'}): play with it`;}
 inputBox.addEventListener('toggle',()=>{if(inputBox.open){if(p.input==='MIDI'||p.inputStatus?.midi?.permission==='granted')p.probeMidi?.().then(msg=>{midiMsg=msg||'';renderInput();});renderInput();}});
 document.addEventListener('click',e=>{if(inputBox.open&&!inputBox.contains(e.target))inputBox.open=false;});
 p.on('input',d=>{if(d?.midi!=null)return;if(d?.kind==='microphone'){meterBar.style.width=Math.min(100,Math.round(Math.sqrt(d.level||0)*260))+'%';if(d.heard?.length){lastHeard=d.heard;lastHeardAt=Date.now();}}if(d?.kind==='MIDI'&&d.note!=null)midiMsg='';if(inputBox.open||d?.kind!=='microphone')renderInput();});
 const step=el('div',undefined,'sg-step');step.append(prevBar,go,nextBar);
 deck.append(modes.node,back,step,hands.node,tempo,loopB,clickT.node,otherT.node,inputBox,more);
 stage.append(deck);

 // Summary after a run
 const sum=el('dialog',undefined,'sg-summary');const sScores=el('div',undefined,'sg-sum-scores');const sBig=el('p',undefined,'sg-sum-big');const sTime=el('p',undefined,'sg-sum-big sg-sum-time');const sLine=el('p',undefined,'sg-sum-line');const sHeat=el('div',undefined,'sg-sum-heat');const sActs=el('div',undefined,'sg-sum-acts');const accCol=el('div');accCol.append(sBig,el('span','accuracy · right notes','sg-sum-cap'));const timeCol=el('div');timeCol.append(sTime,el('span','timing · on the beat','sg-sum-cap'));sScores.append(accCol,timeCol);sum.append(sScores,sLine,sHeat,sActs);document.body.append(sum);sum.addEventListener('click',e=>{if(e.target===sum)sum.close();});
 const toast=el('p',undefined,'sg-toast');toast.setAttribute('role','status');stage.append(toast);let toastTimer;

 if(parts.more){const s=parts.more.querySelector('summary');if(s)s.textContent='Sources and original sheet';if(parts.original)parts.more.append(parts.original);}
 root.prepend(stage);if(parts.more)root.append(parts.more);
 // A saved community fingering plan (from the Discuss panel) shows right under the stage.
 const plan=root.querySelector('.community-practice-plan');if(plan)stage.after(plan);
 waterfall(fall);

 function layout(){views.set(view);stage.dataset.view=view;fall.hidden=view==='sheet'||view==='full';sheet.hidden=view==='notes';if((view==='sheet'||view==='split')&&p.type!=='guide')p.setType('guide');if(view==='full'&&p.type!=='sheet')p.setType('sheet');hint();}
 function hint(){const f=parts.feedback;if(!f||p.state!=='idle')return;if(/^(Practice waits for correct notes|Choose an input|Press Practice|Sheet waits|Follow me pauses|In time keeps)/.test(f.textContent)||f.dataset.hint===f.textContent){const touch=matchMedia('(pointer:coarse)').matches,press=touch?'Press play':'Press Space';f.textContent=mode==='listen'?press+' to hear the grand piano play from the line.':mode==='play'?press+'. After the count-in, play as the notes reach the line.':press+', then play each note as it reaches the line. The music waits for you.'+(touch?' Swipe the music to move bar by bar.':'');f.dataset.hint=f.textContent;}}
 function sync(){if(!p.score)return;const m=window.PianoCurriculum?.pieces?.find(x=>x.id===p.score.id);
  title.textContent=p.score.title.replace(/ · (complete|full piece|learning arrangement|theme arrangement)$/i,'');sub.textContent=[p.score.imported?'Your song':(p.score.composer||m?.composer),m?.level?'Level '+m.level:''].filter(Boolean).join(' — ');
  const busy=p.state!=='idle';if(busy)mode=p.state;modes.set(mode);go.replaceChildren(icon(busy?'pause':'play'));go.setAttribute('aria-label',busy?'Pause ( Space )':mode==='listen'?'Listen ( Space )':'Start ( Space )');go.title=go.getAttribute('aria-label');go.classList.toggle('is-on',busy);
  hands.set(p.hands,p.handsAvailable?{}:{LH:true,RH:true});tv.textContent=p.tempo;tv.title=p.tempo+' beats per minute';
  loopB.replaceChildren(icon('loop'),el('span',p.loop?p.loop.title:'Loop'));loopB.setAttribute('aria-pressed',String(!!p.loop));
  clickT.set(p.click,!p.clickAvailable);clickT.node.title=p.clickAvailable?'Metronome click ( M )':'No click with the microphone, which would hear it';otherT.set(p.accompany,p.hands==='BH'||p.input==='microphone');
  renderInput();inSeg.set(p.input);typeSeg.set(p.type);fingerT.set(p.fingering,!p.fingeringAvailable);speedT.set(p.speedTrainer.on);
  pager.hidden=true;hint();}
 let streak=0;p.on('note',n=>{if(n.result==='wrong')streak=0;else if(n.result==='correct')streak++;runN.textContent=String(streak);});
 function liveSync(){const s=p.stats;acc.textContent=s.accuracy==null?'—':s.accuracy+'%';timeBox.hidden=s.timing==null&&!s.timed;timeN.textContent=s.timing==null?'—':s.timing+'%';doneN.textContent=`${s.done}/${s.total}`;pt.textContent=p.pages.status.replace(/^Practice page (\d+) of (\d+).*/,'$1 / $2');pv.disabled=!p.pages.hasPrev;nx.disabled=!p.pages.hasNext;}
 let lastResult=null;p.on('result',r=>{lastResult=r;if(r.loop&&p.state!=='idle'){clearTimeout(toastTimer);toast.textContent=`Loop · ${r.accuracy}%${r.timing!=null?` · timing ${r.timing}%`:''}${r.wrong?` · ${r.wrong} wrong`:''}${r.missed?` · ${r.missed} missed`:''}`;toast.classList.add('show');toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);}});
 p.on('state',()=>{if(p.state==='idle'&&lastResult&&Date.now()-lastResult.time<1500){showSummary(lastResult);lastResult=null;}});
 function showSummary(r){clearTimeout(toastTimer);toast.classList.remove('show');sBig.textContent=r.accuracy+'%';sTime.textContent=r.timing==null?'':r.timing+'%';sTime.parentElement.hidden=r.timing==null;sLine.textContent=`${r.correct} right · ${r.wrong} wrong${r.kind==='play'?` · ${r.missed} missed`:''} · ${K.handsName[r.hands]} · ${r.bpm} BPM${r.range?` · ${r.range.title}`:''}`;
  sHeat.replaceChildren();const m=p.mistakes,from=r.range?p.barOf(r.range.start):0,to=r.range?p.barOf(r.range.end-.001):p.barCount-1;for(let b=from;b<=to;b++){const c=el('span');const n=m[b]||0;c.dataset.heat=n===0?0:n===1?1:n<=3?2:3;c.title=`Bar ${b+1}: ${n} mistake${n===1?'':'s'}`;sHeat.append(c);}
  sActs.replaceChildren();const spots=K.troubleSpots(1);if(spots.length){const s=spots[0];const b=button(s.from===s.to?`Loop bar ${s.from+1}`:`Loop bars ${s.from+1}–${s.to+1}`,{icon:'loop',cls:'sg-primary'});b.onclick=()=>{sum.close();p.loopBars(s.from,s.to);};sActs.append(b);}
  const again=button('Again',{icon:'restart',cls:spots.length?'sg-secondary':'sg-primary'});again.onclick=()=>{sum.close();p.restart();p.start(r.kind==='play'?'play':'wait');};const close=button('Close',{cls:'sg-secondary'});close.onclick=()=>sum.close();sActs.append(again);if(window.PianoSocial&&r.kind!=='listen'){const share=button('Share',{icon:'share',cls:'sg-secondary'});share.title='Post this result to the community';share.onclick=()=>{sum.close();window.PianoSocial.shareResult(r);};sActs.append(share);}sActs.append(close);sum.showModal();sActs.querySelector('button')?.focus();}
 p.on('load',()=>fitRange(parts.keyboard));fitRange(parts.keyboard);for(const t of ['state','load','tempo'])p.on(t,sync);let q=false;p.on('tick',()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;liveSync();});});p.on('load',()=>{streak=0;runN.textContent='0';});
 // ---------- Parts ----------
 function renderParts(){if(!p.score)return;const list=partsOf(p),total=p.barCount*p.meter||1,done=readParts()[p.score.id]||{},loop=p.loop;
  ruler.replaceChildren(...list.map((part,i)=>{const b=el('button',undefined,'sg-part');b.type='button';b.style.flexGrow=String(part.end-part.start);b.style.flexBasis='0';
   const on=!!loop&&Math.abs(loop.start-part.start)<.001&&Math.abs(loop.end-part.end)<.001;b.setAttribute('aria-pressed',String(on));
   const bars=(p.barOf(part.start)+1)+'–'+(p.barOf(part.end-.001)+1),got=done[part.start+'-'+part.end]||[];
   b.setAttribute('aria-label',`Part ${i+1}, bars ${bars}. ${got.length?'Passed: '+STEPS.filter(([k])=>got.includes(k)).map(([,n])=>n.toLowerCase()).join(', ')+'.':'Not passed yet.'} ${on?'Looping; tap to play the whole piece.':'Tap to loop.'}`);b.title=`Part ${i+1} · bars ${bars}`;
   const dots=el('span',undefined,'sg-part-dots');for(const[k,n]of STEPS){const d=el('span',undefined,got.includes(k)?'on':'');d.dataset.step=k;d.title=n;dots.append(d);}
   b.append(el('strong',String(i+1)),el('span',bars,'sg-part-bars'),dots);b.classList.toggle('has-progress',got.length>0);
   b.onclick=()=>{if(on){p.clearLoop();toastNow('Whole piece');}else{p.setLoop(part.start,part.end);toastNow(`Part ${i+1} · bars ${bars} · looping`);}};return b;}));
  ruler.dataset.many=list.length>8?'1':'';}
 function toastNow(text){clearTimeout(toastTimer);toast.textContent=text;toast.classList.add('show');toastTimer=setTimeout(()=>toast.classList.remove('show'),1600);}
 p.on('result',r=>{if(r.complete===false||r.accuracy<90||!r.range||!p.score)return;const part=partsOf(p).find(x=>Math.abs(x.start-r.range.start)<.001&&Math.abs(x.end-r.range.end)<.001);if(!part)return;const all=readParts(),mine=all[p.score.id]||(all[p.score.id]={}),k=part.start+'-'+part.end,got=mine[k]||(mine[k]=[]),st=stepOf(r);if(!got.includes(st)){got.push(st);try{localStorage.setItem(PARTS_KEY,JSON.stringify(all));}catch{}renderParts();}});
 for(const t of ['load','state'])p.on(t,renderParts);

 // ---------- Swipe the music to move bar by bar ----------
 // Horizontal: drag left to go forward. On the falling notes, dragging down also goes forward.
 let swipe=null,swallowClick=false;
 screen.addEventListener('pointerdown',e=>{if(e.button>0||e.target.closest?.('.fixed-playhead,.sg-pager,button'))return;swipe={x:e.clientX,y:e.clientY,id:e.pointerId,on:false,done:0,canvas:e.target===fall};});
 screen.addEventListener('pointermove',e=>{if(!swipe||e.pointerId!==swipe.id)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;
  if(!swipe.on){const vertical=swipe.canvas&&Math.abs(dy)>Math.abs(dx);if(Math.max(Math.abs(dx),Math.abs(dy))<12)return;if(!vertical&&Math.abs(dx)<Math.abs(dy))return void(swipe=null);swipe.on=true;swipe.vertical=vertical;try{screen.setPointerCapture(e.pointerId);}catch{}stage.classList.add('is-swiping');}
  const unit=swipe.vertical?Math.max(40,fall.clientHeight/4):Math.max(44,Math.min(90,screen.clientWidth/14)),want=Math.trunc((swipe.vertical?dy:-dx)/unit);
  if(want!==swipe.done){p.seekBars(want-swipe.done);swipe.done=want;toastNow('Bar '+(p.barOf(p.position)+1));}});
 const endSwipe=()=>{if(swipe?.on){swallowClick=true;setTimeout(()=>swallowClick=false,0);}swipe=null;stage.classList.remove('is-swiping');};
 screen.addEventListener('pointerup',endSwipe);screen.addEventListener('pointercancel',endSwipe);
 screen.addEventListener('click',e=>{if(swallowClick){e.stopPropagation();e.preventDefault();}},true);

 layout();sync();liveSync();renderParts();K.bindGlobalKeys();
}
document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(build));
})();
