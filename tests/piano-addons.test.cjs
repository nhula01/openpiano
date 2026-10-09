const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function load(file,extra={}){const store=new Map();const ctx={window:{addEventListener(){},dispatchEvent(){},...extra},document:{addEventListener(){},createElement:()=>({}),createElementNS:()=>({})},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},setTimeout,requestAnimationFrame:()=>0,Event:class{constructor(t){this.type=t;}},console};vm.runInNewContext(fs.readFileSync('site/'+file,'utf8'),ctx);return ctx.window;}
const A=load('piano-addons.js').PianoAddons;
const post=(o)=>({id:'x'+Math.random(),kind:'fingering',fingers:'1',hand:'RH',note_beat:0,note_midi:60,votes:0,voted:false,mine:false,alias:'Ann',profile:{id:'ann'},...o});

test('finger numbers are read only from clear fingering, never invented from free text',()=>{
 assert.equal(A.digits('3'),'3');assert.equal(A.digits('3-1'),'3–1');assert.equal(A.digits(' 4 – 2 '),'4–2');
 assert.equal(A.digits('E5(1), A5(5)'),'1');assert.equal(A.digits('use the thumb'),'');assert.equal(A.digits('6'),'');assert.equal(A.digits('E5'),'');
});
test('add-ons group by author, rank by votes, and one voter counts once',()=>{
 const posts=[post({alias:'Bot A',bot:true,profile:{name:'Bot A',bot:true},votes:0}),post({alias:'Bot A',bot:true,profile:{name:'Bot A',bot:true},note_beat:1,votes:0}),
  post({alias:'Ben',profile:{id:'ben'},votes:1,voted:true}),post({alias:'Ben',profile:{id:'ben'},note_beat:1,votes:1,voted:true}),post({alias:'Ben',profile:{id:'ben'},note_beat:2,kind:'comment',body:'soft',votes:1,voted:true}),
  post({alias:'Me',mine:true,votes:5}),post({alias:'Ann',parent:'p1',votes:9})];
 const layers=A.groupLayers(posts);assert.equal(layers.length,2,'own posts and replies are excluded');
 assert.equal(layers[0].author,'Ben');assert.equal(layers[0].votes,1);assert.equal(layers[0].voted,true);assert.equal(layers[0].fingerings,2);assert.equal(layers[0].comments,1);
 assert.equal(layers[1].author,'Bot A');assert.equal(layers[1].bot,true);
});
test('marks show digits for fingering and turn unreadable fingering into a comment',()=>{
 const marks=A.toMarks([post({fingers:'2',body:'Fingering 2'}),post({fingers:'thumb under',body:'Fingering thumb under',note_beat:1}),post({kind:'comment',body:'Pedal',note_beat:2,note_midi:40,hand:'LH'})],'layer','Ann');
 assert.equal(JSON.stringify(marks.map(m=>[m.kind,m.fingers||'',m.body])),JSON.stringify([['fingering','2',''],['comment','','Fingering: thumb under · Fingering thumb under'],['comment','','Pedal']]));
 assert.ok(marks.every(m=>m.source==='layer'&&m.author==='Ann'));
});
test('the preview stand-in keeps notes private until shared, and blocks voting for yourself',async()=>{
 const w=load('piano-addons-demo.js',{PianoProfiles:null}),api=w.PianoAddonsDemo;
 const before=(await api.rpc('community_list',{p_piece:'fur'})).total;assert.ok(before>=39);
 const id=await api.rpc('community_write',{p_piece:'fur',p_body:'Fingering 3',p_kind:'fingering',p_fingers:'3',p_hand:'RH',p_note_beat:6,p_note_midi:76,p_visibility:'private'});
 assert.equal((await api.rpc('community_list',{p_piece:'fur'})).total,before,'private notes are not listed');
 assert.equal((await api.rpc('community_mine',{p_piece:'fur'})).posts.length,1);
 await api.rpc('community_reveal',{p_post:id,p_public:true});assert.equal((await api.rpc('community_list',{p_piece:'fur'})).total,before+1);
 await assert.rejects(api.rpc('community_vote',{p_post:id,p_on:true}),/another learner/);
 const bot=(await api.rpc('community_list',{p_piece:'fur'})).posts.find(p=>p.bot);await api.rpc('community_vote',{p_post:bot.id,p_on:true});
 assert.equal((await api.rpc('community_list',{p_piece:'fur'})).posts[0].votes,1,'voted add-on rises to the top');
});
test('the demo bots and the SQL seed describe the same Für Elise notes',()=>{
 const sql=fs.readFileSync('scripts/supabase-note-addons-demo-fur.sql','utf8');const rows=[...sql.matchAll(/'(fingering-demo|alt-fingering-demo|phrasing-demo)',([\d.]+)(?:::numeric)?,(\d+),'(RH|LH)','(fingering|comment)','([^']*)'/g)].map(m=>[m[1],Number(m[2]),Number(m[3]),m[4],m[5],m[6]].join('|')).sort();
 const w=load('piano-addons-demo.js',{PianoProfiles:null});
 return w.PianoAddonsDemo.rpc('community_list',{p_piece:'fur',p_offset:0}).then(async first=>{let all=first.posts;for(let o=20;o<first.total;o+=20)all=all.concat((await w.PianoAddonsDemo.rpc('community_list',{p_piece:'fur',p_offset:o})).posts);
  const bots={'OpenPiano Fingering Bot':'fingering-demo','OpenPiano Alternate Fingering Bot':'alt-fingering-demo','OpenPiano Phrasing Bot':'phrasing-demo'};
  const demo=all.map(p=>[bots[p.alias],p.note_beat,p.note_midi,p.hand,p.kind,p.fingers].join('|')).sort();assert.equal(rows.length,39);assert.equal(JSON.stringify(demo),JSON.stringify(rows));});
});
