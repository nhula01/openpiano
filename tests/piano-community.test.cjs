const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM,VirtualConsole}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,30));
const post={id:'post-a',piece:'entertainer',alias:'A learner',body:'Relax through the shift.',kind:'fingering',bars:'Bar 2 · C4 · RH',hand:'RH',fingers:'C4(1), D4(2)',note_beat:4,note_midi:60,note_label:'C4',visibility:'public',created_at:'2026-10-08T00:00:00Z',votes:3,voted:false,saved:false,mine:false,replies:[]};
async function setup({signed=true,posts=[post],minePosts=[],savedPosts=[],rpcOverride,profile={name:'My alias',id:'00000000-0000-4000-8000-000000000001'}}={}){
 const dom=new JSDOM('<div class="lib-piece"><section id="piece-course"></section></div><section id="note-trainer"><select id="trainer-song"><option value="entertainer">Entertainer</option><option value="private-id">Private</option></select><div class="stage"></div></section>',{url:'https://example.test/#library/piece',runScripts:'outside-only',virtualConsole:new VirtualConsole()});const w=dom.window,calls=[];
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.PianoCurriculum={pieces:[{id:'entertainer'}]};w.localStorage.setItem('my-journey-piano-pathway-v2',JSON.stringify({selected:'entertainer'}));
 w.PianoCommunityAuth={ready:()=>true,signedIn:()=>signed,rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});if(rpcOverride)return rpcOverride(name,args);if(name==='community_list')return{data:{posts:structuredClone(posts),total:posts.length},error:null};if(name==='community_mine')return{data:{posts:structuredClone(minePosts),saved:structuredClone(savedPosts)},error:null};return{data:'new-id',error:null};}};
 w.PianoProfiles={current:()=>profile,identity:(p,fallback)=>{const n=w.document.createElement('div');n.textContent=p?.name||fallback;return n;}};
 w.eval(fs.readFileSync('site/piano-community.js','utf8'));await tick();return{dom,w,calls};
}
test('public notes render untrusted text safely and private song IDs never reach community RPCs',async()=>{
 const ui=await setup({signed:false,posts:[{...post,alias:'<img src=x onerror=alert(1)>',body:'<script>bad()</script>'}]});const d=ui.w.document;
 assert.equal(d.querySelectorAll('.community img,.community script').length,0);assert.ok(d.querySelector('.community').textContent.includes('<script>bad()</script>'));
 assert.ok(d.querySelector('.community').textContent.includes('Sign in to create and save notes'));[...d.querySelectorAll('.community-actions button')].find(b=>b.textContent.startsWith('Helpful')).click();await tick();assert.equal(ui.calls.filter(c=>c.name==='community_vote').length,0);
 ui.w.location.hash='#practice';d.querySelector('#trainer-song').value='private-id';d.querySelector('#trainer-song').dispatchEvent(new ui.w.Event('change'));await tick();assert.equal(d.querySelector('#piece-community').hidden,true);assert.ok(ui.calls.every(c=>c.args.p_piece!=='private-id'));ui.dom.window.close();
});
test('selecting an engraved note creates a private add-on with its pitch, beat and hand',async()=>{
 const ui=await setup({posts:[]});const d=ui.w.document;ui.w.dispatchEvent(new ui.w.CustomEvent('piano-note-selected',{detail:{piece:'entertainer',beat:8,midi:64,note:'E4',hand:'RH',bar:3}}));
 const f=d.querySelector('.community-form');assert.ok(f.textContent.includes('Bar 3 · E4 · RH'));assert.equal(f.querySelector('button[type=submit]').disabled,false);assert.equal(f.querySelector('input[type=checkbox]'),null);
 [...f.querySelectorAll('textarea')].at(-1).value='Keep the wrist loose here.';f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await tick();const write=ui.calls.find(c=>c.name==='community_write');
 assert.equal(write.args.p_note_beat,8);assert.equal(write.args.p_note_midi,64);assert.equal(write.args.p_hand,'RH');assert.equal(write.args.p_visibility,'private');assert.equal(write.args.p_publish,false);ui.dom.window.close();
});
test('fingering is entered by the learner and no generated finger numbers are added',async()=>{
 const ui=await setup({posts:[]});const d=ui.w.document;ui.w.dispatchEvent(new ui.w.CustomEvent('piano-note-selected',{detail:{piece:'entertainer',beat:1,midi:60,note:'C4',hand:'LH',bar:1}}));const f=d.querySelector('.community-form'),select=f.querySelector('select');select.value='fingering';select.dispatchEvent(new ui.w.Event('change'));
 const input=f.querySelector('.addon-fingering-fields input');assert.equal(input.value,'');input.value='C4(5), G4(1)';[...f.querySelectorAll('textarea')].at(-1).value='My comfortable crossing.';f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await tick();const write=ui.calls.find(c=>c.name==='community_write');assert.equal(write.args.p_kind,'fingering');assert.equal(write.args.p_fingers,'C4(5), G4(1)');ui.dom.window.close();
});
test('private personal add-ons can be revealed, edited and removed by their owner',async()=>{
 const ownPost={...post,id:'mine-a',mine:true,visibility:'private',votes:0};const ui=await setup({posts:[],minePosts:[ownPost]});const d=ui.w.document,buttons=[...d.querySelectorAll('.personal-addon .community-actions button')];
 assert.ok(buttons.find(b=>b.textContent==='Reveal'));assert.ok(buttons.find(b=>b.textContent==='Edit'));buttons.find(b=>b.textContent==='Reveal').click();await tick();assert.deepEqual(ui.calls.find(c=>c.name==='community_reveal').args,{p_post:'mine-a',p_public:true});
 [...d.querySelectorAll('.personal-addon .community-actions button')].find(b=>b.textContent==='Edit').click();assert.equal(d.querySelector('.personal-addon form textarea').value,ownPost.body);ui.dom.window.close();
});
test('public bot examples are labeled and can be copied into the signed-in repertoire',async()=>{
 const bot={...post,id:'bot-a',alias:'OpenPiano Practice Bot',bot:true,profile:{name:'OpenPiano Practice Bot',skills:'Demo note comments',bot:true},kind:'comment',fingers:'',body:'Demo add-on: loop slowly.'};const ui=await setup({posts:[bot]});const d=ui.w.document;
 assert.equal(d.querySelector('.bot-badge').textContent,'BOT');[...d.querySelectorAll('.community-actions button')].find(b=>b.textContent==='Add to mine').click();await tick();assert.deepEqual(ui.calls.find(c=>c.name==='community_save_addon').args,{p_post:'bot-a',p_on:true});ui.dom.window.close();
});
test('saved public add-ons retain attribution and can be removed from My add-ons',async()=>{
 const snapshot={...post,id:undefined,source_post:'post-a',source_alias:'A learner',saved:true,saved_at:'2026-10-09T00:00:00Z'};const ui=await setup({posts:[{...post,saved:true}],savedPosts:[snapshot]});const d=ui.w.document;assert.ok(d.querySelector('.my-addons').textContent.includes('A learner'));
 [...d.querySelectorAll('.personal-addon .community-actions button')].find(b=>b.textContent==='Remove').click();await tick();assert.deepEqual(ui.calls.find(c=>c.name==='community_save_addon').args,{p_post:'post-a',p_on:false});ui.dom.window.close();
});
test('opening an add-on seeks the matching score note and marks it for the player',async()=>{
 const ui=await setup();ui.w.PianoPractice={score:{id:'entertainer'},meter:4};let opened;ui.w.addEventListener('piano-addon-open',e=>opened=e.detail);[...ui.w.document.querySelectorAll('.community-actions button')].find(b=>b.textContent==='Open note').click();
 assert.equal(ui.w.location.hash,'#practice');assert.equal(JSON.stringify(opened),JSON.stringify({piece:'entertainer',beat:4,midi:60,note:'C4',hand:'RH'}));ui.dom.window.close();
});
test('an older public response cannot replace the selected private practice screen',async()=>{
 let resolve;const ui=await setup({signed:false,rpcOverride:()=>new Promise(r=>{resolve=r;})});ui.w.location.hash='#practice';const select=ui.w.document.querySelector('#trainer-song');select.value='private-id';select.dispatchEvent(new ui.w.Event('change'));await tick();resolve({data:{posts:[post],total:1},error:null});await tick();assert.equal(ui.w.document.querySelector('#piece-community').hidden,true);assert.equal(ui.w.document.querySelectorAll('.community-post').length,0);ui.dom.window.close();
});
test('a shared piece link opens the correct add-ons when the hidden course is filtered elsewhere',async()=>{
 const dom=new JSDOM(fs.readFileSync('site/index.html','utf8'),{url:'https://example.test/#library/piece/entertainer',runScripts:'outside-only',virtualConsole:new VirtualConsole()});const w=dom.window;w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.PianoRepertoire={entertainer:{title:'The Entertainer',composer:'Scott Joplin'}};w.PianoSkills={units:[]};w.PianoCommunityAuth={ready:()=>true,signedIn:()=>false,rpc:async()=>({data:{posts:[],total:0},error:null})};
 w.eval(fs.readFileSync('site/piano-curriculum.js','utf8'));for(const name of['piano-course','piano-app','piano-community'])w.eval(fs.readFileSync('site/'+name+'.js','utf8'));await tick();await tick();
 assert.equal(JSON.parse(w.localStorage.getItem('my-journey-piano-pathway-v2')).selected,'entertainer');assert.equal(w.document.querySelector('#piece-course h2').textContent,'The Entertainer');assert.equal(w.document.querySelector('#piece-community').hidden,false);assert.equal(w.document.querySelector('#community-permalink').hash,'#library/piece/entertainer');assert.ok(w.document.querySelector('.repertoire-post').contains(w.document.querySelector('#piece-community')));dom.window.close();
});
test('an old composer cannot save its note under a different signed-in profile',async()=>{
 const ui=await setup({posts:[]});ui.w.dispatchEvent(new ui.w.CustomEvent('piano-note-selected',{detail:{piece:'entertainer',beat:2,midi:62,note:'D4',hand:'RH',bar:1}}));const f=ui.w.document.querySelector('.community-form');f.querySelector('textarea').value='My note';
 ui.w.PianoProfiles.current=()=>({id:'another-profile',name:'Other learner'});f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await tick();assert.equal(ui.calls.filter(c=>c.name==='community_write').length,0);assert.ok(ui.w.document.querySelector('.community-status').textContent.includes('account changed'));ui.dom.window.close();
});
