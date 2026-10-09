const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM,VirtualConsole}=require('jsdom');
const wait=()=>new Promise(r=>setTimeout(r,30));const id='10000000-0000-4000-8000-000000000001';
async function setup({hash='#profile',signed=true,mine=null,publicProfile=null,override}={}){
 const dom=new JSDOM('<div id="profile-content"></div><p id="profile-status"></p>',{url:'https://example.test/'+hash,runScripts:'outside-only',virtualConsole:new VirtualConsole()});const w=dom.window,calls=[],storageCalls=[];
 w.URL.createObjectURL=()=> 'blob:profile-preview';w.URL.revokeObjectURL=()=>{};
 w.PianoCommunityAuth={ready:()=>true,signedIn:()=>signed,account:()=>signed?{email:'learner@example.test'}:null,signOut:async()=>{storageCalls.push({name:'signOut'});},avatarUrl:async path=>'https://storage.example.test/'+path,uploadAvatar:async(file,profileId)=>{storageCalls.push({name:'upload',profileId,type:file.type,size:file.size});return profileId+'/20000000-0000-4000-8000-000000000002.jpg';},removeAvatar:async path=>{storageCalls.push({name:'remove',path});},rpc:async(name,args)=>{calls.push({name,args:structuredClone(args)});if(override)return override(name,args);if(name==='profile_save'){mine={id,name:args.p_name,skills:args.p_skills,bio:args.p_bio,experience:args.p_experience,avatar_path:args.p_avatar_path,published:args.p_published};return {data:mine,error:null};}return {data:name==='profile_mine'?mine:publicProfile,error:null};}};
 w.eval(fs.readFileSync('site/piano-profile.js','utf8'));await wait();await wait();return {dom,w,calls,storageCalls};
}
test('profile starts blank and private and publishes only fields explicitly chosen by the learner',async()=>{
 const ui=await setup(),d=ui.w.document;let f=d.querySelector('form');assert.ok(f);let textInputs=f.querySelectorAll('input:not([type=file]):not([type=checkbox])');assert.equal(textInputs[0].value,'');assert.equal(f.querySelector('input[type=checkbox]').checked,false);
 textInputs[0].value='Chosen learner';textInputs[1].value='Sight-reading';f.querySelector('textarea').value='Learning ragtime';f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await wait();
 let save=ui.calls.find(c=>c.name==='profile_save');assert.equal(save.args.p_published,false);assert.equal(save.args.p_name,'Chosen learner');assert.equal(ui.w.PianoProfiles.current().skills,'Sight-reading');
 f=d.querySelector('form');[...f.querySelectorAll('input[type=checkbox]')].at(-1).checked=true;f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await wait();assert.equal(ui.calls.filter(c=>c.name==='profile_save').at(-1).args.p_published,true);assert.ok(d.querySelector('a[href="#profile/'+id+'"]'));ui.dom.window.close();
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
test('one uploaded picture is saved on the account profile and reused by public identity',async()=>{
 const oldPath=id+'/10000000-0000-4000-8000-000000000001.png';const ui=await setup({mine:{id,name:'Photo learner',skills:'Piano',bio:'',experience:'Beginner',published:true,avatar_path:oldPath}}),d=ui.w.document,f=d.querySelector('form'),input=f.querySelector('input[type=file]');
 const file=new ui.w.File(['photo'],'me.jpg',{type:'image/jpeg'});Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new ui.w.Event('change'));
 f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await wait();await wait();const save=ui.calls.find(c=>c.name==='profile_save');assert.equal(save.args.p_avatar_path,id+'/20000000-0000-4000-8000-000000000002.jpg');assert.ok(ui.storageCalls.find(c=>c.name==='upload'&&c.profileId===id));assert.ok(ui.storageCalls.find(c=>c.name==='remove'&&c.path===oldPath));
 assert.equal(ui.w.PianoProfiles.current().avatar_path,save.args.p_avatar_path);ui.dom.window.close();
 const pub=await setup({hash:'#profile/'+id,signed:false,publicProfile:{id,name:'Photo learner',skills:'Piano',bio:'',experience:'Beginner',avatar_path:'public/avatar.jpg'}});await wait();assert.equal(pub.w.document.querySelector('.profile-avatar img').src,'https://storage.example.test/public/avatar.jpg');pub.dom.window.close();
});
test('a new profile is prepared privately before its first picture is uploaded and published',async()=>{
 const ui=await setup(),f=ui.w.document.querySelector('form'),texts=f.querySelectorAll('input:not([type=file]):not([type=checkbox])');texts[0].value='New pianist';
 const file=new ui.w.File(['photo'],'me.png',{type:'image/png'}),input=f.querySelector('input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new ui.w.Event('change'));[...f.querySelectorAll('input[type=checkbox]')].at(-1).checked=true;
 f.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await wait();await wait();const saves=ui.calls.filter(c=>c.name==='profile_save');assert.equal(saves.length,2);assert.equal(saves[0].args.p_published,false);assert.equal(saves[0].args.p_avatar_path,null);assert.equal(saves[1].args.p_published,true);assert.ok(saves[1].args.p_avatar_path.startsWith(id+'/'));ui.dom.window.close();
});
