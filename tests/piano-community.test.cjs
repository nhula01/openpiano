const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM,VirtualConsole}=require('jsdom');
const tick=()=>new Promise(r=>setTimeout(r,25));
const post={id:'post-a',piece:'entertainer',alias:'A learner',body:'Relax through the shift.',kind:'fingering',bars:'5–8',hand:'RH',fingers:'C4(1), D4(2)',created_at:'2026-10-08T00:00:00Z',votes:3,voted:false,mine:false,replies:[]};
async function setup({signed=true,posts=[post],rpcOverride,profile={name:'My alias',id:'00000000-0000-4000-8000-000000000001'}}={}){
 const dom=new JSDOM('<div class="lib-piece"><section id="piece-course"></section></div><section id="note-trainer"><select id="trainer-song"><option value="entertainer">Entertainer</option><option value="private-id">Private</option></select><div class="stage"></div></section>',{url:'https://example.test/#library/piece',runScripts:'outside-only',virtualConsole:new VirtualConsole()});const w=dom.window,calls=[];
 w.PianoCurriculum={pieces:[{id:'entertainer'}]};w.localStorage.setItem('my-journey-piano-pathway-v2',JSON.stringify({selected:'entertainer'}));
 w.PianoCommunityAuth={ready:()=>true,signedIn:()=>signed,rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});if(rpcOverride)return rpcOverride(name,args);return {data:name==='community_list'?{posts:structuredClone(posts),total:posts.length}:'new-id',error:null};}};
 w.PianoProfiles={current:()=>profile,identity:(p,fallback)=>{const n=w.document.createElement('div');n.textContent=p?.name||fallback;return n;}};
 w.eval(fs.readFileSync('site/piano-community.js','utf8'));await tick();return {dom,w,calls};
}
test('discussion renders untrusted text, gates anonymous contributions and never requests private score discussions',async()=>{
 const ui=await setup({signed:false,posts:[{...post,alias:'<img src=x onerror=alert(1)>',body:'<script>bad()</script>'}]});const d=ui.w.document;
 assert.equal(d.querySelectorAll('.community img,.community script').length,0);assert.ok(d.querySelector('.community').textContent.includes('<script>bad()</script>'));
 assert.ok(d.querySelector('.community').textContent.includes('Sign in to contribute'));d.querySelector('.community-actions button').click();await tick();assert.equal(ui.calls.filter(c=>c.name==='community_vote').length,0);
 ui.w.location.hash='#practice';d.querySelector('#trainer-song').value='private-id';d.querySelector('#trainer-song').dispatchEvent(new ui.w.Event('change'));await tick();assert.equal(d.querySelector('#piece-community').hidden,true);assert.ok(ui.calls.every(c=>c.args.p_piece!=='private-id'));ui.dom.window.close();
});
test('helpful votes, public consent, author edits and reusable fingering preserve attribution',async()=>{
 const ui=await setup();const d=ui.w.document;d.querySelector('.community-actions button').click();await tick();assert.deepEqual(ui.calls.find(c=>c.name==='community_vote').args,{p_post:'post-a',p_on:true});
 const f=d.querySelector('.community-form'),inputs=f.querySelectorAll('input'),body=[...f.querySelectorAll('textarea')].at(-1);body.value='My advice';
 f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await tick();assert.equal(ui.calls.filter(c=>c.name==='community_write').length,0);
 f.querySelector('input[type=checkbox]').checked=true;f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await tick();const write=ui.calls.find(c=>c.name==='community_write');assert.equal(write.args.p_publish,true);assert.equal(write.args.p_alias,'My alias');
 [...d.querySelectorAll('.community-actions button')].find(b=>b.textContent==='Use in practice').click();const saved=JSON.parse(ui.w.localStorage.getItem('openpiano-community-plans-v1')).entertainer;assert.equal(saved.alias,post.alias);assert.equal(saved.fingers,post.fingers);assert.equal(d.querySelector('.community-practice-plan').hidden,false);
 d.querySelector('.community-practice-plan button').click();assert.equal(d.querySelector('.community-practice-plan').hidden,true);assert.equal(JSON.parse(ui.w.localStorage.getItem('openpiano-community-plans-v1')).entertainer.removed,true);ui.dom.window.close();
});
test('an older discussion response cannot replace the selected private practice screen',async()=>{
 let resolve;const ui=await setup({rpcOverride:()=>new Promise(r=>{resolve=r;})});ui.w.location.hash='#practice';const select=ui.w.document.querySelector('#trainer-song');select.value='private-id';select.dispatchEvent(new ui.w.Event('change'));await tick();resolve({data:{posts:[post],total:1},error:null});await tick();assert.equal(ui.w.document.querySelector('#piece-community').hidden,true);assert.equal(ui.w.document.querySelectorAll('.community-post').length,0);ui.dom.window.close();
});
test('only authors see editing and withdrawal and self-voting is disabled',async()=>{
 const ui=await setup({posts:[{...post,mine:true}]});const buttons=[...ui.w.document.querySelectorAll('.community-actions button')];assert.ok(buttons.find(b=>b.textContent==='Edit'));assert.ok(buttons.find(b=>b.textContent==='Withdraw'));assert.equal(buttons[0].disabled,true);buttons.find(b=>b.textContent==='Edit').click();assert.equal(ui.w.document.querySelector('.community-post form textarea').value,post.fingers);ui.dom.window.close();
});

test('adapt starts a separate version with attribution, without rewriting the original plan',async()=>{
 const ui=await setup();const d=ui.w.document;d.querySelectorAll('.community-actions button').forEach(b=>{if(b.textContent==='Adapt')b.click();});
 const f=d.querySelector('.community-form');assert.equal(f.querySelector('select').value,'fingering');assert.ok([...f.querySelectorAll('textarea')].at(-1).value.includes('Adapted from A learner'));
 f.querySelector('input[type=checkbox]').checked=true;
 f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await tick();const write=ui.calls.find(c=>c.name==='community_write');assert.equal(write.args.p_id,null);assert.equal(write.args.p_kind,'fingering');assert.ok(write.args.p_body.includes('post-a'));ui.dom.window.close();
});

test('a shared piece link opens the correct discussion even when the hidden course is filtered to another level',async()=>{
 const dom=new JSDOM(fs.readFileSync('site/index.html','utf8'),{url:'https://example.test/#library/piece/entertainer',runScripts:'outside-only',virtualConsole:new VirtualConsole()});const w=dom.window;
 w.PianoRepertoire={entertainer:{title:'The Entertainer',composer:'Scott Joplin'}};w.PianoSkills={units:[]};w.PianoCommunityAuth={ready:()=>true,signedIn:()=>false,rpc:async()=>({data:{posts:[],total:0},error:null})};
 w.eval(fs.readFileSync('site/piano-curriculum.js','utf8'));
 for(const name of ['piano-course','piano-app','piano-community'])w.eval(fs.readFileSync('site/'+name+'.js','utf8'));
 await tick();await tick();assert.equal(JSON.parse(w.localStorage.getItem('my-journey-piano-pathway-v2')).selected,'entertainer');
 assert.equal(w.document.querySelector('#piece-course h2').textContent,'The Entertainer');assert.equal(w.document.querySelector('#piece-community').hidden,false);
 assert.equal(w.document.querySelector('#community-permalink').hash,'#library/piece/entertainer');
 assert.equal(w.document.querySelectorAll('#piece-library [data-piece-progress="entertainer"]').length,0);
 assert.equal(w.document.querySelector('.piece-learning-guide').open,false);assert.equal(w.document.querySelectorAll('.piece-learning-guide .course-step').length,5);
 assert.ok(w.document.querySelector('.repertoire-post').contains(w.document.querySelector('#piece-community')));dom.window.close();
});

test('comments use the saved profile and an old composer cannot post after an account switch',async()=>{
 const ui=await setup();const f=ui.w.document.querySelector('.community-form');assert.equal([...f.querySelectorAll('input')].filter(n=>n.type==='text').length,1);
 [...f.querySelectorAll('textarea')].at(-1).value='My original comment';f.querySelector('input[type=checkbox]').checked=true;
 ui.w.PianoProfiles.current=()=>({id:'another-profile',name:'Other learner'});f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await tick();
 assert.equal(ui.calls.filter(c=>c.name==='community_write').length,0);assert.ok(ui.w.document.querySelector('.community-status').textContent.includes('account changed'));ui.dom.window.close();
});
