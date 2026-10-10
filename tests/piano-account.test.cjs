const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM,VirtualConsole}=require('jsdom');
const keys=['my-journey-piano-pathway-v2','journey-piano-skills-v1','journey-note-passes-v1'];
async function setup({google=false,signedOut=false,user='account-a',seed}={}){
 const reloads=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>{if(/navigation/i.test(e.message))reloads.push(e.message);});
 const dom=new JSDOM('<div id="my-songs"></div><div id="account-box"></div>',{url:'https://example.test/',runScripts:'outside-only',virtualConsole});
 const w=dom.window,rows=new Map(),writes=[],oauthCalls=[];let authCallback;
 const sb={auth:{getSession:async()=>({data:{session:signedOut?null:{user:{id:user,email:user+'@example.test'}}}}),onAuthStateChange:f=>{authCallback=f;},signOut:async()=>{},signInWithOAuth:async opts=>{oauthCalls.push(structuredClone(opts));return {error:null};}},from:table=>({select:()=>({order:async()=>({data:[],error:null}),eq:(_,owner)=>({maybeSingle:async()=>({data:rows.has(owner)?{data:rows.get(owner)}:null,error:null})})}),upsert:async row=>{writes.push(structuredClone(row));rows.set(row.owner,structuredClone(row.data));return {error:null};}})};
 w.PianoCloudConfig={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'publishable-test',googleEnabled:google};
 w.supabase={createClient:()=>sb};
 const append=w.document.head.append.bind(w.document.head);w.document.head.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='SCRIPT')queueMicrotask(()=>node.onload());};
 const timeout=w.setTimeout.bind(w);w.setTimeout=(f,ms,...args)=>timeout(f,ms===1500?0:ms,...args);
 w.localStorage.setItem(keys[0],JSON.stringify({checks:{guest:true}}));
 seed?.(w,rows);
 w.eval(fs.readFileSync('site/piano-account.js','utf8'));
 await new Promise(r=>setTimeout(r,40));
 return {dom,w,rows,writes,oauthCalls,reloads,switch:async id=>{authCallback('SIGNED_IN',{user:{id,email:id+'@example.test'}});await new Promise(r=>setTimeout(r,40));}};
}
test('account progress sync includes earned passes and isolates shared-browser accounts',async()=>{
 const ui=await setup();assert.equal(ui.rows.get('account-a')[keys[0]].checks.guest,true);
 ui.w.localStorage.setItem(keys[2],JSON.stringify({'ode:all:full':{accuracy:100,date:'2026-10-08T00:00:00Z'}}));
 ui.w.dispatchEvent(new ui.w.Event('piano-progress-changed'));await new Promise(r=>setTimeout(r,30));
 assert.equal(ui.rows.get('account-a')[keys[2]]['ode:all:full'].accuracy,100);
 await ui.switch('account-b');assert.deepEqual(ui.rows.get('account-b')[keys[2]],{});assert.deepEqual(ui.rows.get('account-b')[keys[0]],{});
 await ui.switch('account-a');assert.equal(JSON.parse(ui.w.localStorage.getItem(keys[2]))['ode:all:full'].accuracy,100);
 ui.dom.window.close();
});
test('newer remote practice result survives an older cached pass',async()=>{
 const ui=await setup();const newer={accuracy:98,date:'2026-10-08T10:00:00Z'},older={accuracy:90,date:'2026-10-07T10:00:00Z'};
 ui.rows.set('account-b',{[keys[2]]:{test:newer}});ui.w.localStorage.setItem('openpiano-progress-cache:account-b',JSON.stringify({[keys[2]]:{test:older}}));
 await ui.switch('account-b');assert.deepEqual(ui.rows.get('account-b')[keys[2]].test,newer);ui.dom.window.close();
});

test('Google sign-in requires age/terms confirmation and uses the exact website callback',async()=>{
 const ui=await setup({google:true,signedOut:true});
 const button=[...ui.w.document.querySelectorAll('button')].find(b=>b.textContent==='Continue with Google');
 assert.ok(button);await button.onclick();assert.equal(ui.oauthCalls.length,0);
 ui.w.document.querySelector('.signin input[type=checkbox]').checked=true;
 await button.onclick();assert.equal(ui.oauthCalls.length,1);
 assert.deepEqual(ui.oauthCalls[0],{provider:'google',options:{redirectTo:'https://example.test/'}});
 const consent=JSON.parse(ui.w.sessionStorage.getItem('openpiano-oauth-consent'));assert.equal(consent.age_13_or_older,true);
 assert.ok(consent.accepted_terms_at);ui.dom.window.close();
});

test('community practice plans sync privately and a newer removal wins over an older saved plan',async()=>{
 const ui=await setup();const key='openpiano-community-plans-v1';
 ui.w.localStorage.setItem(key,JSON.stringify({entertainer:{alias:'Public alias',fingers:'C4(1)',date:'2026-10-08T10:00:00Z'}}));
 ui.w.dispatchEvent(new ui.w.Event('piano-progress-changed'));await new Promise(r=>setTimeout(r,30));
 assert.equal(ui.rows.get('account-a')[key].entertainer.fingers,'C4(1)');
 ui.rows.set('account-b',{[key]:{entertainer:{removed:true,date:'2026-10-09T10:00:00Z'}}});
 ui.w.localStorage.setItem('openpiano-progress-cache:account-b',JSON.stringify({[key]:{entertainer:{fingers:'C4(1)',date:'2026-10-08T10:00:00Z'}}}));
 await ui.switch('account-b');assert.equal(JSON.parse(ui.w.localStorage.getItem(key)).entertainer.removed,true);
 await ui.switch('account-a');assert.equal(JSON.parse(ui.w.localStorage.getItem(key)).entertainer.alias,'Public alias');ui.dom.window.close();
});
test('signed-in account chrome is a compact profile picture link instead of an email and sign-out card',async()=>{
 const ui=await setup();ui.w.PianoProfiles={current:()=>({name:'Profile learner',avatar_path:'account-a/avatar.jpg'}),avatar:()=>{const n=ui.w.document.createElement('span');n.className='profile-avatar';return n;}};ui.w.dispatchEvent(new ui.w.Event('piano-profile-changed'));
 const box=ui.w.document.querySelector('#account-box');assert.ok(box.querySelector('a.account-profile[href="#profile"] .profile-avatar'));assert.equal(box.textContent.includes('a@example.test'),false);assert.equal([...box.querySelectorAll('button')].some(b=>b.textContent==='Sign out'),false);ui.dom.window.close();
});
test('practice attempts from two devices merge without duplicates, the log keeps the larger minutes, and syncing does not reload again',async()=>{
 const ui=await setup();const P='openpiano-progress-v1',L='openpiano-practice-log-v1';
 const a1={t:1,k:'p',a:95,h:'BH',c:1},a2={t:2,k:'w',a:80,h:'RH',r:[0,8]},a3={t:3,k:'p',a:91,h:'BH',c:1,cold:1};
 ui.rows.set('account-b',{[P]:{pieces:{ode:{a:{'1':a1,'2':a2}}},migrated:5},[L]:{days:{'2026-10-08':600,'2026-10-09':60},pieces:{ode:{seconds:600,attempts:3,best:95,last:9,title:'Ode'}}}});
 ui.w.localStorage.setItem('openpiano-progress-cache:account-b',JSON.stringify({[P]:{pieces:{ode:{a:{'2':a2,'3':a3}},fur:{a:{'4':a1}}},migrated:7},[L]:{days:{'2026-10-08':120,'2026-10-10':300},pieces:{ode:{seconds:200,attempts:5,best:90,last:12,title:'Ode'}}}}));
 await ui.switch('account-b');
 const merged=JSON.parse(ui.w.localStorage.getItem(P));
 assert.deepEqual(Object.keys(merged.pieces.ode.a).sort(),['1','2','3'],'the union of both devices, the shared attempt once');
 assert.deepEqual(merged.pieces.ode.a['2'],a2);assert.ok(merged.pieces.fur);
 const log=JSON.parse(ui.w.localStorage.getItem(L));
 assert.deepEqual(log.days,{'2026-10-08':600,'2026-10-09':60,'2026-10-10':300},'minutes per day: the larger of the two');
 assert.deepEqual([log.pieces.ode.seconds,log.pieces.ode.attempts,log.pieces.ode.best,log.pieces.ode.last],[600,5,95,12]);
 assert.equal(merged.migrated,7,'other numbers keep the usual rule (this device wins)');
 assert.deepEqual(ui.rows.get('account-b')[L].days,log.days,'the merged log is saved to the account');
 // After the reload the page writes the same log back with its keys in another order: no second reload.
 const local=Object.fromEntries([P,L].map(k=>[k,JSON.parse(ui.w.localStorage.getItem(k))]));local[L]={pieces:log.pieces,days:Object.fromEntries(Object.entries(log.days).reverse())};ui.dom.window.close();
 const next=await setup({user:'account-b',seed:(w,rows)=>{rows.set('account-b',ui.rows.get('account-b'));w.localStorage.setItem('openpiano-progress-owner','account-b');for(const [k,v] of Object.entries(local))w.localStorage.setItem(k,JSON.stringify(v));}});
 assert.equal(next.reloads.length,0,'nothing new, so no reload');assert.ok(next.writes.length,'it did sync');next.dom.window.close();
});
