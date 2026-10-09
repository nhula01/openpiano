'use strict';
/* Note add-ons on the score.
   Each person's notes on a piece (fingering numbers and comments attached to engraved notes) form their
   add-on for that piece. It is private until they share it. Shared add-ons from other people (and the
   clearly labelled demo bots) can be browsed by votes and applied: their marks then appear on your score.
   Storage uses the existing community RPCs (one post per note); signed-out notes stay on this device. */
(()=>{
const P=()=>window.PianoPractice;
const DEVICE='openpiano-addons-device-v1',APPLIED='openpiano-addons-applied-v1',SHOW_MINE='openpiano-addons-show-mine-v1';
const read=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v??d;}catch{return d;}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const NS='http://www.w3.org/2000/svg';
function icon(d){const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');s.setAttribute('fill','none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.8');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.innerHTML=d;return s;}
const PENCIL='<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>';
const LAYERS='<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>';

// ---------- Pure helpers (also used by tests) ----------
// Finger numbers to draw: "3", "3-1" (substitution) or "1 2 3" sequences; free text yields nothing.
function digits(text){const t=String(text||'').trim();if(/^[1-5](\s*[-–>,\s]\s*[1-5])*$/.test(t))return t.replace(/\s*[-–>]\s*/g,'–').replace(/\s*,\s*|\s+/g,' ');const m=/\(([1-5](?:\s*[-–]\s*[1-5])*)\)/.exec(t);return m?m[1].replace(/\s*[-–]\s*/g,'–'):'';}
function authorKey(p){return p.bot?'bot:'+(p.profile?.name||p.alias):'user:'+(p.profile?.id||p.profile?.public_id||p.alias);}
// Group public note posts by author: each author's notes on a piece are one add-on. Its score is its
// best-voted note, so one person voting for a whole add-on counts once. Most helpful first.
function groupLayers(posts){const map=new Map();for(const p of posts){if(p.mine||p.parent||p.note_beat==null)continue;const k=authorKey(p);const l=map.get(k)||{key:k,author:p.alias,bot:!!p.bot,profile:p.profile,posts:[],votes:0,fingerings:0,comments:0,newest:''};l.posts.push(p);l.votes=Math.max(l.votes,Number(p.votes)||0);if(p.kind==='fingering')l.fingerings++;else l.comments++;if((p.created_at||'')>l.newest)l.newest=p.created_at||'';map.set(k,l);}
 const layers=[...map.values()];for(const l of layers)l.voted=l.posts.length>0&&l.posts.every(p=>p.voted);return layers.sort((a,b)=>b.votes-a.votes||b.posts.length-a.posts.length||(b.newest>a.newest?1:-1));}
function toMarks(posts,source,author){const out=[];for(const p of posts){if(p.note_beat==null)continue;const base={beat:Number(p.note_beat),midi:Number(p.note_midi),hand:p.hand,source,author:author||p.alias};
 if(p.kind==='fingering'){const d=digits(p.fingers);if(d)out.push({...base,id:p.id,kind:'fingering',fingers:d,body:p.body&&!/^Fingering /.test(p.body)?p.body:''});else out.push({...base,id:p.id,kind:'comment',body:`Fingering: ${p.fingers}`+(p.body?` · ${p.body}`:'')});}
 else out.push({...base,id:p.id,kind:'comment',body:p.body});}return out;}

// ---------- Backend: the live community RPCs, or the in-browser demo used by previews ----------
function backend(){const demo=window.PianoAddonsDemo;if(demo)return demo;const a=window.PianoCommunityAuth;if(!a)return null;return {ready:()=>a.ready(),signedIn:()=>a.signedIn(),rpc:async(n,args)=>{const {data,error}=await a.rpc(n,args);if(error)throw new Error(error.message);return data;}};}
const profile=()=>window.PianoProfiles?.current?.()||null;

const state={piece:null,mine:[],layers:[],device:[],error:null,loading:false,generation:0};
const library=()=>new Set((window.PianoCurriculum?.pieces||[]).map(p=>p.id));
const applied=()=>read(APPLIED,{})[state.piece]||null;
const showMine=()=>read(SHOW_MINE,true)!==false;
function deviceNotes(){return (read(DEVICE,{})[state.piece]||[]);}
function saveDevice(list){const all=read(DEVICE,{});if(list.length)all[state.piece]=list;else delete all[state.piece];write(DEVICE,all);}
function anchorText(beat,midi,hand){const p=P();return `Bar ${p.barOf(beat)+1} · ${window.PianoEngine.noteName(midi)} · ${hand}`;}

async function load(){const p=P(),id=p?.score?.id;if(!id)return;const gen=++state.generation;state.piece=id;state.device=deviceNotes();state.error=null;
 const be=backend();if(!be||!library().has(id)){state.mine=[];state.layers=[];render();paint();return;}
 if(!be.ready()){render();paint();return;}
 state.loading=true;render();
 try{const roots=[];let total=1;for(let off=0;off<total&&off<200;off+=20){const d=await be.rpc('community_list',{p_piece:id,p_sort:'best',p_offset:off});total=d?.total||0;const got=d?.posts||[];roots.push(...got);if(!got.length)break;}
  const mine=be.signedIn()?await be.rpc('community_mine',{p_piece:id}):{posts:[]};if(gen!==state.generation)return;
  state.mine=(mine?.posts||[]).filter(x=>x.note_beat!=null);state.layers=groupLayers(roots);}
 catch(e){if(gen!==state.generation)return;state.error=e.message;}
 state.loading=false;render();paint();}

// Marks on the score: your add-on (unless hidden) and the one add-on you applied.
function paint(){const p=P();if(!p?.setMarks)return;let marks=[];if(showMine())marks=marks.concat(toMarks(state.mine,'mine','You'),toMarks(state.device,'mine','You (this device)'));
 const key=applied(),layer=state.layers.find(l=>l.key===key);if(layer)marks=marks.concat(toMarks(layer.posts,'layer',layer.author));p.setMarks(marks);syncButtons();}

// ---------- Stage controls: an Add-ons button and an Annotate (pencil) toggle ----------
let addonsButton,annotateButton,panel,editor,viewer;
function mount(){const deck=document.querySelector('.sg-deck');if(!deck||addonsButton)return!!addonsButton;const gear=deck.querySelector('.sg-more');
 annotateButton=el('button',undefined,'sg-tog addon-annotate');annotateButton.type='button';annotateButton.append(icon(PENCIL),el('span','Annotate'));annotateButton.title='Annotate: click notes to add your fingering or a comment';annotateButton.setAttribute('aria-label','Annotate notes');annotateButton.setAttribute('aria-pressed','false');
 annotateButton.onclick=()=>setAnnotate(!P().annotating);
 addonsButton=el('button',undefined,'sg-tog addon-open');addonsButton.type='button';addonsButton.append(icon(LAYERS),el('span','Add-ons'));addonsButton.title='Add-ons: yours and the most helpful community add-ons for this piece';addonsButton.setAttribute('aria-expanded','false');
 addonsButton.onclick=e=>{e.stopPropagation();togglePanel();};
 deck.insertBefore(annotateButton,gear);deck.insertBefore(addonsButton,gear);
 panel=el('div',undefined,'addon-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Add-ons');document.body.append(panel);
 // The path is taken when the click starts, so a panel that redraws itself on click still counts as inside.
 document.addEventListener('click',e=>{const path=e.composedPath();if(!panel.hidden&&!path.includes(panel)&&!path.includes(addonsButton))togglePanel(false);if(editor&&!path.includes(editor)&&!e.target.closest?.('.score-note'))closeEditor();if(viewer&&!path.includes(viewer)&&!e.target.closest?.('.addon-mark'))closeViewer();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){togglePanel(false);closeEditor();closeViewer();}});
 return true;}
function setAnnotate(on){P().setAnnotate(on);syncButtons();if(on)toast('Annotate: click a note to add fingering or a comment.');else closeEditor();}
function syncButtons(){if(!annotateButton)return;const on=!!P()?.annotating;annotateButton.setAttribute('aria-pressed',String(on));const lib=library().has(state.piece);annotateButton.disabled=!lib;addonsButton.disabled=!lib;
 const key=applied(),layer=state.layers.find(l=>l.key===key);addonsButton.querySelector('span').textContent=layer?`Add-ons · ${layer.author}`:'Add-ons';addonsButton.setAttribute('aria-pressed',String(!!layer));}
function toast(text){const t=document.querySelector('.sg-toast');if(!t)return;t.textContent=text;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2200);}
function togglePanel(force){const open=force??panel.hidden;panel.hidden=!open;addonsButton.setAttribute('aria-expanded',String(open));if(open){render();placePanel();if(!state.loading)load();}}
// The panel opens above the Add-ons button and always stays inside the window.
function placePanel(){if(panel.hidden)return;const r=addonsButton.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight;panel.style.left=Math.max(8,Math.min(innerWidth-w-8,r.right-w))+'px';panel.style.top=Math.max(8,r.top-h-12)+'px';}
window.addEventListener('resize',()=>placePanel());

function btn(text,cls,fn){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
async function run(b,fn){b.disabled=true;try{await fn();}catch(e){state.error=e.message;render();}finally{b.disabled=false;}}

function render(){if(!panel||panel.hidden)return;const be=backend(),signed=!!be?.signedIn?.(),p=P(),title=(p?.score?.title||'').replace(/ · (complete|full piece|learning arrangement|theme arrangement)$/i,'');
 panel.replaceChildren();requestAnimationFrame(placePanel);const head=el('div',undefined,'addon-head');head.append(el('h2','Add-ons'),el('span',title,'addon-piece'));panel.append(head);
 if(!library().has(state.piece)){panel.append(el('p','Add-ons are available for pieces in the library.','addon-muted'));return;}
 // Your add-on
 const mineBox=el('section',undefined,'addon-mine');const count=state.mine.length+state.device.length,shared=state.mine.filter(x=>x.visibility==='public').length;
 const row=el('div',undefined,'addon-row');const who=el('div');who.append(el('strong','Your add-on'),el('span',count?`${count} note${count===1?'':'s'}${shared?` · ${shared} shared`:' · private'}${state.device.length?` · ${state.device.length} on this device`:''}`:'No notes yet','addon-muted'));row.append(who);
 const show=btn(showMine()?'Shown':'Hidden','addon-chip',()=>{write(SHOW_MINE,!showMine());paint();render();});show.setAttribute('aria-pressed',String(showMine()));row.append(show);mineBox.append(row);
 const actions=el('div',undefined,'addon-actions');
 actions.append(btn(p.annotating?'Stop annotating':'Annotate notes','addon-primary',()=>{setAnnotate(!p.annotating);togglePanel(false);}));
 if(signed&&state.device.length)actions.append(btn(`Move ${state.device.length} device note${state.device.length===1?'':'s'} to your account`,'addon-chip',e=>run(e.currentTarget,moveDevice)));
 const privateOnes=state.mine.filter(x=>x.visibility!=='public');
 if(signed&&privateOnes.length){const share=btn(`Share ${privateOnes.length} note${privateOnes.length===1?'':'s'}`,'addon-chip',()=>{if(share.dataset.confirm!=='1'){share.dataset.confirm='1';share.textContent='Confirm: everyone can see them';return;}run(share,async()=>{for(const x of privateOnes)await be.rpc('community_reveal',{p_post:x.id,p_public:true});await load();toast('Your add-on is shared.');});});actions.append(share);}
 else if(signed&&shared)actions.append(btn('Make private','addon-chip',e=>run(e.currentTarget,async()=>{for(const x of state.mine.filter(x=>x.visibility==='public'))await be.rpc('community_reveal',{p_post:x.id,p_public:false});await load();})));
 mineBox.append(actions);
 if(!signed)mineBox.append(el('p','Signed out: notes stay on this device. Sign in to keep them in your account and share them.','addon-muted'));
 else if(!profile()){const a=el('a','Set up your profile name');a.href='#profile';const pp=el('p',undefined,'addon-muted');pp.append(a,' to save notes to your account.');mineBox.append(pp);}
 panel.append(mineBox);
 // Community add-ons
 const comm=el('section',undefined,'addon-community');const ch=el('div',undefined,'addon-row');ch.append(el('strong','Community add-ons'),el('span','Most helpful first','addon-muted'));comm.append(ch);
 if(state.loading&&!state.layers.length)comm.append(el('p','Loading…','addon-muted'));
 else if(!state.layers.length)comm.append(el('p','No shared add-ons for this piece yet. Annotate notes and share yours.','addon-muted'));
 const key=applied();const list=el('ol',undefined,'addon-list');
 for(const l of state.layers){const li=el('li',undefined,'addon-item'+(l.key===key?' is-applied':''));const info=el('div',undefined,'addon-item-info');const name=el('strong',l.author);info.append(name);if(l.bot)info.append(el('span','Demo bot','addon-bot'));
  info.append(el('span',[l.fingerings?`${l.fingerings} fingering${l.fingerings===1?'':'s'}`:'',l.comments?`${l.comments} comment${l.comments===1?'':'s'}`:''].filter(Boolean).join(' · '),'addon-muted'));
  const vote=btn(`▲ ${l.votes}`,'addon-vote',()=>{if(!signed){state.error='Sign in to vote for an add-on.';render();return;}run(vote,async()=>{for(const x of l.posts)if(!!x.voted===!!l.voted)await be.rpc('community_vote',{p_post:x.id,p_on:!l.voted});await load();});});vote.setAttribute('aria-pressed',String(!!l.voted));vote.title=l.voted?'Remove your vote':'Vote: this add-on helped me';
  const apply=btn(l.key===key?'Applied':'Apply','addon-apply',()=>{const all=read(APPLIED,{});if(all[state.piece]===l.key)delete all[state.piece];else all[state.piece]=l.key;write(APPLIED,all);paint();render();toast(all[state.piece]?`${l.author}'s add-on is on your score.`:'Add-on removed from your score.');});apply.setAttribute('aria-pressed',String(l.key===key));
  li.append(info,vote,apply);list.append(li);}
 comm.append(list);comm.append(el('p','Community fingering and comments are suggestions, not teacher-verified. Printed fingering stays on the score.','addon-foot'));panel.append(comm);
 if(state.error){const e=el('p',state.error,'addon-error');e.setAttribute('role','status');panel.append(e);}
}

// ---------- Editor: add or change your fingering and comment at one note ----------
function place(box,rect){document.body.append(box);const w=box.offsetWidth,h=box.offsetHeight,vw=innerWidth,vh=innerHeight;let x=rect.left+rect.width/2-w/2,y=rect.top-h-12;if(y<8)y=rect.bottom+12;box.style.left=Math.max(8,Math.min(vw-w-8,x))+'px';box.style.top=Math.max(8,Math.min(vh-h-8,y))+'px';}
function closeEditor(){editor?.remove();editor=null;}
function closeViewer(){viewer?.remove();viewer=null;}
const at=(list,beat,midi)=>list.filter(x=>x.note_beat!=null&&Math.abs(Number(x.note_beat)-beat)<.002&&Number(x.note_midi)===midi);
function openEditor(d){closeEditor();closeViewer();const be=backend(),signed=!!be?.signedIn?.()&&!!profile();
 const server=at(state.mine,d.beat,d.midi),local=at(state.device,d.beat,d.midi),fingerPost=[...server,...local].find(x=>x.kind==='fingering'),commentPost=[...server,...local].find(x=>x.kind==='comment');
 editor=el('form',undefined,'addon-editor');editor.setAttribute('aria-label',`Add-on for ${d.note}`);
 const head=el('div',undefined,'addon-editor-head');head.append(el('strong',d.note),el('span',`Bar ${d.bar} · ${d.hand==='LH'?'left hand':d.hand==='RH'?'right hand':'both hands'}`,'addon-muted'));editor.append(head);
 const fl=el('label','Fingering');const pad=el('div',undefined,'addon-pad');const finger=el('input');finger.name='fingers';finger.maxLength=40;finger.placeholder='e.g. 3 or 3-1';finger.value=fingerPost?.fingers||'';finger.inputMode='numeric';
 for(let n=1;n<=5;n++){const b=btn(String(n),'addon-finger',()=>{finger.value=finger.value&&/[1-5]$/.test(finger.value)&&finger.dataset.typed==='1'?finger.value+'-'+n:String(n);finger.dataset.typed='1';finger.focus();});b.title=['','Thumb','Index finger','Middle finger','Ring finger','Little finger'][n];pad.append(b);}
 pad.append(finger);fl.append(pad);
 const cl=el('label','Comment');const comment=el('textarea');comment.name='comment';comment.rows=2;comment.maxLength=4000;comment.placeholder='How it should sound or feel here';comment.value=commentPost?.body||'';cl.append(comment);
 const note=el('p',signed?'Private to you until you share your add-on.':backend()?.signedIn?.()?'Set up your profile name to save to your account; for now this stays on this device.':'Saved on this device. Sign in to keep it in your account and share it.','addon-muted');
 const acts=el('div',undefined,'addon-actions');const save=el('button','Save','addon-primary');save.type='submit';acts.append(save);
 if(fingerPost||commentPost)acts.append(btn('Delete','addon-chip',e=>run(e.currentTarget,async()=>{await removeAt(d,[fingerPost,commentPost].filter(Boolean));closeEditor();await load();toast('Note removed from your add-on.');})));
 acts.append(btn('Cancel','addon-chip',closeEditor));editor.append(fl,cl,note,acts);
 editor.addEventListener('keydown',e=>e.stopPropagation());
 editor.onsubmit=e=>{e.preventDefault();const f=finger.value.trim(),c=comment.value.trim();if(f&&!digits(f)){state.error='Use finger numbers 1 to 5, for example 3 or 3-1.';note.textContent=state.error;note.className='addon-error';return;}
  run(save,async()=>{await saveAt(d,{fingers:f,comment:c,fingerPost,commentPost});closeEditor();await load();toast(f||c?'Saved to your add-on.':'Note cleared.');});};
 place(editor,d.rect);setTimeout(()=>(f=>f.focus())(fingerPost||!commentPost?finger:comment),0);}
async function saveAt(d,{fingers,comment,fingerPost,commentPost}){const be=backend(),signed=!!be?.signedIn?.()&&!!profile();
 if(!signed){let list=deviceNotes().filter(x=>!(Math.abs(x.note_beat-d.beat)<.002&&x.note_midi===d.midi));const base={note_beat:d.beat,note_midi:d.midi,hand:d.hand,created_at:new Date().toISOString()};
  if(fingers)list.push({...base,id:'device-f-'+d.beat+'-'+d.midi,kind:'fingering',fingers,body:''});if(comment)list.push({...base,id:'device-c-'+d.beat+'-'+d.midi,kind:'comment',body:comment});saveDevice(list);state.device=list;return;}
 const common={p_piece:state.piece,p_alias:'',p_bars:anchorText(d.beat,d.midi,d.hand),p_hand:d.hand,p_parent:null,p_publish:false,p_note_beat:d.beat,p_note_midi:d.midi,p_visibility:'private'};
 if(fingers)await be.rpc('community_write',{...common,p_body:`Fingering ${fingers}`,p_kind:'fingering',p_fingers:fingers,p_id:fingerPost&&!String(fingerPost.id).startsWith('device')?fingerPost.id:null});
 else if(fingerPost&&!String(fingerPost.id).startsWith('device'))await be.rpc('community_hide',{p_post:fingerPost.id,p_hide:true});
 if(comment)await be.rpc('community_write',{...common,p_body:comment,p_kind:'comment',p_fingers:'',p_id:commentPost&&!String(commentPost.id).startsWith('device')?commentPost.id:null});
 else if(commentPost&&!String(commentPost.id).startsWith('device'))await be.rpc('community_hide',{p_post:commentPost.id,p_hide:true});}
async function removeAt(d,posts){const be=backend();for(const x of posts){if(String(x.id).startsWith('device')){saveDevice(deviceNotes().filter(y=>y.id!==x.id));}else await be.rpc('community_hide',{p_post:x.id,p_hide:true});}state.device=deviceNotes();}
async function moveDevice(){const be=backend(),list=deviceNotes();for(const x of list){const d={beat:x.note_beat,midi:x.note_midi,hand:x.hand};await be.rpc('community_write',{p_piece:state.piece,p_alias:'',p_bars:anchorText(d.beat,d.midi,d.hand),p_hand:d.hand,p_parent:null,p_publish:false,p_note_beat:d.beat,p_note_midi:d.midi,p_visibility:'private',p_kind:x.kind,p_fingers:x.kind==='fingering'?x.fingers:'',p_body:x.kind==='fingering'?`Fingering ${x.fingers}`:x.body,p_id:null});}saveDevice([]);state.device=[];await load();}

// ---------- Viewer: what a mark says ----------
function openViewer(id,rect){closeViewer();const all=[...state.mine.map(x=>({...x,author:'You'})),...state.device.map(x=>({...x,author:'You (this device)'})),...state.layers.flatMap(l=>l.posts.map(x=>({...x,author:l.author,bot:l.bot})))];const hit=all.find(x=>String(x.id)===String(id));if(!hit)return;
 const here=all.filter(x=>Math.abs(Number(x.note_beat)-Number(hit.note_beat))<.002&&Number(x.note_midi)===Number(hit.note_midi)&&(x.author===hit.author));
 viewer=el('div',undefined,'addon-viewer');viewer.setAttribute('role','dialog');const head=el('div',undefined,'addon-editor-head');head.append(el('strong',hit.author));if(hit.bot)head.append(el('span','Demo bot','addon-bot'));head.append(el('span',`${hit.note_label||window.PianoEngine.noteName(Number(hit.note_midi))} · bar ${P().barOf(Number(hit.note_beat))+1}`,'addon-muted'));viewer.append(head);
 for(const x of here){if(x.kind==='fingering'){const r=el('p',undefined,'addon-view-finger');r.append(el('span',digits(x.fingers)||x.fingers,'addon-big'),el('span',`${x.hand==='LH'?'Left':'Right'} hand fingering`,'addon-muted'));viewer.append(r);if(x.body&&!/^Fingering /.test(x.body))viewer.append(el('p',x.body));}else viewer.append(el('p',x.body,'addon-view-comment'));}
 const acts=el('div',undefined,'addon-actions');if(hit.author.startsWith('You'))acts.append(btn('Edit','addon-chip',()=>{closeViewer();openEditor({beat:Number(hit.note_beat),midi:Number(hit.note_midi),note:window.PianoEngine.noteName(Number(hit.note_midi)),hand:hit.hand,bar:P().barOf(Number(hit.note_beat))+1,rect});}));acts.append(btn('Close','addon-chip',closeViewer));viewer.append(acts);place(viewer,rect);}

// ---------- Wiring ----------
window.addEventListener('piano-note-annotate',e=>{if(!library().has(e.detail?.piece))return;openEditor(e.detail);});
window.addEventListener('piano-addon-mark',e=>openViewer(e.detail.id,e.detail.rect));
window.addEventListener('piano-community-auth',()=>load());window.addEventListener('piano-profile-changed',()=>load());
document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const p=P();if(!p)return;mount();p.on('load',()=>{if(p.score?.id!==state.piece){closeEditor();closeViewer();load();}else paint();});load();})));
window.PianoAddons={digits,groupLayers,toMarks,authorKey,reload:load,get state(){return state;}};
})();
