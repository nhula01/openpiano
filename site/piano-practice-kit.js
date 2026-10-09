'use strict';
/* Shared practice widgets used by the page designs: a bar strip (mistakes per bar, click to
   jump, drag to loop), a piece finder, a shortcut sheet and small control helpers.
   Each design styles them through CSS custom properties; behaviour lives here once. */
(()=>{
const P=()=>window.PianoPractice;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n;};
const ICONS={
 play:'<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
 pause:'<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/>',
 restart:'<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4.5h4.5"/>',
 share:'<path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 14v6h14v-6"/>',loop:'<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
 search:'<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
 click:'<path d="M9 3h6l3.5 18h-13z"/><path d="M12 15l5-9"/>',
 hands:'<path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11M10 10V4a1.5 1.5 0 0 1 3 0v6M13 10V5a1.5 1.5 0 0 1 3 0v8"/><path d="M16 12.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 5 15.5V12a1.5 1.5 0 0 1 3 0"/>',
 accompany:'<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
 ear:'<path d="M6 8.5a6 6 0 0 1 12 0c0 3.5-3 4.5-3 8a3.5 3.5 0 0 1-7 .5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-1.5 3"/>',
 keys:'<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M8 5v8M12 5v8M16 5v8M6.5 5v5h3V5M14.5 5v5h3V5"/>',
 mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
 tap:'<path d="M9 11V5.5a2 2 0 0 1 4 0V11l4.5 1a2.5 2.5 0 0 1 2 2.7l-.6 4.3a2.5 2.5 0 0 1-2.5 2H10a2.5 2.5 0 0 1-2-1l-3.4-4.6a1.6 1.6 0 0 1 2.4-2.1L9 15"/>',
 close:'<path d="M6 6l12 12M18 6L6 18"/>',
 prev:'<path d="M15 5l-7 7 7 7"/>',next:'<path d="M9 5l7 7-7 7"/>',
 star:'<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
 check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',flame:'<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5.5 1 1 1.5 2 1.5 3.5C12 9 12 6 12 3z"/>'
};
function icon(name,cls){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.8');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');if(cls)s.setAttribute('class',cls);s.innerHTML=ICONS[name]||'';return s;}
function button(label,{icon:ic,cls='',title,onClick,iconOnly=false}={}){const b=el('button',undefined,cls);b.type='button';if(ic)b.append(icon(ic));if(iconOnly){b.setAttribute('aria-label',label);b.title=title||label;}else b.append(el('span',label));if(title&&!iconOnly)b.title=title;if(onClick)b.onclick=onClick;return b;}
// A group of buttons where one is chosen (aria-pressed); returns {node,set(value)}.
function segmented(name,options,onChange,cls='kit-seg'){const node=el('div',undefined,cls);node.setAttribute('role','group');node.setAttribute('aria-label',name);const buttons=options.map(([value,label,ic,title])=>{const b=button(label,{icon:ic,title});b.dataset.value=value;b.onclick=()=>onChange(value);node.append(b);return b;});return {node,buttons,set(value,disabled={}){for(const b of buttons){b.setAttribute('aria-pressed',String(b.dataset.value===value));b.disabled=!!disabled[b.dataset.value];}}};}
function toggle(label,ic,onChange,cls='kit-toggle'){const b=button(label,{icon:ic,cls});b.setAttribute('aria-pressed','false');b.onclick=()=>onChange(b.getAttribute('aria-pressed')!=='true');return {node:b,set(v,disabled=false){b.setAttribute('aria-pressed',String(!!v));b.disabled=disabled;}};}
const minutes=s=>{const m=Math.round((s||0)/60);return m<1?'under a minute':m===1?'1 minute':m+' minutes';};
const level=id=>window.PianoCurriculum?.pieces?.find(p=>p.id===id)?.level;
const handsName={LH:'left hand',RH:'right hand',BH:'both hands'};

// Bar strip: one cell per bar. Colour = mistakes in this session; drag across bars to loop them.
function barStrip(host,{labels=true,knob=false}={}){
 const strip=el('div',undefined,'kit-bars');strip.tabIndex=0;strip.setAttribute('role','group');
 const cells=el('div',undefined,'kit-bars-cells'),marks=el('div',undefined,'kit-bars-marks'),head=el('div',undefined,'kit-bars-head'),sel=el('div',undefined,'kit-bars-loop');
 if(knob){const k=el('span',undefined,'kit-bars-knob');k.setAttribute('aria-hidden','true');head.append(k);strip.classList.add('has-knob');}
 cells.append(sel,head);strip.append(cells);if(labels)strip.append(marks);host.append(strip);
 let count=0,drag=null,stamp='';
 const barAt=x=>{const r=cells.getBoundingClientRect();return Math.max(0,Math.min(count-1,Math.floor((x-r.left)/r.width*count)));};
 function build(){const p=P();count=p.barCount;cells.querySelectorAll('.kit-bar').forEach(n=>n.remove());marks.replaceChildren();const frag=document.createDocumentFragment();for(let i=0;i<count;i++){const c=el('span',undefined,'kit-bar');c.dataset.bar=i;frag.append(c);}cells.insertBefore(frag,sel);const step=count<=16?1:count<=40?4:count<=100?8:16;for(let i=0;i<count;i+=step){const m=el('span',String(i+1));m.style.left=(i/count*100)+'%';marks.append(m);}strip.setAttribute('aria-label',`Bars 1 to ${count}. Click a bar to start there, drag across bars to loop them. Arrow keys move one bar.`);}
 function paint(){const p=P();if(!p?.score)return;if(p.barCount!==count||strip.dataset.score!==p.score.id){strip.dataset.score=p.score.id;build();}
  const m=p.mistakes,loop=p.loop,key=JSON.stringify(m)+JSON.stringify(loop);if(key!==stamp){stamp=key;for(const c of cells.querySelectorAll('.kit-bar')){const n=m[c.dataset.bar]||0;c.dataset.heat=n===0?0:n===1?1:n<=3?2:3;c.title=`Bar ${Number(c.dataset.bar)+1}${n?` · ${n} mistake${n>1?'s':''}`:''}`;}
   if(loop){sel.hidden=false;sel.style.left=(p.barOf(loop.start)/count*100)+'%';sel.style.width=((p.barOf(loop.end-.001)-p.barOf(loop.start)+1)/count*100)+'%';}else if(!drag)sel.hidden=true;}
  head.style.left=Math.min(100,p.position/(count*p.meter)*100)+'%';}
 // With a knob, dragging the playhead moves it bar by bar; dragging anywhere else marks a loop.
 cells.addEventListener('pointerdown',e=>{if(!P()?.score)return;e.preventDefault();cells.setPointerCapture(e.pointerId);const hx=head.getBoundingClientRect().left+1,reach=e.pointerType==='touch'?30:16;if(knob&&Math.abs(e.clientX-hx)<=reach){drag={scrub:true,last:-1};strip.classList.add('is-scrubbing');return;}drag={a:barAt(e.clientX),b:barAt(e.clientX)};});
 cells.addEventListener('pointermove',e=>{if(!drag)return;if(drag.scrub){const b=barAt(e.clientX);if(b!==drag.last){drag.last=b;const p=P();p.seek(b*p.meter);}return;}drag.b=barAt(e.clientX);if(drag.a!==drag.b){const lo=Math.min(drag.a,drag.b),hi=Math.max(drag.a,drag.b);sel.hidden=false;sel.style.left=(lo/count*100)+'%';sel.style.width=((hi-lo+1)/count*100)+'%';}});
 const end=()=>{if(!drag)return;strip.classList.remove('is-scrubbing');if(drag.scrub){drag=null;return;}const {a,b}=drag;drag=null;stamp='';const p=P();if(a===b)p.seek(a*p.meter);else p.loopBars(a,b);};
 cells.addEventListener('pointerup',end);cells.addEventListener('pointercancel',()=>{drag=null;stamp='';strip.classList.remove('is-scrubbing');paint();});
 strip.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();P().seekBars(e.key==='ArrowLeft'?-1:1);}});
 let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;paint();});};
 for(const t of ['tick','state','load','result'])P().on(t,schedule);schedule();
 return {node:strip,update:schedule};
}

// Hardest bars this session: consecutive bars with mistakes merged, worst first.
function troubleSpots(limit=3){const p=P(),m=p.mistakes,bars=Object.keys(m).map(Number).sort((a,b)=>a-b),spans=[];for(const b of bars){const last=spans.at(-1);if(last&&b<=last.to+1){last.to=b;last.n+=m[b];}else spans.push({from:b,to:b,n:m[b]});}return spans.sort((a,b)=>b.n-a.n).slice(0,limit);}

// Piece finder: search every library piece and your own songs; recent pieces first.
let pickerDialog=null;
function picker(){if(pickerDialog)return pickerDialog;const d=el('dialog',undefined,'kit-picker');d.setAttribute('aria-label','Find a piece');
 const top=el('div',undefined,'kit-picker-top'),label=el('label',undefined,'kit-picker-search');label.append(icon('search'));const input=el('input');input.type='search';input.placeholder='Find a piece or composer';input.setAttribute('aria-label','Find a piece or composer');input.autocomplete='off';label.append(input);const close=button('Close',{icon:'close',iconOnly:true,cls:'kit-icon'});close.onclick=()=>d.close();top.append(label,close);
 const list=el('ul',undefined,'kit-picker-list');list.setAttribute('role','listbox');const note=el('p',undefined,'kit-picker-note');d.append(top,note,list);document.body.append(d);
 const all=()=>Object.values(window.PianoRepertoire||{}).filter(s=>s?.id&&s.title);
 const clean=t=>String(t).replace(/ · (complete|full piece|learning arrangement|theme arrangement)$/i,'');
 function render(){const q=input.value.trim().toLowerCase(),log=P().log.pieces;let items;
  if(!q){items=Object.entries(log).sort((a,b)=>(b[1].last||0)-(a[1].last||0)).map(([id])=>window.PianoRepertoire?.[id]).filter(Boolean).slice(0,8);note.textContent=items.length?'Recently practised':'Type to search 500+ pieces and your own songs.';if(!items.length)items=all().filter(s=>level(s.id)===1).slice(0,8);}
  else{const words=q.split(/\s+/);items=all().filter(s=>{const hay=(s.title+' '+(s.composer||'')).toLowerCase();return words.every(w=>hay.includes(w));}).slice(0,40);note.textContent=items.length?`${items.length===40?'First 40':items.length} matching`:`No piece matches “${input.value.trim()}”. Try a composer’s surname.`;}
  list.replaceChildren(...items.map((s,i)=>{const li=el('li');const b=el('button',undefined,'kit-picker-item');b.type='button';b.setAttribute('role','option');const lv=level(s.id);b.append(el('strong',clean(s.title)),el('span',[s.imported?'Your song':s.composer,lv?'Level '+lv:''].filter(Boolean).join(', ')));if(log[s.id]?.seconds)b.append(el('em',minutes(log[s.id].seconds)+' practised'));b.onclick=()=>{d.close();P().select(s.id);};if(i===0)b.dataset.first='1';li.append(b);return li;}));}
 input.addEventListener('input',render);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();list.querySelector('button')?.click();}if(e.key==='ArrowDown'){e.preventDefault();list.querySelector('button')?.focus();}});
 list.addEventListener('keydown',e=>{const items=[...list.querySelectorAll('button')],i=items.indexOf(document.activeElement);if(e.key==='ArrowDown'){e.preventDefault();items[Math.min(items.length-1,i+1)]?.focus();}if(e.key==='ArrowUp'){e.preventDefault();(i<=0?input:items[i-1]).focus();}});
 d.addEventListener('click',e=>{if(e.target===d)d.close();});
 pickerDialog={node:d,open(){input.value='';render();d.showModal();input.focus();}};return pickerDialog;}

let helpDialog=null;
const SHORTCUTS=[['Space','Start or pause'],['R','Restart from the beginning'],['← →','Previous or next bar'],['[ ]','Slower or faster by 5 BPM'],['L','Loop this bar and the next, or clear the loop (Shift+L while using tap input)'],['1 2 3','Left hand, right hand, both hands'],['M','Click on or off'],['/','Find a piece'],['?','Show these shortcuts'],['A W S E D F T G Y H U J K','Play notes with tap input']];
function shortcuts(){if(helpDialog)return helpDialog;const d=el('dialog',undefined,'kit-help');d.setAttribute('aria-labelledby','kit-help-title');const h=el('h2','Keyboard shortcuts');h.id='kit-help-title';const dl=el('dl');for(const[k,v]of SHORTCUTS){const row=el('div');row.append(el('dt',k),el('dd',v));dl.append(row);}const close=button('Done',{cls:'kit-help-close'});close.onclick=()=>d.close();d.append(h,dl,close);d.addEventListener('click',e=>{if(e.target===d)d.close();});document.body.append(d);helpDialog={node:d,open(){d.showModal();}};return helpDialog;}

// Take the engine's live elements (score, keyboard, status line, device picker) for a new layout.
function adopt(){const root=document.querySelector('#note-trainer'),p=P(),e=p.elements;const feedback=root.querySelector('.trainer-feedback');
 const legacy=['.practice-head','.practice-bar','.stage'].map(s=>root.querySelector(s)).filter(Boolean);const more=root.querySelector('.practice-more');
 return {root,feedback,score:e.score,keyboard:e.keyboard,original:e.original,device:e.device,monitor:e.monitor,provenance:e.provenance,fingeringNote:e.fingeringNote,soundCredit:e.soundCredit,legacy,more};}

function bindGlobalKeys(){document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='k'){e.preventDefault();picker().open();}return;}if(e.altKey||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)||e.target.isContentEditable)return;if(document.body.dataset.view!=='practice')return;if(e.key==='/'&&!(P().mode==='keys'&&P().state!=='idle')){e.preventDefault();picker().open();}});P().on('help',()=>shortcuts().open());}

window.PianoPracticeKit={el,icon,button,segmented,toggle,barStrip,troubleSpots,picker,shortcuts,adopt,bindGlobalKeys,minutes,level,handsName};
})();
