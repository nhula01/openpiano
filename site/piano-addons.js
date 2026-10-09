'use strict';
/* Note add-ons on the score.
   Click a note and a + appears beside it: add a fingering number (Enter saves) or a comment. What you add
   goes into your draft, a layer over the piece that only you see. Publish the draft when it is ready and
   others can find it under Add-ons, vote for it and apply it to their score. Changes to a published
   add-on wait in the draft until you publish again. Shared add-ons from other people (and the clearly
   labelled demo bots) are listed by votes. Storage uses the existing community RPCs (one post per note:
   private posts are the draft, public posts are published); signed-out drafts stay on this device. */
(()=>{
const P=()=>window.PianoPractice;
const DEVICE='openpiano-addons-device-v1',APPLIED='openpiano-addons-applied-v1',SHOW_MINE='openpiano-addons-show-mine-v1';
const read=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v??d;}catch{return d;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const NS='http://www.w3.org/2000/svg';
function icon(d){const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.8');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.innerHTML=d;return s;}
const LAYERS='<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>';
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
const notesIn=list=>new Set(list.map(x=>Number(x.note_beat).toFixed(3)+':'+x.note_midi)).size;

// ---------- Pure helpers (also used by tests) ----------
// Finger numbers to draw: "3", "3-1" (substitution) or "1 2 3" sequences; free text yields nothing.
function digits(text){const t=String(text||'').trim();if(/^[1-5](\s*[-–>,\s]\s*[1-5])*$/.test(t))return t.replace(/\s*[-–>]\s*/g,'–').replace(/\s*,\s*|\s+/g,' ');const m=/\(([1-5](?:\s*[-–]\s*[1-5])*)\)/.exec(t);return m?m[1].replace(/\s*[-–]\s*/g,'–'):'';}
function authorKey(p){return p.bot?'bot:'+(p.profile?.name||p.alias):'user:'+(p.profile?.id||p.profile?.public_id||p.alias);}
// Group public note posts by author: each author's notes on a piece are one add-on. Its score is its
// best-voted note, so one person voting for a whole add-on counts once. Most helpful first.
function groupLayers(posts){const map=new Map();for(const p of posts){if(p.mine||p.parent||p.note_beat==null)continue;const k=authorKey(p);const l=map.get(k)||{key:k,author:p.alias,bot:!!p.bot,profile:p.profile,posts:[],votes:0,fingerings:0,comments:0,newest:''};l.posts.push(p);l.votes=Math.max(l.votes,Number(p.votes)||0);if(p.kind==='fingering')l.fingerings++;else l.comments++;if((p.created_at||'')>l.newest)l.newest=p.created_at||'';map.set(k,l);}
 const layers=[...map.values()];for(const l of layers)l.voted=l.posts.length>0&&l.posts.every(p=>p.voted);return layers.sort((a,b)=>b.votes-a.votes||b.posts.length-a.posts.length||(b.newest>a.newest?1:-1));}
const sameNote=(a,b)=>Math.abs(Number(a.note_beat)-Number(b.note_beat))<.002&&Number(a.note_midi)===Number(b.note_midi);
const sameSlot=(a,b)=>a.kind===b.kind&&sameNote(a,b);
// Your add-on is one layer: published notes plus a draft. A draft note at the same note and kind as a
// published one is a pending change to it. Publishing updates published notes in place (keeping their
// votes) and reveals the new ones.
function splitMine(posts){const published=posts.filter(p=>p.visibility==='public'),drafts=posts.filter(p=>p.visibility!=='public');
 const shown=[...published.filter(p=>!drafts.some(d=>sameSlot(d,p))),...drafts];
 const plan=drafts.map(d=>{const target=published.find(p=>sameSlot(p,d));return target?{op:'update',draft:d,target}:{op:'reveal',draft:d};});
 return {published,drafts,shown,plan};}
function toMarks(posts,source,author){const out=[];for(const p of posts){if(p.note_beat==null)continue;const src=typeof source==='function'?source(p):source;const base={beat:Number(p.note_beat),midi:Number(p.note_midi),hand:p.hand,source:src,author:author||p.alias};
 if(p.kind==='fingering'){const d=digits(p.fingers);if(d)out.push({...base,id:p.id,kind:'fingering',fingers:d,body:p.body&&!/^Fingering /.test(p.body)?p.body:''});else out.push({...base,id:p.id,kind:'comment',body:`Fingering: ${p.fingers}`+(p.body?` · ${p.body}`:'')});}
 else out.push({...base,id:p.id,kind:'comment',body:p.body});}return out;}

// ---------- Backend: the live community RPCs, or the in-browser demo used by previews ----------
function backend(){const demo=window.PianoAddonsDemo;if(demo)return demo;const a=window.PianoCommunityAuth;if(!a)return null;return {ready:()=>a.ready(),signedIn:()=>a.signedIn(),rpc:async(n,args)=>{const {data,error}=await a.rpc(n,args);if(error)throw new Error(error.message);return data;}};}
const profile=()=>window.PianoProfiles?.current?.()||null;
const canSync=()=>!!backend()?.signedIn?.()&&!!profile();

const state={piece:null,mine:[],layers:[],device:[],error:null,loading:false,generation:0};
const library=()=>new Set((window.PianoCurriculum?.pieces||[]).map(p=>p.id));
const applied=()=>read(APPLIED,{})[state.piece]||null;
const showMine=()=>read(SHOW_MINE,true)!==false;
function deviceNotes(){return (read(DEVICE,{})[state.piece]||[]);}
function saveDevice(list){const all=read(DEVICE,{});if(list.length)all[state.piece]=list;else delete all[state.piece];write(DEVICE,all);}
function anchorText(beat,midi,hand){const p=P();return `Bar ${p.barOf(beat)+1} · ${window.PianoEngine.noteName(midi)} · ${hand}`;}
// Device notes are always draft (they have no visibility); account notes split into draft and published.
const mineView=()=>{const s=splitMine(state.mine);return {...s,device:state.device,draftCount:notesIn([...s.drafts,...state.device]),publishedCount:notesIn(s.published),shown:[...s.shown,...state.device]};};

async function load(){const p=P(),id=p?.score?.id;if(!id)return;const gen=++state.generation;state.piece=id;state.device=deviceNotes();state.error=null;
 const be=backend();if(!be||!library().has(id)){state.mine=[];state.layers=[];render();paint();return;}
 if(!be.ready()){render();paint();return;}
 state.loading=true;render();
 try{const roots=[];let total=1;for(let off=0;off<total&&off<200;off+=20){const d=await be.rpc('community_list',{p_piece:id,p_sort:'best',p_offset:off});total=d?.total||0;const got=d?.posts||[];roots.push(...got);if(!got.length)break;}
  const mine=be.signedIn()?await be.rpc('community_mine',{p_piece:id}):{posts:[]};if(gen!==state.generation)return;
  state.mine=(mine?.posts||[]).filter(x=>x.note_beat!=null);state.layers=groupLayers(roots);}
 catch(e){if(gen!==state.generation)return;state.error=e.message;}
 state.loading=false;render();paint();}

// Marks on the score: your add-on (draft notes look dashed until published) and the one add-on you applied.
function paint(){const p=P();if(!p?.setMarks)return;let marks=[];const v=mineView();
 if(showMine())marks=marks.concat(toMarks(v.shown,x=>x.visibility==='public'?'mine':'draft','You'));
 const key=applied(),layer=state.layers.find(l=>l.key===key);if(layer)marks=marks.concat(toMarks(layer.posts,'layer',layer.author));p.setMarks(marks);syncButtons();drawPill();}

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
 document.addEventListener('click',e=>{const path=e.composedPath(),onNote=!!e.target.closest?.('.score-note');if(!panel.hidden&&!path.includes(panel)&&!path.includes(addonsButton))togglePanel(false);if(editor&&!path.includes(editor)&&!onNote)closeEditor();if(viewer&&!path.includes(viewer)&&!e.target.closest?.('.addon-mark'))closeViewer();if(!onNote&&!path.includes(plus))hidePlus();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){togglePanel(false);closeEditor();closeViewer();hidePlus();}});
 return true;}
function syncButtons(){if(!addonsButton)return;const lib=library().has(state.piece);addonsButton.disabled=!lib;
 const key=applied(),layer=state.layers.find(l=>l.key===key);addonsButton.querySelector('span').textContent=layer?`Add-ons · ${layer.author}`:'Add-ons';addonsButton.setAttribute('aria-pressed',String(!!layer));}
function toast(text){const t=document.querySelector('.sg-toast');if(!t)return;t.textContent=text;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2400);}
function togglePanel(force){const open=force??panel.hidden;panel.hidden=!open;addonsButton.setAttribute('aria-expanded',String(open));if(open){closeEditor();hidePlus();render();placePanel();if(!state.loading)load();}}
// The panel opens above the Add-ons button and always stays inside the window.
function placePanel(){if(!panel||panel.hidden)return;const r=addonsButton.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight;panel.style.left=Math.max(8,Math.min(innerWidth-w-8,r.right-w))+'px';panel.style.top=Math.max(8,r.top-h-12)+'px';}
window.addEventListener('resize',()=>placePanel());

function btn(text,cls,fn){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
async function run(b,fn){b.disabled=true;try{await fn();}catch(e){state.error=e.message;toast(e.message);render();}finally{b.disabled=false;}}
// A button that asks once before doing something others will see or that cannot be undone.
function confirmBtn(text,ask,cls,fn){const b=btn(text,cls,()=>{if(b.dataset.confirm!=='1'){b.dataset.confirm='1';b.textContent=ask;clearTimeout(b.timer);b.timer=setTimeout(()=>{b.dataset.confirm='';b.textContent=text;},4000);return;}run(b,fn);});return b;}

// ---------- Draft actions ----------
async function publishDraft(){const be=backend(),{plan}=splitMine(state.mine);
 for(const step of plan){const d=step.draft;if(step.op==='update'){await be.rpc('community_write',{p_piece:state.piece,p_alias:'',p_body:d.body,p_kind:d.kind,p_bars:d.bars||anchorText(Number(d.note_beat),Number(d.note_midi),d.hand),p_hand:d.hand,p_fingers:d.fingers||'',p_parent:null,p_id:step.target.id,p_publish:false,p_note_beat:Number(d.note_beat),p_note_midi:Number(d.note_midi),p_visibility:'public'});await be.rpc('community_hide',{p_post:d.id,p_hide:true});}
  else await be.rpc('community_reveal',{p_post:d.id,p_public:true});}
 await load();toast(plan.length?'Published. Others can now find your add-on under Add-ons.':'Nothing to publish.');}
async function discardDraft(){const be=backend(),{drafts}=splitMine(state.mine);for(const d of drafts)await be.rpc('community_hide',{p_post:d.id,p_hide:true});saveDevice([]);state.device=[];await load();toast('Draft discarded.');}
async function unpublish(){const be=backend(),{published,drafts}=splitMine(state.mine);
 // A published note with a pending change gives way to the change, so each note keeps one version.
 for(const x of published){if(drafts.some(d=>sameSlot(d,x)))await be.rpc('community_hide',{p_post:x.id,p_hide:true});else await be.rpc('community_reveal',{p_post:x.id,p_public:false});}
 await load();toast('Your add-on is private again.');}
function needSignIn(){state.error=backend()?.signedIn?.()?'Set up your profile name to publish your add-on.':'Sign in to publish your add-on. Your draft stays on this device until then.';togglePanel(true);}

// The draft bar sits over the sheet while you have unpublished changes.
function drawPill(){if(!pill)return;const v=mineView(),n=v.draftCount;pill.hidden=!n||!library().has(state.piece)||!showMine();if(pill.hidden)return;pill.replaceChildren();
 const label=el('span',undefined,'addon-pill-label');label.append(el('strong','Your draft'),el('span',`${plural(n,v.publishedCount?'change':'note')}${state.device.length&&canSync()?'':state.device.length?' · this device':''}`));pill.append(label);
 if(canSync()&&state.device.length)pill.append(btn('Move to account','addon-chip',e=>run(e.currentTarget,moveDevice)));
 else if(!canSync())pill.append(btn('Publish','addon-primary',needSignIn));
 else pill.append(confirmBtn('Publish','Publish to everyone?','addon-primary',publishDraft));
 pill.append(confirmBtn('Discard','Discard draft?','addon-chip',discardDraft));}

function render(){if(!panel||panel.hidden)return;const be=backend(),signed=!!be?.signedIn?.(),p=P(),title=(p?.score?.title||'').replace(/ · (complete|full piece|learning arrangement|theme arrangement)$/i,'');
 panel.replaceChildren();requestAnimationFrame(placePanel);const head=el('div',undefined,'addon-head');head.append(el('h2','Add-ons'),el('span',title,'addon-piece'));panel.append(head);
 if(!library().has(state.piece)){panel.append(el('p','Add-ons are available for pieces in the library.','addon-muted'));return;}
 // Your add-on: draft and published
 const v=mineView(),mineBox=el('section',undefined,'addon-yours');
 const row=el('div',undefined,'addon-row');const who=el('div');
 const parts=[v.draftCount?`Draft: ${plural(v.draftCount,v.publishedCount?'change':'note')}`:'',v.publishedCount?`Published: ${plural(v.publishedCount,'note')}`:''].filter(Boolean);
 who.append(el('strong','Your add-on'),el('span',parts.join(' · ')||'Click a note on the sheet, then + to add fingering or a comment.','addon-muted'));row.append(who);
 const show=btn(showMine()?'Shown':'Hidden','addon-chip',()=>{write(SHOW_MINE,!showMine());paint();render();});show.setAttribute('aria-pressed',String(showMine()));show.title='Show or hide your add-on on the sheet';row.append(show);mineBox.append(row);
 const actions=el('div',undefined,'addon-actions');
 if(v.draftCount){if(canSync()&&state.device.length)actions.append(btn(`Move ${plural(state.device.length,'device note')} to your account`,'addon-primary',e=>run(e.currentTarget,moveDevice)));
  else if(canSync())actions.append(confirmBtn(`Publish ${plural(v.draftCount,v.publishedCount?'change':'note')}`,'Publish: everyone can see them','addon-primary',publishDraft));
  actions.append(confirmBtn('Discard draft','Discard: this cannot be undone','addon-chip',discardDraft));}
 if(canSync()&&v.publishedCount)actions.append(confirmBtn('Unpublish','Unpublish: make it private','addon-chip',unpublish));
 if(actions.children.length)mineBox.append(actions);
 if(!signed)mineBox.append(el('p','Signed out: your draft stays on this device. Sign in to keep it in your account and publish it.','addon-muted'));
 else if(!profile()){const a=el('a','Set up your profile name');a.href='#profile';const pp=el('p',undefined,'addon-muted');pp.append(a,' to save your draft to your account and publish it.');mineBox.append(pp);}
 else if(v.draftCount)mineBox.append(el('p','Only you see the draft. Publish it when it is ready; you can keep editing afterwards.','addon-muted'));
 panel.append(mineBox);
 // Community add-ons
 const comm=el('section',undefined,'addon-community');const ch=el('div',undefined,'addon-row');ch.append(el('strong','Community add-ons'),el('span','Most helpful first','addon-muted'));comm.append(ch);
 if(state.loading&&!state.layers.length)comm.append(el('p','Loading…','addon-muted'));
 else if(!state.layers.length)comm.append(el('p','No published add-ons for this piece yet. Add notes and publish yours.','addon-muted'));
 const key=applied();const list=el('ol',undefined,'addon-list');
 for(const l of state.layers){const li=el('li',undefined,'addon-item'+(l.key===key?' is-applied':''));const info=el('div',undefined,'addon-item-info');const name=el('strong',l.author);info.append(name);if(l.bot)info.append(el('span','Demo bot','addon-bot'));
  info.append(el('span',[l.fingerings?plural(l.fingerings,'fingering'):'',l.comments?plural(l.comments,'comment'):''].filter(Boolean).join(' · '),'addon-muted'));
  const vote=btn(`▲ ${l.votes}`,'addon-vote',()=>{if(!signed){state.error='Sign in to vote for an add-on.';render();return;}run(vote,async()=>{for(const x of l.posts)if(!!x.voted===!!l.voted)await be.rpc('community_vote',{p_post:x.id,p_on:!l.voted});await load();});});vote.setAttribute('aria-pressed',String(!!l.voted));vote.title=l.voted?'Remove your vote':'Vote: this add-on helped me';
  const apply=btn(l.key===key?'Applied':'Apply','addon-apply',()=>{const all=read(APPLIED,{});if(all[state.piece]===l.key)delete all[state.piece];else all[state.piece]=l.key;write(APPLIED,all);paint();render();toast(all[state.piece]?`${l.author}'s add-on is on your score.`:'Add-on removed from your score.');});apply.setAttribute('aria-pressed',String(l.key===key));
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

// ---------- Editor: add or change your fingering and comment at one note ----------
function place(box,rect){document.body.append(box);const w=box.offsetWidth,h=box.offsetHeight,vw=innerWidth,vh=innerHeight;let x=rect.left+rect.width/2-w/2,y=rect.top-h-12;if(y<8)y=rect.bottom+12;box.style.left=Math.max(8,Math.min(vw-w-8,x))+'px';box.style.top=Math.max(8,Math.min(vh-h-8,y))+'px';}
function closeEditor(){editor?.remove();editor=null;}
function closeViewer(){viewer?.remove();viewer=null;}
const at=(list,beat,midi)=>list.filter(x=>x.note_beat!=null&&sameNote(x,{note_beat:beat,note_midi:midi}));
function openEditor(d){closeEditor();closeViewer();hidePlus();const synced=canSync(),v=mineView();
 const here=at(v.shown,d.beat,d.midi),fingerPost=here.find(x=>x.kind==='fingering'),commentPost=here.find(x=>x.kind==='comment');
 editor=el('form',undefined,'addon-editor');editor.setAttribute('aria-label',`Add-on for ${d.note}`);
 const head=el('div',undefined,'addon-editor-head');head.append(el('strong',d.note),el('span',`Bar ${d.bar} · ${d.hand==='LH'?'left hand':d.hand==='RH'?'right hand':'both hands'}`,'addon-muted'));editor.append(head);
 const fl=el('label','Fingering');const pad=el('div',undefined,'addon-pad');const finger=el('input');finger.name='fingers';finger.maxLength=40;finger.placeholder='3 or 3-1';finger.value=fingerPost?.fingers||'';finger.inputMode='numeric';finger.autocomplete='off';
 for(let n=1;n<=5;n++){const b=btn(String(n),'addon-finger',()=>{finger.value=finger.value&&/[1-5]$/.test(finger.value)&&finger.dataset.typed==='1'?finger.value+'-'+n:String(n);finger.dataset.typed='1';finger.focus();});b.title=['','Thumb','Index finger','Middle finger','Ring finger','Little finger'][n];pad.append(b);}
 pad.append(finger);fl.append(pad);
 const cl=el('label','Comment');const comment=el('textarea');comment.name='comment';comment.rows=2;comment.maxLength=4000;comment.placeholder='How it should sound or feel here';comment.value=commentPost?.body||'';cl.append(comment);
 const more=btn('+ Add a comment','addon-link',()=>{more.remove();cl.hidden=false;comment.focus();});cl.hidden=!commentPost;
 const published=here.some(x=>x.visibility==='public');
 const note=el('p',synced?(published?'Enter saves the change to your draft; others see it after you publish again.':'Enter saves it to your draft. Only you see it until you publish.'):backend()?.signedIn?.()?'Set up your profile name to save to your account; for now your draft stays on this device.':'Your draft stays on this device. Sign in to publish it.','addon-muted');
 const acts=el('div',undefined,'addon-actions');const save=el('button','Save','addon-primary');save.type='submit';acts.append(save);
 if(fingerPost||commentPost)acts.append(confirmBtn('Delete',published?'Delete from published?':'Delete?','addon-chip',async()=>{await removeAt(d);closeEditor();await load();toast('Removed from your add-on.');}));
 acts.append(btn('Cancel','addon-chip',closeEditor));editor.append(fl);if(cl.hidden)editor.append(more);editor.append(cl,note,acts);
 editor.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();closeEditor();}});
 editor.onsubmit=e=>{e.preventDefault();const f=finger.value.trim(),c=comment.value.trim();if(f&&!digits(f)){note.textContent='Use finger numbers 1 to 5, for example 3 or 3-1.';note.className='addon-error';finger.focus();return;}
  run(save,async()=>{const changed=await saveAt(d,{fingers:f,comment:c});closeEditor();await load();toast(changed==='none'?'No change.':f||c?'Saved to your draft.':'Removed from your add-on.');});};
 place(editor,d.rect||noteRect(d)||{left:innerWidth/2,top:innerHeight/2,width:0,height:0,bottom:innerHeight/2});setTimeout(()=>{finger.focus();finger.select();},0);}
// One kind (fingering or comment) at one note. A published note gets a draft change; a draft is edited in place.
async function saveSlot(d,kind,value){const be=backend(),{published,drafts}=splitMine(state.mine),slot={kind,note_beat:d.beat,note_midi:d.midi};
 const pub=published.find(x=>sameSlot(x,slot)),draft=drafts.find(x=>sameSlot(x,slot)),pubValue=pub?(kind==='fingering'?pub.fingers:pub.body):'';
 if(!value){if(draft)await be.rpc('community_hide',{p_post:draft.id,p_hide:true});if(pub)await be.rpc('community_hide',{p_post:pub.id,p_hide:true});return !!(draft||pub);}
 if(pub&&value===pubValue){if(draft){await be.rpc('community_hide',{p_post:draft.id,p_hide:true});return true;}return false;}
 const current=draft?(kind==='fingering'?draft.fingers:draft.body):null;if(current===value)return false;
 await be.rpc('community_write',{p_piece:state.piece,p_alias:'',p_bars:anchorText(d.beat,d.midi,d.hand),p_hand:d.hand,p_parent:null,p_publish:false,p_note_beat:d.beat,p_note_midi:d.midi,p_visibility:'private',p_body:kind==='fingering'?`Fingering ${value}`:value,p_kind:kind,p_fingers:kind==='fingering'?value:'',p_id:draft?draft.id:null});return true;}
async function saveAt(d,{fingers,comment}){
 if(!canSync()){let list=deviceNotes().filter(x=>!sameNote(x,{note_beat:d.beat,note_midi:d.midi}));const base={note_beat:d.beat,note_midi:d.midi,hand:d.hand,created_at:new Date().toISOString()};
  if(fingers)list.push({...base,id:'device-f-'+d.beat+'-'+d.midi,kind:'fingering',fingers,body:''});if(comment)list.push({...base,id:'device-c-'+d.beat+'-'+d.midi,kind:'comment',body:comment});saveDevice(list);state.device=list;return 'device';}
 const a=await saveSlot(d,'fingering',fingers),b=await saveSlot(d,'comment',comment);return a||b?'saved':'none';}
async function removeAt(d){const be=backend(),key={note_beat:d.beat,note_midi:d.midi};saveDevice(deviceNotes().filter(x=>!sameNote(x,key)));state.device=deviceNotes();
 if(be&&canSync())for(const x of at(state.mine,d.beat,d.midi))await be.rpc('community_hide',{p_post:x.id,p_hide:true});}
async function moveDevice(){const be=backend(),list=deviceNotes();for(const x of list){const d={beat:x.note_beat,midi:x.note_midi,hand:x.hand};await saveSlot(d,x.kind,x.kind==='fingering'?x.fingers:x.body);state.mine=(await be.rpc('community_mine',{p_piece:state.piece}))?.posts?.filter(y=>y.note_beat!=null)||state.mine;}saveDevice([]);state.device=[];await load();toast('Your draft is in your account.');}

// ---------- Viewer: what a mark says ----------
function openViewer(id,rect){closeViewer();hidePlus();const v=mineView();const all=[...v.shown.map(x=>({...x,author:'You',draft:x.visibility!=='public'})),...state.layers.flatMap(l=>l.posts.map(x=>({...x,author:l.author,bot:l.bot})))];const hit=all.find(x=>String(x.id)===String(id));if(!hit)return;
 const here=all.filter(x=>sameNote(x,hit)&&x.author===hit.author);
 viewer=el('div',undefined,'addon-viewer');viewer.setAttribute('role','dialog');const head=el('div',undefined,'addon-editor-head');head.append(el('strong',hit.author));if(hit.bot)head.append(el('span','Demo bot','addon-bot'));if(hit.author==='You')head.append(el('span',here.some(x=>x.draft)?'Draft':'Published',here.some(x=>x.draft)?'addon-tag-draft':'addon-tag-pub'));head.append(el('span',`${hit.note_label||window.PianoEngine.noteName(Number(hit.note_midi))} · bar ${P().barOf(Number(hit.note_beat))+1}`,'addon-muted'));viewer.append(head);
 for(const x of here){if(x.kind==='fingering'){const r=el('p',undefined,'addon-view-finger');r.append(el('span',digits(x.fingers)||x.fingers,'addon-big'),el('span',`${x.hand==='LH'?'Left':'Right'} hand fingering`,'addon-muted'));viewer.append(r);if(x.body&&!/^Fingering /.test(x.body))viewer.append(el('p',x.body));}else viewer.append(el('p',x.body,'addon-view-comment'));}
 const acts=el('div',undefined,'addon-actions');if(hit.author==='You')acts.append(btn('Edit','addon-chip',()=>{closeViewer();const beat=Number(hit.note_beat),midi=Number(hit.note_midi);openEditor({beat,midi,note:window.PianoEngine.noteName(midi),hand:hit.hand,bar:P().barOf(beat)+1,rect});}));acts.append(btn('Close','addon-chip',closeViewer));viewer.append(acts);place(viewer,rect);}

// ---------- Wiring ----------
window.addEventListener('piano-note-pick',e=>{if(!editor)showPlus(e.detail);else{const d=e.detail;openEditor({...d,rect:noteRect(d)});}});
window.addEventListener('piano-note-annotate',e=>{if(!library().has(e.detail?.piece))return;openEditor(e.detail);});
window.addEventListener('piano-addon-mark',e=>openViewer(e.detail.id,e.detail.rect));
window.addEventListener('piano-community-auth',()=>load());window.addEventListener('piano-profile-changed',()=>load());
document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const p=P();if(!p)return;mount();p.on('load',()=>{if(p.score?.id!==state.piece){closeEditor();closeViewer();hidePlus();load();}else paint();});p.on('state',()=>{const st=p.state;if(st==='play'||st==='listen'){hidePlus();closeEditor();}});load();})));
window.PianoAddons={digits,groupLayers,toMarks,authorKey,splitMine,reload:load,get state(){return state;}};
})();
