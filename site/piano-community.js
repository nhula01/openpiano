'use strict';
// Note add-ons belong to a built-in repertoire piece. New roots are private until
// their author reveals them; public add-ons can be copied into another account.
(() => {
const $=s=>document.querySelector(s);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const auth=()=>window.PianoCommunityAuth;
const signed=()=>!!auth()?.signedIn();
let root,list,mine,composer,status,title,piece=null,catalog,sort='best',generation=0,loaded=[],own=[],saved=[],total=0,selectedAnchor=null;
function say(text,bad=false){status.textContent=text;status.classList.toggle('bad',bad);}
async function rpc(name,args={}){if(!auth()?.ready())throw new Error('Sign-in service is still loading. Try again shortly.');const {data,error}=await auth().rpc(name,args);if(error)throw new Error(error.message);return data;}
function button(text,fn,cls='secondary small'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
async function action(b,fn){b.disabled=true;try{await fn();}catch(e){say(e.message,true);}finally{b.disabled=false;}}
function needSignIn(){say('Sign in from My songs to save, reply or vote.');const a=el('a','Sign in');a.href='#mine';status.append(' ',a);}
function field(label,tag='input',max=4000){const l=el('label',label),input=el(tag);input.maxLength=max;l.append(input);return[l,input];}
function anchorText(p){if(p.note_beat==null)return p.bars||'Piece comment';return [`Bar ${Math.max(1,Math.floor(Number(p.note_beat)/(window.PianoPractice?.meter||4))+1)}`,p.note_label||p.note,p.hand].filter(Boolean).join(' · ');}
function anchorChip(p,clickable=false){const n=el(clickable?'button':'span',anchorText(p),'addon-anchor');if(clickable){n.type='button';n.onclick=()=>openAddon(p);}return n;}
function openAddon(p){
 if(p.note_beat==null)return;
 const anchor={piece:p.piece,beat:Number(p.note_beat),midi:Number(p.note_midi),note:p.note_label,hand:p.hand};
 const show=()=>window.dispatchEvent(new CustomEvent('piano-addon-open',{detail:anchor}));
 if(window.PianoPractice?.score?.id===p.piece){location.hash='#practice';show();return;}
 const ready=e=>{if(e.detail!==p.piece)return;window.removeEventListener('piano-score-viewed',ready);setTimeout(show,0);};
 window.addEventListener('piano-score-viewed',ready);location.hash='#practice';setTimeout(()=>window.dispatchEvent(new CustomEvent('piano-select-score',{detail:p.piece})),0);
}
function composerForm(post=null,parent=null){
 const profile=window.PianoProfiles?.current();
 if(!profile){const prompt=el('div',undefined,'comment-profile-prompt'),a=el('a','Set up your profile to add a note');a.href='#profile';prompt.append(a);return prompt;}
 const f=el('form',undefined,'community-form addon-composer');
 const top=el('div',undefined,'comment-composer-identity');top.append(window.PianoProfiles.identity(profile,profile.name));const edit=el('a','Edit profile');edit.href='#profile';top.append(edit);f.append(top);
 const anchor=post||selectedAnchor;
 if(!parent){
  const selected=el('div',undefined,'addon-selected');
  if(anchor?.note_beat!=null)selected.append(anchorChip(anchor));
  else{selected.append(el('span','Choose a note in the practice score first.','muted'));const choose=el('a','Open score');choose.href='#practice';choose.onclick=()=>setTimeout(()=>window.dispatchEvent(new CustomEvent('piano-select-score',{detail:piece})),0);selected.append(choose);}
  f.append(selected);
 }
 const [bodyLabel,body]=field(parent?'Write a public reply':'Add your note comment','textarea',4000);body.required=true;body.rows=2;body.placeholder=parent?'Write a reply…':'What should you remember at this note?';
 const [kindLabel,kind]=field('Type','select');for(const[v,t]of[['comment','Comment'],['fingering','Fingering']]){const o=el('option',t);o.value=v;kind.append(o);}
 const detail=el('div',undefined,'addon-fingering-fields'),[handLabel,hand]=field('Hand','select');for(const v of ['RH','LH','BH']){const o=el('option',v);o.value=v;hand.append(o);}hand.value=anchor?.hand||'RH';
 const [fingersLabel,fingers]=field('Finger numbers','input',1000);fingers.placeholder='e.g. E5(1), A5(5), then shift';
 detail.append(handLabel,fingersLabel,el('small','Use 1 for thumb and 5 for little finger. Enter only your own fingering advice.','muted'));
 const showDetail=()=>{detail.hidden=kind.value!=='fingering';fingers.required=!detail.hidden;};kind.onchange=showDetail;
 if(post){kind.value=post.kind;kind.disabled=true;body.value=post.body;hand.value=post.hand;fingers.value=post.fingers;}
 showDetail();
 if(!parent)f.append(kindLabel,detail);f.append(bodyLabel);
 if(parent)f.append(el('p','Replies are public under your profile name.','muted'));
 else f.append(el('p',post?'Editing keeps the current visibility.':'Saved privately first. You choose Reveal when it is ready for everyone.','muted'));
 const submit=el('button',post?'Save changes':parent?'Reply':'Save add-on');submit.type='submit';submit.disabled=!parent&&anchor?.note_beat==null;f.append(submit);
 if(post||parent)f.append(button('Cancel',()=>f.remove()));
 const profileId=profile.id;
 f.onsubmit=e=>{e.preventDefault();if(!signed()){needSignIn();return;}if(profileId!==window.PianoProfiles?.current()?.id){say('Your account changed. Reopen the composer.',true);return;}if(!f.reportValidity())return;const target=piece,epoch=generation;action(submit,async()=>{
  const chosen=post||selectedAnchor;
  await rpc('community_write',{p_piece:target,p_alias:'',p_body:body.value.trim(),p_kind:parent?'comment':kind.value,p_bars:chosen?.note_beat!=null?anchorText({...chosen,hand:hand.value}):'',p_hand:parent?'BH':hand.value,p_fingers:kind.value==='fingering'?fingers.value.trim():'',p_parent:parent?.id||post?.parent||null,p_id:post?.id||null,p_publish:!!parent,p_note_beat:parent?null:Number(chosen.note_beat),p_note_midi:parent?null:Number(chosen.note_midi),p_visibility:parent?'public':'private'});
  if(epoch!==generation)return;if(post||parent)f.remove();else{body.value='';fingers.value='';}await load();say(parent?'Reply published.':'Add-on saved privately. Reveal it when you want to share.');
 });};return f;
}
function identity(p){const head=el('div',undefined,'community-post-head'),who=window.PianoProfiles?.identity(p.profile,p.alias)||el('strong',p.alias);head.append(who);if(p.bot)head.append(el('span','BOT','bot-badge'));head.append(el('span',new Date(p.created_at||p.saved_at).toLocaleDateString()+(p.edited_at?' · edited':''),'muted'));return head;}
function reportForm(box,p){if(box.querySelector('.community-report'))return;const f=el('form',undefined,'community-report'),[label,reason]=field('Why are you reporting this?','textarea',500);reason.required=true;const send=el('button','Send report');send.type='submit';f.append(label,send,button('Cancel',()=>f.remove()));f.onsubmit=e=>{e.preventDefault();if(!f.reportValidity())return;action(send,async()=>{await rpc('community_report',{p_post:p.id,p_reason:reason.value.trim()});f.remove();say('Report sent privately to the maintainer.');});};box.append(f);}
function card(p,{reply=false,personal=false,snapshot=false}={}){
 const box=el('article',undefined,'community-post'+(reply?' community-reply':'')+(personal?' personal-addon':''));box.dataset.post=p.id||p.source_post;
 const bubble=el('div',undefined,'comment-bubble');bubble.append(identity(p));
 if(!reply&&p.note_beat!=null)bubble.append(anchorChip(p,true));
 if(p.kind==='fingering'&&p.fingers)bubble.append(el('p',`${p.hand} fingering · ${p.fingers}`,'addon-fingering'));
 bubble.append(el('p',p.body,'community-body'));box.append(bubble);
 const actions=el('div',undefined,'actions community-actions');
 if(snapshot){const remove=button('Remove',()=>action(remove,async()=>{await rpc('community_save_addon',{p_post:p.source_post||p.id,p_on:false});await load();say('Removed from your repertoire.');}));actions.append(button('Open note',()=>openAddon(p)),remove);}
 else if(personal){
  actions.append(button('Open note',()=>openAddon(p)));
  const reveal=button(p.visibility==='public'?'Make private':'Reveal',()=>action(reveal,async()=>{await rpc('community_reveal',{p_post:p.id,p_public:p.visibility!=='public'});await load();say(p.visibility==='public'?'Add-on is private again.':'Add-on revealed to the community.');}));actions.append(reveal);
  actions.append(button('Edit',()=>{if(!box.querySelector('form'))box.append(composerForm(p));}));
  const withdraw=button('Remove',()=>action(withdraw,async()=>{await rpc('community_hide',{p_post:p.id,p_hide:true});await load();say('Add-on removed.');}));actions.append(withdraw);
 }else{
  const vote=button(`${p.voted?'✓ Helpful':'Helpful'} · ${p.votes}`,()=>{if(!signed()){needSignIn();return;}action(vote,async()=>{await rpc('community_vote',{p_post:p.id,p_on:!p.voted});await load(true);});});vote.setAttribute('aria-pressed',String(!!p.voted));vote.disabled=!!p.mine;actions.append(vote);
  if(!reply)actions.append(button('Reply',()=>{if(!signed()){needSignIn();return;}if(!box.querySelector('form'))box.append(composerForm(null,p));}));
  if(!reply){const add=button(p.saved?'✓ Added':'Add to mine',()=>{if(!signed()){needSignIn();return;}action(add,async()=>{await rpc('community_save_addon',{p_post:p.id,p_on:!p.saved});await load(true);say(p.saved?'Removed from your repertoire.':'Added to your repertoire with credit.');});});add.setAttribute('aria-pressed',String(!!p.saved));actions.append(add,button('Open note',()=>openAddon(p)));}
  if(!p.mine)actions.append(button('Report',()=>{if(!signed()){needSignIn();return;}reportForm(box,p);}));
 }
 box.append(actions);for(const r of p.replies||[])box.append(card(r,{reply:true}));return box;
}
function render(){
 list.replaceChildren();if(!loaded.length)list.append(el('p','No public add-ons yet.','muted'));for(const p of loaded)list.append(card(p));title.textContent='Community add-ons';
 mine.replaceChildren();if(signed()){
  const h=el('div',undefined,'addon-section-title');h.append(el('h3','My add-ons'),el('span',`${own.length+saved.length} saved`,'muted'));mine.append(h);
  if(!own.length&&!saved.length)mine.append(el('p','Your private note comments and saved community add-ons will appear here.','muted'));
  for(const p of own)mine.append(card(p,{personal:true}));for(const p of saved)mine.append(card(p,{personal:true,snapshot:true}));
  if(!composer.querySelector('form'))composer.replaceChildren(composerForm());
 }else{mine.replaceChildren();composer.replaceChildren();const a=el('a','Sign in to create and save add-ons');a.href='#mine';composer.append(a);}
}
async function load(quiet=false){
 if(!piece)return;const epoch=++generation,target=piece;if(!quiet)say('Loading add-ons…');
 try{const[publicData,mineData]=await Promise.all([rpc('community_list',{p_piece:target,p_sort:sort,p_offset:0}),signed()?rpc('community_mine',{p_piece:target}):Promise.resolve({posts:[],saved:[]})]);if(epoch!==generation||piece!==target)return;loaded=publicData.posts||[];total=publicData.total||0;own=mineData.posts||[];saved=mineData.saved||[];render();say(total?`${total} public add-on${total===1?'':'s'} · community advice is not teacher verification.`:'Add-ons are private until their authors reveal them.');}
 catch(e){if(epoch!==generation)return;list.replaceChildren(el('p','Add-ons could not load. The practice score still works.','muted'));say(e.message,true);composer.replaceChildren(button('Try again',()=>load()));}
}
function shapePiecePost(){const layout=$('.lib-piece .piece-layout'),course=$('#piece-course');if(!layout||!course)return;layout.classList.add('repertoire-post');if(course.querySelector('.piece-learning-guide'))return;const steps=course.querySelector('.course-steps');if(!steps)return;const guide=el('details',undefined,'piece-learning-guide');guide.append(el('summary','Learning guide'));const intro=course.children[3],pattern=course.querySelector('.piece-pattern'),notice=course.lastElementChild;for(const n of[intro,pattern,steps,notice])if(n&&n.tagName!=='H2'&&n!==guide)guide.append(n);course.append(guide);}
function route(){
 const hash=location.hash,practice=hash==='#practice',lesson=hash.startsWith('#library/piece');let id=null;if(practice)id=$('#trainer-song')?.value;else if(lesson){try{id=JSON.parse(localStorage.getItem('my-journey-piano-pathway-v2'))?.selected;}catch{}}
 if(!catalog.has(id)||(!practice&&!lesson)){root.hidden=true;piece=null;++generation;return;}
 root.querySelector('#community-permalink').href='#library/piece/'+encodeURIComponent(id);if(lesson)shapePiecePost();(practice?$('#community-practice-slot'):$('#community-library-slot')).append(root);root.hidden=false;
 if(piece!==id){piece=id;selectedAnchor=null;loaded=[];own=[];saved=[];composer.replaceChildren();load();}
}
document.addEventListener('DOMContentLoaded',()=>{
 catalog=new Set((window.PianoCurriculum?.pieces||[]).map(p=>p.id));const lesson=$('.lib-piece'),practice=$('#note-trainer');if(!lesson||!practice)return;
 const librarySlot=el('div');librarySlot.id='community-library-slot';(lesson.querySelector('.piece-layout')||lesson).append(librarySlot);const practiceSlot=el('div');practiceSlot.id='community-practice-slot';practice.append(practiceSlot);
 root=el('section',undefined,'community');root.id='piece-community';root.hidden=true;root.setAttribute('aria-label','Personal and community note add-ons');root.addEventListener('keydown',e=>e.stopPropagation());
 title=el('h2','Community add-ons');root.append(title,el('p','Click a note in the practice score to attach a private comment or fingering. Reveal it only when you want others to see it.','community-intro'));
 composer=el('div',undefined,'community-composer');mine=el('section',undefined,'my-addons');
 const controls=el('div',undefined,'community-toolbar'),[label,order]=field('Show','select');for(const[v,t]of[['best','Most useful'],['new','Newest']]){const o=el('option',t);o.value=v;order.append(o);}order.onchange=()=>{sort=order.value;load();};controls.append(label);const permalink=el('a','Link to piece');permalink.id='community-permalink';controls.append(permalink);
 list=el('div',undefined,'community-list');status=el('p','', 'community-status');status.setAttribute('role','status');root.append(composer,mine,controls,list,status);
 const later=()=>setTimeout(route,0);window.addEventListener('hashchange',later);window.addEventListener('piano-select-score',later);window.addEventListener('piano-import-score',later);$('#trainer-song')?.addEventListener('change',later);new MutationObserver(later).observe($('#piece-course'),{childList:true});
 window.addEventListener('piano-note-selected',e=>{if(e.detail?.piece!==piece||!catalog.has(piece))return;selectedAnchor={...e.detail,note_beat:e.detail.beat,note_midi:e.detail.midi,note_label:e.detail.note};composer.replaceChildren(signed()?composerForm():el('a','Sign in to add a note'));composer.scrollIntoView({behavior:'smooth',block:'nearest'});say(`Selected ${e.detail.note} in bar ${e.detail.bar}.`);});
 window.addEventListener('piano-profile-changed',()=>{composer.replaceChildren();if(piece)render();});window.addEventListener('piano-community-auth',()=>{composer.replaceChildren();route();if(piece)load();});route();
});
})();
