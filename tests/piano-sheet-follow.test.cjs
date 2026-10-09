const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');
test('normal sheet tracks staff systems instead of note pitch or hand',()=>{
 const dom=new JSDOM('<div id="score"><svg viewBox="0 0 100 150"><g class="score-note" data-beat="0" data-midi="60"></g><g class="score-note" data-beat="1" data-midi="72"></g><g class="score-note" data-beat="4" data-midi="48"></g></svg></div>',{runScripts:'outside-only'});
 dom.window.eval(fs.readFileSync('site/piano-score-view.js','utf8'));
 const host=dom.window.document.querySelector('#score'),drawing=host.querySelector('svg');
 Object.defineProperty(drawing,'viewBox',{value:{baseVal:{width:100,y:0}}});
 Object.defineProperty(host,'clientHeight',{value:220});host.getBoundingClientRect=()=>({left:0,top:0});
 drawing.getBoundingClientRect=()=>({width:500,top:-host.scrollTop});
 [...host.querySelectorAll('.score-note')].forEach((n,i)=>n.getBoundingClientRect=()=>({left:50+i*40,top:[110,190,330][i]-host.scrollTop}));
 const view=Object.create(dom.window.PianoScoreView.prototype);Object.assign(view,{host,mode:'sheet',page:0,available:true,score:{title:'Study'},keys:new Map(),data:{pages:[{start:0}],systems:[{page:0,start:0,end:4,y:10,height:30,width:100,positions:[[0,10],[1,20]]},{page:0,start:4,end:8,y:60,height:30,width:100,positions:[[4,10],[5,20]]}]}});
 const events=[{beat:0,duration:1,notes:[60],members:[]},{beat:1,duration:1,notes:[72],members:[]},{beat:4,duration:1,notes:[48],members:[]}],matcher={index:0,held:new Set()};
 const update=()=>view.update({events,matcher,fingers:false,hintsRight:[],hintsLeft:[]});
 update();const top=host.querySelector('.normal-playhead').style.top,scroll=host.scrollTop;
 matcher.index=1;update();assert.equal(host.scrollTop,scroll);assert.equal(host.querySelector('.normal-playhead').style.top,top);
 matcher.index=2;update();assert.notEqual(host.querySelector('.normal-playhead').style.top,top);assert.ok(host.scrollTop>scroll);
 dom.window.close();
});
