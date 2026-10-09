const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM,VirtualConsole}=require('jsdom');
const keys=['my-journey-piano-pathway-v2','journey-piano-skills-v1','journey-note-passes-v1'];
async function setup({google=false,signedOut=false}={}){
 const dom=new JSDOM('<div id="my-songs"></div><div id="account-box"></div>',{url:'https://example.test/',runScripts:'outside-only',virtualConsole:new VirtualConsole()});
 const w=dom.window,rows=new Map(),writes=[],oauthCalls=[];let authCallback;
 const sb={auth:{getSession:async()=>({data:{session:signedOut?null:{user:{id:'account-a',email:'a@example.test'}}}}),onAuthStateChange:f=>{authCallback=f;},signOut:async()=>{},signInWithOAuth:async opts=>{oauthCalls.push(structuredClone(opts));return {error:null};}},from:table=>({select:()=>({order:async()=>({data:[],error:null}),eq:(_,owner)=>({maybeSingle:async()=>({data:rows.has(owner)?{data:rows.get(owner)}:null,error:null})})}),upsert:async row=>{writes.push(structuredClone(row));rows.set(row.owner,structuredClone(row.data));return {error:null};}})};
 w.PianoCloudConfig={supabaseUrl:'https://example.supabase.co',supabaseAnonKey:'publishable-test',googleEnabled:google};
 w.supabase={createClient:()=>sb};
 const append=w.document.head.append.bind(w.document.head);w.document.head.append=(...nodes)=>{append(...nodes);for(const node of nodes)if(node.tagName==='SCRIPT')queueMicrotask(()=>node.onload());};
 const timeout=w.setTimeout.bind(w);w.setTimeout=(f,ms,...args)=>timeout(f,ms===1500?0:ms,...args);
 w.localStorage.setItem(keys[0],JSON.stringify({checks:{guest:true}}));
 w.eval(fs.readFileSync('site/piano-account.js','utf8'));
 await new Promise(r=>setTimeout(r,40));
 return {dom,w,rows,writes,oauthCalls,switch:async id=>{authCallback('SIGNED_IN',{user:{id,email:id+'@example.test'}});await new Promise(r=>setTimeout(r,40));}};
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
