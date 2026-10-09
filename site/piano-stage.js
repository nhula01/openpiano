'use strict';
/* Pitch C · Stage. Practice fills the window like a rehearsal stage: sheet, falling notes or
   both; a heat-map timeline you drag to loop; one floating transport; a summary after each run.
   Navigation shrinks to a slim top bar with piece search. */
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

function build(){const p=P();if(!p)return;document.body.dataset.shell='stage';const parts=K.adopt();for(const n of parts.legacy)n.hidden=true;const root=parts.root;
 // Slim top bar: search lives in the navigation.
 const rail=document.querySelector('.rail');if(rail){const search=button('Search pieces',{icon:'search',cls:'sg-search'});search.append(el('kbd',/Mac|iPhone|iPad/.test(navigator.platform)?'⌘K':'Ctrl K'));search.onclick=()=>K.picker().open();rail.querySelector('.tabs')?.after(search);}

 const stage=el('section',undefined,'sg-stage');stage.setAttribute('aria-label','Practice stage');
 const hud=el('div',undefined,'sg-hud');const who=el('div',undefined,'sg-who');const title=el('h1',undefined,'sg-title');const sub=el('p',undefined,'sg-sub');who.append(title,sub);
 let view=(()=>{try{return localStorage.getItem(VIEW_KEY)||'split';}catch{return 'split';}})();
 const views=segmented('View',[['sheet','Sheet'],['notes','Falling notes'],['split','Both']],v=>{view=v;try{localStorage.setItem(VIEW_KEY,v);}catch{}layout();},'sg-views');
 const live=el('div',undefined,'sg-live');const accBox=el('div',undefined,'sg-stat');const acc=el('strong','—');accBox.append(acc,el('span','accuracy'));const runBox=el('div',undefined,'sg-stat');const runN=el('strong','0');runBox.append(runN,el('span','in a row'));const doneBox=el('div',undefined,'sg-stat');const doneN=el('strong','0');doneBox.append(doneN,el('span','notes'));live.append(accBox,runBox,doneBox);
 hud.append(who,views.node,live);

 const screen=el('div',undefined,'sg-screen');const sheet=el('div',undefined,'sg-sheet');if(parts.score)sheet.append(parts.score);const pager=el('div',undefined,'sg-pager');const pv=button('Previous page',{icon:'prev',cls:'sg-icon',iconOnly:true});pv.onclick=()=>p.pages.prev();const nx=button('Next page',{icon:'next',cls:'sg-icon',iconOnly:true});nx.onclick=()=>p.pages.next();const pt=el('span');pager.append(pv,pt,nx);sheet.append(pager);
 const fall=el('canvas',undefined,'sg-fall');fall.setAttribute('role','img');fall.setAttribute('aria-label','Falling notes: each bar drops onto the key to play. Right hand blue, left hand pink.');
 screen.append(sheet,fall);
 const keys=el('div',undefined,'sg-keys');if(parts.keyboard){parts.keyboard.setAttribute('preserveAspectRatio','none');keys.append(parts.keyboard);}
 const line=el('div',undefined,'sg-line');if(parts.feedback){parts.feedback.className='trainer-feedback sg-feedback';line.append(parts.feedback);}
 const timeline=el('div',undefined,'sg-timeline');K.barStrip(timeline);
 stage.append(hud,screen,keys,line,timeline);

 // Floating transport
 const deck=el('div',undefined,'sg-deck');deck.setAttribute('role','toolbar');deck.setAttribute('aria-label','Practice controls');
 let mode='wait';const modes=segmented('How to practise',[['wait','Wait'],['play','In time'],['listen','Listen']],v=>{mode=v;if(p.state!=='idle')p.pause();sync();},'sg-seg');
 modes.buttons[0].title='The music waits on each note until you play it';modes.buttons[1].title='The music keeps moving; notes count if you play them on time';modes.buttons[2].title='Hear the grand piano play';
 const back=button('Back to start',{icon:'restart',cls:'sg-icon',iconOnly:true,title:'Back to start ( R )'});back.onclick=()=>p.restart();
 const go=el('button',undefined,'sg-go');go.type='button';go.onclick=()=>{if(p.state==='idle')p.start(mode);else p.pause();};
 const hands=segmented('Hands',[['LH','L','','Left hand ( 1 )'],['RH','R','','Right hand ( 2 )'],['BH','Both','','Both hands ( 3 )']],v=>p.setHands(v),'sg-seg small');
 const tempo=el('div',undefined,'sg-tempo');const tm=button('Slower',{cls:'sg-icon',iconOnly:true,title:'Slower ( [ )'});tm.textContent='−';tm.onclick=()=>p.setTempo(p.tempo-5);const tv=el('span',undefined,'sg-tempo-val');const tp=button('Faster',{cls:'sg-icon',iconOnly:true,title:'Faster ( ] )'});tp.textContent='+';tp.onclick=()=>p.setTempo(p.tempo+5);tempo.append(tm,tv,tp);
 const loopB=button('Loop',{icon:'loop',cls:'sg-tog',title:'Loop this bar and the next ( L ), or drag across the timeline'});loopB.onclick=()=>{if(p.loop)p.clearLoop();else{const b=p.barOf(p.position);p.loopBars(b,b+1);}};
 const clickT=toggle('Click','click',v=>p.setClick(v),'sg-tog');const otherT=toggle('Other hand','accompany',v=>p.setAccompany(v),'sg-tog');
 const more=el('details',undefined,'sg-more');const moreSum=el('summary');moreSum.append(icon('settings'),el('span','Settings','sr'));moreSum.title='Input and sheet settings';more.append(moreSum);
 const morePanel=el('div',undefined,'sg-more-panel');const inSeg=segmented('Listen with',INPUTS.map(([v,l,ic])=>[v,l,ic]),v=>{p.setInput(v);sync();},'sg-list');const typeSeg=segmented('Sheet',[['sheet','Pages'],['guide','One scrolling line']],v=>p.setType(v),'sg-list');const fingerT=toggle('Printed fingering','hands',v=>p.setFingering(v),'sg-tog wide');const speedT=toggle('Speed up after clean loops','loop',v=>p.setSpeedTrainer({on:v,step:4,target:Math.min(200,p.tempo+20)}),'sg-tog wide');const keysHelp=button('Keyboard shortcuts',{icon:'keys',cls:'sg-tog wide'});keysHelp.onclick=()=>K.shortcuts().open();
 morePanel.append(el('p','Listen with','sg-more-label'),inSeg.node);if(parts.device)morePanel.append(parts.device);morePanel.append(el('p','Sheet','sg-more-label'),typeSeg.node,fingerT.node,speedT.node,keysHelp);more.append(morePanel);
 document.addEventListener('click',e=>{if(more.open&&!more.contains(e.target))more.open=false;});
 const inputChip=el('span',undefined,'sg-input-chip');
 deck.append(modes.node,back,go,hands.node,tempo,loopB,clickT.node,otherT.node,inputChip,more);
 stage.append(deck);

 // Summary after a run
 const sum=el('dialog',undefined,'sg-summary');const sBig=el('p',undefined,'sg-sum-big');const sLine=el('p',undefined,'sg-sum-line');const sHeat=el('div',undefined,'sg-sum-heat');const sActs=el('div',undefined,'sg-sum-acts');sum.append(sBig,sLine,sHeat,sActs);document.body.append(sum);sum.addEventListener('click',e=>{if(e.target===sum)sum.close();});
 const toast=el('p',undefined,'sg-toast');toast.setAttribute('role','status');stage.append(toast);let toastTimer;

 if(parts.more){const s=parts.more.querySelector('summary');if(s)s.textContent='Sources and original sheet';if(parts.original)parts.more.append(parts.original);}
 root.prepend(stage);if(parts.more)root.append(parts.more);
 waterfall(fall);

 function layout(){views.set(view);stage.dataset.view=view;fall.hidden=view==='sheet';sheet.hidden=view==='notes';if(view==='split'&&p.type==='sheet')p.setType('guide');hint();}
 function hint(){const f=parts.feedback;if(!f||p.state!=='idle')return;if(/^(Practice waits for correct notes|Choose an input|Press Practice|Sheet waits|Follow me pauses|In time keeps)/.test(f.textContent)||f.dataset.hint===f.textContent){const press=matchMedia('(pointer:coarse)').matches?'Press play':'Press Space';f.textContent=mode==='listen'?press+' to hear the grand piano play from the line.':mode==='play'?press+'. After the count-in, play as the notes reach the line.':press+', then play each note as it reaches the line. The music waits for you.';f.dataset.hint=f.textContent;}}
 function sync(){if(!p.score)return;const m=window.PianoCurriculum?.pieces?.find(x=>x.id===p.score.id);
  title.textContent=p.score.title.replace(/ · (complete|full piece|learning arrangement|theme arrangement)$/i,'');sub.textContent=[p.score.imported?'Your song':(p.score.composer||m?.composer),m?.level?'Level '+m.level:''].filter(Boolean).join(' — ');
  const busy=p.state!=='idle';if(busy)mode=p.state;modes.set(mode);go.replaceChildren(icon(busy?'pause':'play'));go.setAttribute('aria-label',busy?'Pause ( Space )':mode==='listen'?'Listen ( Space )':'Start ( Space )');go.title=go.getAttribute('aria-label');go.classList.toggle('is-on',busy);
  hands.set(p.hands,p.handsAvailable?{}:{LH:true,RH:true});tv.textContent=p.tempo;tv.title=p.tempo+' beats per minute';
  loopB.replaceChildren(icon('loop'),el('span',p.loop?p.loop.title:'Loop'));loopB.setAttribute('aria-pressed',String(!!p.loop));
  clickT.set(p.click,!p.clickAvailable);clickT.node.title=p.clickAvailable?'Metronome click ( M )':'No click with the microphone, which would hear it';otherT.set(p.accompany,p.hands==='BH'||p.input==='microphone');
  const inp=INPUTS.find(i=>i[0]===p.input)||INPUTS[0];inputChip.replaceChildren(icon(inp[2]));inputChip.title='Listening with '+inp[1];inSeg.set(p.input);typeSeg.set(p.type);fingerT.set(p.fingering,!p.fingeringAvailable);speedT.set(p.speedTrainer.on);
  pager.hidden=p.type!=='sheet';hint();}
 let streak=0;p.on('note',n=>{if(n.result==='wrong')streak=0;else if(n.result==='correct')streak++;runN.textContent=String(streak);});
 function liveSync(){const s=p.stats;acc.textContent=s.accuracy==null?'—':s.accuracy+'%';doneN.textContent=`${s.done}/${s.total}`;pt.textContent=p.pages.status.replace(/^Practice page (\d+) of (\d+).*/,'$1 / $2');pv.disabled=!p.pages.hasPrev;nx.disabled=!p.pages.hasNext;}
 let lastResult=null;p.on('result',r=>{lastResult=r;if(r.loop&&p.state!=='idle'){clearTimeout(toastTimer);toast.textContent=`Loop · ${r.accuracy}%${r.wrong?` · ${r.wrong} wrong`:''}${r.missed?` · ${r.missed} missed`:''}`;toast.classList.add('show');toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);}});
 p.on('state',()=>{if(p.state==='idle'&&lastResult&&Date.now()-lastResult.time<1500){showSummary(lastResult);lastResult=null;}});
 function showSummary(r){clearTimeout(toastTimer);toast.classList.remove('show');sBig.textContent=r.accuracy+'%';sLine.textContent=`${r.correct} right · ${r.wrong} wrong${r.kind==='play'?` · ${r.missed} missed`:''} · ${K.handsName[r.hands]} · ${r.bpm} BPM${r.range?` · ${r.range.title}`:''}`;
  sHeat.replaceChildren();const m=p.mistakes,from=r.range?p.barOf(r.range.start):0,to=r.range?p.barOf(r.range.end-.001):p.barCount-1;for(let b=from;b<=to;b++){const c=el('span');const n=m[b]||0;c.dataset.heat=n===0?0:n===1?1:n<=3?2:3;c.title=`Bar ${b+1}: ${n} mistake${n===1?'':'s'}`;sHeat.append(c);}
  sActs.replaceChildren();const spots=K.troubleSpots(1);if(spots.length){const s=spots[0];const b=button(s.from===s.to?`Loop bar ${s.from+1}`:`Loop bars ${s.from+1}–${s.to+1}`,{icon:'loop',cls:'sg-primary'});b.onclick=()=>{sum.close();p.loopBars(s.from,s.to);};sActs.append(b);}
  const again=button('Again',{icon:'restart',cls:spots.length?'sg-secondary':'sg-primary'});again.onclick=()=>{sum.close();p.restart();p.start(r.kind==='play'?'play':'wait');};const close=button('Close',{cls:'sg-secondary'});close.onclick=()=>sum.close();sActs.append(again,close);sum.showModal();sActs.querySelector('button')?.focus();}
 p.on('load',()=>fitRange(parts.keyboard));fitRange(parts.keyboard);for(const t of ['state','load','tempo'])p.on(t,sync);let q=false;p.on('tick',()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;liveSync();});});p.on('load',()=>{streak=0;runN.textContent='0';});
 layout();sync();liveSync();K.bindGlobalKeys();
}
document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(build));
})();
