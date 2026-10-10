// First-reading pieces generated in the browser (site/piano-reading-gen.js), the reading staircase and the
// placement decision (site/piano-placement.js). The generator is a port of the reading generator in
// scripts/build-piano-studies.py: run with the build script's search settings it reproduces every seeded
// reading-L-3…10 piece note for note.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { JSDOM } = require('jsdom');

function load({ storage = new Map(), repertoire = {} } = {}) {
  const events = [];
  const window = { PianoRepertoire: repertoire, addEventListener() {}, dispatchEvent: e => events.push(e) };
  const ctx = { window, console, localStorage: { getItem: k => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, String(v)) },
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } } };
  vm.runInNewContext(fs.readFileSync('site/piano-reading-gen.js', 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync('site/piano-placement.js', 'utf8'), ctx);
  return { G: window.PianoReadingGen, Placement: window.PianoPlacement, window, storage, events };
}
const { G, Placement } = load();
const PC = { c: 0, cis: 1, des: 1, d: 2, ees: 3, e: 4, f: 5, fis: 6, g: 7, aes: 8, a: 9, bes: 10, b: 11 };
const scale = (key, mode) => new Set((mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11]).map(x => (x + PC[key]) % 12));
const near = (a, b) => Math.abs(a - b) < 1e-6;
const hand = (s, h) => s.notes.filter(n => n.hand === h);
const topLine = s => { const m = new Map(); for (const n of hand(s, 'right')) { const k = n.beat.toFixed(4); if (!m.has(k) || m.get(k).midi < n.midi) m.set(k, n); } return [...m.values()].sort((a, b) => a.beat - b.beat); };
const key = n => [n.midi, n.beat.toFixed(5), n.duration.toFixed(5), n.hand].join();
// values made in the generator's own context compare as plain data
const plain = x => JSON.parse(JSON.stringify(x));

test('the port reproduces all 56 seeded first-reading pieces of the build script note for note', () => {
  for (let l = 1; l <= 7; l++) for (let n = 3; n <= 10; n++) {
    const m = G._compose(l, G.LEVELS[l].plans[n - 3], `reading-${l}-${n}`, { enough: 12, budget: 600 });
    const built = JSON.parse(fs.readFileSync(`site/scores/reading-${l}-${n}/practice.json`, 'utf8'));
    assert.deepEqual(plain(G._notes(m).map(key).sort()), built.notes.map(key).sort(), `reading-${l}-${n}`);
  }
});

test('generation is deterministic per seed, and different seeds give different music', () => {
  for (let l = 0; l <= 7; l++) {
    const a = G.generate(l, 7), b = G.generate(l, 7), c = G.generate(l, 8);
    assert.deepEqual(plain(a.notes), plain(b.notes)); assert.equal(a.musicxml, b.musicxml);
    assert.equal(a.id, `gen-reading-${l}-7`); assert.equal(a.title, `Reading ${l} · No. 7`);
    assert.notDeepEqual(plain(a.notes.map(key)), plain(c.notes.map(key)));
  }
  // a registered piece computes the same music when it is first asked for it
  const { G: G2, window } = load();
  const entry = G2.ensure('gen-reading-3-12');
  assert.equal(window.PianoRepertoire['gen-reading-3-12'], entry);
  assert.deepEqual(plain(entry.notes), plain(G.generate(3, 12).notes));
  assert.equal(G2.ensure('gen-reading-9-1'), null); assert.equal(G2.ensure('reading-3-4'), null);
});

// Each level's rules, checked over many seeds: keys, meters, range, rhythms, the key's notes, the cadence.
const RULES = {
  0: { keys: ['c-major'], meters: ['4/4'], rh: [60, 67], durations: [1, 2], oneHand: true },
  1: { keys: ['c-major'], meters: ['4/4'], rh: [60, 67], shortest: 1 },
  2: { keys: ['c-major', 'g-major', 'f-major'], meters: ['4/4', '3/4'], shortest: 1, position: true },
  3: { keys: ['g-major', 'f-major', 'e-minor', 'd-minor'], meters: ['4/4', '3/4', '2/4'], rh: [60, 79], shortest: .5, has: .5 },
  4: { keys: ['d-major', 'bes-major', 'b-minor', 'g-minor'], meters: ['4/4', '3/4', '6/8'], rh: [59, 81], shortest: .5, has: 1.5 },
  5: { keys: ['a-major', 'ees-major', 'fis-minor', 'c-minor'], meters: ['4/4', '3/4', '6/8', '2/4'], rh: [57, 84], shortest: .25, has: .25, ledger: true },
  6: { keys: ['ees-major', 'a-major', 'd-major', 'bes-major', 'fis-minor', 'c-minor', 'g-minor', 'b-minor'], meters: ['4/4', '3/4', '6/8'], rh: [57, 81], shortest: .25, dyads: true, chromatic: true },
  7: { keys: ['e-major', 'aes-major', 'cis-minor', 'f-minor'], meters: ['4/4', '3/4', '6/8'], rh: [55, 84], shortest: .25, triplets: true, wide: true },
};
test('every level keeps to its rules: keys, meters, range, rhythms, cadence (seeds 1–16)', () => {
  for (let l = 0; l <= 7; l++) {
    const r = RULES[l], meters = new Set();
    for (let seed = 1; seed <= 16; seed++) {
      const s = G.generate(l, seed), id = s.id, rh = hand(s, 'right'), lh = hand(s, 'left'), tonic = PC[s.studyKey];
      meters.add(s.timeSignature);
      assert.equal(s.kind, 'reading'); assert.equal(s.studyLevel, l); assert.ok(s.tempo >= 40 && s.tempo <= 66, id);
      assert.ok(r.keys.includes(`${s.studyKey}-${s.studyMode}`), `${id}: key`); assert.ok(r.meters.includes(s.timeSignature), `${id}: meter`);
      assert.equal(s.totalBeats, s.beatsPerMeasure * 8, `${id}: eight bars`);
      assert.ok(near(Math.max(...s.notes.map(n => n.beat + n.duration)), s.totalBeats), `${id}: the last note is held to the end`);
      if (r.shortest) assert.ok(s.notes.every(n => n.duration >= r.shortest - 1e-6), `${id}: nothing shorter than allowed`);
      if (r.durations) assert.ok(s.notes.every(n => r.durations.some(d => near(n.duration, d))), `${id}: quarters and halves only`);
      if (r.has) assert.ok(rh.some(n => near(n.duration, r.has)), `${id}: shows the level's new rhythm`);
      if (r.rh) assert.ok(rh.every(n => n.midi >= r.rh[0] && n.midi <= r.rh[1]), `${id}: right-hand range`);
      for (const x of rh) assert.ok(lh.filter(y => y.beat < x.beat + x.duration - 1e-6 && y.beat + y.duration > x.beat + 1e-6).every(y => y.midi < x.midi), `${id}: hands cross`);
      const outside = s.notes.filter(n => !scale(s.studyKey, s.studyMode).has(n.midi % 12));
      if (r.chromatic) assert.ok(outside.length >= 1 && outside.length <= 6 && outside.every(n => n.hand === 'right' && n.duration <= 1.5), `${id}: chromatic neighbours`);
      else assert.equal(outside.length, 0, `${id}: notes outside the key`);
      const top = topLine(s), last = top.at(-1);
      assert.equal(last.midi % 12, tonic, `${id}: ends on the tonic`); assert.ok(Math.abs(last.midi - top.at(-2).midi) <= 2, `${id}: final step`);
      for (let i = 1; i < top.length; i++) { const step = Math.abs(top[i].midi - top[i - 1].midi); assert.ok(step !== 6 && step <= 12, `${id}: leap of ${step}`); }
      if (r.oneHand) {
        assert.equal(lh.length, 0, `${id}: right hand alone`);
        assert.ok(top.every((n, i) => !i || Math.abs(n.midi - top[i - 1].midi) <= 4), `${id}: steps and skips only`);
      } else {
        const end = s.notes.filter(n => near(n.beat + n.duration, s.totalBeats));
        assert.equal(Math.min(...end.map(n => n.midi)) % 12, tonic, `${id}: tonic in the bass at the end`);
      }
      if (l === 1) assert.ok(lh.every(n => n.duration === 4), `${id}: whole notes in the left hand`);
      if (r.position) {
        assert.ok(rh.every(n => n.midi >= 60 + tonic && n.midi <= 67 + tonic), `${id}: five-finger position`);
        const lo = Math.min(...lh.map(n => n.midi)); assert.ok(lh.every(n => n.midi - lo <= 7), `${id}: left-hand position`);
      }
      if (r.ledger) assert.ok(rh.some(n => n.midi >= 81 || n.midi <= 60), `${id}: ledger lines`);
      if (r.dyads) assert.ok(rh.filter(x => rh.some(y => y !== x && near(y.beat, x.beat))).length >= 6, `${id}: two-note textures`);
      if (r.triplets && s.timeSignature !== '6/8') assert.ok(rh.some(n => !Number.isInteger(+(n.beat * 4).toFixed(6))), `${id}: triplets`);
      if (r.wide) assert.ok(top.some((n, i) => i && Math.abs(n.midi - top[i - 1].midi) >= 8), `${id}: a wide leap`);
      // never any fingering
      assert.doesNotMatch(s.musicxml, /<fingering|<technical/, id);
      assert.ok(s.notes.every(n => !('finger' in n) && !('fingers' in n)), id);
    }
    assert.deepEqual([...meters].sort(), [...r.meters].sort(), `level ${l} uses every planned meter`);
  }
});

// The MusicXML is well formed and says exactly what the practice notes say.
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function readXML(xml) {
  const doc = new new JSDOM('').window.DOMParser().parseFromString(xml, 'application/xml');
  assert.equal(doc.querySelector('parsererror'), null, 'well-formed XML');
  const div = Number(doc.querySelector('divisions').textContent), notes = [], bars = [];
  let start = 0;
  for (const m of doc.querySelectorAll('measure')) {
    let pos = 0, last = 0, longest = 0;
    for (const e of m.children) {
      if (e.tagName === 'backup') { pos -= Number(e.querySelector('duration').textContent); continue; }
      if (e.tagName !== 'note') continue;
      const chord = !!e.querySelector('chord'), dur = Number(e.querySelector('duration').textContent), onset = chord ? last : pos;
      if (!chord) { pos += dur; last = onset; longest = Math.max(longest, pos); }
      const p = e.querySelector('pitch'); if (!p) continue;
      const alter = Number(p.querySelector('alter')?.textContent || 0);
      notes.push({ midi: 12 * (Number(p.querySelector('octave').textContent) + 1) + STEP[p.querySelector('step').textContent] + alter, beat: Math.round((start + onset) / div * 1e6) / 1e6, duration: Math.round(dur / div * 1e6) / 1e6, hand: e.querySelector('staff').textContent === '1' ? 'right' : 'left' });
    }
    bars.push(longest / div); start += longest;
  }
  return { doc, notes, bars };
}
test('the MusicXML is well formed, eight full bars, and matches the practice notes exactly', () => {
  for (let l = 0; l <= 7; l++) for (let seed = 1; seed <= 8; seed++) {
    const s = G.generate(l, seed), { doc, notes, bars } = readXML(s.musicxml);
    assert.equal(doc.querySelector('work-title').textContent, s.title);
    assert.equal(doc.querySelectorAll('measure').length, 8);
    assert.ok(bars.every(b => near(b, s.beatsPerMeasure)), `${s.id}: every bar is full`);
    assert.equal(doc.querySelector('time beats').textContent + '/' + doc.querySelector('time beat-type').textContent, s.timeSignature);
    assert.deepEqual(notes.map(key).sort(), plain(s.notes.map(key).sort()), s.id);
    // accidentals are printed where the key signature does not give the note (minor leading tones, chromatic notes)
    const fifths = Number(doc.querySelector('key fifths').textContent), sig = {};
    for (const [i, st] of [...'FCGDAEB'].entries()) sig[st] = fifths > i ? 1 : 0;
    for (const [i, st] of [...'BEADGCF'].entries()) if (-fifths > i) sig[st] = -1;
    const off = [...doc.querySelectorAll('pitch')].filter(p => Number(p.querySelector('alter')?.textContent || 0) !== sig[p.querySelector('step').textContent]);
    if (off.length) assert.ok(doc.querySelectorAll('accidental').length >= 1, `${s.id}: notes outside the key signature carry accidentals`);
    else assert.equal(doc.querySelectorAll('accidental').length, 0, `${s.id}: no needless accidentals`);
  }
});

test('the reading staircase: up a whole step after a success, down half a step after a miss, first cold run only', () => {
  const storage = new Map(), { G: R, window, events } = load({ storage });
  window.PianoRepertoire['reading-2-3'] = { kind: 'reading', studyLevel: 2, notes: [{ hand: 'left' }, { hand: 'right' }] };
  const run = (score, accuracy, timing, extra = {}) => R.record({ kind: 'play', complete: true, loop: false, hands: 'BH', score, accuracy, timing, time: Date.now() + Math.random(), ...extra });
  assert.equal(R.level(), 0, 'a new learner reads at Level 0');
  R.setLevel(2);
  assert.deepEqual(plain(run('gen-reading-2-1', 95, 80)), { level: 3, passed: true });
  assert.deepEqual(plain(run('gen-reading-3-1', 92, 70)), { level: 2.5, passed: false }, 'timing below 75% is a miss');
  assert.deepEqual(plain(run('reading-2-3', 85, 90)), { level: 2, passed: false }, 'notes below 90% is a miss; static reading pieces count too');
  assert.equal(run('gen-reading-2-1', 100, 100), null, 'only the first run of a piece counts');
  assert.equal(run('gen-reading-2-2', 100, 100, { kind: 'wait' }), null, 'Wait mode does not count');
  assert.equal(run('gen-reading-2-2', 100, 100, { complete: false }), null, 'a run from the middle does not count');
  assert.equal(run('gen-reading-2-2', 100, 100, { loop: true }), null, 'a loop does not count');
  assert.equal(run('gen-reading-2-2', 100, 100, { hands: 'RH' }), null, 'one hand of a two-hand piece does not count');
  assert.equal(run('ode', 100, 100), null, 'repertoire does not count');
  const level0 = R.ensure('gen-reading-0-4'); void level0.notes;
  assert.deepEqual(plain(run('gen-reading-0-4', 100, 100, { hands: 'RH' })), { level: 3, passed: true }, 'a right-hand-only piece counts with the right hand');
  for (let i = 0; i < 10; i++) run('gen-reading-7-' + (i + 1), 100, 100);
  assert.equal(R.level(), 7, 'clamped at 7');
  for (let i = 0; i < 20; i++) run('gen-reading-1-' + (i + 1), 10, 10);
  assert.equal(R.level(), 0, 'clamped at 0');
  const saved = JSON.parse(storage.get('openpiano-reading-v1'));
  assert.equal(saved.level, 0);
  const history = Object.entries(saved.history);
  assert.ok(history.every(([t, h]) => /^\d+(\.\d+)?$/.test(t) && h.id && Number.isInteger(h.level) && typeof h.accuracy === 'number'), 'history keyed by time: {id, level, accuracy, timing}');
  assert.equal(history.find(([, h]) => h.id === 'gen-reading-2-1')[1].level, 2);
  assert.ok(events.some(e => e.type === 'piano-progress-changed'), 'account sync is told');
  assert.ok(events.some(e => e.type === 'piano-reading-level'));
  // placement pieces do not move the staircase
  const probe = R.ensure('gen-reading-5-30'); probe.placement = true;
  assert.equal(run('gen-reading-5-30', 100, 100), null);
});

test('next() offers an unseen piece, the same one until it is opened, at the reading level', () => {
  const storage = new Map(), { G: R, window } = load({ storage });
  R.setLevel(3.5);
  assert.equal(R.level(), 3.5);
  const a = R.next(); assert.equal(a.id, 'gen-reading-3-1'); assert.equal(a.kind, 'reading'); assert.equal(a.studyLevel, 3);
  assert.equal(window.PianoRepertoire[a.id], a);
  assert.equal(R.next().id, a.id, 'stable until it is opened');
  R.markSeen(a.id);
  assert.equal(R.next().id, 'gen-reading-3-2', 'an opened piece is not offered again');
  storage.set('journey-piano-skills-v1', JSON.stringify({ seen: ['gen-reading-3-2'] }));
  assert.equal(R.next(3).id, 'gen-reading-3-3', 'pieces seen through the skills page count');
  assert.equal(R.next(0).id, 'gen-reading-0-1'); assert.equal(R.next(9).id, 'gen-reading-7-1');
  assert.deepEqual(JSON.parse(storage.get('openpiano-reading-v1')).seen, ['gen-reading-3-1']);
});

test('the reading key syncs with the account', () => {
  assert.match(fs.readFileSync('site/piano-account.js', 'utf8'), /PROGRESS_KEYS = \[[^\]]*'openpiano-reading-v1'/);
});

test('placement: start from the answer, up after a clean reading, down after a miss, stop at the edge', () => {
  const d = Placement.decide;
  assert.deepEqual(plain(d('never')), { done: true, level: 0, reason: d('never').reason });
  assert.equal(d('some').next, 2); assert.equal(d('grade').next, 4);
  assert.equal(d('some', [{ level: 2, passed: true }]).next, 3);
  assert.equal(d('some', [{ level: 2, passed: false }]).next, 1);
  // passed 3, failed 4: start at 3
  let r = d('some', [{ level: 2, passed: true }, { level: 3, passed: true }, { level: 4, passed: false }]);
  assert.equal(r.done, true); assert.equal(r.level, 3); assert.match(r.reason, /Level 3/);
  // failed 4, passed 3: start at 3 after two pieces
  r = d('grade', [{ level: 4, passed: false }, { level: 3, passed: true }]); assert.equal(r.level, 3);
  // four passes in a row: the highest passed
  r = d('some', [2, 3, 4, 5].map(level => ({ level, passed: true }))); assert.equal(r.done, true); assert.equal(r.level, 5);
  assert.equal(d('some', [2, 3, 4].map(level => ({ level, passed: true }))).next, 5, 'up to four pieces');
  // all misses: a step below the lowest miss, or Level 0 after missing it
  r = d('grade', [4, 3, 2, 1].map(level => ({ level, passed: false }))); assert.equal(r.level, 0);
  r = d('some', [{ level: 2, passed: false }, { level: 1, passed: false }, { level: 0, passed: false }]); assert.equal(r.done, true); assert.equal(r.level, 0);
  r = d('grade', [{ level: 4, passed: true }, { level: 5, passed: true }, { level: 6, passed: true }, { level: 7, passed: true }]); assert.equal(r.level, 7);
  assert.ok(d('grade', [{ level: 6, passed: true }, { level: 7, passed: true }]).done, 'passing Level 7 ends the check');
  // with no input: the answer alone, a careful step lower
  assert.equal(Placement.fallback('some').level, 1); assert.equal(Placement.fallback('grade').level, 3); assert.equal(Placement.fallback('never').level, 0);
  for (const a of ['never', 'some', 'grade']) assert.match(Placement.fallback(a).reason, /^[^.]+\.[^.]*$/, 'one sentence');
  // the reasons are single sentences
  assert.match(r.reason, /^[^.]*\.$/);
});
