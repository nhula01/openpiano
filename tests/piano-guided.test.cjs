const {test}=require('node:test');const assert=require('node:assert/strict');
const {GuidedClock,Matcher}=require('../site/piano-engine.js');
test('guided movement stops at silence and wrong notes, then resumes without skipping',()=>{
 const events=[{beat:0,notes:[60,64]},{beat:1,notes:[64]},{beat:3,notes:[67]}];
 const clock=new GuidedClock(events,60,-4,0),matcher=new Matcher(events);
 assert.equal(clock.advance(4,matcher.index),0);
 assert.equal(clock.advance(30,matcher.index),0);
 assert.equal(matcher.input(61,true),'wrong');assert.equal(clock.advance(40,matcher.index),0);
 matcher.input(61,false);assert.equal(matcher.input(60,true),'partial');assert.equal(clock.advance(50,matcher.index),0);
 assert.equal(matcher.input(64,true),'correct');assert.equal(clock.advance(50.5,matcher.index),.5);
 assert.equal(clock.advance(60,matcher.index),1);
 assert.equal(matcher.input(64,true),'held');assert.equal(clock.advance(70,matcher.index),1);
 matcher.input(64,false);assert.equal(matcher.input(64,true),'correct');
 assert.equal(clock.advance(70.5,matcher.index),1.5);assert.equal(clock.advance(80,matcher.index),3);
 assert.equal(matcher.input(67,true),'complete');assert.equal(matcher.index,events.length);
});
