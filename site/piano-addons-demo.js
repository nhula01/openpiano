'use strict';
/* Preview and test only: an in-browser stand-in for the community RPCs, so add-ons can be tried where
   the real service cannot be reached. It is never loaded by the live site. Demo bots are labelled as bots;
   their fingerings are examples for trying the feature, not taken from a printed edition. */
(()=>{
const KEY='openpiano-addons-demo-db-v1',YOU='you';
const BOTS={'fingering-demo':{name:'OpenPiano Fingering Bot',skills:'Demo fingering suggestions'},'alt-fingering-demo':{name:'OpenPiano Alternate Fingering Bot',skills:'Demo alternative fingering'},'phrasing-demo':{name:'OpenPiano Phrasing Bot',skills:'Demo phrasing and pedal comments'}};
const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'],label=m=>names[m%12]+(Math.floor(m/12)-1);
let n=0;const post=(bot,beat,midi,hand,kind,fingers,body)=>({id:'demo-'+bot+'-'+(++n),piece:'fur',bot,owner:null,kind,fingers,body:body||(kind==='fingering'?`Fingering ${fingers}`:''),hand,note_beat:beat,note_midi:midi,note_label:label(midi),visibility:'public',created_at:'2026-10-09T15:00:00Z'});
// Für Elise, opening bars: two fingering add-ons that differ, and one add-on of comments.
const SEED=[
 ...[[0,76,'5'],[.25,75,'4'],[.5,76,'5'],[.75,75,'4'],[1,76,'5'],[1.25,71,'2'],[1.5,74,'4'],[1.75,72,'3'],[2,69,'1'],[2.75,60,'1'],[3,64,'2'],[3.25,69,'4'],[3.5,71,'5'],[4.25,64,'1'],[4.5,68,'3'],[4.75,71,'4'],[5,72,'5']].map(([b,m,f])=>post('fingering-demo',b,m,'RH','fingering',f)),
 ...[[2,45,'5'],[2.25,52,'2'],[2.5,57,'1'],[3.5,40,'5'],[3.75,52,'2'],[4,56,'1'],[5,45,'5'],[5.25,52,'2'],[5.5,57,'1']].map(([b,m,f])=>post('fingering-demo',b,m,'LH','fingering',f)),
 ...[[0,76,'4'],[.25,75,'3'],[.5,76,'4'],[.75,75,'3'],[1,76,'4'],[1.25,71,'1'],[1.5,74,'3'],[1.75,72,'2'],[2,69,'1']].map(([b,m,f])=>post('alt-fingering-demo',b,m,'RH','fingering',f)),
 post('phrasing-demo',0,76,'RH','comment','','Keep the E–D♯ turn light and even, almost a whisper.'),
 post('phrasing-demo',2,69,'RH','comment','','Land on this A softly and let it ring with the left-hand broken chord.'),
 post('phrasing-demo',3.5,40,'LH','comment','','Change the pedal here, together with the bass note.'),
 post('phrasing-demo',5,72,'RH','comment','','Ease off at the end of the phrase before the theme returns.')
];
function db(){try{const d=JSON.parse(localStorage.getItem(KEY));if(d&&d.version===1)return d;}catch{}return {version:1,posts:SEED,votes:[]};}
function save(d){try{localStorage.setItem(KEY,JSON.stringify(d));}catch{}}
function json(d,p){const bot=p.bot&&BOTS[p.bot];return {id:p.id,piece:p.piece,alias:bot?bot.name:'You (preview)',profile:bot?{name:bot.name,skills:bot.skills,bot:true}:{id:'demo-you',name:'You (preview)'},bot:!!bot,body:p.body,kind:p.kind,bars:p.bars||'',hand:p.hand,fingers:p.fingers||'',parent:null,visibility:p.visibility,note_beat:p.note_beat,note_midi:p.note_midi,note_label:p.note_label,created_at:p.created_at,edited_at:p.edited_at||null,mine:p.owner===YOU,saved:false,votes:d.votes.filter(v=>v.post===p.id).length,voted:d.votes.some(v=>v.post===p.id&&v.owner===YOU),replies:[]};}
const impl={
 community_list({p_piece,p_sort='best',p_offset=0}){const d=db();const roots=d.posts.filter(p=>p.piece===p_piece&&p.visibility==='public'&&!p.hidden).map(p=>json(d,p));roots.sort((a,b)=>(p_sort==='best'?b.votes-a.votes:0)||(b.created_at>a.created_at?1:-1));return {posts:roots.slice(p_offset,p_offset+20),total:roots.length};},
 community_mine({p_piece}){const d=db();return {posts:d.posts.filter(p=>p.piece===p_piece&&p.owner===YOU&&!p.hidden).map(p=>json(d,p)),saved:[]};},
 community_write(a){const d=db();if(a.p_note_beat==null)throw new Error('Choose a note in the score first');if(!String(a.p_body||'').trim())throw new Error('Write something first');
  if(a.p_id){const p=d.posts.find(x=>x.id===a.p_id&&x.owner===YOU);if(!p)throw new Error('Only the author can edit');Object.assign(p,{body:a.p_body.trim(),fingers:(a.p_fingers||'').trim(),hand:a.p_hand,bars:a.p_bars,edited_at:new Date().toISOString()});save(d);return p.id;}
  const p={id:'mine-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),piece:a.p_piece,owner:YOU,bot:null,kind:a.p_kind,fingers:(a.p_fingers||'').trim(),body:a.p_body.trim(),hand:a.p_hand,bars:a.p_bars,note_beat:Number(a.p_note_beat),note_midi:Number(a.p_note_midi),note_label:label(Number(a.p_note_midi)),visibility:a.p_visibility==='public'&&a.p_publish?'public':'private',created_at:new Date().toISOString()};d.posts.push(p);save(d);return p.id;},
 community_reveal({p_post,p_public}){const d=db(),p=d.posts.find(x=>x.id===p_post&&x.owner===YOU);if(!p)throw new Error('Only the author can change this add-on');p.visibility=p_public?'public':'private';save(d);},
 community_vote({p_post,p_on}){const d=db(),p=d.posts.find(x=>x.id===p_post);if(!p||p.owner===YOU||p.visibility!=='public')throw new Error('Vote on another learner’s public add-on');d.votes=d.votes.filter(v=>!(v.post===p_post&&v.owner===YOU));if(p_on)d.votes.push({post:p_post,owner:YOU});save(d);},
 community_hide({p_post,p_hide}){const d=db(),p=d.posts.find(x=>x.id===p_post&&x.owner===YOU);if(!p)throw new Error('Only the author can remove this');p.hidden=!!p_hide;save(d);},
 community_save_addon(){},community_report(){}
};
const api={demo:true,ready:()=>true,signedIn:()=>true,async rpc(name,args={}){if(!impl[name])throw new Error('Not available in the preview');return impl[name](args);},reset(){try{localStorage.removeItem(KEY);}catch{}}};
window.PianoAddonsDemo=api;
// The community panel under the stage uses the same stand-in, signed in as "You (preview)".
window.PianoCommunityAuth={ready:()=>true,signedIn:()=>true,account:()=>({email:'preview@example.invalid'}),signOut:()=>{},rpc:async(n,a)=>{try{return {data:await api.rpc(n,a),error:null};}catch(e){return {data:null,error:{message:e.message}};}}};
document.addEventListener('DOMContentLoaded',()=>{const P=window.PianoProfiles;if(P){const me={id:'demo-you',name:'You (preview)'};P.current=()=>me;}setTimeout(()=>window.dispatchEvent(new Event('piano-community-auth')),50);});
})();
