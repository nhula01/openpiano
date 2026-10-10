// Original studies (scripts/build-piano-studies.py): Level 0 "First keys", key studies and first-reading
// miniatures. Every study is complete, engraved, matches its MIDI, carries no fingering, and keeps to the
// demands of its stage or level.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const E = require('../site/piano-engine.js');

const ctx = { window: { PianoRepertoire: {} } };
vm.runInNewContext(fs.readFileSync('site/piano-studies.js', 'utf8'), ctx);
const R = ctx.window.PianoRepertoire, studies = Object.values(R);
const data = id => JSON.parse(fs.readFileSync('site/' + R[id].dataURL.split('?')[0]));
const source = id => fs.readFileSync(`site/scores/${id}/original.ly`, 'utf8');
const PC = { c: 0, cis: 1, des: 1, d: 2, ees: 3, e: 4, f: 5, fis: 6, g: 7, aes: 8, a: 9, bes: 10, b: 11 };
const scale = (key, mode) => new Set((mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11]).map(x => (x + PC[key]) % 12));
const hand = (d, h) => d.notes.filter(n => n.hand === h);
const bars = d => d.totalBeats / d.beatsPerMeasure;
const near = (a, b) => Math.abs(a - b) < 1e-6;
// The highest right-hand note at each onset.
const topLine = d => { const m = new Map(); for (const n of hand(d, 'right')) { const k = n.beat.toFixed(4); if (!m.has(k) || m.get(k).midi < n.midi) m.set(k, n); } return [...m.values()].sort((a, b) => a.beat - b.beat); };
// Every note still sounding at the final moment.
const ending = d => d.notes.filter(n => near(n.beat + n.duration, d.totalBeats));

test('the manifest lists 20 Level 0 pieces, 24 key studies and 70 first-reading miniatures, all CC0', () => {
  assert.equal(studies.filter(s => s.kind === 'first').length, 20);
  assert.equal(studies.filter(s => s.kind === 'technique').length, 24);
  assert.equal(studies.filter(s => s.kind === 'reading').length, 70);
  for (let n = 1; n <= 20; n++) assert.equal(R[`first-${String(n).padStart(2, '0')}`].studyOrder, n);
  for (let l = 1; l <= 7; l++) for (let n = 1; n <= 10; n++) {
    const s = R[`reading-${l}-${n}`];
    assert.ok(s, `reading-${l}-${n}`); assert.equal(s.studyLevel, l); assert.equal(s.title, `First-reading miniature ${l}.${n}`);
  }
  for (const s of studies) {
    assert.match(s.attribution, /CC0 1\.0/); assert.ok(s.caption, s.id);
    assert.ok(Number.isInteger(s.studyLevel) && s.studyKey in PC && ['major', 'minor'].includes(s.studyMode), s.id);
    assert.match(s.timeSignature, /^(2|3|4|6)\/(4|8)$/, s.id);
    for (const f of ['original.ly', 'original.pdf', 'practice.ly', 'practice.midi', 'practice.json', 'README.md', 'original/page-1.jpg']) assert.ok(fs.existsSync(`site/scores/${s.id}/${f}`), `${s.id}/${f}`);
  }
});

test('every original study is complete, engraved note for note and matches its MIDI', () => {
  for (const s of studies) {
    const d = data(s.id), n = bars(d);
    assert.ok(Number.isInteger(n) && (s.kind === 'first' ? n >= 8 && n <= 16 : n === 8), `${s.id}: ${n} bars`);
    assert.ok(d.notes.every(x => x.midi >= 21 && x.midi <= 108 && x.hand));
    assert.ok(near(Math.max(...d.notes.map(x => x.beat + x.duration)), d.totalBeats), `${s.id}: the last note is held to the end`);
    if (s.kind !== 'first') assert.deepEqual([...new Set(d.notes.map(x => x.hand))].sort(), ['left', 'right'], s.id);
    const heads = new Set(d.engraving.pages.flatMap(p => p.notes.map(x => x.beat.toFixed(5) + ':' + x.midi)));
    const moving = new Set(d.engraving.systems.flatMap(p => [...p.svg.matchAll(/class="score-note"[^>]*data-midi="(\d+)"[^>]*data-beat="([^"]+)"/g)].map(m => Number(m[2]).toFixed(5) + ':' + m[1])));
    for (const x of d.notes) { const k = x.beat.toFixed(5) + ':' + x.midi; assert.ok(heads.has(k), s.id + ' page'); assert.ok(moving.has(k), s.id + ' scroll'); }
    const b = fs.readFileSync('site/' + s.midi), parsed = E.parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    assert.equal(parsed.endBeat, d.totalBeats, s.id); assert.equal(parsed.length, d.notes.length, s.id);
    const order = ns => ns.map(x => [x.midi, +x.beat.toFixed(6), +x.duration.toFixed(6)]).sort((a, c) => a[1] - c[1] || a[0] - c[0]);
    assert.deepEqual(order(parsed), order(d.notes), s.id);
    // Every page shows the whole page, not the last cut system.
    for (const p of d.engraving.pages) assert.match(p.svg, /viewBox="0\.0000 -0\.0000 /, s.id);
  }
});

test('no fingering anywhere: no numbers in any original source, practice data or engraving', () => {
  for (const s of studies) {
    const ly = source(s.id), d = data(s.id);
    assert.doesNotMatch(ly, /\\finger|\\rightHandFinger|-\s*\d/, s.id);
    assert.equal(d.sourceFingering, false, s.id);
    assert.ok(!JSON.stringify(d).includes('source-fingering'), s.id);
    assert.ok(d.notes.every(n => !('finger' in n) && !('fingers' in n)), s.id);
  }
});

test('Level 0 pieces add one demand at a time', () => {
  const first = n => `first-${String(n).padStart(2, '0')}`;
  for (let n = 1; n <= 20; n++) {
    const id = first(n), s = R[id], d = data(id), ly = source(id), tonic = PC[s.studyKey];
    assert.equal(s.studyLevel, 0); assert.equal(s.studyMode, 'major');
    assert.match(ly, new RegExp(`subtitle = "First keys · piece ${n} of 20"`));
    const tempo = +ly.match(/\\tempo "[^"]+" 4 = (\d+)/)[1]; assert.ok(tempo >= 72 && tempo <= 96, id); assert.equal(s.tempo, tempo);
    // Only the key's own notes: white keys in C, plus F-sharp in G and B-flat in F.
    assert.ok(d.notes.every(x => scale(s.studyKey, 'major').has(x.midi % 12)), id);
    // A clear ending: tonic in the bass of the final sound, a tonic-chord note on top.
    const end = ending(d), low = Math.min(...end.map(x => x.midi)), high = Math.max(...end.map(x => x.midi));
    assert.equal(low % 12, tonic, id); assert.ok([0, 4, 7].includes((high - tonic + 12) % 12), id);
    // Onsets at least a beat apart in each hand (staccato notes sound shorter in the MIDI).
    if (n <= 19) for (const h of ['left', 'right']) { const on = [...new Set(hand(d, h).map(x => +x.beat.toFixed(6)))].sort((a, b) => a - b); assert.ok(on.every((b, i) => !i || b - on[i - 1] >= 1 - 1e-6), `${id}: nothing faster than quarter notes before piece 20`); }
    if (n <= 8) {
      // One note at a time: no chords, and the hands never play together.
      const ns = [...d.notes].sort((a, b) => a.beat - b.beat);
      for (let i = 1; i < ns.length; i++) assert.ok(ns[i - 1].beat + ns[i - 1].duration <= ns[i].beat + 1e-6, `${id}: overlap at beat ${ns[i].beat}`);
      assert.equal(s.studyKey, 'c'); assert.equal(s.timeSignature, '4/4');
    }
    const hands = [...new Set(d.notes.map(x => x.hand))].sort().join();
    if (n <= 3 || n === 12) assert.equal(hands, 'right', id); else if (n <= 5) assert.equal(hands, 'left', id); else assert.equal(hands, 'left,right', id);
    if (n <= 3 || (n >= 6 && n <= 8)) assert.ok(hand(d, 'right').every(x => x.midi >= 60 && x.midi <= 67), `${id}: C position`);
    if ((n >= 4 && n <= 8)) assert.ok(hand(d, 'left').every(x => x.midi >= 48 && x.midi <= 55), `${id}: C position in the bass`);
    if (n <= 5) assert.ok(d.notes.every((x, i, a) => !i || Math.abs(x.midi - a[i - 1].midi) <= 2), `${id}: steps and repeats only`);
    if (n === 1) assert.ok(d.notes.every(x => x.duration <= 2), 'piece 1 has no whole notes');
    if (n >= 6 && n <= 8) assert.ok(/(^|\s)r[124.]*(?=\s)/.test(ly), `${id}: rests`);
    if (n >= 9 && n <= 11) {
      assert.ok(hand(d, 'left').every(x => x.duration >= 2), `${id}: held left-hand notes`);
      assert.ok(hand(d, 'left').some(l => hand(d, 'right').some(r => near(r.beat, l.beat))), `${id}: hands together`);
    }
    if (n === 9) assert.ok(hand(d, 'left').every(x => x.duration === 4), 'piece 9: whole notes in the left hand');
    if (n === 12 || n === 13) { assert.equal(s.studyKey, 'g'); assert.ok(hand(d, 'right').some(x => x.midi % 12 === 6), `${id}: F-sharp`); }
    if (n === 14 || n === 15) { assert.equal(s.timeSignature, '3/4'); for (const h of ['left', 'right']) assert.ok(hand(d, h).some(x => x.duration === 3), `${id}: dotted halves`); }
    if (n === 16) {
      assert.ok(hand(d, 'right').every(x => x.midi >= 60 && x.midi <= 67) && hand(d, 'left').every(x => x.midi >= 53 && x.midi <= 60), 'middle-C position');
      assert.ok(hand(d, 'right').some(x => x.midi === 60) && hand(d, 'left').some(x => x.midi === 60), 'both thumbs share middle C');
    }
    if (n === 17) { assert.equal(s.studyKey, 'f'); for (const h of ['left', 'right']) assert.ok(hand(d, h).some(x => x.midi % 12 === 10), `${id}: B-flat`); }
    if (n === 18) {
      assert.match(ly, /-\./); assert.match(ly, /\(/);
      const steps = topLine(d).slice(1).map((x, i, a) => Math.abs(x.midi - topLine(d)[i].midi));
      assert.ok(steps.includes(5) && steps.includes(7), 'fourths and fifths');
    }
    if (n === 19) {
      const lh = hand(d, 'left');
      assert.ok(lh.every(x => [tonic, (tonic + 7) % 12].includes(x.midi % 12)), 'I and V only');
      assert.ok(lh.some(a => lh.some(b => near(a.beat, b.beat) && b.midi - a.midi === 7)), 'open fifths');
    }
    if (n === 20) {
      const eighths = hand(d, 'right').filter(x => x.duration === .5);
      assert.ok(eighths.length >= 8);
      for (const x of eighths.filter(x => Number.isInteger(x.beat))) {
        const next = eighths.find(y => near(y.beat, x.beat + .5)); assert.ok(next && Math.abs(next.midi - x.midi) <= 2, `eighth pair at beat ${x.beat} moves by step`);
      }
    }
  }
});

test('the 24 key studies follow the usual teaching order of keys', () => {
  const level = { 2: ['c-major', 'g-major', 'f-major', 'a-minor', 'd-minor', 'e-minor'], 3: ['d-major', 'bes-major', 'b-minor', 'g-minor'], 4: ['a-major', 'ees-major', 'fis-minor', 'c-minor'], 5: ['e-major', 'aes-major', 'des-minor', 'f-minor'], 6: ['b-major', 'fis-major', 'des-major', 'aes-minor', 'ees-minor', 'bes-minor'] };
  const seen = [];
  for (const [l, ids] of Object.entries(level)) for (const k of ids) { assert.equal(R['key-' + k].studyLevel, +l, k); seen.push('key-' + k); }
  assert.deepEqual(seen.sort(), studies.filter(s => s.kind === 'technique').map(s => s.id).sort());
});

test('the 56 generated first-reading miniatures keep to their level', () => {
  const rules = {
    1: { keys: ['c-major'], meters: ['4/4'], rh: [60, 67], shortest: 1 },
    2: { keys: ['c-major', 'g-major', 'f-major'], meters: ['4/4', '3/4'], shortest: 1, position: true },
    3: { keys: ['g-major', 'f-major', 'e-minor', 'd-minor'], meters: ['4/4', '3/4', '2/4'], rh: [60, 79], shortest: .5, has: .5 },
    4: { keys: ['d-major', 'bes-major', 'b-minor', 'g-minor'], meters: ['4/4', '3/4', '6/8'], rh: [59, 81], shortest: .5, has: 1.5 },
    5: { keys: ['a-major', 'ees-major', 'fis-minor', 'c-minor'], meters: ['4/4', '3/4', '6/8', '2/4'], rh: [57, 84], shortest: .25, has: .25, ledger: true },
    6: { keys: ['ees-major', 'a-major', 'd-major', 'bes-major', 'fis-minor', 'c-minor', 'g-minor', 'b-minor'], meters: ['4/4', '3/4', '6/8'], rh: [57, 81], shortest: .25, dyads: true, chromatic: true },
    7: { keys: ['e-major', 'aes-major', 'cis-minor', 'f-minor'], meters: ['4/4', '3/4', '6/8'], rh: [55, 84], shortest: .25, triplets: true, wide: true },
  };
  for (let l = 1; l <= 7; l++) {
    const r = rules[l], meters = new Set();
    for (let n = 3; n <= 10; n++) {
      const id = `reading-${l}-${n}`, s = R[id], d = data(id), rh = hand(d, 'right'), lh = hand(d, 'left'), tonic = PC[s.studyKey];
      meters.add(s.timeSignature);
      assert.ok(r.keys.includes(`${s.studyKey}-${s.studyMode}`), `${id}: key ${s.studyKey} ${s.studyMode}`);
      assert.ok(r.meters.includes(s.timeSignature), id);
      assert.ok(d.notes.every(x => x.duration >= r.shortest - 1e-6), `${id}: nothing shorter than allowed`);
      if (r.has) assert.ok(rh.some(x => near(x.duration, r.has)), `${id}: shows the level's new rhythm`);
      if (r.rh) assert.ok(rh.every(x => x.midi >= r.rh[0] && x.midi <= r.rh[1]), `${id}: right-hand range`);
      // The right hand stays above the left hand.
      for (const x of rh) assert.ok(lh.filter(y => y.beat < x.beat + x.duration - 1e-6 && y.beat + y.duration > x.beat + 1e-6).every(y => y.midi < x.midi), `${id}: hands cross at beat ${x.beat}`);
      // Key: every note belongs to the key (major or harmonic minor), except level 6's chromatic neighbours.
      const outside = d.notes.filter(x => !scale(s.studyKey, s.studyMode).has(x.midi % 12));
      if (r.chromatic) { assert.ok(outside.length >= 1 && outside.length <= 6 && outside.every(x => x.hand === 'right' && x.duration <= 1.5), `${id}: chromatic neighbours`); }
      else assert.deepEqual(outside, [], id);
      // Ends on the tonic in both hands, approached by step.
      const top = topLine(d), last = top.at(-1);
      assert.equal(last.midi % 12, tonic, id); assert.ok(Math.abs(last.midi - top.at(-2).midi) <= 2, `${id}: final step`);
      assert.equal(Math.min(...ending(d).map(x => x.midi)) % 12, tonic, id);
      // No augmented or diminished melodic leaps and nothing wider than an octave.
      for (let i = 1; i < top.length; i++) { const step = Math.abs(top[i].midi - top[i - 1].midi); assert.ok(step !== 6 && step <= 12, `${id}: leap of ${step} at beat ${top[i].beat}`); }
      if (l === 1) assert.ok(lh.every(x => x.duration === 4), `${id}: whole notes in the left hand`);
      if (r.position) {
        assert.ok(rh.every(x => x.midi >= 60 + tonic && x.midi <= 67 + tonic), `${id}: five-finger position`);
        const lo = Math.min(...lh.map(x => x.midi)); assert.ok(lh.every(x => x.midi - lo <= 7), `${id}: left-hand position`);
        assert.ok(lh.length > bars(d), `${id}: the left hand moves`);
      }
      if (r.ledger) assert.ok(rh.some(x => x.midi >= 81 || x.midi <= 60), `${id}: ledger lines`);
      if (r.dyads) assert.ok(rh.filter(x => rh.some(y => y !== x && near(y.beat, x.beat))).length >= 6, `${id}: two-note textures`);
      if (r.triplets && s.timeSignature !== '6/8') assert.ok(rh.some(x => !Number.isInteger(+(x.beat * 4).toFixed(6))), `${id}: triplets`);
      if (r.wide) assert.ok(top.some((x, i) => i && Math.abs(x.midi - top[i - 1].midi) >= 8), `${id}: a wide leap`);
    }
    assert.deepEqual([...meters].sort(), [...r.meters].sort(), `level ${l} uses every planned meter`);
  }
});

test('the original fourteen miniatures keep their ids and music', () => {
  for (let l = 1; l <= 7; l++) for (const n of [1, 2]) assert.match(source(`reading-${l}-${n}`), /\\midi \{ \\tempo 4=60 \} \}/);
  assert.match(source('reading-1-1'), /c'2 d'2 \| d'2 e'2 \| e'2 d'2 \| d'2 c'2 \| c'2 e'2 \| e'2 f'2 \| f'2 e'2 \| c'1/);
});

test('the build is deterministic: regenerating every source reproduces the published LilyPond files', { timeout: 300000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studies-'));
  try {
    execFileSync('python3', ['scripts/build-piano-studies.py', '--sources-only', dir], { stdio: 'pipe' });
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.ly')).sort();
    assert.deepEqual(files.map(f => f.slice(0, -3)), studies.map(s => s.id).sort());
    for (const f of files) assert.equal(fs.readFileSync(path.join(dir, f), 'utf8'), source(f.slice(0, -3)), f);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
