'use strict';
// Play by chords (site/piano-chords.js): chord symbols, the A/B/C checker, voice leading, left-hand
// patterns, the lesson pass rule, progressions in twelve keys, the curriculum and the lead sheets.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');

function load({ repertoire = false } = {}) {
  const store = new Map();
  const w = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }, dispatchEvent() {}, Event: class { constructor(t) { this.type = t; } } };
  const c = { window: w, localStorage: w.localStorage, Event: w.Event, location: { hash: '' } };
  if (repertoire) w.PianoRepertoire = {};
  if (repertoire) for (const name of ['piano-library', 'piano-additions', 'piano-famous', 'piano-pdmx', 'piano-studies']) vm.runInNewContext(fs.readFileSync('site/' + name + '.js', 'utf8'), Object.assign(c, { window: w }));
  for (const name of ['piano-chords', 'piano-leadsheets']) vm.runInNewContext(fs.readFileSync('site/' + name + '.js', 'utf8'), c);
  return { C: w.PianoChords, w, store };
}
const sorted = a => Array.from(a).sort((x, y) => x - y);

test('chord symbols parse to the right notes, spelled from the root', () => {
  const { C } = load();
  assert.deepEqual(sorted(C.parse('C').pcs), [0, 4, 7]);
  assert.deepEqual(Array.from(C.parse('F#m7').tones, t => t.name), ['F#', 'A', 'C#', 'E']);
  assert.deepEqual(Array.from(C.parse('Ebmaj7').tones, t => t.name), ['Eb', 'G', 'Bb', 'D']);
  assert.deepEqual(Array.from(C.parse('Bdim').tones, t => t.name), ['B', 'D', 'F']);
  const g7 = C.parse('G7');
  assert.deepEqual(sorted(g7.required), [5, 7, 11], 'a seventh chord may leave out its fifth');
  assert.deepEqual(Array.from(g7.optional), [2]);
  const slash = C.parse('Bbmaj7/D');
  assert.equal(slash.bass, 2); assert.equal(slash.name, 'B♭maj7/D'); assert.equal(slash.kind, 'major-seventh');
  assert.equal(C.parse('Am/E').bass, 4);
  assert.equal(C.parse('C♯m').root, 1);
  for (const s of ['Gm6', 'Am7', 'Ddim', 'E7', 'Gsus4', 'D9', 'Cm7b5', 'Faug', 'C6', 'G5']) assert.ok(C.parse(s), s);
  assert.equal(C.parse('H7'), null); assert.equal(C.parse('Cxyz'), null);
});

test('stage A takes any voicing or inversion, with doublings; stage B wants the root at the bottom; stage C the exact shape', () => {
  const { C } = load();
  const ok = (notes, sym, stage, target) => C.check(notes, sym, stage, { target }).ok;
  assert.ok(ok([60, 64, 67], 'C', 'A'));
  assert.ok(ok([64, 67, 72], 'C', 'A'), 'first inversion');
  assert.ok(ok([55, 60, 64], 'C', 'A'), 'second inversion');
  assert.ok(ok([48, 55, 60, 64, 67, 72], 'C', 'A'), 'doublings and open spacing');
  assert.ok(!ok([60, 64], 'C', 'A'), 'a missing fifth in a triad is a missing note');
  assert.match(C.check([60, 64], 'C', 'A').message, /Add G/);
  assert.ok(!ok([60, 63, 67], 'C', 'A'), 'E♭ is not in C major');
  assert.match(C.check([60, 64, 66, 67], 'C', 'A').message, /Leave out F♯/);
  assert.ok(ok([55, 59, 65], 'G7', 'A'), 'G7 without its fifth');
  assert.ok(ok([53, 59, 67], 'G7', 'A'), 'G7 as F–B–G');
  assert.ok(!ok([55, 59, 62], 'G7', 'A'), 'G7 needs its seventh');
  // stage B
  assert.ok(ok([48, 64, 67, 72], 'C', 'B'));
  assert.ok(!ok([52, 60, 67], 'C', 'B'));
  assert.match(C.check([52, 60, 67], 'C', 'B').message, /put C at the bottom/);
  assert.ok(ok([52, 60, 67], 'C/E', 'B'), 'a slash chord wants its bass at the bottom');
  assert.ok(ok([46, 62, 65, 69], 'Bbmaj7/D', 'A'));
  assert.ok(!ok([46, 62, 65, 69], 'Bbmaj7/D', 'B'));
  // stage C
  assert.ok(ok([60, 65, 69], 'F', 'C', [60, 65, 69]));
  assert.ok(!ok([65, 69, 72], 'F', 'C', [60, 65, 69]), 'right chord, other shape');
  assert.match(C.check([65, 69, 72], 'F', 'C', { target: [60, 65, 69] }).message, /exactly the shape shown: C F A/);
  // the microphone: pitch classes over a window, lenient
  assert.ok(C.checkHeard([0, 4], 'C').ok, 'root and third are enough');
  assert.ok(C.checkHeard([0, 4, 7, 2], 'C').ok, 'one stray note is forgiven');
  assert.ok(!C.checkHeard([0, 7], 'C').ok, 'no third: not yet');
  assert.ok(!C.checkHeard([0, 4, 1, 2], 'C').ok);
});

test('voice leading is scored against the smoothest possible path', () => {
  const { C } = load();
  assert.equal(C.movement([60, 64, 67], [60, 65, 69]), 3);
  assert.equal(C.movement([60, 64, 67], [59, 62, 67]), 3);
  assert.deepEqual(Array.from(C.nearestPath(['C', 'F', 'C', 'G', 'C']), a => Array.from(a)), [[60, 64, 67], [60, 65, 69], [60, 64, 67], [59, 62, 67], [60, 64, 67]]);
  const smooth = C.voiceLeading([[60, 64, 67], [60, 65, 69], [59, 62, 67]], ['C', 'F', 'G']);
  assert.equal(smooth.score, 100); assert.equal(smooth.moved, smooth.best);
  const jumpy = C.voiceLeading([[60, 64, 67], [65, 69, 72], [67, 71, 74]], ['C', 'F', 'G']);
  assert.equal(jumpy.moved, 21); assert.equal(jumpy.best, 9); assert.equal(jumpy.score, 43);
  assert.equal(C.bestMovement(['C', 'Am'], [60, 64, 67]), 2, 'C to Am: G moves up to A');
});

test('left-hand patterns are checked against the click, slot by slot', () => {
  const { C } = load();
  const steps = [{ beat: 0, beats: 4, symbol: 'C' }, { beat: 4, beats: 4, symbol: 'Am' }];
  // root–fifth at 60 BPM: C on 0 s, G on 2 s, A on 4 s, E on 6 s
  const ons = [{ midi: 36, time: 30 }, { midi: 43, time: 2040 }, { midi: 45, time: 3980 }, { midi: 52, time: 6010 }];
  const all = C.checkPattern(ons, steps, 'root-fifth', { bpm: 60, t0: 0 });
  assert.equal(all.slots, 4); assert.equal(all.pct, 100);
  const late = C.checkPattern([ons[0], { midi: 43, time: 2400 }, ons[2], ons[3]], steps, 'root-fifth', { bpm: 60, t0: 0 });
  assert.equal(late.pct, 75, 'a note 400 ms late misses its slot'); assert.equal(late.stray, 1);
  const wrong = C.checkPattern([ons[0], { midi: 44, time: 2000 }, ons[2], ons[3]], steps, 'root-fifth', { bpm: 60, t0: 0 });
  assert.equal(wrong.pct, 75, 'the wrong note does not count');
  // waltz: low root on 1, the chord (two or more chord tones together) on 2 and 3
  const waltz = C.checkPattern([{ midi: 41, time: 0 }, { midi: 57, time: 1000 }, { midi: 60, time: 1030 }, { midi: 57, time: 2000 }, { midi: 60, time: 2010 }], [{ beat: 0, beats: 3, symbol: 'F' }], 'waltz', { bpm: 60, t0: 0 });
  assert.equal(waltz.pct, 100);
  const single = C.checkPattern([{ midi: 41, time: 0 }, { midi: 57, time: 1000 }, { midi: 57, time: 2000 }], [{ beat: 0, beats: 3, symbol: 'F' }], 'waltz', { bpm: 60, t0: 0 });
  assert.equal(single.hits, 1, 'one note is not a chord');
  // Alberti: root, fifth, third, fifth in eighths; swung boogie offbeats land two-thirds through the beat
  const alberti = C.checkPattern([36, 43, 40, 43, 36, 43, 40, 43].map((midi, i) => ({ midi, time: i * 500 })), [{ beat: 0, beats: 4, symbol: 'C' }], 'alberti', { bpm: 60, t0: 0 });
  assert.equal(alberti.pct, 100);
  const boogie = C.checkPattern([36, 40, 43, 45, 46, 45, 43, 40].map((midi, i) => ({ midi, time: Math.floor(i / 2) * 1000 + (i % 2 ? 667 : 0) })), [{ beat: 0, beats: 4, symbol: 'C7' }], 'boogie', { bpm: 60, t0: 0 });
  assert.equal(boogie.pct, 100);
});

test('a lesson passes only in time, at its stage and tempo, with enough chords on time', () => {
  const { C } = load();
  const lesson = C.lesson('ch-1-7');
  assert.deepEqual({ ...lesson.pass }, { stage: 'B', bpm: 80, onTime: 90 });
  const play = (opts, lateAt = new Set()) => {
    const p = C.plan(lesson), s = C.session(p, opts), spb = 60000 / opts.bpm;
    const t0 = s.start(0);
    assert.equal(t0, 4 * spb, 'one bar counts in');
    p.steps.forEach((st, i) => {
      const at = t0 + st.beat * spb + (lateAt.has(i) ? 400 : 20);
      for (const n of st.target) s.input(n, true, at);
      s.tick(at + 100);
      for (const n of st.target) s.input(n, false, t0 + (st.beat + st.beats) * spb - 60);
    });
    s.tick(t0 + p.totalBeats * spb + 500);
    assert.ok(s.done);
    return s.result();
  };
  const good = play({ mode: 'time', stage: 'B', bpm: 80 });
  assert.equal(good.steps, 8); assert.equal(good.onTimePct, 100); assert.equal(good.passed, true);
  assert.equal(play({ mode: 'time', stage: 'B', bpm: 72 }).passed, false, 'too slow');
  assert.equal(play({ mode: 'time', stage: 'A', bpm: 80 }).passed, false, 'stage A is below the lesson’s stage B');
  const late = play({ mode: 'time', stage: 'B', bpm: 80 }, new Set([2]));
  assert.equal(late.correct, 8); assert.equal(late.onTimePct, 88); assert.equal(late.passed, false, '7 of 8 on time is under 90%');
  // the microphone checks stage A only, so a stage-B lesson cannot be passed with it
  const micRun = C.session(C.plan(lesson), { mode: 'time', stage: 'B', bpm: 80, input: 'microphone' });
  assert.equal(micRun.stage, 'A');
  // voice-leading and pattern rules
  assert.equal(C.passes(C.lesson('ch-1-2'), { mode: 'time', stage: 'C', bpm: 60, onTimePct: 100, vl: { score: 60 } }), false);
  assert.equal(C.passes(C.lesson('ch-1-2'), { mode: 'time', stage: 'C', bpm: 60, onTimePct: 100, vl: { score: 80 } }), true);
  assert.equal(C.passes(C.lesson('ch-3-4'), { mode: 'time', stage: 'A', bpm: 84, onTimePct: 0, pattern: { pct: 90 } }), true);
  assert.equal(C.passes(C.lesson('ch-3-4'), { mode: 'wait', stage: 'A', bpm: 84, onTimePct: 100, pattern: { pct: 90 } }), false, 'Wait mode never passes');
});

test('Wait mode moves on when the chord is right and counts first tries; repeated chords need a new note', () => {
  const { C } = load();
  const s = C.session(C.plan('ch-1-1'), { mode: 'wait', stage: 'A' });
  s.start(0);
  s.input(60, true, 1); s.input(64, true, 2); s.input(66, true, 3);
  assert.equal(s.index, 0); assert.match(s.last.message, /Leave out F♯/);
  s.input(66, false, 4); assert.equal(s.index, 0, 'lifting a key does not pass a chord already missed… until it is right');
  s.input(67, true, 5); assert.equal(s.index, 1);
  s.input(67, false, 6); s.input(64, false, 6);
  s.input(72, true, 60); assert.equal(s.index, 1, 'a note rolled into the chord just passed does not count for the next one');
  s.input(72, false, 70);
  s.input(65, true, 400); s.input(69, true, 401); assert.equal(s.index, 2, 'C stays down, F and A join: F major');
  const r = s.finish();
  assert.equal(r.correct, 2); assert.equal(r.firstTryPct, 13);
});

test('progressions are spelled correctly in all twelve keys', () => {
  const { C } = load();
  const letters = 'CDEFGAB';
  const deg = sym => letters.indexOf(sym[0]);
  for (const { key, chords } of C.allKeys(['I', 'IV', 'V7', 'vi', 'ii', 'iii', 'vii°'], 'C')) {
    const tonic = C.parse(key).root;
    assert.deepEqual(Array.from(chords, c => (C.parse(c).root - tonic + 12) % 12), [0, 5, 7, 9, 2, 4, 11], key);
    assert.deepEqual(Array.from(chords, c => C.parse(c).kind), ['major', 'major', 'dominant', 'minor', 'minor', 'minor', 'diminished']);
    assert.deepEqual(Array.from(chords, c => (deg(c) - deg(key) + 7) % 7), [0, 3, 4, 5, 1, 2, 6], key + ': one letter per degree');
    assert.ok(chords.every(c => !/##|bb/.test(c)), key);
  }
  assert.equal(C.allKeys(['I'], 'C').length, 12);
  assert.deepEqual(Array.from(C.inKey(['I', 'V', 'vi', 'IV'], 'Db')), ['Db', 'Ab', 'Bbm', 'Gb']);
  assert.deepEqual(Array.from(C.inKey(['I', 'V', 'vi', 'IV'], 'F#')), ['F#', 'C#', 'D#m', 'B']);
  assert.deepEqual(Array.from(C.inKey(['i', 'iv', 'V7', 'VI'], 'C#m')), ['C#m', 'F#m', 'G#7', 'A']);
  assert.deepEqual(Array.from(C.inKey(['I', 'VI7', 'II7', 'V7'], 'Eb')), ['Eb', 'C7', 'F7', 'Bb7']);
  for (const { key, chords } of C.allKeys(['i', 'iv', 'V7'], 'Am')) {
    const tonic = C.parse(key).root;
    assert.deepEqual(Array.from(chords, c => (C.parse(c).root - tonic + 12) % 12), [0, 5, 7], key);
    assert.equal(C.parse(chords[2]).kind, 'dominant', key + ': the minor key’s V7 is major');
  }
  // the all-twelve-keys lesson really visits every key
  const p = C.plan('ch-4-4');
  assert.equal(p.steps.length, 48);
  assert.equal(new Set(p.steps.filter((_, i) => i % 4 === 0).map(s => C.parse(s.symbol).root)).size, 12);
});

test('the chords curriculum: about 30 lessons over levels 1–5, each with a goal, pass rule and a reading task', () => {
  const { C } = load({ repertoire: true });
  assert.ok(C.LESSONS.length >= 28 && C.LESSONS.length <= 34, String(C.LESSONS.length));
  assert.equal(new Set(C.LESSONS.map(l => l.id)).size, C.LESSONS.length);
  const levels = new Set(C.LESSONS.map(l => l.level));
  assert.deepEqual(sorted(levels), [1, 2, 3, 4, 5]);
  const patterns = new Set(C.LESSONS.map(l => l.pattern).filter(Boolean));
  for (const p of ['block', 'root-fifth', 'broken', 'waltz', 'arpeggio', 'alberti', 'ballad', 'boogie', 'stride']) assert.ok(patterns.has(p), p);
  for (const l of C.LESSONS) {
    assert.ok(l.goal && l.title && l.pass.bpm >= 50, l.id);
    const p = C.plan(l);
    assert.ok(p.steps.length >= 4, l.id);
    for (const st of p.steps) {
      assert.ok(st.target.length >= 1, `${l.id}: a shape to show for ${st.symbol}`);
      if (!l.pattern || l.pattern === 'block') assert.ok(C.check(st.target, st.symbol, l.pass.stage, { target: st.target }).ok, `${l.id}: the shape shown for ${st.symbol} passes its own stage`);
    }
  }
  for (const level of [1, 2, 3, 4, 5]) {
    const task = C.readingTask(level);
    assert.ok(task && task.id.startsWith(`reading-${level}-`), `level ${level} reading task`);
  }
  assert.ok(C.lesson('ch-1-2').pass.stage === 'C' && C.LESSONS.some(l => l.pass.stage === 'B'));
});

test('lead sheets come only from verified public-domain library songs with chord symbols in their scores', () => {
  const { C, w } = load();
  const songs = w.PianoLeadSheets.songs;
  assert.ok(songs.length >= 6);
  for (const s of songs) {
    assert.ok(!/gershwin/.test(s.id), 'no Gershwin songs (lyricist copyright)');
    assert.ok(fs.existsSync(`site/scores/${s.id}/original.mxl`), s.id);
    assert.ok(s.why && s.attribution && s.fit >= 60, s.id);
    for (const [beat, sym] of s.chords) assert.ok(C.parse(sym) && beat >= 0 && beat < s.total, `${s.id}: ${sym}`);
    const p = C.songPlan(s);
    assert.ok(p.steps.every(st => st.target.length >= 2 && st.target.every(n => n < p.split)), `${s.id}: left-hand shapes below the melody`);
  }
  const script = fs.readFileSync('scripts/build-chord-leadsheets.py', 'utf8');
  assert.match(script, /fake book/);
});

test('route choice, attempts and the Today item', () => {
  const { C, w, store } = load({ repertoire: true });
  assert.equal(C.route(), 'reading');
  const plan = { level: 1, items: [{ kind: 'piece', id: 'first-01' }, { kind: 'reading', id: 'reading-1-1' }] };
  assert.equal(C.planItems(plan).length, 2, 'the reading route adds nothing');
  C.setRoute('chords');
  assert.equal(JSON.parse(store.get('my-journey-piano-pathway-v2')).route, 'chords');
  const items = C.planItems(plan);
  assert.equal(items[0].kind, 'chords'); assert.ok(items.some(i => i.kind === 'reading'), 'the chords route keeps the reading item');
  const item = C.todayItem(1);
  assert.equal(item.kind, 'chords'); assert.equal(item.label, 'Practise'); assert.equal(item.id, 'ch-1-1'); assert.equal(typeof item.action, 'function');
  w.PianoChords.open = id => { w.opened = id; }; item.action(); assert.equal(w.opened, 'ch-1-1');
  C.record('ch-1-1', { mode: 'time', stage: 'A', bpm: 60, input: 'keys', onTimePct: 100, correctPct: 100, passed: true });
  const saved = JSON.parse(store.get('openpiano-chords-v1'));
  const times = Object.keys(saved.lessons['ch-1-1'].a);
  assert.equal(times.length, 1); assert.ok(Number(times[0]) > 1.7e12, 'attempts are keyed by time');
  assert.equal(saved.lessons['ch-1-1'].a[times[0]].pass, 1);
  assert.ok(C.passed('ch-1-1')); assert.equal(C.nextLesson().id, 'ch-1-2'); assert.equal(C.todayItem(1).id, 'ch-1-2');
  assert.ok(fs.readFileSync('site/piano-account.js', 'utf8').includes("'openpiano-chords-v1'"), 'chord progress syncs with the account');
});

test('the player reports raw input from tap keys and MIDI even when no practice run is going', async () => {
  const { setup } = require('./practice-harness.cjs');
  const ui = setup();
  const seen = [];
  ui.api.on('input', d => { if (d?.midi != null) seen.push([d.midi, d.on, d.source]); });
  ui.api.noteOn(60); ui.api.noteOff(60);
  assert.deepEqual(seen, [[60, true, 'keys'], [60, false, 'keys']]);
  assert.equal(await ui.api.probeMidi(), '');
  ui.note(64); ui.note(64, false);
  assert.deepEqual(seen.slice(2), [[64, true, 'MIDI'], [64, false, 'MIDI']]);
  assert.equal(ui.api.index, 0, 'not practising');
});
