'use strict';
/* Preview and test only: an in-browser stand-in for the add-on RPCs, so add-ons can be tried where
   the real service cannot be reached. It is never loaded by the live site. Demo bots are labelled as bots;
   their fingerings are examples for trying the feature, not taken from a printed edition.
   It mirrors scripts/supabase-addon-layers.sql: one add-on per author per piece, a private draft and a
   published copy; publishing copies the whole draft. */
(()=>{
const KEY='openpiano-addons-demo-db-v2',YOU='you';
const BOTS={'fingering-demo':{name:'OpenPiano Fingering Bot',skills:'Demo fingering suggestions'},'alt-fingering-demo':{name:'OpenPiano Alternate Fingering Bot',skills:'Demo alternative fingering'},'phrasing-demo':{name:'OpenPiano Phrasing Bot',skills:'Demo phrasing and pedal comments'}};
const F=(h,list)=>list.map(([b,m,f])=>({b,m,h,f}));
// Für Elise, opening bars: two fingering add-ons that differ, and one add-on of comments.
const SEED_NOTES={
 'fingering-demo':[...F('RH',[[0,76,'5'],[.25,75,'4'],[.5,76,'5'],[.75,75,'4'],[1,76,'5'],[1.25,71,'2'],[1.5,74,'4'],[1.75,72,'3'],[2,69,'1'],[2.75,60,'1'],[3,64,'2'],[3.25,69,'4'],[3.5,71,'5'],[4.25,64,'1'],[4.5,68,'3'],[4.75,71,'4'],[5,72,'5']]),
  ...F('LH',[[2,45,'5'],[2.25,52,'2'],[2.5,57,'1'],[3.5,40,'5'],[3.75,52,'2'],[4,56,'1'],[5,45,'5'],[5.25,52,'2'],[5.5,57,'1']])],
 'alt-fingering-demo':F('RH',[[0,76,'4'],[.25,75,'3'],[.5,76,'4'],[.75,75,'3'],[1,76,'4'],[1.25,71,'1'],[1.5,74,'3'],[1.75,72,'2'],[2,69,'1']]),
 'phrasing-demo':[{b:0,m:76,h:'RH',c:'Keep the E–D♯ turn light and even, almost a whisper.'},{b:2,m:69,h:'RH',c:'Land on this A softly and let it ring with the left-hand broken chord.'},{b:3.5,m:40,h:'LH',c:'Change the pedal here, together with the bass note.'},{b:5,m:72,h:'RH',c:'Ease off at the end of the phrase before the theme returns.'}]
};
const SEED=Object.entries(SEED_NOTES).map(([bot,notes],i)=>({id:'demo-'+bot,piece:'fur',bot,owner:null,draft:notes,published:notes,published_at:`2026-10-09T15:0${i}:00Z`}));
const clone=x=>x===undefined?x:JSON.parse(JSON.stringify(x));
function db(){try{const d=JSON.parse(localStorage.getItem(KEY));if(d&&d.version===2)return d;}catch{}return {version:2,addons:clone(SEED),votes:[]};}
function save(d){try{localStorage.setItem(KEY,JSON.stringify(d));}catch{}}
// The same checks as community_addon_clean.
function clean(notes){if(!Array.isArray(notes))throw new Error('Add-on notes must be a list');if(notes.length>3000)throw new Error('An add-on can hold up to 3000 notes');const out=[],seen=new Set();
 for(const n of notes){if(!n||typeof n.b!=='number'||typeof n.m!=='number')throw new Error('Each add-on note needs a beat and a pitch');const b=Math.round(n.b*1e4)/1e4,m=n.m,h=n.h||'BH';const f=String(n.f||'').replace(/\s*[–-]\s*/g,'-').trim(),c=String(n.c||'').trim();
  if(b<0||m<21||m>108||m!==Math.trunc(m))throw new Error('Add-on note is outside the piece');if(!['RH','LH','BH'].includes(h))throw new Error('Choose RH, LH or BH');
  if(f&&!/^[1-5](-[1-5]| [1-5]){0,7}$/.test(f))throw new Error('Use finger numbers 1 to 5, for example 3 or 3-1');if(c.length>500)throw new Error('Keep each comment to 500 characters');
  if(!f&&!c)continue;const k=b+':'+m;if(seen.has(k))throw new Error('Each note can appear once in an add-on');seen.add(k);const o={b,m,h};if(f)o.f=f;if(c)o.c=c;out.push(o);}
 return out;}
const votes=(d,a)=>d.votes.filter(v=>v.addon===a.id).length;
function json(d,a){const bot=a.bot&&BOTS[a.bot];return {id:a.id,piece:a.piece,author:bot?bot.name:'You (preview)',profile:bot?{name:bot.name,skills:bot.skills,bot:true}:{id:'demo-you',name:'You (preview)'},bot:!!bot,notes:a.published||[],published_at:a.published_at,mine:a.owner===YOU,votes:votes(d,a),voted:d.votes.some(v=>v.addon===a.id&&v.owner===YOU)};}
const mine=(d,piece)=>d.addons.find(a=>a.owner===YOU&&a.piece===piece);
function mineJson(d,piece){const a=mine(d,piece);return a?{id:a.id,draft:a.draft,published:a.published,published_at:a.published_at,draft_updated_at:a.draft_updated_at,under_review:false,votes:votes(d,a)}:null;}
const impl={
 addon_list({p_piece,p_offset=0}){const d=db();const live=d.addons.filter(a=>a.piece===p_piece&&a.published?.length).map(a=>json(d,a));live.sort((a,b)=>b.votes-a.votes||(b.published_at>a.published_at?1:-1));return {addons:live.slice(p_offset,p_offset+20),total:live.length};},
 addon_mine({p_piece}){return mineJson(db(),p_piece);},
 addon_save_draft({p_piece,p_notes}){const d=db(),notes=clean(p_notes);let a=mine(d,p_piece);if(!a){a={id:'mine-'+p_piece,piece:p_piece,owner:YOU,bot:null,draft:[],published:null,published_at:null};d.addons.push(a);}a.draft=notes;a.draft_updated_at=new Date().toISOString();save(d);return mineJson(d,p_piece);},
 addon_publish({p_piece}){const d=db(),a=mine(d,p_piece);if(!a||!a.draft.length)throw new Error('Add fingering or comments to your draft first');a.published=clone(a.draft);a.published_at=new Date().toISOString();save(d);return mineJson(d,p_piece);},
 addon_discard({p_piece}){const d=db(),a=mine(d,p_piece);if(a){a.draft=clone(a.published||[]);save(d);}return mineJson(d,p_piece);},
 addon_unpublish({p_piece}){const d=db(),a=mine(d,p_piece);if(a){a.published=null;a.published_at=null;save(d);}return mineJson(d,p_piece);},
 addon_vote({p_addon,p_on}){const d=db(),a=d.addons.find(x=>x.id===p_addon);if(!a||a.owner===YOU||!a.published)throw new Error('Vote for another learner’s published add-on');d.votes=d.votes.filter(v=>!(v.addon===p_addon&&v.owner===YOU));if(p_on)d.votes.push({addon:p_addon,owner:YOU});save(d);},
 addon_report(){},
 // The per-note discussion below the score has nothing to show in the preview.
 community_list(){return {posts:[],total:0};},community_mine(){return {posts:[],saved:[]};}
};
const api={demo:true,ready:()=>true,signedIn:()=>true,async rpc(name,args={}){if(!impl[name])throw new Error('Not available in the preview');return clone(impl[name](args));},reset(){try{localStorage.removeItem(KEY);}catch{}},seed:SEED_NOTES};
window.PianoAddonsDemo=api;
// The rest of the page uses the same stand-in, signed in as "You (preview)".
window.PianoCommunityAuth={ready:()=>true,signedIn:()=>true,account:()=>({email:'preview@example.invalid'}),signOut:()=>{},rpc:async(n,a)=>{try{return {data:await api.rpc(n,a),error:null};}catch(e){return {data:null,error:{message:e.message}};}}};
document.addEventListener('DOMContentLoaded',()=>{const P=window.PianoProfiles;if(P){const me={id:'demo-you',name:'You (preview)'};P.current=()=>me;}setTimeout(()=>window.dispatchEvent(new Event('piano-community-auth')),50);});
})();
