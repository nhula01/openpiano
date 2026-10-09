'use strict';
/* Add-ons on the score: one add-on per person per piece.
   Your add-on is a working draft over the whole piece. Click a note and a + appears beside it: add a
   fingering number (Enter saves) or a comment, and it goes into the draft, which only you see. When the
   draft is ready, Publish sends the whole draft at once; others can then find your add-on under Add-ons,
   vote for it and apply it to their score. You can keep editing: changes stay in the draft until you
   publish again (or discard them). Storage: the add-on RPCs in scripts/supabase-addon-layers.sql
   (a draft and a published copy per person and piece); signed out, the draft stays on this device. */
(()=>{
const P=()=>window.PianoPractice;
const DEVICE='openpiano-addons-device-v1',APPLIED='openpiano-addons-applied-v2',SHOW_MINE='openpiano-addons-show-mine-v1';
const read=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v??d;}catch{return d;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const NS='http://www.w3.org/2000/svg';
function icon(d){const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.8');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.innerHTML=d;return s;}
const LAYERS='<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>';
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;

// ---------- Pure helpers (also used by tests) ----------
// A note in an add-on: {b: beat, m: midi, h: 'RH'|'LH'|'BH', f: finger numbers, c: comment}.
// Finger numbers to draw: "3", "3–1" (substitution) or "1 2 3" sequences; free text yields nothing.
function digits(text){const t=String(text||'').trim();if(/^[1-5](\s*[-–>,\s]\s*[1-5])*$/.test(t))return t.replace(/\s*[-–>]\s*/g,'–').replace(/\s*,\s*|\s+/g,' ');const m=/\(([1-5](?:\s*[-–]\s*[1-5])*)\)/.exec(t);return m?m[1].replace(/\s*[-–]\s*/g,'–'):'';}
// The stored form: "3", "3-1", "1 2 3".
const storeFingers=t=>digits(t).replace(/–/g,'-');
const keyOf=n=>Number(n.b).toFixed(3)+':'+Number(n.m);
const same=(a,b)=>!!a&&!!b&&(a.f||'')===(b.f||'')&&(a.c||'')===(b.c||'')&&(a.h||'')===(b.h||'');
// What changed between the published copy and the draft, note by note.
function changes(draft,published){const pub=new Map((published||[]).map(n=>[keyOf(n),n])),dr=new Map((draft||[]).map(n=>[keyOf(n),n]));let added=0,edited=0,removed=0;
 for(const[k,n]of dr){const p=pub.get(k);if(!p)added++;else if(!same(n,p))edited++;}for(const k of pub.keys())if(!dr.has(k))removed++;return {added,edited,removed,total:added+edited+removed};}
// Put one note into a draft (or take it out when it has neither fingering nor comment).
function setNote(draft,note){const k=keyOf(note),rest=(draft||[]).filter(n=>keyOf(n)!==k),f=storeFingers(note.f||''),c=String(note.c||'').trim();if(!f&&!c)return rest;const n={b:Number(note.b),m:Number(note.m),h:note.h||'BH'};if(f)n.f=f;if(c)n.c=c;return [...rest,n].sort((a,b)=>a.b-b.b||a.m-b.m);}
// Marks for the score view; source decides the colour ('mine', 'draft' for unpublished changes, 'layer').
function toMarks(notes,source,author){const out=[];for(const n of notes||[]){const src=typeof source==='function'?source(n):source,base={beat:Number(n.b),midi:Number(n.m),hand:n.h,source:src,author,key:keyOf(n)};
 if(n.f&&digits(n.f))out.push({...base,id:`${src}:${keyOf(n)}:f`,kind:'fingering',fingers:digits(n.f),body:''});if(n.c)out.push({...base,id:`${src}:${keyOf(n)}:c`,kind:'comment',body:n.c});}return out;}
const counts=notes=>({fingerings:(notes||[]).filter(n=>n.f).length,comments:(notes||[]).filter(n=>n.c).length});
// Drafts saved on this device by the first version (one entry per fingering or comment) become notes.
function fromDevice(list){if(!Array.isArray(list))return [];let out=[];for(const x of list){if(x&&'b' in x){out=setNote(out,x);continue;}if(!x||x.note_beat==null)continue;const k=keyOf({b:x.note_beat,m:x.note_midi}),old=out.find(n=>keyOf(n)===k)||{b:Number(x.note_beat),m:Number(x.note_midi),h:x.hand};out=setNote(out,{...old,[x.kind==='fingering'?'f':'c']:x.kind==='fingering'?x.fingers:x.body});}return out;}

// ---------- Backend: the live add-on RPCs, or the in-browser demo used by previews ----------
function backend(){const demo=window.PianoAddonsDemo;if(demo)return demo;const a=window.PianoCommunityAuth;if(!a)return null;return {ready:()=>a.ready(),signedIn:()=>a.signedIn(),rpc:async(n,args)=>{const {data,error}=await a.rpc(n,args);if(error)throw new Error(error.message);return data;}};}
const profile=()=>window.PianoProfiles?.current?.()||null;
const canSync=()=>!!backend()?.signedIn?.()&&!!profile();

// mine: {draft, published, published_at, votes} from the account (or from this device when signed out).
const state={piece:null,mine:null,device:[],layers:[],error:null,loading:false,generation:0};
const library=()=>new Set((window.PianoCurriculum?.pieces||[]).map(p=>p.id));
const applied=()=>read(APPLIED,{})[state.piece]||null;
const showMine=()=>read(SHOW_MINE,true)!==false;
const deviceDraft=()=>fromDevice(read(DEVICE,{})[state.piece]||[]);
function saveDevice(notes){const all=read(DEVICE,{});if(notes.length)all[state.piece]=notes;else delete all[state.piece];write(DEVICE,all);state.device=notes;}
// Your working copy: the account draft when signed in (device notes waiting to move in are shown on top).
function view(){const m=state.mine,synced=canSync(),draft=synced?(m?.draft||[]):state.device,published=synced?(m?.published||null):null;let shown=draft;if(synced)for(const n of state.device)shown=setNote(shown,n);
 const ch=changes(shown,published);return {draft:shown,published,publishedAt:m?.published_at||null,votes:m?.votes||0,changes:ch,pending:published?ch.total:shown.length,deviceWaiting:synced?state.device.length:0,underReview:!!m?.under_review};}

async function load(){const p=P(),id=p?.score?.id;if(!id)return;const gen=++state.generation;state.piece=id;state.device=deviceDraft();state.error=null;
 const be=backend();if(!be||!library().has(id)){state.mine=null;state.layers=[];render();paint();return;}
 if(!be.ready()){render();paint();return;}
 state.loading=true;render();
 try{const list=[];let total=1;for(let off=0;off<total&&off<200;off+=20){const d=await be.rpc('addon_list',{p_piece:id,p_offset:off});total=d?.total||0;const got=d?.addons||[];list.push(...got);if(!got.length)break;}
  const mine=canSync()?await be.rpc('addon_mine',{p_piece:id}):null;if(gen!==state.generation)return;
  state.mine=mine||null;state.layers=list.filter(a=>!a.mine);}
 catch(e){if(gen!==state.generation)return;state.error=e.message;}
 state.loading=false;render();paint();}

// Saving the draft: the whole draft is sent each time, one save after another.
let saving=Promise.resolve();
function saveDraft(next){if(!canSync()){saveDevice(next);render();paint();return Promise.resolve();}
 state.mine={...(state.mine||{published:null,published_at:null,votes:0}),draft:next};render();paint();const piece=state.piece;
 saving=saving.catch(()=>{}).then(async()=>{const m=await backend().rpc('addon_save_draft',{p_piece:piece,p_notes:next});if(piece===state.piece&&m)state.mine={...m,draft:state.mine?.draft===next?m.draft:state.mine.draft};render();paint();});
 return saving.catch(e=>{toast(e.message);state.error=e.message;load();throw e;});}

// Marks on the score: your add-on (unpublished changes look dashed/italic) and the one add-on you applied.
function paint(){const p=P();if(!p?.setMarks)return;let marks=[];const v=view();
 if(showMine()){const pub=new Map((v.published||[]).map(n=>[keyOf(n),n]));marks=marks.concat(toMarks(v.draft,n=>same(n,pub.get(keyOf(n)))?'mine':'draft','You'));}
 const layer=state.layers.find(l=>l.id===applied());if(layer)marks=marks.concat(toMarks(layer.notes,'layer',layer.author));p.setMarks(marks);syncButtons();drawPill();}

// ---------- Stage controls: the Add-ons button, the draft bar over the sheet and the + on a picked note ----------
let addonsButton,panel,editor,viewer,pill,plus;
function mount(){const deck=document.querySelector('.sg-deck');if(!deck||addonsButton)return!!addonsButton;const gear=deck.querySelector('.sg-more');
 addonsButton=el('button',undefined,'sg-tog addon-open');addonsButton.type='button';addonsButton.append(icon(LAYERS),el('span','Add-ons'));addonsButton.title='Add-ons: your draft and the most helpful community add-ons for this piece';addonsButton.setAttribute('aria-expanded','false');
 addonsButton.onclick=e=>{e.stopPropagation();togglePanel();};
 deck.insertBefore(addonsButton,gear);
 panel=el('div',undefined,'addon-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Add-ons');document.body.append(panel);
 pill=el('div',undefined,'addon-pill');pill.hidden=true;pill.setAttribute('role','status');document.querySelector('.sg-sheet')?.append(pill);
 plus=el('button','+','addon-plus');plus.type='button';plus.hidden=true;plus.onclick=e=>{e.stopPropagation();const d=plus.detail;hidePlus();if(d)openEditor({...d,rect:noteRect(d)||plus.getBoundingClientRect()});};document.body.append(plus);
 // The path is taken when the click starts, so a panel that redraws itself on click still counts as inside.
 document.addEventListener('click',e=>{const path=e.composedPath(),onNote=!!e.target.closest?.('.score-note')||performance.now()-pickedAt<80;if(!panel.hidden&&!path.includes(panel)&&!path.includes(addonsButton))togglePanel(false);if(editor&&!path.includes(editor)&&!onNote)closeEditor();if(viewer&&!path.includes(viewer)&&!e.target.closest?.('.addon-mark'))closeViewer();if(!onNote&&!path.includes(plus))hidePlus();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){togglePanel(false);closeEditor();closeViewer();hidePlus();}});
 return true;}
function syncButtons(){if(!addonsButton)return;const lib=library().has(state.piece);addonsButton.disabled=!lib;
 const layer=state.layers.find(l=>l.id===applied());addonsButton.querySelector('span').textContent=layer?`Add-ons · ${layer.author}`:'Add-ons';addonsButton.setAttribute('aria-pressed',String(!!layer));}
function toast(text){const t=document.querySelector('.sg-toast');if(!t)return;t.textContent=text;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2400);}
function togglePanel(force){const open=force??panel.hidden;panel.hidden=!open;addonsButton.setAttribute('aria-expanded',String(open));if(open){closeEditor();hidePlus();render();placePanel();if(!state.loading)load();}}
// The panel opens above the Add-ons button and always stays inside the window.
function placePanel(){if(!panel||panel.hidden)return;const r=addonsButton.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight;panel.style.left=Math.max(8,Math.min(innerWidth-w-8,r.right-w))+'px';panel.style.top=Math.max(8,r.top-h-12)+'px';}
window.addEventListener('resize',()=>placePanel());

function btn(text,cls,fn){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
async function run(b,fn){b.disabled=true;try{await fn();}catch(e){state.error=e.message;toast(e.message);render();}finally{b.disabled=false;}}
// A button that asks once before doing something others will see or that cannot be undone.
function confirmBtn(text,ask,cls,fn){const b=btn(text,cls,()=>{if(b.dataset.confirm!=='1'){b.dataset.confirm='1';b.textContent=ask;clearTimeout(b.timer);b.timer=setTimeout(()=>{b.dataset.confirm='';b.textContent=text;},4000);return;}run(b,fn);});return b;}

// ---------- Whole-add-on actions ----------
async function publish(){await saving;const be=backend();if(state.device.length)await moveDevice();state.mine=await be.rpc('addon_publish',{p_piece:state.piece});render();paint();toast('Your add-on is published. Others can find it under Add-ons.');}
async function discard(){await saving.catch(()=>{});const be=backend();if(canSync()){state.mine=await be.rpc('addon_discard',{p_piece:state.piece});}saveDevice([]);render();paint();toast(view().published?'Changes discarded. Your published add-on is unchanged.':'Draft discarded.');}
async function unpublish(){await saving;state.mine=await backend().rpc('addon_unpublish',{p_piece:state.piece});render();paint();toast('Your add-on is no longer published. The draft is still yours.');}
async function moveDevice(){const v=view();await saveDraft(v.draft);saveDevice([]);toast('Your device draft is now in your account.');}
function needSignIn(){state.error=backend()?.signedIn?.()?'Set up your profile name to publish your add-on.':'Sign in to publish your add-on. Your draft stays on this device until then.';togglePanel(true);}
const pendingText=v=>v.published?plural(v.pending,'unpublished change'):plural(v.pending,'note');

// The draft bar sits over the sheet while the draft has something to publish.
function drawPill(){if(!pill)return;const v=view();pill.hidden=!v.pending||!library().has(state.piece)||!showMine();if(pill.hidden)return;pill.replaceChildren();
 const label=el('span',undefined,'addon-pill-label');label.append(el('strong','Your draft'),el('span',pendingText(v)+(!canSync()?' · this device':'')));pill.append(label);
 if(!canSync())pill.append(btn('Publish','addon-primary',needSignIn));
 else pill.append(confirmBtn(v.published?'Publish update':'Publish','Publish to everyone?','addon-primary',publish));
 pill.append(confirmBtn('Discard',v.published?'Discard changes?':'Discard draft?','addon-chip',discard));}

function render(){if(!panel||panel.hidden)return;const be=backend(),signed=!!be?.signedIn?.(),p=P(),title=(p?.score?.title||'').replace(/ · (complete|full piece|learning arrangement|theme arrangement)$/i,'');
 panel.replaceChildren();requestAnimationFrame(placePanel);const head=el('div',undefined,'addon-head');head.append(el('h2','Add-ons'),el('span',title,'addon-piece'));panel.append(head);
 if(!library().has(state.piece)){panel.append(el('p','Add-ons are available for pieces in the library.','addon-muted'));return;}
 // Your add-on: one draft for the whole piece, and its published copy
 const v=view(),mineBox=el('section',undefined,'addon-yours'),c=counts(v.draft);
 const row=el('div',undefined,'addon-row');const who=el('div');who.append(el('strong','Your add-on'));
 const status=el('span',undefined,'addon-muted');
 if(!v.draft.length&&!v.published)status.textContent='Click a note on the sheet, then + to add fingering or a comment. It all goes into one draft for this piece.';
 else{const bits=[[c.fingerings?plural(c.fingerings,'fingering'):'',c.comments?plural(c.comments,'comment'):''].filter(Boolean).join(' · ')||'Empty draft'];
  if(v.published)bits.push(`published ${new Date(v.publishedAt).toLocaleDateString()} · ▲ ${v.votes}`,v.pending?pendingText(v):'up to date');else bits.push('not published');status.textContent=bits.join(' · ');}
 who.append(status);row.append(who);
 const show=btn(showMine()?'Shown':'Hidden','addon-chip',()=>{write(SHOW_MINE,!showMine());paint();render();});show.setAttribute('aria-pressed',String(showMine()));show.title='Show or hide your add-on on the sheet';row.append(show);mineBox.append(row);
 const actions=el('div',undefined,'addon-actions');
 if(v.pending){if(canSync())actions.append(confirmBtn(v.published?'Publish update':'Publish add-on','Publish: everyone can see it','addon-primary',publish));
  else actions.append(btn('Publish add-on','addon-primary',needSignIn));
  actions.append(confirmBtn(v.published?'Discard changes':'Discard draft','Discard: this cannot be undone','addon-chip',discard));}
 if(canSync()&&v.published)actions.append(confirmBtn('Unpublish','Unpublish: hide it from others','addon-chip',unpublish));
 if(actions.children.length)mineBox.append(actions);
 if(v.underReview)mineBox.append(el('p','The maintainer is reviewing this add-on; it is not listed for now.','addon-error'));
 if(!signed)mineBox.append(el('p','Signed out: your draft stays on this device. Sign in to keep it in your account and publish it.','addon-muted'));
 else if(!profile()){const a=el('a','Set up your profile name');a.href='#profile';const pp=el('p',undefined,'addon-muted');pp.append(a,' to save your draft to your account and publish it.');mineBox.append(pp);}
 else if(v.deviceWaiting)mineBox.append(btn(`Move ${plural(v.deviceWaiting,'note')} from this device into your draft`,'addon-chip',e=>run(e.currentTarget,moveDevice)));
 else if(v.pending)mineBox.append(el('p','Only you see the draft. Publish sends the whole add-on; you can keep editing afterwards.','addon-muted'));
 panel.append(mineBox);
 // Community add-ons: each is one person's whole add-on for the piece
 const comm=el('section',undefined,'addon-community');const ch=el('div',undefined,'addon-row');ch.append(el('strong','Community add-ons'),el('span','Most helpful first','addon-muted'));comm.append(ch);
 if(state.loading&&!state.layers.length)comm.append(el('p','Loading…','addon-muted'));
 else if(!state.layers.length)comm.append(el('p','No published add-ons for this piece yet. Make yours and publish it.','addon-muted'));
 const key=applied();const list=el('ol',undefined,'addon-list');
 for(const l of state.layers){const li=el('li',undefined,'addon-item'+(l.id===key?' is-applied':''));const info=el('div',undefined,'addon-item-info');info.append(el('strong',l.author));if(l.bot)info.append(el('span','Demo bot','addon-bot'));
  const lc=counts(l.notes);info.append(el('span',[lc.fingerings?plural(lc.fingerings,'fingering'):'',lc.comments?plural(lc.comments,'comment'):''].filter(Boolean).join(' · '),'addon-muted'));
  const vote=btn(`▲ ${l.votes}`,'addon-vote',()=>{if(!signed){state.error='Sign in to vote for an add-on.';render();return;}run(vote,async()=>{await be.rpc('addon_vote',{p_addon:l.id,p_on:!l.voted});await load();});});vote.setAttribute('aria-pressed',String(!!l.voted));vote.title=l.voted?'Remove your vote':'Vote: this add-on helped me';
  const apply=btn(l.id===key?'Applied':'Apply','addon-apply',()=>{const all=read(APPLIED,{});if(all[state.piece]===l.id)delete all[state.piece];else all[state.piece]=l.id;write(APPLIED,all);paint();render();toast(all[state.piece]?`${l.author}'s add-on is on your score.`:'Add-on removed from your score.');});apply.setAttribute('aria-pressed',String(l.id===key));
  li.append(info,vote,apply);list.append(li);}
 comm.append(list);comm.append(el('p','Community fingering and comments are suggestions, not teacher-verified. Printed fingering stays on the score.','addon-foot'));panel.append(comm);
 if(state.error){const e=el('p',state.error,'addon-error');e.setAttribute('role','status');panel.append(e);}
}

// ---------- The + beside a picked note ----------
// It follows the note while the sheet glides to it, and steps aside while the piece is playing.
function noteEl(d){for(const n of document.querySelectorAll('#practice-score .score-note'))if(Number(n.dataset.midi)===d.midi&&Math.abs(Number(n.dataset.beat)-d.beat)<.002)return n;return null;}
function noteRect(d){const n=noteEl(d);if(!n)return null;const r=n.getBoundingClientRect();return r.width||r.height?r:null;}
function showPlus(d){if(!plus||!library().has(d.piece))return;const st=P()?.state;if(st==='play'||st==='listen')return;plus.detail=d;plus.setAttribute('aria-label',`Add fingering or a comment at ${d.note}, bar ${d.bar}`);plus.title=`Add to your draft: ${d.note} · bar ${d.bar}`;plus.hidden=false;plus.node=null;follow();}
function hidePlus(){if(!plus)return;plus.hidden=true;plus.detail=null;cancelAnimationFrame(follow.raf);}
function follow(){cancelAnimationFrame(follow.raf);if(!plus||plus.hidden||!plus.detail)return;if(!plus.node?.isConnected)plus.node=noteEl(plus.detail);const r=plus.node?.getBoundingClientRect(),box=document.querySelector('.sg-sheet')?.getBoundingClientRect();
 const visible=r&&(r.width||r.height)&&(!box||(r.bottom>box.top&&r.top<box.bottom&&r.right>box.left&&r.left<box.right));plus.style.visibility=visible?'visible':'hidden';
 if(visible){plus.style.left=Math.round(r.right+1)+'px';plus.style.top=Math.round(r.top-plus.offsetHeight+3)+'px';}follow.raf=requestAnimationFrame(follow);}

// ---------- Editor: your fingering and comment at one note, in the draft ----------
function place(box,rect){document.body.append(box);const w=box.offsetWidth,h=box.offsetHeight,vw=innerWidth,vh=innerHeight;let x=rect.left+rect.width/2-w/2,y=rect.top-h-12;if(y<8)y=rect.bottom+12;box.style.left=Math.max(8,Math.min(vw-w-8,x))+'px';box.style.top=Math.max(8,Math.min(vh-h-8,y))+'px';}
function closeEditor(){editor?.remove();editor=null;}
function closeViewer(){viewer?.remove();viewer=null;}
const findNote=(notes,beat,midi)=>(notes||[]).find(n=>Math.abs(Number(n.b)-beat)<.002&&Number(n.m)===midi);
function openEditor(d){closeEditor();closeViewer();hidePlus();const v=view(),current=findNote(v.draft,d.beat,d.midi),published=findNote(v.published,d.beat,d.midi);
 editor=el('form',undefined,'addon-editor');editor.setAttribute('aria-label',`Add-on note at ${d.note}`);
 const head=el('div',undefined,'addon-editor-head');head.append(el('strong',d.note),el('span',`Bar ${d.bar} · ${d.hand==='LH'?'left hand':d.hand==='RH'?'right hand':'both hands'}`,'addon-muted'));editor.append(head);
 const fl=el('label','Fingering');const pad=el('div',undefined,'addon-pad');const finger=el('input');finger.name='fingers';finger.maxLength=40;finger.placeholder='3 or 3-1';finger.value=current?.f||'';finger.inputMode='numeric';finger.autocomplete='off';
 for(let n=1;n<=5;n++){const b=btn(String(n),'addon-finger',()=>{finger.value=finger.value&&/[1-5]$/.test(finger.value)&&finger.dataset.typed==='1'?finger.value+'-'+n:String(n);finger.dataset.typed='1';finger.focus();});b.title=['','Thumb','Index finger','Middle finger','Ring finger','Little finger'][n];pad.append(b);}
 pad.append(finger);fl.append(pad);
 const cl=el('label','Comment');const comment=el('textarea');comment.name='comment';comment.rows=2;comment.maxLength=500;comment.placeholder='How it should sound or feel here';comment.value=current?.c||'';cl.append(comment);
 const more=btn('+ Add a comment','addon-link',()=>{more.remove();cl.hidden=false;comment.focus();});cl.hidden=!current?.c;
 const note=el('p',canSync()?(published?'Enter saves to your draft; others see it when you publish the add-on again.':'Enter saves to your draft. Only you see it until you publish the add-on.'):backend()?.signedIn?.()?'Set up your profile name to save to your account; for now your draft stays on this device.':'Your draft stays on this device. Sign in to publish it.','addon-muted');
 const acts=el('div',undefined,'addon-actions');const save=el('button','Save','addon-primary');save.type='submit';acts.append(save);
 if(current)acts.append(btn('Remove','addon-chip',e=>run(e.currentTarget,async()=>{closeEditor();await saveDraft(setNote(view().draft,{b:d.beat,m:d.midi}));toast('Removed from your draft.');})));
 acts.append(btn('Cancel','addon-chip',closeEditor));editor.append(fl);if(cl.hidden)editor.append(more);editor.append(cl,note,acts);
 editor.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();closeEditor();}});
 editor.onsubmit=e=>{e.preventDefault();const f=finger.value.trim(),c=comment.value.trim();if(f&&!digits(f)){note.textContent='Use finger numbers 1 to 5, for example 3 or 3-1.';note.className='addon-error';finger.focus();return;}
  const next=setNote(view().draft,{b:d.beat,m:d.midi,h:d.hand,f,c});const changed=JSON.stringify(next)!==JSON.stringify(view().draft);closeEditor();if(!changed)return;
  run(save,async()=>{await saveDraft(next);toast(f||c?'Saved to your draft.':'Removed from your draft.');});};
 place(editor,d.rect||noteRect(d)||{left:innerWidth/2,top:innerHeight/2,width:0,height:0,bottom:innerHeight/2});setTimeout(()=>{finger.focus();finger.select();},0);}

// ---------- Viewer: what a mark says ----------
function openViewer(id,rect){closeViewer();hidePlus();const [source,beat,midi]=String(id).split(':');const b=Number(beat),m=Number(midi);
 const mineMark=source==='mine'||source==='draft',layer=mineMark?null:state.layers.find(l=>l.id===applied()),notes=mineMark?view().draft:layer?.notes,n=findNote(notes,b,m);if(!n)return;
 viewer=el('div',undefined,'addon-viewer');viewer.setAttribute('role','dialog');const head=el('div',undefined,'addon-editor-head');head.append(el('strong',mineMark?'You':layer.author));if(layer?.bot)head.append(el('span','Demo bot','addon-bot'));
 if(mineMark)head.append(el('span',source==='draft'?'Draft':'Published',source==='draft'?'addon-tag-draft':'addon-tag-pub'));head.append(el('span',`${window.PianoEngine.noteName(m)} · bar ${P().barOf(b)+1}`,'addon-muted'));viewer.append(head);
 if(n.f){const r=el('p',undefined,'addon-view-finger');r.append(el('span',digits(n.f)||n.f,'addon-big'),el('span',`${n.h==='LH'?'Left':'Right'} hand fingering`,'addon-muted'));viewer.append(r);}
 if(n.c)viewer.append(el('p',n.c,'addon-view-comment'));
 const acts=el('div',undefined,'addon-actions');
 // Opened after this click finishes, so the click that closes the viewer does not also close the editor.
 if(mineMark)acts.append(btn('Edit','addon-chip',()=>{closeViewer();setTimeout(()=>openEditor({beat:b,midi:m,note:window.PianoEngine.noteName(m),hand:n.h,bar:P().barOf(b)+1,rect}),0);}));acts.append(btn('Close','addon-chip',closeViewer));viewer.append(acts);place(viewer,rect);}

// ---------- Wiring ----------
// A note picked by this click (it may arrive through the playhead, so the click target is not the note).
let pickedAt=-1e9;
window.addEventListener('piano-note-pick',e=>{pickedAt=performance.now();if(!editor)showPlus(e.detail);else{const d=e.detail;openEditor({...d,rect:noteRect(d)});}});
window.addEventListener('piano-note-annotate',e=>{if(!library().has(e.detail?.piece))return;openEditor(e.detail);});
window.addEventListener('piano-addon-mark',e=>openViewer(e.detail.id,e.detail.rect));
window.addEventListener('piano-community-auth',()=>load());window.addEventListener('piano-profile-changed',()=>load());
document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const p=P();if(!p)return;mount();p.on('load',()=>{if(p.score?.id!==state.piece){closeEditor();closeViewer();hidePlus();load();}else paint();});p.on('state',()=>{const st=p.state;if(st==='play'||st==='listen'){hidePlus();closeEditor();}});load();})));
window.PianoAddons={digits,storeFingers,changes,setNote,toMarks,fromDevice,reload:load,get state(){return state;}};
})();
