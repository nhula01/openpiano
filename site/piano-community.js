'use strict';
// Public repertoire discussion. No private score IDs/files, emails or Google
// profile names are sent here. Contributors choose an alias and publish explicitly.
(() => {
const $ = s => document.querySelector(s);
const el = (tag, text, cls) => { const n=document.createElement(tag); if(text!=null)n.textContent=text; if(cls)n.className=cls; return n; };
const auth = () => window.PianoCommunityAuth;
const signed = () => !!auth()?.signedIn();
let root, list, status, composer, commentsTitle, practicePlan, piece=null, catalog, sort='best', offset=0, generation=0, loaded=[], total=0;
const SAVED='openpiano-community-plans-v1';
const plans = () => { try{return JSON.parse(localStorage.getItem(SAVED))||{};}catch{return {};} };
function say(text,bad=false){status.textContent=text;status.classList.toggle('bad',bad);}
async function rpc(name,args){if(!auth()?.ready())throw new Error('Sign-in service is still loading. Try again shortly.');const {data,error}=await auth().rpc(name,args);if(error)throw new Error(error.message);return data;}
function button(text,fn,cls='secondary small'){const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;}
function needSignIn(){say('Sign in from My songs to post, reply or vote.');const a=el('a','Sign in');a.href='#mine';status.append(' ',a);}
function fields(label,tag='input',max=4000){const l=el('label',label),input=el(tag);input.maxLength=max;l.append(input);return [l,input];}
async function action(b,fn){b.disabled=true;try{await fn();}catch(e){say(e.message,true);}finally{b.disabled=false;}}
function form(post=null,parent=null,adapt=null){
 if(!window.PianoProfiles?.current()){const prompt=el('div',undefined,'comment-profile-prompt'),a=el('a','Set up your profile to comment');a.href='#profile';prompt.append(a);return prompt;}
 const f=el('form',undefined,'community-form');
 const profile=window.PianoProfiles?.current();
 const identity=el('div',undefined,'comment-composer-identity');identity.append(window.PianoProfiles?.identity(profile,profile?.name));const editProfile=el('a','Edit profile');editProfile.href='#profile';identity.append(editProfile);
 const [bodyLabel,body]=fields(parent?'Your reply':'Advice, question or explanation','textarea');body.required=true;body.rows=2;body.placeholder=parent?'Write a reply…':'Write a comment…';
 const [kindLabel,kind]=fields('Contribution','select');for(const [v,t] of [['comment','Comment or question'],['fingering','My fingering plan']]){const o=el('option',t);o.value=v;kind.append(o);}
 const extra=el('div',undefined,'community-fingering-fields');
 const [barsLabel,bars]=fields('Bars / passage (identify the edition)','input',80);bars.placeholder='e.g. bars 5–8, this library edition';
 const [handLabel,hand]=fields('Hand','select');for(const [v,t] of [['RH','Right hand'],['LH','Left hand'],['BH','Both hands']]){const o=el('option',t);o.value=v;hand.append(o);}
 const [fingersLabel,fingers]=fields('Notes and finger numbers','textarea',1000);fingers.rows=3;fingers.placeholder='Match each number to a note, e.g. RH C4(1), D4(2), E4(3). Describe shifts and chord fingers.';
 extra.append(barsLabel,handLabel,fingersLabel,el('p','1 = thumb, 5 = little finger. Include note pitches, rhythm/beat or repeat where needed so another player can locate your choices.','muted'));
 const visibility=()=>{extra.hidden=kind.value!=='fingering';bars.required=fingers.required=!extra.hidden;};kind.onchange=visibility;
 if(post){body.value=post.body;kind.value=post.kind;kind.disabled=true;bars.value=post.bars;hand.value=post.hand;fingers.value=post.fingers;}
 if(adapt){kind.value='fingering';bars.value=adapt.bars;hand.value=adapt.hand;fingers.value=adapt.fingers;body.value=`Adapted from ${adapt.alias}’s community plan (${adapt.id}).\n\n${adapt.body}\n\nMy changes: `;}
 visibility();
 const check=el('label',undefined,'check'),agree=el('input');agree.type='checkbox';agree.required=true;
 check.append(agree,el('span','Post publicly under my profile name. My original advice may be reused with credit. No private information or copied copyrighted material.'));
 const submit=el('button',post?'Save public edit':parent?'Reply':'Post comment');submit.type='submit';
 f.append(identity);if(post||parent||adapt)f.append(el('h3',post?'Edit comment':parent?'Reply to '+parent.alias:'Adapt this fingering plan'));if(!parent)f.append(kindLabel);f.append(extra,bodyLabel,check,submit);
 if(post||parent)f.append(button('Cancel',()=>f.remove()));
 f.onsubmit=async e=>{e.preventDefault();if(!signed()){needSignIn();return;}if(profile?.id!==window.PianoProfiles?.current()?.id){say('Your account changed. Write your comment again under your current profile.',true);return;}if(!f.reportValidity())return;const target=piece,epoch=generation;await action(submit,async()=>{
  await rpc('community_write',{p_piece:target,p_alias:profile?.name||'',p_body:body.value.trim(),p_kind:parent?'comment':kind.value,p_bars:kind.value==='fingering'?bars.value.trim():'',p_hand:hand.value,p_fingers:kind.value==='fingering'?fingers.value.trim():'',p_parent:parent?.id||post?.parent||null,p_id:post?.id||null,p_publish:agree.checked});
  if(epoch!==generation)return;f.reset();visibility();if(post||parent)f.remove();await load();say('Published. Thank you for helping another learner.');
 });};return f;
}
function usePlan(p){
 const saved=plans();saved[p.piece]={id:p.id,alias:p.alias,bars:p.bars,hand:p.hand,fingers:p.fingers,body:p.body,date:new Date().toISOString()};
 try{localStorage.setItem(SAVED,JSON.stringify(saved));window.dispatchEvent(new Event('piano-progress-changed'));window.dispatchEvent(new CustomEvent('piano-select-score',{detail:p.piece}));showPlan();say('Plan saved beside this piece’s practice score.');}catch{say('Could not save this plan on this device.',true);}
}
function showPlan(){
 practicePlan.replaceChildren();const id=$('#trainer-song')?.value,p=plans()[id];practicePlan.hidden=!p||!catalog?.has(id);if(practicePlan.hidden)return;
 practicePlan.append(el('h3','My community fingering plan'),el('p',`${p.hand} · ${p.bars} · by ${p.alias}`,'muted'),el('p',p.fingers,'community-body'),el('p',p.body,'community-body'),el('p','Community suggestion, not teacher verification. Original printed fingering remains on the score.','muted'));
 practicePlan.append(button('Remove from my practice',()=>{const all=plans();all[id]={removed:true,date:new Date().toISOString()};localStorage.setItem(SAVED,JSON.stringify(all));window.dispatchEvent(new Event('piano-progress-changed'));showPlan();}));
 if(p.removed){practicePlan.hidden=true;practicePlan.replaceChildren();}
}
function card(p,reply=false){
 const box=el('article',undefined,'community-post'+(reply?' community-reply':''));box.dataset.post=p.id;
 const heading=el('div',undefined,'community-post-head');if(window.PianoProfiles)heading.append(window.PianoProfiles.identity(p.profile,p.alias));else heading.append(el('strong',p.alias));heading.append(el('span',new Date(p.created_at).toLocaleDateString()+(p.edited_at?' · edited':''),'muted'));
 const bubble=el('div',undefined,'comment-bubble');box.append(bubble);bubble.append(heading);
 if(p.kind==='fingering')bubble.append(el('h3','Fingering plan'),el('p',`${p.hand} · ${p.bars}`,'muted'),el('p',p.fingers,'community-body'));
 bubble.append(el('p',p.body,'community-body'));
 const actions=el('div',undefined,'actions community-actions');
 const vote=button(`${p.voted?'✓ Helpful':'Helpful'} · ${p.votes}`,()=>{if(!signed()){needSignIn();return;}action(vote,async()=>{await rpc('community_vote',{p_post:p.id,p_on:!p.voted});await load(true);});});vote.setAttribute('aria-pressed',String(!!p.voted));vote.disabled=!!p.mine;actions.append(vote);
 if(!reply)actions.append(button('Reply',()=>{if(!signed()){needSignIn();return;}if(!box.querySelector('form'))box.append(form(null,p));}));
 if(p.kind==='fingering')actions.append(button('Use in practice',()=>usePlan(p)),button('Adapt',()=>{if(!signed()){needSignIn();return;}composer.replaceChildren(form(null,null,p));composer.scrollIntoView({behavior:'smooth',block:'start'});}));
 if(p.mine){actions.append(button('Edit',()=>{if(!box.querySelector('form'))box.append(form(p));}));const withdraw=button('Withdraw',()=>action(withdraw,async()=>{await rpc('community_hide',{p_post:p.id,p_hide:true});await load();say('Contribution withdrawn.');const undo=button('Undo',()=>action(undo,async()=>{await rpc('community_hide',{p_post:p.id,p_hide:false});await load();say('Contribution restored.');}));status.append(' ',undo);}));actions.append(withdraw);}
 else actions.append(button('Report',()=>{
  if(!signed()){needSignIn();return;}if(box.querySelector('.community-report'))return;
  const f=el('form',undefined,'community-report'),[label,reason]=fields('Why are you reporting this?','textarea',500);reason.required=true;
  const send=el('button','Send private report');send.type='submit';f.append(label,send,button('Cancel',()=>f.remove()));
  f.onsubmit=e=>{e.preventDefault();if(!f.reportValidity())return;action(send,async()=>{await rpc('community_report',{p_post:p.id,p_reason:reason.value.trim()});f.remove();say('Report sent privately to the maintainer for review.');});};box.append(f);
 }));
 box.append(actions);for(const r of p.replies||[])box.append(card(r,true));return box;
}
function render(){list.replaceChildren();if(!loaded.length)list.append(el('p','No contributions yet. Ask a question or share the fingering that helped you.','muted'));for(const p of loaded)list.append(card(p));if(loaded.length<total)list.append(button('Load more',()=>{offset=loaded.length;load(false,true);}));commentsTitle.textContent='Comments';if(signed()){if(!composer.querySelector('form')){composer.replaceChildren();if(window.PianoProfiles?.current())composer.append(form());else{const a=el('a','Set up your profile to comment');a.href='#profile';composer.append(a);}}}else{composer.replaceChildren();const a=el('a','Sign in to contribute');a.href='#mine';composer.append(a);} }
async function load(quiet=false,more=false){
 if(!piece)return;const epoch=++generation,target=piece;if(!more)offset=0;if(!quiet){say('Loading discussion…');if(!more)list.replaceChildren();}
 try{const data=await rpc('community_list',{p_piece:target,p_sort:sort,p_offset:offset});if(epoch!==generation||piece!==target)return;loaded=more?[...loaded,...data.posts]:data.posts;total=data.total;render();say('Helpful votes reflect community preference, not verified accuracy.');}
 catch(e){if(epoch!==generation)return;list.replaceChildren(el('p','Discussion could not load. Your practice score still works.','muted'));say(e.message,true);composer.replaceChildren(button('Try again',()=>load()));}
}
function route(){
 const hash=location.hash,practice=hash==='#practice',lesson=hash.startsWith('#library/piece');
 let id=null;if(practice)id=$('#trainer-song')?.value;else if(lesson){try{id=JSON.parse(localStorage.getItem('my-journey-piano-pathway-v2'))?.selected;}catch{}}
 showPlan();if(!catalog.has(id)||(!practice&&!lesson)){root.hidden=true;piece=null;++generation;return;}
 root.querySelector('#community-permalink').href='#library/piece/'+encodeURIComponent(id);
 if(lesson)shapePiecePost();
 const slot=practice?$('#community-practice-slot'):$('#community-library-slot');slot.append(root);root.hidden=false;
 if(piece!==id){piece=id;loaded=[];offset=0;list.replaceChildren();composer.replaceChildren();load();}
}
function shapePiecePost(){
 const layout=$('.lib-piece .piece-layout'),course=$('#piece-course');if(!layout||!course)return;layout.classList.add('repertoire-post');
 if(course.querySelector('.piece-learning-guide'))return;
 const steps=course.querySelector('.course-steps');if(!steps)return;
 const guide=el('details',undefined,'piece-learning-guide');guide.append(el('summary','Learning guide'));
 const intro=course.children[3],pattern=course.querySelector('.piece-pattern'),notice=course.lastElementChild;
 for(const n of [intro,pattern,steps,notice])if(n&&n.tagName!=='H2'&&n!==guide)guide.append(n);
 course.append(guide);
}
document.addEventListener('DOMContentLoaded',()=>{
 catalog=new Set((window.PianoCurriculum?.pieces||[]).map(p=>p.id));
 const lesson=$('.lib-piece'),practice=$('#note-trainer');if(!lesson||!practice)return;
 const librarySlot=el('div');librarySlot.id='community-library-slot';(lesson.querySelector('.piece-layout')||lesson).append(librarySlot);
 const practiceSlot=el('div');practiceSlot.id='community-practice-slot';practice.append(practiceSlot);
 practicePlan=el('aside',undefined,'community-practice-plan');practicePlan.hidden=true;practicePlan.setAttribute('aria-label','Saved community fingering plan');practice.querySelector('.stage')?.append(practicePlan);
 root=el('section',undefined,'community');root.addEventListener('keydown',e=>e.stopPropagation());root.id='piece-community';root.setAttribute('aria-label','Community discussion and fingering');
 commentsTitle=el('h2','Comments');root.append(commentsTitle);
 const controls=el('div',undefined,'community-toolbar'),[label,order]=fields('Sort','select');for(const [v,t]of [['best','Most helpful'],['new','Newest']]){const o=el('option',t);o.value=v;order.append(o);}order.onchange=()=>{sort=order.value;load();};controls.append(label,button('Refresh',()=>load()));const permalink=el('a','Link to this piece');permalink.id='community-permalink';controls.append(permalink);root.append(controls);
 status=el('p','','community-status');status.setAttribute('role','status');list=el('div',undefined,'community-list');composer=el('div');root.append(composer,list,status);
 const later=()=>setTimeout(route,0);window.addEventListener('hashchange',later);window.addEventListener('piano-select-score',later);window.addEventListener('piano-import-score',later);$('#trainer-song')?.addEventListener('change',later);
 new MutationObserver(later).observe($('#piece-course'),{childList:true});
 window.addEventListener('piano-profile-changed',()=>{composer.replaceChildren();if(piece)render();});
 window.addEventListener('piano-community-auth',()=>{composer.replaceChildren();route();if(piece)load();});window.addEventListener('piano-progress-changed',showPlan);window.addEventListener('storage',showPlan);route();
});
})();
