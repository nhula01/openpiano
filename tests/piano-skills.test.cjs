const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../site/piano-engine.js');
function context(){const c={window:{PianoRepertoire:{entertainer:{}}}};for(const name of ['piano-library','piano-additions','piano-famous','piano-pdmx','piano-studies','piano-curriculum','piano-skills'])vm.runInNewContext(fs.readFileSync('site/'+name+'.js','utf8'),c);return c.window;}
test('40 original units (Level 0 and Levels 1–7) connect method and technique to playable complete repertoire',()=>{const w=context();assert.equal(w.PianoSkills.units.length,40);for(let l=0;l<=7;l++)assert.equal(w.PianoSkills.units.filter(u=>u.level===l).length,5);for(const u of w.PianoSkills.units){assert.ok(u.method&&u.technique&&u.check);assert.ok(w.PianoRepertoire[u.piece]);}});
test('all 24 key models spell triads and dominant sevenths correctly, including minor leading tones',()=>{const w=context(),pcs=[0,7,2,9,4,11,6,1,8,3,10,5];for(let i=0;i<12;i++)for(const mode of ['major','minor']){const m=w.PianoSkills.keyModel(i,mode),notes=m.chords[0].notes;assert.deepEqual(Array.from(notes,n=>n.midi-notes[0].midi),[0,mode==='minor'?3:4,7]);assert.deepEqual(Array.from(m.chords[2].notes,n=>n.midi-(60+pcs[i])),[7,11,14,17]);assert.equal(m.scale.length,8);assert.equal(m.chords[2].notes[1].name,m.leading);}assert.equal(w.PianoSkills.keyModel(3,'minor').leading,'G♯');assert.equal(w.PianoSkills.keyModel(7,'minor').notes[2],'F♭');assert.equal(w.PianoSkills.keyModel(6,'major').leading,'E♯');});


// ---- The learning path (piano-path.js): Up next and Today come from passes, not ticked boxes ----
test('the path starts at First keys, moves Up next on as pieces are learned, and finishes a level', () => {
  const store = new Map(), w = context();
  Object.assign(w, { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, dispatchEvent() {}, Event: class { constructor(t) { this.type = t; } } });
  const c = { window: w, localStorage: w.localStorage, Event: w.Event, Date, JSON, Math, Number, Object };
  Object.assign(c, w);
  vm.runInNewContext(fs.readFileSync('site/piano-progress.js', 'utf8'), c);
  vm.runInNewContext(fs.readFileSync('site/piano-path.js', 'utf8'), c);
  const P = c.window.PianoPath;
  assert.equal(P.learnerLevel(), 0);
  assert.equal(P.upNext().id, 'first-01');
  // a Secure play: the whole piece In time, both hands, above 60% of the marked tempo
  const pass = (id, days = 0) => c.window.PianoProgress.record({ score: id, kind: 'play', accuracy: 95, timing: 90, bpm: 100, hands: 'BH', complete: true, time: Date.now() - days * 864e5 });
  pass('first-01', 5);
  assert.equal(P.upNext().id, 'first-02', 'a learned piece moves Up next on');
  const plan = P.today();
  assert.ok(plan.items.some(i => i.kind === 'reading' && /^reading-1-/.test(i.id)), 'a fresh first-reading piece');
  assert.ok(plan.items.some(i => i.kind === 'review' && i.id === 'first-01'), 'a piece learned days ago comes back for review');
  for (let n = 2; n <= 12; n++) pass('first-' + String(n).padStart(2, '0'));
  assert.equal(P.learnerLevel(), 1, 'twelve First keys pieces finish Level 0');
  assert.ok(P.levelState(1).total > 0);
  P.setStartLevel(3); assert.equal(P.learnerLevel(), 3, 'an experienced player can start higher');
  assert.ok(P.today().items.some(i => i.kind === 'warmup'), 'a key-study warm-up from Level 2 on');
});
