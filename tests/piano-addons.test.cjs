const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function load(file,extra={}){const store=new Map();const ctx={window:{addEventListener(){},dispatchEvent(){},...extra},document:{addEventListener(){},createElement:()=>({}),createElementNS:()=>({})},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},setTimeout,requestAnimationFrame:()=>0,Event:class{constructor(t){this.type=t;}},console};vm.runInNewContext(fs.readFileSync('site/'+file,'utf8'),ctx);return ctx.window;}
const A=load('piano-addons.js').PianoAddons;
const J=x=>JSON.stringify(x);

test('finger numbers are read only from clear fingering, never invented from free text',()=>{
 assert.equal(A.digits('3'),'3');assert.equal(A.digits('3-1'),'3–1');assert.equal(A.digits(' 4 – 2 '),'4–2');
 assert.equal(A.digits('E5(1), A5(5)'),'1');assert.equal(A.digits('use the thumb'),'');assert.equal(A.digits('6'),'');assert.equal(A.digits('E5'),'');
 assert.equal(A.storeFingers('4 – 2'),'4-2');assert.equal(A.storeFingers('1, 2, 3'),'1 2 3');
});
test('the draft is one list for the whole piece: setting a note adds, replaces or removes it',()=>{
 let d=A.setNote([],{b:1,m:76,h:'RH',f:'5'});d=A.setNote(d,{b:0,m:75,h:'RH',f:'4',c:'light'});assert.equal(J(d),J([{b:0,m:75,h:'RH',f:'4',c:'light'},{b:1,m:76,h:'RH',f:'5'}]),'kept in score order');
 d=A.setNote(d,{b:1,m:76,h:'RH',f:'4'});assert.equal(d[1].f,'4','one entry per note');assert.equal(d.length,2);
 d=A.setNote(d,{b:0,m:75});assert.equal(J(d),J([{b:1,m:76,h:'RH',f:'4'}]),'empty note is removed');
});
test('unpublished changes are counted against the published copy of the whole add-on',()=>{
 const pub=[{b:0,m:76,h:'RH',f:'5'},{b:.25,m:75,h:'RH',f:'4'},{b:2,m:45,h:'LH',c:'pedal'}];
 assert.equal(A.changes(pub,pub).total,0);
 const draft=[{b:0,m:76,h:'RH',f:'4'},{b:.25,m:75,h:'RH',f:'4'},{b:3,m:64,h:'RH',f:'2'}];
 assert.equal(J(A.changes(draft,pub)),J({added:1,edited:1,removed:1,total:3}));
 assert.equal(A.changes(draft,null).total,3,'never published: every note is new');
});
test('marks show digits for fingering and a bubble for comments, with ids the viewer can resolve',()=>{
 const marks=A.toMarks([{b:0,m:76,h:'RH',f:'3-1',c:'slow'},{b:2,m:40,h:'LH',c:'Pedal'}],'layer','Ann');
 assert.equal(J(marks.map(m=>[m.kind,m.fingers||'',m.body,m.id])),J([['fingering','3–1','','layer:0.000:76:f'],['comment','','slow','layer:0.000:76:c'],['comment','','Pedal','layer:2.000:40:c']]));
 assert.ok(marks.every(m=>m.source==='layer'&&m.author==='Ann'));
});
test('a device draft from the first version becomes notes',()=>{
 const old=[{note_beat:0,note_midi:76,hand:'RH',kind:'fingering',fingers:'5'},{note_beat:0,note_midi:76,hand:'RH',kind:'comment',body:'light'},{note_beat:1,note_midi:60,hand:'LH',kind:'fingering',fingers:'1'}];
 assert.equal(J(A.fromDevice(old)),J([{b:0,m:76,h:'RH',f:'5',c:'light'},{b:1,m:60,h:'LH',f:'1'}]));
});
test('the preview stand-in keeps the draft private, publishes the whole draft, and counts one vote per person',async()=>{
 const w=load('piano-addons-demo.js',{PianoProfiles:null}),api=w.PianoAddonsDemo;
 assert.equal((await api.rpc('addon_list',{p_piece:'fur'})).total,3);
 let me=await api.rpc('addon_save_draft',{p_piece:'fur',p_notes:[{b:6,m:76,h:'RH',f:'3'},{b:6.25,m:75,h:'RH',f:'2 – 1'},{b:7,m:72,h:'RH',f:'',c:''}]});
 assert.equal(J(me.draft),J([{b:6,m:76,h:'RH',f:'3'},{b:6.25,m:75,h:'RH',f:'2-1'}]),'tidied and empty notes dropped');
 assert.equal((await api.rpc('addon_list',{p_piece:'fur'})).total,3,'a draft is not listed');
 await assert.rejects(api.rpc('addon_save_draft',{p_piece:'fur',p_notes:[{b:0,m:76,f:'6'}]}),/1 to 5/);
 me=await api.rpc('addon_publish',{p_piece:'fur'});assert.equal(J(me.published),J(me.draft));
 const listed=(await api.rpc('addon_list',{p_piece:'fur'})).addons.find(a=>a.mine);assert.equal(listed.notes.length,2);
 await api.rpc('addon_save_draft',{p_piece:'fur',p_notes:[{b:6,m:76,h:'RH',f:'4'}]});
 assert.equal((await api.rpc('addon_list',{p_piece:'fur'})).addons.find(a=>a.mine).notes.length,2,'changes wait for the next publish');
 me=await api.rpc('addon_discard',{p_piece:'fur'});assert.equal(J(me.draft),J(me.published));
 await assert.rejects(api.rpc('addon_vote',{p_addon:listed.id,p_on:true}),/another learner/);
 const bot=(await api.rpc('addon_list',{p_piece:'fur'})).addons.find(a=>a.bot&&a.author.includes('Alternate'));
 await api.rpc('addon_vote',{p_addon:bot.id,p_on:true});await api.rpc('addon_vote',{p_addon:bot.id,p_on:true});
 const top=(await api.rpc('addon_list',{p_piece:'fur'})).addons[0];assert.equal(top.id,bot.id,'voted add-on rises to the top');assert.equal(top.votes,1);
});
test('the demo bots and the SQL seed describe the same Für Elise add-ons',()=>{
 const sql=fs.readFileSync('scripts/supabase-addon-layers-demo-fur.sql','utf8');
 const rows=Object.fromEntries([...sql.matchAll(/'(fingering-demo|alt-fingering-demo|phrasing-demo)',\$\$(\[.*?\])\$\$/g)].map(m=>[m[1],JSON.parse(m[2])]));
 const w=load('piano-addons-demo.js',{PianoProfiles:null});
 assert.equal(J(rows),J(w.PianoAddonsDemo.seed));assert.equal(Object.values(rows).flat().length,39);
});
test('the add-on migration keeps tables private and grants only the add-on functions (and the updated comment writer)',()=>{
 const sql=fs.readFileSync('scripts/supabase-addon-layers.sql','utf8');
 assert.match(sql,/revoke all on public\.community_addons,public\.community_addon_votes,public\.community_addon_reports from public,anon,authenticated/);
 for(const t of ['community_addons','community_addon_votes','community_addon_reports'])assert.match(sql,new RegExp(`alter table public\\.${t} enable row level security`));
 const grants=[...sql.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to ([\w,]+)/g)].map(m=>m[1]+':'+m[2]);
 assert.equal(J(grants),J(['addon_list:anon,authenticated','addon_mine:authenticated','addon_save_draft:authenticated','addon_publish:authenticated','addon_discard:authenticated','addon_unpublish:authenticated','addon_vote:authenticated','addon_report:authenticated','community_write:authenticated']));
});
