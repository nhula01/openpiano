const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM,VirtualConsole}=require('jsdom');
const wait=()=>new Promise(r=>setTimeout(r,30));const id='10000000-0000-4000-8000-000000000001';
async function setup({hash='#profile',signed=true,mine=null,publicProfile=null,override}={}){
 const dom=new JSDOM('<div id="profile-content"></div><p id="profile-status"></p>',{url:'https://example.test/'+hash,runScripts:'outside-only',virtualConsole:new VirtualConsole()});const w=dom.window,calls=[];
 w.PianoCommunityAuth={ready:()=>true,signedIn:()=>signed,rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});if(override)return override(name,args);if(name==='profile_save'){mine={id,name:args.p_name,skills:args.p_skills,bio:args.p_bio,experience:args.p_experience,published:args.p_published};return {data:mine,error:null};}return {data:name==='profile_mine'?mine:publicProfile,error:null};}};
 w.eval(fs.readFileSync('site/piano-profile.js','utf8'));await wait();await wait();return {dom,w,calls};
}
test('profile starts blank and private and publishes only fields explicitly chosen by the learner',async()=>{
 const ui=await setup(),d=ui.w.document;let f=d.querySelector('form');assert.ok(f);assert.equal(f.querySelector('input').value,'');assert.equal(f.querySelector('input[type=checkbox]').checked,false);
 f.querySelector('input').value='Chosen learner';f.querySelectorAll('input')[1].value='Sight-reading';f.querySelector('textarea').value='Learning ragtime';f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await wait();
 let save=ui.calls.find(c=>c.name==='profile_save');assert.equal(save.args.p_published,false);assert.equal(save.args.p_name,'Chosen learner');assert.equal(ui.w.PianoProfiles.current().skills,'Sight-reading');
 f=d.querySelector('form');f.querySelector('input[type=checkbox]').checked=true;f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await wait();assert.equal(ui.calls.filter(c=>c.name==='profile_save').at(-1).args.p_published,true);assert.ok(d.querySelector('a[href="#profile/'+id+'"]'));ui.dom.window.close();
});
test('public profile safely renders chosen names and skills and offers no other-person editing',async()=>{
 const ui=await setup({hash:'#profile/'+id,signed:false,publicProfile:{id,name:'<img src=x onerror=bad()>',skills:'<script>bad()</script>',bio:'Original text',experience:'Advanced'}}),d=ui.w.document;
 assert.equal(d.querySelectorAll('img,script,form').length,0);assert.ok(d.body.textContent.includes('<script>bad()</script>'));assert.ok(d.body.textContent.includes('self-described'));assert.equal(ui.calls.some(c=>c.name==='profile_save'),false);ui.dom.window.close();
});
test('signed-out profile view points to sign-in and unavailable public profiles do not leak private fields',async()=>{
 const ui=await setup({signed:false});assert.ok(ui.w.document.querySelector('a[href="#mine"]'));assert.equal(ui.calls.length,0);ui.dom.window.close();
 const privateUi=await setup({hash:'#profile/'+id,signed:false});assert.ok(privateUi.w.document.body.textContent.includes('private or no longer available'));privateUi.dom.window.close();
});
test('an old account profile response cannot overwrite a new account after switching users',async()=>{
 let oldResolve;let owner='old';const ui=await setup({hash:'#library',override:async name=>name==='profile_mine'?owner==='old'?new Promise(r=>{oldResolve=r;}):{data:{id,name:'New account',published:false},error:null}:{data:null,error:null}});
 owner='new';ui.w.dispatchEvent(new ui.w.Event('piano-community-auth'));await wait();assert.equal(ui.w.PianoProfiles.current().name,'New account');
 oldResolve({data:{id,name:'Old account',published:true},error:null});await wait();assert.equal(ui.w.PianoProfiles.current().name,'New account');ui.dom.window.close();
});

test('an old profile editor cannot publish its fields into another account after sign-in changes',async()=>{
 let owner='first';const ui=await setup({override:async name=>name==='profile_mine'?{data:{id,name:owner==='first'?'First learner':'Second learner',skills:'',bio:'',experience:'Learning',published:false},error:null}:{data:null,error:null}});
 const oldForm=ui.w.document.querySelector('form');oldForm.querySelector('input[type=checkbox]').checked=true;
 owner='second';ui.w.dispatchEvent(new ui.w.Event('piano-community-auth'));oldForm.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await wait();
 assert.equal(ui.calls.filter(c=>c.name==='profile_save').length,0);assert.equal(ui.w.PianoProfiles.current().name,'Second learner');ui.dom.window.close();
});
