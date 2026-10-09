'use strict';
(() => {
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
let own=null,box,status,epoch=0,authEpoch=0;
const auth=()=>window.PianoCommunityAuth;
const signed=()=>!!auth()?.signedIn();
async function rpc(name,args={}){if(!auth()?.ready())throw new Error('Sign-in service is still loading. Try again shortly.');const r=await auth().rpc(name,args);if(r.error)throw new Error(r.error.message);return r.data;}
function initials(name){return (name||'?').trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();}
function avatar(name,path){const n=el('span',initials(name),'profile-avatar');n.setAttribute('aria-hidden','true');n.dataset.avatarPath=path||'';if(path&&auth()?.avatarUrl)auth().avatarUrl(path).then(src=>{if(!src||n.dataset.avatarPath!==path)return;const img=el('img');img.alt='';img.src=src;img.onload=()=>n.classList.add('has-photo');n.append(img);}).catch(()=>{});return n;}
function identity(profile,fallback){const name=profile?.name||fallback||'Learner',row=el('div',undefined,'profile-identity');row.append(avatar(name,profile?.avatar_path));const info=el('div');const a=el(profile?.id?'a':'strong',name);if(profile?.id)a.href=profile.published===false?'#profile':'#profile/'+profile.id;info.append(a);if(profile?.experience||profile?.skills)info.append(el('small',[profile.experience&&profile.experience+' · self-described',profile.skills].filter(Boolean).join(' · ')));row.append(info);return row;}
function profileCard(profile){const card=el('article',undefined,'profile-card');card.append(identity(profile));if(profile.bio)card.append(el('p',profile.bio,'community-body'));card.append(el('p','Music experience and skills are shared by this learner, not verified credentials.','muted'));return card;}
function message(text,bad=false){status.textContent=text;status.classList.toggle('bad',bad);}
function editor(){
 const editorAuthEpoch=authEpoch;
 box.replaceChildren();const p=own||{name:'',skills:'',bio:'',experience:'Learning',published:false,avatar_path:null};const form=el('form',undefined,'profile-editor');
 const field=(title,tag,max)=>{const label=el('label',title),input=el(tag);input.maxLength=max;label.append(input);form.append(label);return input;};
 form.append(el('h2',own?'Edit your profile':'Create your profile'),el('p','This is the profile your comments use. Choose your picture, name and music details here; your Google profile is not copied or published.','muted'));
 const photoField=el('div',undefined,'profile-photo-field'),photoPreview=avatar(p.name||'You',p.avatar_path),photoControls=el('div');
 const photoLabel=el('label','Profile picture'),photo=el('input');photo.type='file';photo.accept='image/jpeg,image/png,image/webp';photoLabel.append(photo);
 const removePhoto=el('label',undefined,'check profile-photo-remove'),removePhotoInput=el('input');removePhotoInput.type='checkbox';removePhotoInput.checked=false;removePhotoInput.disabled=!p.avatar_path;removePhoto.append(removePhotoInput,el('span','Remove current picture'));
 photoControls.append(photoLabel,el('p','JPG, PNG or WebP · up to 3 MB. A square picture works best.','muted'),removePhoto);photoField.append(photoPreview,photoControls);form.append(photoField);
 let localPreview='';photo.onchange=()=>{const file=photo.files?.[0];if(localPreview)URL.revokeObjectURL(localPreview);if(!file){photoPreview.replaceChildren();photoPreview.textContent=initials(p.name||'You');return;}localPreview=URL.createObjectURL(file);const img=el('img');img.alt='New profile picture preview';img.src=localPreview;photoPreview.replaceChildren(img);photoPreview.classList.add('has-photo');removePhotoInput.checked=false;};removePhotoInput.onchange=()=>{if(removePhotoInput.checked){photo.value='';photoPreview.replaceChildren();photoPreview.textContent=initials(p.name||'You');photoPreview.classList.remove('has-photo');}};
 const name=field('Name','input',40);name.required=true;name.minLength=2;name.value=p.name;name.autocomplete='off';
 const experience=field('Music experience','select');for(const v of ['Learning','Beginner','Intermediate','Advanced','Professional']){const o=el('option',v);o.value=v;experience.append(o);}experience.value=p.experience;
 const skills=field('Music skills','input',240);skills.value=p.skills;skills.placeholder='e.g. piano, sight-reading, jazz chords, teaching';
 const bio=field('About your music journey','textarea',800);bio.value=p.bio;bio.rows=4;bio.placeholder='What you play, what you are learning, or how you like to help.';
 const label=el('label',undefined,'check'),visible=el('input');visible.type='checkbox';visible.checked=!!p.published;label.append(visible,el('span','Make my picture, name, experience, skills and bio public, and link this profile from my comments.'));form.append(label);
 form.append(el('p','Your chosen name is public whenever you post a comment. Your picture and music details appear with comments only when this profile is public. Turning it private hides those details, but does not erase names or text already posted. Songs and progress stay private.','muted'));
 const save=el('button','Save profile');save.type='submit';form.append(save);
 if(p.published){const a=el('a','View my public profile','secondary');a.href='#profile/'+p.id;form.append(a);}
 const account=auth()?.account?.();if(account){const accountRow=el('div',undefined,'profile-account');accountRow.append(el('span','Signed in as '+account.email,'muted'));const out=el('button','Sign out','secondary small');out.type='button';out.onclick=()=>auth()?.signOut?.();accountRow.append(out);form.append(accountRow);}
 form.onsubmit=async e=>{e.preventDefault();if(!signed()||editorAuthEpoch!==authEpoch){message('Your account changed. Reopen your profile before saving.',true);return;}if(!form.reportValidity())return;save.disabled=true;const requestEpoch=epoch,oldPath=p.avatar_path||null;let uploaded=null;
  try{const values={p_name:name.value.trim(),p_experience:experience.value,p_skills:skills.value.trim(),p_bio:bio.value.trim(),p_published:visible.checked};let nextPath=removePhotoInput.checked?null:oldPath,profileId=p.id;
   if(photo.files?.[0]){if(!profileId){const prepared=await rpc('profile_save',{...values,p_published:false,p_avatar_path:null});profileId=prepared.id;}message('Uploading your picture…');uploaded=await auth().uploadAvatar(photo.files[0],profileId);if(!signed()||editorAuthEpoch!==authEpoch)throw new Error('Your account changed. Choose the picture again.');nextPath=uploaded;}
   const result=await rpc('profile_save',{...values,p_avatar_path:nextPath});if(requestEpoch!==epoch)return;own=result;if(oldPath&&oldPath!==nextPath)await auth().removeAvatar(oldPath).catch(()=>{});window.dispatchEvent(new Event('piano-profile-changed'));editor();message('Profile saved.');}
  catch(e){if(uploaded)await auth()?.removeAvatar?.(uploaded).catch(()=>{});if(requestEpoch===epoch)message(e.message,true);}finally{if(localPreview)URL.revokeObjectURL(localPreview);save.disabled=false;}
 };box.append(form);
}
async function route(){
 if(!box||!location.hash.startsWith('#profile'))return;const id=location.hash.split('/')[1],requestEpoch=++epoch;message('');
 if(id){box.replaceChildren(el('p','Loading profile…'));try{if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('This profile link is invalid.');const p=await rpc('profile_public',{p_id:id});if(requestEpoch!==epoch)return;box.replaceChildren(p?profileCard(p):el('p','This profile is private or no longer available.'));}catch(e){if(requestEpoch===epoch){box.replaceChildren();message(e.message,true);}}return;}
 if(!signed()){const a=el('a','Sign in with Google');a.href='#mine';box.replaceChildren(el('p','Sign in to create or edit your music profile.'),a);return;}
 box.replaceChildren(el('p','Loading your profile…'));try{const p=await rpc('profile_mine');if(requestEpoch!==epoch)return;own=p;window.dispatchEvent(new Event('piano-profile-changed'));editor();}catch(e){if(requestEpoch===epoch){box.replaceChildren();message(e.message,true);}}
}
async function refresh(){const requestEpoch=++authEpoch;++epoch;own=null;if(box&&location.hash==='#profile')box.replaceChildren(el('p','Loading your profile…'));if(signed()&&auth()?.ready()){try{const p=await rpc('profile_mine');if(requestEpoch!==authEpoch)return;own=p;}catch{}}
 if(requestEpoch!==authEpoch)return;window.dispatchEvent(new Event('piano-profile-changed'));route();}
window.PianoProfiles={current:()=>own,identity,avatar};
document.addEventListener('DOMContentLoaded',()=>{box=document.getElementById('profile-content');status=document.getElementById('profile-status');window.addEventListener('hashchange',route);window.addEventListener('piano-community-auth',refresh);refresh();});
})();
