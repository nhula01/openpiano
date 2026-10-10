'use strict';
// Daily sight reading: a fresh, complete piece for every day and level, written in the browser.
// The same date and level always give the same piece (a seeded generator), so a learner can come back
// to today's piece, and "Another piece" gives as many more as they like. Each level of the learning
// path (docs/piano-learning-path.md, Levels 0-7 anchored to RCM grades) adds ingredients: keys,
// meters, rhythms, left-hand patterns (held notes, five-finger positions, triads, inversions, Alberti,
// bass-and-chord jumps, arpeggios, stride, octaves), scale runs, sevenths, secondary dominants, key
// changes and right-hand chords. A learner can switch ingredients on or off; the music is built from
// whatever is chosen. The melodic rules follow the first-reading generator in
// scripts/build-piano-studies.py: chord tones on strong beats and long notes, other notes reached and
// left by step, leaps that turn back, one high point, no parallel fifths or octaves onto a strong beat.
// Output is MusicXML, opened through the same import as a person's own songs (piano-score-import.js).
// The pieces carry no fingering numbers (AGENTS.md). They are original and dedicated to the public
// domain (CC0).
(() => {
const mod = (a, n) => ((a % n) + n) % n;

// ---------- seeded random numbers (FNV-1a hash of the seed text, then mulberry32) ----------
function makeRng(text) {
  let a = 2166136261 >>> 0;
  for (const ch of String(text)) { a ^= ch.codePointAt(0); a = Math.imul(a, 16777619) >>> 0; }
  const random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (items, weights) => {
    const w = weights || items.map(() => 1); let x = random() * w.reduce((s, v) => s + v, 0);
    for (let i = 0; i < items.length; i++) { x -= w[i]; if (x < 0) return items[i]; }
    return items[items.length - 1];
  };
  // a weighted random order (weighted sampling without replacement)
  const order = (items, weights) => items.map((it, i) => [weights[i] > 0 ? Math.pow(random(), 1 / weights[i]) : -1, it]).filter(p => p[0] >= 0).sort((p, q) => q[0] - p[0]).map(p => p[1]);
  return { random, pick, order, chance: p => random() < p };
}

// ---------- keys ----------
const LETTERS = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
// tonic letter, alteration, mode, key signature (fifths), first level
const KEY_LIST = [
  ['C', 0, 'major', 0, 0], ['G', 0, 'major', 1, 1], ['F', 0, 'major', -1, 1],
  ['A', 0, 'minor', 0, 2], ['D', 0, 'minor', -1, 2], ['E', 0, 'minor', 1, 2],
  ['D', 0, 'major', 2, 3], ['B', -1, 'major', -2, 3], ['B', 0, 'minor', 2, 3], ['G', 0, 'minor', -2, 3],
  ['A', 0, 'major', 3, 4], ['E', -1, 'major', -3, 4], ['F', 1, 'minor', 3, 4], ['C', 0, 'minor', -3, 4],
  ['E', 0, 'major', 4, 5], ['A', -1, 'major', -4, 5], ['C', 1, 'minor', 4, 5], ['F', 0, 'minor', -4, 5],
  ['B', 0, 'major', 5, 6], ['D', -1, 'major', -5, 6], ['G', 1, 'minor', 5, 6], ['B', -1, 'minor', -5, 6],
  ['F', 1, 'major', 6, 7], ['G', -1, 'major', -6, 7], ['D', 1, 'minor', 6, 7], ['E', -1, 'minor', -6, 7],
];
const ACC = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
function keyFrom(letter, pc, mode, fifths = null, level = null) {
  const off = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11]; // minor: harmonic, so V has its leading tone
  const alter = mod(pc - NAT[letter] + 6, 12) - 6;
  return {
    letter, pc, mode, off, fifths, level, name: LETTERS[letter] + ACC[alter] + ' ' + mode,
    rh: 60 + pc,                         // treble tonic, C4-B4
    lh: 40 + mod(pc - 4, 12),            // bass root register, E2-D#3
    lh5: pc <= 4 ? 48 + pc : 36 + pc,    // left-hand five-finger position, F2-E3
  };
}
const KEYS = KEY_LIST.map(([step, alter, mode, fifths, level]) => { const l = LETTERS.indexOf(step); return keyFrom(l, mod(NAT[l] + alter, 12), mode, fifths, level); });
const midiOf = (K, d, base) => base + 12 * Math.floor(d / 7) + K.off[mod(d, 7)];
const letterOf = (K, d) => mod(K.letter + d, 7);
// the key a contrasting phrase moves to: the dominant of a major key, the relative major of a minor key
const keyChange = K => K.mode === 'major' ? keyFrom(mod(K.letter + 4, 7), mod(K.pc + 7, 12), 'major') : keyFrom(mod(K.letter + 2, 7), mod(K.pc + 3, 12), 'major');

// ---------- chords ----------
// A chord is a root (scale degree of the local key) and a kind. Secondary dominants are altered so
// they are major triads or dominant sevenths on their root.
function makeChord(K, root, kind = 'triad') {
  const seventh = kind === '7' || kind === 'sec7', degs = [root, root + 2, root + 4].concat(seventh ? [root + 6] : []), alt = new Map();
  if (kind === 'sec' || kind === 'sec7') {
    const target = [0, 4, 7, 10], rootPc = K.off[mod(root, 7)];
    degs.forEach((d, i) => { if (!i) return; const have = mod(K.off[mod(d, 7)] - rootPc, 12), a = target[i] - have; if (a) alt.set(mod(d, 7), a); });
  }
  const RN = K.mode === 'major' ? ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] : ['i', 'ii°', 'III', 'iv', 'V', 'VI', 'vii°'];
  const label = kind === 'sec' ? 'V/' + RN[mod(root + 3, 7)] : kind === 'sec7' ? 'V7/' + RN[mod(root + 3, 7)] : RN[mod(root, 7)] + (seventh ? '7' : '');
  return { root, kind, seventh, tones: new Set(degs.map(d => mod(d, 7))), degs, alt, label };
}
const altOf = (chord, d) => chord.alt.get(mod(d, 7)) || 0;

// ---------- the ladder ----------
// Ingredients a learner can switch on or off. `level` is where the learning path brings each one in.
const FEATURES = [
  { id: 'together', level: 1, label: 'Hands together', help: 'Both hands play at once; before this the melody passes between the hands.' },
  { id: 'chords', level: 2, label: 'Left-hand triads', help: 'Blocked major and minor triads in root position.' },
  { id: 'eighths', level: 2, label: 'Eighth notes', help: 'Pairs and groups of eighth notes.' },
  { id: 'minor', level: 2, label: 'Minor keys', help: 'A, D and E minor first, with the raised leading note.' },
  { id: 'rests', level: 2, label: 'Rests', help: 'A breath at the end of a phrase.' },
  { id: 'expression', level: 2, label: 'Dynamics and articulation', help: 'Dynamics, slurs and staccato to read along with the notes.' },
  { id: 'dotted', level: 3, label: 'Dotted rhythms', help: 'Dotted quarter and eighth.' },
  { id: 'compound', level: 3, label: '6/8 time', help: 'Compound meter, felt in two; 9/8 and 12/8 from Level 6.' },
  { id: 'inversions', level: 3, label: 'Chord inversions', help: 'Left-hand chords move to the nearest inversion, blocked and broken.' },
  { id: 'runs', level: 3, label: 'Scale runs', help: 'A bar that runs up or down the scale.' },
  { id: 'sixteenths', level: 4, label: 'Sixteenth notes', help: 'Sixteenths moving by step.' },
  { id: 'alberti', level: 4, label: 'Alberti bass', help: 'Low–high–middle–high broken chords in eighths.' },
  { id: 'jumps', level: 4, label: 'Bass–chord jumps', help: 'A low bass note, then a chord higher up (oom-pah, waltz).' },
  { id: 'seventh', level: 4, label: 'Dominant sevenths', help: 'V7 before the cadence.' },
  { id: 'thirds', level: 4, label: 'Thirds and sixths', help: 'Two notes at once in the right hand.' },
  { id: 'ledger', level: 4, label: 'Ledger lines', help: 'Notes above and below the staff.' },
  { id: 'triplets', level: 5, label: 'Triplets', help: 'Three eighths in the time of two.' },
  { id: 'syncopation', level: 5, label: 'Syncopation', help: 'Eighth–quarter–eighth across the beat.' },
  { id: 'arpeggios', level: 5, label: 'Arpeggios', help: 'Left-hand arpeggios over an octave.' },
  { id: 'secondary', level: 5, label: 'Secondary dominants', help: 'V of V: the first sharps or naturals outside the key.' },
  { id: 'modulation', level: 5, label: 'Key change', help: 'The third phrase moves to the dominant (or relative major) and comes back.' },
  { id: 'rhChords', level: 5, label: 'Right-hand chords', help: 'Full chords under the melody on strong beats.' },
  { id: 'dottedSixteenth', level: 6, label: 'Dotted eighth–sixteenth', help: 'The sharper dotted rhythm.' },
  { id: 'chromatic', level: 6, label: 'Chromatic notes', help: 'Chromatic lower neighbours.' },
  { id: 'leaps', level: 6, label: 'Wide leaps', help: 'Sixths and octaves in the melody.' },
  { id: 'stride', level: 6, label: 'Stride', help: 'Low bass octave, then a chord in the middle: bigger jumps.' },
  { id: 'octaves', level: 7, label: 'Octaves', help: 'Octaves in both hands and wide arpeggios.' },
];
const FEATURE = Object.fromEntries(FEATURES.map(f => [f.id, f]));
const LEVELS = [
  { id: 0, name: 'First keys', bars: 8, tempo: 72, lo: 0, hi: 4, win: [60, 67], leap: 2, summary: 'C position, the melody passing between the hands.' },
  { id: 1, name: 'Five-finger positions', bars: 8, tempo: 76, lo: 0, hi: 4, win: [55, 79], leap: 3, summary: 'C, G and F positions, hands together over held notes, 3/4.' },
  { id: 2, name: 'Triads and minor keys', bars: 8, tempo: 80, lo: -2, hi: 8, win: [60, 79], leap: 4, summary: 'Keys to one sharp or flat, eighth notes, left-hand triads.' },
  { id: 3, name: 'Inversions and 6/8', bars: 8, tempo: 84, lo: -7, hi: 12, win: [59, 81], leap: 4, summary: 'Keys to two sharps or flats, dotted rhythms, inversions, scale runs.' },
  { id: 4, name: 'Sixteenths and Alberti', bars: 8, tempo: 88, lo: -7, hi: 12, win: [57, 86], leap: 5, summary: 'Three sharps or flats, sixteenths, Alberti bass, bass–chord jumps, V7.' },
  { id: 5, name: 'Key changes', bars: 16, tempo: 92, lo: -7, hi: 12, win: [57, 86], leap: 5, summary: 'Four sharps or flats, triplets, syncopation, V of V, a key change.' },
  { id: 6, name: 'Chromatic and stride', bars: 16, tempo: 96, lo: -9, hi: 14, win: [55, 89], leap: 5, summary: 'Five sharps or flats, 9/8 and 12/8, chromatic notes, wide leaps, stride.' },
  { id: 7, name: 'Concert reading', bars: 16, tempo: 100, lo: -9, hi: 14, win: [53, 91], leap: 5, summary: 'Every key, octaves, wide arpeggios, everything together.' },
];
const defaultFeatures = level => FEATURES.filter(f => f.level <= level).map(f => f.id);
// which sight-reading level goes with each repertoire level: reading runs a little behind repertoire
// (the same rule as READING in piano-path.js)
const FOR_REPERTOIRE = { 0: 0, 1: 1, 2: 2, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6 };

// ---------- rhythm cells (durations in twelfths of a quarter note; negative = rest) ----------
const SIMPLE = {
  q: { d: [12], s: 1, w: 4 }, h: { d: [24], s: 2, w: 2.2, long: 1 }, dh: { d: [36], s: 3, w: .6, long: 1 }, w: { d: [48], s: 4, w: .4, long: 1 },
  ee: { d: [6, 6], s: 1, w: 3, f: 'eighths' }, dqe: { d: [18, 6], s: 2, w: 2.2, f: 'dotted' },
  ssss: { d: [3, 3, 3, 3], s: 1, w: .7, f: 'sixteenths', busy: 1 }, ess: { d: [6, 3, 3], s: 1, w: 1.1, f: 'sixteenths', busy: 1 }, sse: { d: [3, 3, 6], s: 1, w: 1.1, f: 'sixteenths', busy: 1 },
  des: { d: [9, 3], s: 1, w: 1.4, f: 'dottedSixteenth', busy: 1 }, trip: { d: [4, 4, 4], s: 1, w: 1.6, f: 'triplets', busy: 1, trip: 1 },
  eqe: { d: [6, 12, 6], s: 2, w: 1.3, f: 'syncopation' }, qr: { d: [-12], s: 1, w: 0, rest: 1 },
};
const COMPOUND = {
  dq: { d: [18], s: 1, w: 2 }, qe: { d: [12, 6], s: 1, w: 3 }, eee: { d: [6, 6, 6], s: 1, w: 2, f: 'eighths' }, dh: { d: [36], s: 2, w: .5, long: 1 },
  ssee: { d: [3, 3, 6, 6], s: 1, w: 1.3, f: 'sixteenths', busy: 1 }, s6: { d: [3, 3, 3, 3, 3, 3], s: 1, w: .5, f: 'sixteenths', busy: 1 },
  eq: { d: [6, 12], s: 1, w: .8, f: 'syncopation' }, dqr: { d: [-18], s: 1, w: 0, rest: 1 },
};
// meters: beats per bar, beat length, the time signature, first level, needed ingredient
const METERS = {
  '4/4': { beats: 4, u: 12, num: 4, den: 4, level: 0 }, '3/4': { beats: 3, u: 12, num: 3, den: 4, level: 1 }, '2/4': { beats: 2, u: 12, num: 2, den: 4, level: 2 },
  '6/8': { beats: 2, u: 18, num: 6, den: 8, level: 3, f: 'compound' }, '9/8': { beats: 3, u: 18, num: 9, den: 8, level: 6, f: 'compound' }, '12/8': { beats: 4, u: 18, num: 12, den: 8, level: 6, f: 'compound' },
};

function cellWeights(ctx, compound) {
  const cells = compound ? COMPOUND : SIMPLE, L = ctx.level, out = {};
  for (const [name, c] of Object.entries(cells)) {
    if (c.rest || (c.f && !ctx.has(c.f))) continue;
    let w = c.w;
    if (c.long) w *= Math.max(.35, 1 - .1 * L);
    if (name === 'q') w *= Math.max(.5, 1 - .06 * L);
    if (c.f) w *= Math.min(1.8, 1 + .15 * Math.max(0, L - FEATURE[c.f].level));
    out[name] = w;
  }
  if (L <= 1 && !compound) delete out.ee;
  return out;
}
function fits(M, cells, name, pos) {
  const c = cells[name], span = c.s;
  if (pos + span > M.beats) return false;
  if (span === 1) return true;
  if (M.u === 12 && (name === 'w' || name === 'dh')) return pos === 0;
  return M.beats === 4 ? pos % 2 === 0 : true;
}
function fill(rng, ctx, M, weights, beats, busyMax) {
  const cells = M.u === 18 ? COMPOUND : SIMPLE;
  for (let tries = 0; tries < 60; tries++) {
    const out = []; let pos = 0;
    while (pos < beats) {
      const opts = Object.keys(weights).filter(n => fits({ ...M, beats }, cells, n, pos));
      if (!opts.length) break;
      const c = rng.pick(opts, opts.map(o => weights[o])); out.push(c); pos += cells[c].s;
    }
    if (pos === beats && out.filter(c => cells[c].busy).length <= busyMax) return out;
  }
  return Array(beats).fill(M.u === 18 ? 'dq' : 'q');
}
// a bar's rhythm: 'normal', 'half' (end of an open phrase) or 'final' (end of a closed phrase)
function barRhythm(rng, ctx, M, kind) {
  const compound = M.u === 18, weights = cellWeights(ctx, compound), busyMax = ctx.level >= 7 ? 3 : 2;
  if (kind === 'normal') { delete weights.w; return fill(rng, ctx, M, weights, M.beats, busyMax); }
  let ends;
  if (compound) ends = kind === 'final' ? [['dh']] : [['dq'], ['dh']].concat(ctx.has('rests') ? [['dq', 'dqr']] : []);
  else if (M.beats === 4) ends = kind === 'final' ? [['w'], ['h']] : [['h']].concat(ctx.level <= 1 ? [['w']] : []).concat(ctx.has('rests') ? [['h', 'qr']] : []);
  else if (M.beats === 3) ends = kind === 'final' ? [['dh'], ['h']] : [['h']].concat(ctx.level <= 1 ? [['dh']] : []).concat(ctx.has('rests') ? [['h', 'qr']] : []);
  else ends = kind === 'final' ? [['h']] : [['h'], ['q']].concat(ctx.has('rests') ? [['q', 'qr']] : []);
  if (compound && kind === 'final' && M.beats === 3) ends = [['dh']];
  const end = rng.pick(ends, ends.map(e => e.includes('qr') || e.includes('dqr') ? 1.2 : 1)), cells = compound ? COMPOUND : SIMPLE;
  const span = end.reduce((s, c) => s + cells[c].s, 0), head = M.beats - span;
  const w = { ...weights }; delete w.w;
  return (head ? fill(rng, ctx, M, w, head, busyMax) : []).concat(end);
}
// a scale run: eighths (and sixteenths when they are in) moving one way by step, at most eight
// notes from the start of the bar; the rest of the bar has ordinary rhythm
function runRhythm(rng, ctx, M) {
  const compound = M.u === 18, cells = compound ? COMPOUND : SIMPLE, out = []; let notes = 0;
  for (let b = 0; b < M.beats; b++) {
    const c = compound ? (ctx.has('sixteenths') && rng.chance(.3) ? 'ssee' : 'eee') : (ctx.has('sixteenths') && rng.chance(.35) ? 'ssss' : 'ee');
    if (notes + cells[c].d.length > 8) break;
    out.push(c); notes += cells[c].d.length;
  }
  const runCells = out.length, rest = M.beats - runCells;
  if (rest) { const w = cellWeights(ctx, compound); delete w.w; for (const k of Object.keys(w)) if (cells[k].busy || cells[k].d.length > 1) delete w[k]; out.push(...fill(rng, ctx, M, w, rest, 0)); }
  return { cells: out, runCells };
}

// ---------- progressions (one chord per bar, degrees of the local key) ----------
const HC_BASIC = [[0, 3, 0, 4], [0, 4, 0, 4], [0, 0, 3, 4], [0, 3, 4, 4], [0, 0, 4, 4]];
const HC_MORE = [[0, 5, 3, 4], [0, 5, 1, 4], [0, 3, 1, 4], [0, 1, 0, 4]];
const PAC_BASIC = [[0, 3, 4, 0], [0, 0, 4, 0], [0, 4, 4, 0], [3, 0, 4, 0]];
const PAC_MORE = [[0, 5, 4, 0], [5, 3, 4, 0], [0, 1, 4, 0], [3, 1, 4, 0], [1, 4, 4, 0]];
const CONTRAST = [[3, 0, 3, 4], [5, 3, 1, 4], [3, 0, 5, 4], [5, 1, 4, 4], [3, 4, 0, 4]];
function progressions(ctx, K, cadence, contrast) {
  const minor = K.mode === 'minor', rich = ctx.level >= 2, ok = p => !(minor && p.includes(1));
  if (contrast) return CONTRAST.filter(ok);
  const list = cadence === 'HC' ? HC_BASIC.concat(rich ? HC_MORE : []) : PAC_BASIC.concat(rich ? PAC_MORE : []);
  return list.filter(ok);
}

// ---------- the left hand ----------
// Each pattern returns one bar of events { on, dur, notes: [{ midi, letter }] }.
const LH_PATTERNS = [
  { id: 'held', level: 1, label: 'held notes' },
  { id: 'root5', level: 1, label: 'five-finger bass' },
  { id: 'blocked', level: 2, f: 'chords', label: 'blocked triads' },
  { id: 'broken', level: 3, f: 'chords', label: 'broken chords' },
  { id: 'blockedInv', level: 3, f: 'inversions', label: 'blocked chords in inversions' },
  { id: 'brokenInv', level: 3, f: 'inversions', label: 'broken chords in inversions' },
  { id: 'chordal', level: 4, f: 'chords', label: 'bass and chord' },
  { id: 'alberti', level: 4, f: 'alberti', label: 'Alberti bass' },
  { id: 'jumps', level: 4, f: 'jumps', label: 'bass–chord jumps' },
  { id: 'arpeggio', level: 5, f: 'arpeggios', label: 'arpeggios' },
  { id: 'stride', level: 6, f: 'stride', label: 'stride' },
  { id: 'octaves', level: 7, f: 'octaves', label: 'bass octaves' },
  { id: 'arpeggioWide', level: 7, f: 'octaves', label: 'wide arpeggios' },
];
function patternPool(ctx) {
  // an ingredient switched on brings its pattern even below its usual level
  const pool = LH_PATTERNS.filter(p => !p.f ? p.level <= Math.max(1, ctx.level) || !ctx.has('chords') : p.f === 'chords' ? ctx.has('chords') && p.level <= Math.max(2, ctx.level) : ctx.has(p.f));
  // newest patterns more often; the five-finger patterns fade out once chords arrive
  return { list: pool, weights: pool.map(p => (p.level <= 1 ? (ctx.level >= 3 ? .1 : ctx.level === 2 ? .35 : 1) : 1) * (p.level >= ctx.level ? 4 : p.level === ctx.level - 1 ? 2 : 1)) };
}
const note = (K, chord, d, base) => ({ midi: midiOf(K, d, base) + altOf(chord, d), letter: letterOf(K, d) });
// the bass root degree, placed in E2-D#3 (or an octave lower for jumps, stride and octaves)
function bassRoot(K, root, low) { let r = root; while (midiOf(K, r, K.lh) > 51) r -= 7; while (midiOf(K, r, K.lh) < 40) r += 7; return low ? r - 7 : r; }
// the closest-position chord to the previous one: inversions come from voice leading
function voiced(K, chord, prev, lo, hi, centre, root = false) {
  const degs = chord.seventh ? [chord.root, chord.root + 2, chord.root + 6] : [chord.root, chord.root + 2, chord.root + 4], cands = [];
  for (let inv = 0; inv < 3; inv++) for (let oct = -3; oct <= 2; oct++) {
    const ds = degs.map((d, i) => d + (i < inv ? 7 : 0) + 7 * oct).sort((a, b) => a - b), ms = ds.map(d => midiOf(K, d, K.lh) + altOf(chord, d));
    if (ms[0] < lo || ms[2] > hi || ms[2] - ms[0] > 12) continue;
    const cost = (prev ? ms.reduce((s, m, i) => s + Math.abs(m - prev[i]), 0) : Math.abs(ms[1] - centre)) + (!prev ? inv * 8 : 0);
    cands.push({ cost, ds, ms, inv });
  }
  cands.sort((a, b) => a.cost - b.cost);
  // cadences and the last chord stand in root position whenever one fits the hand's range
  const best = (root && cands.find(c => !c.inv)) || cands[0];
  return { notes: best.ds.map(d => note(K, chord, d, K.lh)), midis: best.ms };
}
function lhBar(pattern, ctx, K, M, chord, kind, state) {
  const L = M.beats * M.u, u = M.u, compound = u === 18, ev = [], add = (on, dur, ds, base = K.lh) => ev.push({ on, dur, notes: ds.map(d => note(K, chord, d, base)) });
  const low = ['stride', 'octaves', 'arpeggioWide'].includes(pattern), R = bassRoot(K, chord.root, low), T = R + 2, F = R + 4, O = R + 7, S = R + 6;
  if (kind === 'final') {
    if (pattern === 'held' || pattern === 'root5') { const r = chord.root <= 4 ? chord.root : chord.root - 7; add(0, L, ctx.level >= 2 ? [r, r + 4] : [r], K.lh5); }
    else if (low) add(0, L, [R, O]);
    else if (ctx.level >= 3) { const v = voiced(K, chord, state.voicing, 43, 62, 52, true); ev.push({ on: 0, dur: L, notes: v.notes }); }
    else add(0, L, [R, F]);
    return ev;
  }
  const halves = M.beats % 2 === 0 && M.beats > 2 ? [0, L / 2] : [0];
  switch (pattern) {
    case 'held': { const tones = [0, 1, 2, 3, 4].filter(x => chord.tones.has(mod(x, 7))), a = tones.includes(chord.root) ? chord.root : tones[0]; add(0, L, [a], K.lh5); break; }
    case 'root5': {
      const tones = [0, 1, 2, 3, 4].filter(x => chord.tones.has(mod(x, 7))), a = chord.root <= 4 ? chord.root : tones[0], others = tones.filter(x => x !== a), c = others.includes(mod(chord.root + 4, 7)) ? mod(chord.root + 4, 7) : others[others.length - 1] ?? a;
      if (kind === 'penult' || kind === 'cadence') { add(0, L, [a], K.lh5); break; }
      if (compound) { const first = M.beats === 3 ? 2 * u : L / 2; add(0, first, [a], K.lh5); add(first, L - first, [c], K.lh5); }
      else if (M.beats === 4) { add(0, 24, [a], K.lh5); add(24, 24, [c], K.lh5); }
      else if (M.beats === 3) { add(0, 24, [a], K.lh5); add(24, 12, [c], K.lh5); }
      else { add(0, 12, [a], K.lh5); add(12, 12, [c], K.lh5); }
      break;
    }
    case 'blocked': { const ds = chord.seventh ? [R, T, S] : [R, T, F]; for (const on of halves) add(on, L / halves.length, ds); break; }
    case 'blockedInv': { const v = voiced(K, chord, state.voicing, 43, 62, 52, kind === 'cadence' || kind === 'penult'); state.voicing = v.midis; for (const on of halves) ev.push({ on, dur: L / halves.length, notes: v.notes }); break; }
    case 'broken': {
      if (compound) for (let b = 0; b < M.beats; b++) (b ? [F, T, F] : [R, F, T]).forEach((d, i) => add(b * u + i * 6, 6, [chord.seventh && d === F && b ? S : d]));
      else ({ 4: [R, F, T, F], 3: [R, T, F], 2: [R, F] })[M.beats].forEach((d, i) => add(i * 12, 12, [d]));
      break;
    }
    case 'brokenInv': {
      const v = voiced(K, chord, state.voicing, 43, 62, 52, kind === 'cadence' || kind === 'penult'); state.voicing = v.midis; const [a, b, c] = v.notes, push = (on, dur, n) => ev.push({ on, dur, notes: [n] });
      if (compound) for (let k = 0; k < M.beats; k++) (k ? [c, b, c] : [a, c, b]).forEach((n, i) => push(k * u + i * 6, 6, n));
      else [a, c, b, c].slice(0, M.beats).forEach((n, i) => push(i * 12, 12, n));
      break;
    }
    case 'chordal': {
      const top = chord.seventh ? [T, S] : [T, F];
      if (compound) for (let b = 0; b < M.beats; b++) add(b * u, u, b % 2 ? top : [R]);
      else if (M.beats === 4) { add(0, 24, [R]); add(24, 24, top); }
      else for (let b = 0; b < M.beats; b++) add(b * 12, 12, b ? top : [R]);
      break;
    }
    case 'alberti': {
      const seq = compound ? [R, F, T, F, T, F] : [R, chord.seventh ? S : F, T, chord.seventh ? S : F];
      for (let i = 0; i < L / 6; i++) add(i * 6, 6, [seq[i % seq.length]]);
      break;
    }
    case 'jumps': case 'stride': {
      const v = voiced(K, chord, state.voicing, 50, pattern === 'stride' ? 64 : 62, 56, kind === 'cadence' || kind === 'penult'); state.voicing = v.midis;
      for (let b = 0; b < M.beats; b++) {
        const bass = b === 0 || (M.beats === 4 && b === 2);
        // the bass alternates root and fifth (oom-pah); stride doubles it in octaves
        if (bass) { const fifth = midiOf(K, R + 4, K.lh) <= (pattern === 'stride' ? 45 : 50) ? R + 4 : R + 4 - 7, d = b === 0 ? R : midiOf(K, fifth, K.lh) >= 31 ? fifth : R; add(b * u, u, pattern === 'stride' ? [d, d + 7] : [d]); }
        else ev.push({ on: b * u, dur: u, notes: v.notes });
      }
      break;
    }
    case 'arpeggio': {
      const seq = compound ? [R, F, O, F, O, F] : [R, F, O, F];
      for (let i = 0; i < L / 6; i++) add(i * 6, 6, [seq[i % seq.length]]);
      break;
    }
    case 'octaves': {
      if (compound && M.beats === 3) add(0, L, [R, O]);
      else if (M.beats === 3) add(0, L, [R, O]);
      else { add(0, L / 2, [R, O]); add(L / 2, L / 2, [R + 4, R + 11]); }
      break;
    }
    case 'arpeggioWide': {
      const seq = compound ? [R, F, O, T + 7, O, F] : [R, F, O, T + 7, F + 7, T + 7, O, F];
      for (let i = 0; i < L / 6; i++) add(i * 6, 6, [seq[i % seq.length]]);
      break;
    }
  }
  return ev;
}

// ---------- the melody ----------
// Melodic intervals allowed for each diatonic distance (no augmented or diminished leaps, no sevenths).
const GOOD = { 0: [0], 1: [1, 2], 2: [3, 4], 3: [5], 4: [7], 5: [8, 9], 7: [12] };
function slotsOf(phrase, M, offsetBar) {
  const cells = M.u === 18 ? COMPOUND : SIMPLE, L = M.beats * M.u, out = [], rests = [];
  phrase.bars.forEach((bar, b) => {
    let pos = 0;
    bar.rhythm.forEach((c, ci) => {
      const run = !!bar.run && ci < bar.run;
      cells[c].d.forEach((d, j) => {
        const dur = Math.abs(d);
        if (d < 0) rests.push({ bar: offsetBar + b, on: pos, dur });
        else {
          const strong = M.u === 18 ? pos % 18 === 0 : M.beats === 4 ? pos % 24 === 0 : pos === 0;
          out.push({ bar: offsetBar + b, local: b, on: pos, dur, strong, trip: cells[c].trip ? j : null, cell: c, run, chord: bar.chord, key: phrase.key, hand: phrase.hand });
        }
        pos += dur;
      });
    });
  });
  for (const s of out) s.needct = (s.strong && !(s.run && s.on > 0)) || s.dur >= (M.u === 18 ? 18 : 24);
  return { slots: out, rests };
}

function solvePhrase(rng, ctx, ph, slots, prev, copy) {
  const K = ph.key, n = slots.length, res = new Array(n).fill(null), level = ctx.level, P = ph.range;
  const base = ph.hand === 'left' ? K.lh5 : K.rh, [wlo, whi] = ph.win;
  const pitch = (i, d) => midiOf(K, d, base) + altOf(slots[i].chord, d);
  const centre = ph.centre;
  let last = -1; for (let i = 0; i < n; i++) if (slots[i].local === 3) last = i;
  const ok = (i, d) => {
    const s = slots[i], ct = s.chord.tones.has(mod(d, 7)), m = pitch(i, d);
    if (s.needct && !ct) return false;
    if (i === last) {
      if (ph.cadence === 'HC' && (mod(d, 7) === 0 || !ct)) return false;     // half cadence: a chord tone of V
      if (ph.cadence === 'PAC' && mod(d, 7) !== 0) return false;               // full cadence: the tonic
    }
    const p = i ? res[i - 1] : null;
    if (p === null) {
      if (!prev) return mod(d, 7) === 0 || mod(d, 7) === 2 || mod(d, 7) === 4 ? ct : false;
      const step = Math.abs(m - prev.midi);
      if (![0, 1, 2, 3, 4, 5, 7, 8, 9, 12].includes(step)) return false;
      return ct;
    }
    const pm = pitch(i - 1, p), diff = d - p, ad = Math.abs(diff);
    if (!GOOD[ad] || !GOOD[ad].includes(Math.abs(m - pm))) return false;
    if (i === last && ph.cadence === 'PAC' && ad !== 1 && !(level === 0 && ad === 2)) return false;   // the tonic approached by step
    const ps = slots[i - 1];
    // no parallel octaves or fifths with the bass onto a strong beat
    if (s.strong && s.bass != null && ps.bass != null && s.bass !== ps.bass) {
      const a = mod(pm - ps.bass, 12), b = mod(m - s.bass, 12);
      if ((a === 0 || a === 7) && a === b && (m - pm) * (s.bass - ps.bass) > 0) return false;
    }
    if (diff === 0 && ((i >= 2 && res[i - 2] === p) || s.dur < 6 || ps.dur < 6 || ps.dur >= 24 || s.run)) return false;   // no restruck long notes, no repeated sixteenths
    if (i >= 3 && res[i - 3] === p && res[i - 2] === d && d !== p) return false;                         // no a-b-a-b wobble
    if (s.run && s.local === ps.local && ps.run) { if (ad !== 1) return false; if (i >= 2 && slots[i - 2].run && slots[i - 2].local === s.local && Math.sign(p - res[i - 2]) !== Math.sign(diff)) return false; return true; }
    if (!ct && ad !== 1) return false;                                     // passing or neighbour tone: approached by step
    if (!ps.chord.tones.has(mod(p, 7)) && !ps.run && ad !== 1) return false;   // ...and left by step
    if (s.trip !== null && s.trip > 0 && ad !== 1) return false;
    if ((s.dur < 6 || ps.dur < 6) && ad > 1) return false;                // sixteenths move by step
    if (s.dur <= 6 && ps.dur <= 6 && ad > (level >= 7 ? 3 : 2)) return false;
    if (i >= 2 && res[i - 2] !== null) {
      const q = p - res[i - 2];
      if (Math.abs(q) >= 3 && (diff * q > 0 || ad > 2)) return false;      // a leap turns back by step or third
    }
    if (i >= 6 && !slots.slice(i - 6, i + 1).some(x => x.run)) {
      const moves = []; for (let k = i - 5; k < i; k++) moves.push(res[k] - res[k - 1]); moves.push(diff);
      if (moves.every(x => x > 0) || moves.every(x => x < 0)) return false;   // at most five moves one way
    }
    return true;
  };
  const weights = (i, cands) => cands.map(d => {
    const s = slots[i], p = i ? res[i - 1] : null;
    if (p === null) return (mod(d, 7) === 0 || mod(d, 7) === 2 || mod(d, 7) === 4 ? 3 : 1) / (1 + ((pitch(i, d) - centre) / 7) ** 2);
    const ad = Math.abs(d - p);
    let x = { 0: level <= 1 ? 1 : .6, 1: 4, 2: 2.2, 3: 1.1, 4: .7, 5: .5, 7: .4 }[ad] || 0;
    if (ctx.has('leaps') && ad >= 3) x *= 2.2;
    const up = s.local === 1 || s.local === 2, down = s.local === 3;
    if ((d > p && up) || (d < p && down)) x *= 1.5;
    if (s.run && s.local === slots[i - 1].local) x *= 3;
    if (ctx.has('chromatic') && i >= 2 && res[i - 1] === res[i - 2] - 1 && d === res[i - 2]) x *= 4;
    return x / (1 + ((pitch(i, d) - centre) / 7) ** 2);
  });
  let nodes = 0;
  const leap = ctx.has('leaps') ? 7 : P.leap;
  const rec = i => {
    if (++nodes > 900) return false;
    if (i === n) return true;
    let cands;
    if (copy.has(i)) cands = [copy.get(i)];
    else {
      const p = i ? res[i - 1] : null, lo = p === null ? P.lo : Math.max(P.lo, p - leap), hi = p === null ? P.hi : Math.min(P.hi, p + leap), list = [];
      for (let d = lo; d <= hi; d++) { const m = pitch(i, d); if (m >= wlo && m <= whi && m > slots[i].lhmax) list.push(d); }
      cands = rng.order(list, weights(i, list));
    }
    for (const d of cands) if (ok(i, d)) { res[i] = d; if (rec(i + 1)) return true; }
    res[i] = null; return false;
  };
  if (!rec(0)) return null;
  return res.map((d, i) => ({ deg: d, midi: pitch(i, d), letter: letterOf(K, d) }));
}

// where a right-hand melody should sit on average
const rhCentre = (ctx, K) => ctx.level <= 2 ? K.rh + 5 : 71 + Math.min(4, ctx.level - 3) + (ctx.has('ledger') ? 1 : 0);

// ---------- one complete piece ----------
function settle(opts = {}) {
  const level = Math.max(0, Math.min(7, Number.isInteger(opts.level) ? opts.level : 0));
  const features = new Set((opts.features || defaultFeatures(level)).filter(f => FEATURE[f]));
  if (level === 0 && !opts.features) features.delete('together');
  return { level, features, has: f => features.has(f) };
}
// the frame of a piece, drawn once per seed: key, meter and left-hand patterns
function frame(rng, ctx) {
  // key: newest keys for this level more often; minor keys only with the minor ingredient
  const keys = KEYS.filter(k => k.level <= ctx.level && (k.mode === 'major' || ctx.has('minor')));
  const K = rng.pick(keys, keys.map(k => k.level === ctx.level ? 3 : k.level === ctx.level - 1 ? 2 : 1));
  const meters = Object.entries(METERS).filter(([, m]) => (m.f ? ctx.has(m.f) && (m.level <= ctx.level || m.level === 3) : m.level <= ctx.level)).map(([k]) => k);
  const meterName = rng.pick(meters, meters.map(m => METERS[m].u === 18 ? (m === '6/8' ? 1.4 : .7) : m === '4/4' ? 1.6 : m === '2/4' ? .7 : 1.2));
  const together = ctx.has('together'), phrases = LEVELS[ctx.level].bars / 4;
  const pool = together ? patternPool(ctx) : null;
  const pattern = together ? rng.pick(pool.list, pool.weights).id : null;
  const pattern3 = together && phrases === 4 && ctx.level >= 5 ? rng.pick(pool.list, pool.weights).id : pattern;
  return { K, meterName, M: METERS[meterName], pattern, pattern3 };
}
function plan(rng, ctx, info, fr) {
  const L = LEVELS[ctx.level], { K, meterName, M, pattern, pattern3 } = fr;
  const bars = L.bars, phrases = bars / 4, together = ctx.has('together');
  const modulate = ctx.has('modulation') && phrases === 4;
  // hands: Level 0 (or without hands together) passes the melody between the hands, phrase by phrase or two bars at a time
  const handPlan = together ? null : rng.pick([['right', 'left'], ['left', 'right']]);
  const swapTwo = !together && rng.chance(.4);
  const out = [];
  for (let p = 0; p < phrases; p++) {
    const contrast = phrases === 4 && p === 2, key = contrast && modulate ? keyChange(K) : K;
    const cadence = p === phrases - 1 || (phrases === 4 && p === 1) || (contrast && modulate) ? 'PAC' : 'HC';
    let prog = rng.pick(progressions(ctx, key, cadence, contrast && !modulate)).slice();
    if (p === 1 || p === 3) { const first = out[0].prog; if (rng.chance(.7) && cadence === 'PAC') prog = [first[0], first[1], 4, 0]; }
    const chords = prog.map(r => makeChord(key, r));
    if (ctx.has('seventh') && cadence === 'PAC' && rng.chance(.75)) chords[2] = makeChord(key, 4, '7');
    if (ctx.has('seventh') && cadence === 'HC' && rng.chance(.2)) chords[3] = makeChord(key, 4, '7');
    if (ctx.has('secondary')) {
      const at = [1, 2].filter(i => prog[i + 1] === 4 && prog[i] !== 4 && !(i === 1 && p % 2 === 1));
      if (at.length && rng.chance(.55)) { const i = rng.pick(at); chords[i] = makeChord(key, 1, ctx.has('seventh') && rng.chance(.4) ? 'sec7' : 'sec'); }
    }
    const hand = together ? 'right' : swapTwo ? null : handPlan[p % handPlan.length];
    out.push({ index: p, key, cadence, prog, chords, contrast, hand, pattern: contrast ? pattern3 : pattern });
  }
  if (ctx.has('secondary') && !out.some(ph => ph.chords.some(c => c.kind.startsWith('sec')))) {
    const ph = out.find(x => x.prog[2] === 4 && x.prog[1] !== 4) || out.find(x => x.prog[3] === 4 && x.prog[2] !== 4);
    if (ph) { const i = ph.prog[2] === 4 ? 1 : 2; ph.chords[i] = makeChord(ph.key, 1, 'sec'); }
  }
  info.K = K; info.meter = meterName; info.M = M; info.pattern = pattern; info.pattern3 = pattern3; info.modulate = modulate; info.swapTwo = swapTwo;
  return out;
}

function generate(opts = {}) {
  const ctx = settle(opts), Lv = LEVELS[ctx.level], seed = opts.seed || `${opts.date || 'any'}:${ctx.level}:${opts.variant || 1}:${[...ctx.features].sort().join(',')}`;
  const rng = makeRng(seed), found = [], want16 = LEVELS[ctx.level].bars > 8 ? 3 : 5;
  let relax = false, fr = frame(rng, ctx);
  for (let attempt = 0; attempt < 400 && found.length < want16; attempt++) {
    if (attempt === 200) relax = true;
    if (attempt % 60 === 59 && !found.length) fr = frame(rng, ctx);   // a frame that will not work: draw another
    const info = {}, phrases = plan(rng, ctx, info, fr), K = info.K, M = info.M, Lb = M.beats * M.u;
    const nBars = phrases.length * 4, lh = [], state = { voicing: null };
    // bars: chord, rhythm and runs
    const bars = [];
    phrases.forEach((ph, p) => ph.chords.forEach((chord, b) => bars.push({ phrase: p, chord, key: ph.key, kind: b === 3 ? (ph.cadence === 'PAC' ? 'final' : 'half') : 'normal' })));
    const parallel = rng.chance(.7);
    bars.forEach((bar, i) => {
      const copyFrom = parallel && (bar.phrase === 1 || bar.phrase === 3) && i % 4 < 2 && bars[i % 4].chord.root === bar.chord.root && bars[i % 4].chord.kind === bar.chord.kind && bars[i % 4].key === bar.key ? i % 4 : null;
      bar.copyFrom = copyFrom;
      if (copyFrom !== null) { bar.rhythm = bars[copyFrom].rhythm; bar.run = bars[copyFrom].run; return; }
      if (ctx.has('runs') && bar.kind === 'normal' && i % 4 !== 0 && rng.chance(.25)) { const r = runRhythm(rng, ctx, M); bar.rhythm = r.cells; bar.run = r.runCells; return; }
      bar.rhythm = i % 4 === 2 && rng.chance(.4) && bars[i - 2].copyFrom === null && !bars[i - 2].run ? bars[i - 2].rhythm : barRhythm(rng, ctx, M, bar.kind);
      bar.run = false;
    });
    if (ctx.has('runs') && !relax && !bars.some(b => b.run)) {
      const cand = bars.map((b, i) => i).filter(i => bars[i].kind === 'normal' && i % 4 !== 0 && bars[i].copyFrom === null);
      if (cand.length) { const i = rng.pick(cand), r = runRhythm(rng, ctx, M); bars[i].rhythm = r.cells; bars[i].run = r.runCells; }
    }
    const used = new Set(bars.flatMap(b => b.rhythm));
    const want = (f, cells) => !ctx.has(f) || relax || cells.some(c => used.has(c));
    if (!want('eighths', ['ee', 'eee', 'qe', 'ssee']) || !want('dotted', M.u === 18 ? ['dq'] : ['dqe']) || !want('sixteenths', ['ssss', 'ess', 'sse', 'ssee', 's6'])
      || (M.u === 12 && (!want('triplets', ['trip']) || !want('dottedSixteenth', ['des']) || !want('syncopation', ['eqe'])))) continue;
    // left hand
    if (phrases[0].hand === 'right' && ctx.has('together')) {
      bars.forEach((bar, i) => {
        const ph = phrases[bar.phrase], kind = i === nBars - 1 ? 'final' : i === nBars - 2 ? 'penult' : i % 4 === 3 ? 'cadence' : 'normal';
        if (bar.key !== (bars[i - 1] || bar).key) state.voicing = null;
        lh.push(lhBar(ph.pattern, ctx, bar.key, M, bar.chord, kind, state));
      });
    } else for (let i = 0; i < nBars; i++) lh.push([]);
    // the melody, phrase by phrase
    const melody = [], restsAll = [];
    let prev = null, failed = false;
    for (const ph of phrases) {
      const hands = ph.hand ? [ph.hand] : rng.chance(.5) ? ['right', 'left'] : ['left', 'right'];
      const segs = ph.hand ? [{ hand: ph.hand, bars: [0, 1, 2, 3] }] : [{ hand: hands[0], bars: [0, 1] }, { hand: hands[1], bars: [2, 3] }];
      for (const seg of segs) {
        const offset = ph.index * 4, sub = { key: ph.key, hand: seg.hand, bars: [0, 1, 2, 3].map(b => ({ ...bars[offset + b] })) };
        const { slots, rests } = slotsOf(sub, M, offset), mine = slots.filter(s => seg.bars.includes(s.local));
        for (const r of rests) if (seg.bars.includes(r.bar - offset)) restsAll.push({ ...r, hand: seg.hand });
        for (const s of mine) {
          const end = s.on + s.dur; s.lhmax = -1; s.bass = null;
          for (const e of lh[s.bar]) {
            if (e.on < end && e.on + e.dur > s.on) for (const x of e.notes) s.lhmax = Math.max(s.lhmax, x.midi);
            if (e.on <= s.on && e.on + e.dur > s.on) s.bass = Math.min(...e.notes.map(x => x.midi));
          }
        }
        const left = seg.hand === 'left';
        const range = left ? { lo: ctx.level === 0 ? 0 : -4, hi: ctx.level === 0 ? 4 : 7, leap: Lv.leap } : { lo: Lv.lo, hi: Lv.hi, leap: Lv.leap };
        const win = left ? (ctx.level === 0 ? [ph.key.lh5, ph.key.lh5 + 7] : [Math.max(36, ph.key.lh5 - 7), Math.min(62, ph.key.lh5 + 12)]) : ctx.level <= 1 ? [Math.max(Lv.win[0], ph.key.rh - 1), Math.min(Lv.win[1], ph.key.rh + 8)] : Lv.win;
        const centre = left ? ph.key.lh5 + 3 : rhCentre(ctx, ph.key);
        const segPh = { key: ph.key, hand: seg.hand, cadence: seg.bars.includes(3) ? ph.cadence : 'none', range, win, centre };
        // copies: bars restating the opening of the first phrase keep its notes
        const copy = new Map();
        mine.forEach((s, i) => { const from = bars[s.bar].copyFrom; if (from !== null && from !== undefined) { const src = melody.filter(x => x.slot.bar === from && x.slot.hand === s.hand); const j = mine.filter(x => x.bar === s.bar).indexOf(s); if (src[j]) copy.set(i, src[j].deg); } });
        const samePrev = prev && prev.hand === seg.hand && prev.key === ph.key ? prev : prev && prev.hand === seg.hand ? { midi: prev.midi } : null;
        let res = solvePhrase(rng, ctx, segPh, mine, samePrev, copy);
        if (!res && copy.size) { res = solvePhrase(rng, ctx, segPh, mine, samePrev, new Map()); if (res) for (const s of mine) bars[s.bar].copyFrom = null; }
        if (!res) { failed = true; break; }
        res.forEach((r, i) => melody.push({ ...r, slot: mine[i] }));
        const lastNote = res[res.length - 1];
        prev = { midi: lastNote.midi, hand: seg.hand, key: ph.key };
      }
      if (failed) break;
    }
    if (failed) continue;
    const rh = melody.filter(m => m.slot.hand === 'right');
    // requirements of the chosen ingredients
    if (!relax) {
      if (ctx.has('ledger') && !rh.some(m => m.midi >= 81 || m.midi <= 59)) continue;
      if (ctx.has('chromatic') && !melody.some((m, i) => i > 0 && i < melody.length - 1 && !m.slot.needct && m.slot.trip === null && !m.slot.run && melody[i + 1].deg === melody[i - 1].deg && m.deg === melody[i - 1].deg - 1 && melody[i - 1].midi - m.midi === 2 && melody[i - 1].slot.hand === m.slot.hand && melody[i + 1].slot.hand === m.slot.hand)) continue;
      if (ctx.has('leaps') && !melody.some((m, i) => i && melody[i - 1].slot.hand === m.slot.hand && Math.abs(m.midi - melody[i - 1].midi) >= 8)) continue;
    }
    // shape: smooth lines, one clear high point, variety, a compact range near the middle
    const degs = melody.map(m => m.midi);
    if (Math.max(...degs) - Math.min(...degs) < (ctx.level <= 1 ? 4 : 5)) continue;
    let cost = 0;
    for (let i = 1; i < melody.length; i++) {
      if (melody[i].slot.hand !== melody[i - 1].slot.hand) continue;
      const ad = Math.abs(melody[i].deg - melody[i - 1].deg) + (melody[i].slot.key !== melody[i - 1].slot.key ? 0 : 0);
      cost += ({ 0: .8, 1: 0, 2: .4, 3: 1.2, 4: 1.8, 5: 2.5, 7: 3 }[ad] ?? 3) * (ctx.has('leaps') && ad > 0 ? .6 : 1);
    }
    const top = Math.max(...rh.map(m => m.midi)), peaks = new Set(rh.filter(m => m.midi === top).map(m => m.slot.bar % 4));
    if (rh.length && peaks.size === 1 && [1, 2].includes([...peaks][0])) cost -= 2;
    if (new Set(degs).size < 5) cost += 3;
    for (const hand of ['right', 'left']) {
      const ms = melody.filter(m => m.slot.hand === hand).map(m => m.midi); if (!ms.length) continue;
      const span = Math.max(...ms) - Math.min(...ms), mean = ms.reduce((a, b) => a + b, 0) / ms.length;
      cost += 1.2 * Math.max(0, span - (ctx.level >= 5 ? 17 : 12));                     // a compact range
      cost += Math.abs(mean - (hand === 'right' ? rhCentre(ctx, K) : K.lh5 + 3)) / 1.5;   // near the middle of the register
    }
    cost += Math.max(0, melody.filter((m, i) => i && m.midi === melody[i - 1].midi).length - 2);
    // outer voices: no parallel octaves or fifths onto a strong beat
    if (lh.some(b => b.length)) {
      const topV = rh.map(m => [m.slot.bar * Lb + m.slot.on, m.slot.bar * Lb + m.slot.on + m.slot.dur, m.midi]);
      const bass = lh.flatMap((ev, b) => ev.map(e => [b * Lb + e.on, b * Lb + e.on + e.dur, Math.min(...e.notes.map(x => x.midi))]));
      const times = [...new Set(topV.map(x => x[0]).concat(bass.map(x => x[0])))].sort((a, b) => a - b);
      const at = (list, t) => (list.find(([a, e]) => a <= t && t < e) || [])[2];
      const outer = times.map(t => [at(topV, t), at(bass, t)]);
      let bad = false, par = 0;
      for (let i = 1; i < times.length; i++) {
        const [a, b] = outer[i - 1], [c, d] = outer[i];
        if (a == null || b == null || c == null || d == null) continue;
        if ([0, 7].includes(mod(a - b, 12)) && mod(a - b, 12) === mod(c - d, 12) && (c - a) * (d - b) > 0) { par++; if (times[i] % (M.u === 18 ? 18 : M.beats === 4 ? 24 : Lb) === 0) bad = true; }
      }
      if (bad) continue;
      cost += 2 * par;
    }
    found.push({ cost, attempt, phrases, bars, lh, melody, rests: restsAll, info, relaxed: relax });
  }
  if (!found.length) throw new Error('Could not write a piece with these ingredients. Try switching one off.');
  found.sort((a, b) => a.cost - b.cost || a.attempt - b.attempt);
  return finishPiece(rng, ctx, found[0], opts, seed);
}

// ---------- extra notes, expression and the written score ----------
function finishPiece(rng, ctx, best, opts, seed) {
  const { phrases, bars, lh, melody, rests, info } = best, K = info.K, M = info.M, Lb = M.beats * M.u, nBars = bars.length;
  const events = bars.map(() => ({ right: [], left: [] }));
  // right-hand extras under the melody: thirds/sixths, chords, octaves; chromatic lower neighbours
  const extras = melody.map(() => []);
  const lastIdx = melody.length - 1;
  melody.forEach((m, i) => {
    const s = m.slot, Kl = s.key, base = s.hand === 'left' ? Kl.lh5 : Kl.rh;
    if (s.hand !== 'right' || !ctx.has('together')) return;
    const below = (k) => { const d = m.deg - k; return { deg: d, midi: midiOf(Kl, d, base) + altOf(s.chord, d), letter: letterOf(Kl, d) }; };
    const fitsUnder = n => n.midi > s.lhmax && n.midi >= 52 && s.chord.tones.has(mod(n.deg, 7));
    const strongLong = s.strong && s.dur >= 12;
    const final = i === lastIdx || (s.local === 3 && s === melody.filter(x => x.slot.bar === s.bar && x.slot.hand === 'right').slice(-1)[0]?.slot);
    if (ctx.has('rhChords') && (final || (strongLong && rng.chance(.45)))) {
      const add = []; for (let k = 1; k <= 7 && add.length < 2; k++) { const n = below(k); if (fitsUnder(n) && (k !== 7 || !ctx.has('octaves'))) add.push(n); }
      if (add.length === 2) extras[i].push(...add);
    }
    if (ctx.has('octaves') && (final || (strongLong && rng.chance(.3)))) { const n = below(7); if (n.midi > s.lhmax && !extras[i].some(x => x.midi === n.midi)) extras[i].push(n); }
    if (!extras[i].length && ctx.has('thirds') && strongLong && rng.chance(.65)) for (const k of [2, 5]) { const n = below(k); if (fitsUnder(n)) { extras[i].push(n); break; } }
  });
  // copied bars keep the same extras
  melody.forEach((m, i) => { const from = bars[m.slot.bar].copyFrom; if (from == null) return; const src = melody.findIndex(x => x.slot.bar === from && x.slot.on === m.slot.on && x.slot.hand === m.slot.hand); if (src >= 0 && src < i && melody[src].midi === m.midi) extras[i] = extras[src].map(x => ({ ...x })); });
  if (ctx.has('chromatic')) {
    const sites = melody.map((m, i) => i).filter(i => i > 0 && i < lastIdx && !melody[i].slot.needct && melody[i].slot.trip === null && !melody[i].slot.run
      && melody[i - 1].slot.hand === melody[i].slot.hand && melody[i + 1].slot.hand === melody[i].slot.hand
      && melody[i + 1].deg === melody[i - 1].deg && melody[i].deg === melody[i - 1].deg - 1 && melody[i - 1].midi - melody[i].midi === 2 && !extras[i].length);
    for (const i of rng.order(sites, sites.map(() => 1)).slice(0, 3)) melody[i] = { ...melody[i], midi: melody[i].midi + 1, chromatic: true };
  }
  // expression: dynamics at the phrases, slurs over the phrases, staccato in some bars
  const expressive = ctx.has('expression');
  const staccatoBars = new Set(); if (expressive) bars.forEach((b, i) => { if (b.kind === 'normal' && !b.run && b.copyFrom == null && rng.chance(.22)) staccatoBars.add(i); });
  bars.forEach((b, i) => { if (b.copyFrom != null && staccatoBars.has(b.copyFrom)) staccatoBars.add(i); });
  const dyn0 = rng.pick(ctx.level >= 3 ? ['mf', 'p', 'f', 'mf'] : ['mf', 'p']);
  const dynAt = new Map(); dynAt.set(0, dyn0);
  if (expressive) phrases.forEach((ph, p) => { if (!p) return; if (rng.chance(.6)) { const opts = ['p', 'mf', 'f'].filter(d => d !== dynAt.get([...dynAt.keys()].pop())); dynAt.set(p * 4, rng.pick(opts)); } });
  // build the note events per bar and hand
  melody.forEach((m, i) => {
    const s = m.slot, list = events[s.bar][s.hand];
    list.push({ on: s.on, dur: s.dur, trip: s.trip, notes: [{ midi: m.midi, letter: m.letter }].concat(extras[i].map(x => ({ midi: x.midi, letter: x.letter }))).sort((a, b) => a.midi - b.midi),
      staccato: staccatoBars.has(s.bar) && s.dur <= 12 && s.local !== 3, melodyIndex: i });
  });
  for (const r of rests) events[r.bar][r.hand].push({ on: r.on, dur: r.dur, rest: true });
  lh.forEach((ev, b) => { for (const e of ev) events[b].left.push({ on: e.on, dur: e.dur, notes: e.notes.slice().sort((a, b) => a.midi - b.midi) }); });
  events.forEach(e => { e.right.sort((a, b) => a.on - b.on); e.left.sort((a, b) => a.on - b.on); });
  // slurs: over each run of legato notes in a hand, broken at rests, staccato bars and hand changes
  if (expressive) for (const hand of ['right', 'left']) {
    if (hand === 'left' && ctx.has('together')) continue;
    let run = [];
    const flush = () => { if (run.length >= 3) { run[0].slurStart = true; run[run.length - 1].slurStop = true; } run = []; };
    for (let b = 0; b < nBars; b++) {
      if (b % 4 === 0) flush();
      const list = events[b][hand];
      if (!list.length) { flush(); continue; }
      for (const e of list) { if (e.rest || e.staccato) { flush(); continue; } run.push(e); }
      if (b % 4 === 3) flush();
    }
    flush();
  }
  // ingredients actually present, for the learner
  const used = new Set(bars.flatMap(b => b.rhythm)), present = [];
  const mark = (id, yes) => { if (yes) present.push(id); };
  mark('together', ctx.has('together'));
  mark('eighths', ['ee', 'eee', 'qe', 'ssee'].some(c => used.has(c)));
  mark('dotted', used.has('dqe') || (M.u === 18 && used.has('dq')));
  mark('sixteenths', ['ssss', 'ess', 'sse', 'ssee', 's6'].some(c => used.has(c)));
  mark('triplets', used.has('trip')); mark('dottedSixteenth', used.has('des')); mark('syncopation', used.has('eqe') || used.has('eq'));
  mark('rests', rests.some(r => r.dur < Lb)); mark('expression', expressive); mark('compound', M.u === 18); mark('minor', K.mode === 'minor');
  mark('runs', bars.some(b => b.run)); mark('seventh', bars.some(b => b.chord.seventh && !b.chord.kind.startsWith('sec')) && ctx.has('together'));
  mark('secondary', bars.some(b => b.chord.kind.startsWith('sec')));
  mark('modulation', info.modulate); mark('thirds', extras.some((x, i) => x.length === 1 && [3, 4, 8, 9].includes(melody[i].midi - x[0].midi)));
  mark('rhChords', extras.some(x => x.length >= 2)); mark('chromatic', melody.some(m => m.chromatic));
  const rh = melody.filter(m => m.slot.hand === 'right');
  mark('ledger', rh.some(m => m.midi >= 81 || m.midi <= 59) || events.some(e => e.left.some(x => x.notes?.some(n => n.midi <= 40))));
  mark('leaps', melody.some((m, i) => i && melody[i - 1].slot.hand === m.slot.hand && Math.abs(m.midi - melody[i - 1].midi) >= 8));
  const patterns = [...new Set([info.pattern, info.pattern3].filter(Boolean))];
  for (const p of patterns) { const f = LH_PATTERNS.find(x => x.id === p)?.f; if (f && f !== 'chords') present.push(f); else if (f === 'chords') present.push('chords'); }
  if (patterns.some(p => p === 'blockedInv' || p === 'brokenInv')) present.push('inversions');
  const ingredients = [...new Set(present)].filter(id => FEATURE[id]);
  // title, tempo and the written score
  const Lv = LEVELS[ctx.level], tempo = M.u === 18 ? Math.round(Lv.tempo * .66 / 2) * 2 : Lv.tempo;
  const date = opts.date || '', variant = opts.variant || 1;
  const title = opts.title || `Sight reading · Level ${ctx.level}${date ? ' · ' + prettyDate(date) : ''}${variant > 1 ? ' · No. ' + variant : ''}`;
  const harmony = bars.map(b => b.chord.label);
  const piece = {
    seed, level: ctx.level, levelName: Lv.name, key: K.name, keyFifths: K.fifths, meter: info.meter, bars: nBars, tempo, tempoUnit: M.u === 18 ? 'dotted quarter' : 'quarter',
    patterns: patterns.map(p => LH_PATTERNS.find(x => x.id === p).label), handsTogether: ctx.has('together'),
    modulation: info.modulate ? phrases[2].key.name : null, harmony, ingredients, features: [...ctx.features], relaxed: best.relaxed, title, events,
  };
  piece.xml = musicXML(piece, K, M, dynAt, tempo);
  piece.noteCount = events.reduce((s, e) => s + e.right.concat(e.left).reduce((t, x) => t + (x.notes?.length || 0), 0), 0);
  return piece;
}
function prettyDate(iso) { const [y, m, d] = iso.split('-').map(Number); return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`; }

// ---------- MusicXML ----------
const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3];
const sigAlter = (fifths, letter) => fifths > 0 && SHARPS.slice(0, fifths).includes(letter) ? 1 : fifths < 0 && FLATS.slice(0, -fifths).includes(letter) ? -1 : 0;
function spell(midi, letter) {
  for (const o of [-1, 0, 1]) {
    const octave = Math.floor((midi - NAT[letter]) / 12) - 1 + o, alter = midi - (12 * (octave + 1) + NAT[letter]);
    if (alter >= -2 && alter <= 2) return { step: LETTERS[letter], alter, octave };
  }
  throw new Error('Cannot spell ' + midi);
}
const ACC_NAME = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };
function typeOf(dur, trip) {
  if (trip) return ['eighth', 0];
  return { 72: ['whole', 1], 48: ['whole', 0], 36: ['half', 1], 24: ['half', 0], 18: ['quarter', 1], 12: ['quarter', 0], 9: ['eighth', 1], 6: ['eighth', 0], 3: ['16th', 0] }[dur] || null;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function beams(list, M) {
  // beam eighths and shorter within each beat; sixteenths get a second beam (or a hook)
  const unit = M.u, groups = new Map();
  for (const e of list) { if (e.rest || e.dur >= 12) continue; const g = Math.floor(e.on / unit); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(e); }
  for (const g of groups.values()) {
    // split at rests inside the beat
    const runs = []; let cur = [];
    for (const e of g) { if (cur.length && cur[cur.length - 1].on + cur[cur.length - 1].dur !== e.on) { runs.push(cur); cur = []; } cur.push(e); }
    if (cur.length) runs.push(cur);
    for (const r of runs) {
      if (r.length < 2) continue;
      r.forEach((e, i) => {
        e.beam = [i === 0 ? 'begin' : i === r.length - 1 ? 'end' : 'continue'];
        if (e.dur === 3) {
          const p = r[i - 1]?.dur === 3, n = r[i + 1]?.dur === 3;
          e.beam.push(p && n ? 'continue' : p ? 'end' : n ? 'begin' : i === 0 ? 'forward hook' : 'backward hook');
        }
      });
    }
  }
}
function musicXML(piece, K, M, dynAt, tempo) {
  const Lb = M.beats * M.u, out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>', '<score-partwise version="4.0">',
    `<work><work-title>${esc(piece.title)}</work-title></work>`,
    `<identification><creator type="composer">OpenPiano</creator><rights>Original sight-reading piece written by OpenPiano · CC0 1.0</rights><encoding><software>OpenPiano daily sight reading</software></encoding></identification>`,
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>', '<part id="P1">');
  let slur = 0;
  piece.events.forEach((bar, b) => {
    out.push(`<measure number="${b + 1}">`);
    if (b === 0) {
      out.push(`<attributes><divisions>12</divisions><key><fifths>${K.fifths}</fifths><mode>${K.mode}</mode></key><time><beats>${M.num}</beats><beat-type>${M.den}</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>`);
      const word = tempo <= 60 && M.u === 18 ? 'Andante' : tempo <= 76 ? 'Andante' : tempo <= 92 ? 'Moderato' : 'Allegretto';
      out.push(`<direction placement="above"><direction-type><words font-weight="bold">${word}</words></direction-type><direction-type><metronome><beat-unit>quarter</beat-unit>${M.u === 18 ? '<beat-unit-dot/>' : ''}<per-minute>${tempo}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${M.u === 18 ? tempo * 1.5 : tempo}"/></direction>`);
    }
    for (const [hand, staff, voice] of [['right', 1, 1], ['left', 2, 5]]) {
      if (hand === 'left') out.push(`<backup><duration>${Lb}</duration></backup>`);
      const list = bar[hand], state = new Map();
      const dyn = dynAt.get(b);
      if (dyn && (hand === 'right' ? list.some(e => !e.rest) || !bar.left.some(e => !e.rest) : !bar.right.some(e => !e.rest))) out.push(`<direction placement="below"><direction-type><dynamics><${dyn}/></dynamics></direction-type><staff>${staff}</staff></direction>`);
      if (!list.length) { out.push(`<note><rest measure="yes"/><duration>${Lb}</duration><voice>${voice}</voice><staff>${staff}</staff></note>`); continue; }
      beams(list, M);
      let pos = 0;
      for (const e of list) {
        if (e.on > pos) { const gap = e.on - pos; out.push(restXML(gap, voice, staff)); }
        if (e.rest) { out.push(restXML(e.dur, voice, staff)); pos = e.on + e.dur; continue; }
        // a length with no single note value (a 9/8 bar) is written as tied notes
        const pieces = typeOf(e.dur, e.trip != null) ? [e.dur] : e.dur === 54 ? [36, 18] : null;
        if (!pieces) throw new Error('No note value for a length of ' + e.dur);
        pieces.forEach((len, part) => {
        const [type, dots] = typeOf(len, e.trip != null), tieStart = part < pieces.length - 1, tieStop = part > 0;
        e.notes.forEach((n, k) => {
          const p = spell(n.midi, n.letter), keyAlt = sigAlter(K.fifths, n.letter), id = p.step + p.octave, have = state.has(id) ? state.get(id) : keyAlt;
          let acc = ''; if (p.alter !== have) { acc = `<accidental>${ACC_NAME[p.alter]}</accidental>`; state.set(id, p.alter); }
          const parts = [k ? '<chord/>' : '', `<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>`, `<duration>${len}</duration>`, tieStop ? '<tie type="stop"/>' : '', tieStart ? '<tie type="start"/>' : '', `<voice>${voice}</voice>`, `<type>${type}</type>`, '<dot/>'.repeat(dots), tieStop ? '' : acc];
          if (e.trip !== null && e.trip !== undefined) parts.push('<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>');
          parts.push(`<staff>${staff}</staff>`);
          if (!k && e.beam && pieces.length === 1) e.beam.forEach((v, lvl) => parts.push(`<beam number="${lvl + 1}">${v}</beam>`));
          const nota = [];
          if (tieStop) nota.push('<tied type="stop"/>');
          if (tieStart) nota.push('<tied type="start"/>');
          if (!k && !tieStop) {
            if (e.trip === 0) nota.push('<tuplet type="start" bracket="no"/>');
            if (e.trip === 2) nota.push('<tuplet type="stop"/>');
            if (e.slurStart) { slur = 1; nota.push('<slur type="start" number="1" placement="above"/>'); }
            if (e.slurStop && slur) { slur = 0; nota.push('<slur type="stop" number="1"/>'); }
            if (e.staccato) nota.push('<articulations><staccato/></articulations>');
          }
          if (nota.length) parts.push(`<notations>${nota.join('')}</notations>`);
          out.push(`<note>${parts.join('')}</note>`);
        });
        });
        pos = e.on + e.dur;
      }
      if (pos < Lb) out.push(restXML(Lb - pos, voice, staff));
    }
    if (b === piece.events.length - 1) out.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    out.push('</measure>');
  });
  out.push('</part>', '</score-partwise>');
  return out.join('\n');
}
function restXML(dur, voice, staff) {
  const parts = [], sizes = [36, 24, 18, 12, 9, 6, 3]; let left = dur;
  while (left > 0) { const s = sizes.find(x => x <= left); if (!s) break; const [type, dots] = typeOf(s); parts.push(`<note><rest/><duration>${s}</duration><voice>${voice}</voice><type>${type}</type>${'<dot/>'.repeat(dots)}<staff>${staff}</staff></note>`); left -= s; }
  return parts.join('');
}

// ---------- in the app: today's ten pieces, settings, marks ----------
// Every day each level has a set of ten pieces, the same for everyone who reads that level with its
// own ingredients (a different mix of ingredients is a set of one's own). A piece is marked read after
// one complete run; Reset clears the marks on today's ten so they can be read again.
const SET_SIZE = 10, STORE = 'openpiano-sight-reading-v1', PASS_KEY = 'journey-note-passes-v1';
const read = k => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const changed = () => { try { window.dispatchEvent(new Event('piano-sightread-changed')); window.dispatchEvent(new Event('piano-progress-changed')); } catch {} };
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const publicDefaults = level => { const d = defaultFeatures(level); return level === 0 ? d.filter(f => f !== 'together') : d; };
function isDefault(level, features) { const d = publicDefaults(level); return !features || (features.length === d.length && d.every(f => features.includes(f))); }
const mixHash = features => makeRng([...features].sort().join(',')).random().toString(36).slice(2, 7);
function idFor(date, level, n, features) { return `sight-${date}-l${level}-${n}${isDefault(level, features) ? '' : '-' + mixHash(features)}`; }
const ID = /^sight-(\d{4}-\d\d-\d\d)-l([0-7])-(\d+)(?:-([a-z0-9]+))?$/;

// settings: a chosen level (null = follow my reading level) and a chosen ingredient mix for that level
function settings() {
  const s = read(STORE), level = Number.isInteger(s.level) ? s.level : null;
  return { level, features: Array.isArray(s.features) ? s.features.filter(f => FEATURE[f]) : null, featuresLevel: Number.isInteger(s.featuresLevel) ? s.featuresLevel : null };
}
function setSettings(change) { const s = read(STORE); Object.assign(s, change); write(STORE, s); changed(); }
// The level that follows the learner is their level on the learning path: the one chosen in "Start the
// path at" (or by Find your level), moved on as levels are finished. Choosing a new path level also
// drops a level picked in the Sight-reading panel, so the ten change to the new level at once.
const PATH_KEY = 'my-journey-piano-pathway-v2';
function followLevel(repertoireLevel) {
  let l = repertoireLevel; if (l == null) try { l = window.PianoPath?.learnerLevel?.(); } catch {}
  if (!Number.isFinite(l)) { const start = read(PATH_KEY).startLevel; l = Number.isInteger(start) ? start : 0; }
  return Math.max(0, Math.min(7, Math.floor(l)));
}
function syncPath() {
  const start = read(PATH_KEY).startLevel, s = read(STORE);
  if (!Number.isInteger(start) || s.pathStart === start) return;
  const first = s.pathStart === undefined; s.pathStart = start;
  if (!first) { delete s.level; delete s.features; delete s.featuresLevel; }
  write(STORE, s);
}
function levelFor(repertoireLevel) {
  syncPath();
  const chosen = settings().level;
  return chosen !== null ? chosen : followLevel(repertoireLevel);
}
function prune(s) { for (const k of ['marks']) { const keys = Object.keys(s[k] || {}).sort(); while (keys.length > 60) delete s[k][keys.shift()]; } }
const featuresFor = level => { const s = settings(); return s.features && s.featuresLevel === level ? s.features : null; };

// a piece of a set, registered in the player's score list; its music is written the first time it is asked for
const made = new Map();
function pieceOf(date, level, n, features) {
  const key = idFor(date, level, n, features);
  if (!made.has(key)) made.set(key, generate({ level, date, variant: n, features: features || undefined, title: `Today’s ten · Level ${level} · No. ${n}` }));
  return made.get(key);
}
function practice(piece) {
  const Lb = 48 * Number(piece.meter.split('/')[0]) / Number(piece.meter.split('/')[1]), notes = [];
  piece.events.forEach((bar, b) => { for (const hand of ['right', 'left']) for (const e of bar[hand]) if (!e.rest) for (const n of e.notes) notes.push({ midi: n.midi, beat: (b * Lb + e.on) / 12, duration: e.dur / 12, hand }); });
  notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  const total = piece.events.length * Lb / 12, meter = Lb / 12, sections = [];
  for (let start = 0; start < total; start += meter * 8) sections.push({ id: 'block-' + start, title: 'Practice block ' + (sections.length + 1), start, end: Math.min(total, start + meter * 8) });
  return { notes, totalBeats: total, beatsPerMeasure: meter, movements: [{ title: 'Movement 1', start: 0, end: total }], sections };
}
function ensure(id) {
  const m = ID.exec(id || ''); if (!m) return null;
  const R = window.PianoRepertoire || (window.PianoRepertoire = {});
  if (R[id]) return R[id];
  const [, date, lv, num, hash] = m, level = Number(lv), n = Number(num);
  const features = hash ? (read(STORE).mixes || {})[hash] : null;
  if (hash && !features) return null;   // a mix this browser has never used
  const tempo = window.PianoReadingGen?.TEMPO?.[level] ?? 56;
  const entry = {
    id, title: `Today’s ten · Level ${level} · No. ${n}`, composer: 'OpenPiano', kind: 'reading', studyLevel: level, generated: true, sightReading: true, tempo,
    caption: `Daily sight reading · ${prettyDate(date)} · Level ${level} · piece ${n} of ${SET_SIZE}${hash ? ' · your own ingredients' : ''}`,
    attribution: 'OpenPiano · original sight-reading piece · CC0 1.0', originalPages: 0, sourceFingering: false,
  };
  let music = null;
  const get = () => { if (!music) { const piece = pieceOf(date, level, n, features); music = { ...practice(piece), musicxml: piece.xml, piece }; } return music; };
  for (const name of ['notes', 'totalBeats', 'beatsPerMeasure', 'movements', 'sections', 'musicxml']) Object.defineProperty(entry, name, { enumerable: true, configurable: true,
    get() { return get()[name]; }, set(v) { Object.defineProperty(entry, name, { value: v, writable: true, enumerable: true, configurable: true }); } });
  Object.defineProperty(entry, 'timeSignature', { enumerable: true, configurable: true, get() { return get().piece.meter; } });
  // the engraving is drawn on first open, by the engraver the site uses for imported scores
  entry.prepare = async function () {
    if (this.engraving || !window.PianoScoreImport?.fromXML) return this;
    try { const drawn = await window.PianoScoreImport.fromXML(this.musicxml, { id, title: this.title }); if (drawn?.engraving && drawn.notes.length === this.notes.length) { this.engraving = drawn.engraving; this.notes = drawn.notes; } }
    catch (e) { console.warn('Sight-reading engraving unavailable:', e.message); }
    try { this.originalXMLURL = URL.createObjectURL(new Blob([this.musicxml], { type: 'application/vnd.recordare.musicxml+xml' })); } catch {}
    return this;
  };
  R[id] = entry;
  return entry;
}
// marks: the best complete run of each piece of a day
function mark(id) { const m = ID.exec(id || ''); return m ? (read(STORE).marks?.[m[1]] || {})[id] || null : null; }
function record(r) {
  if (!r || !ID.test(r.score || '') || !r.complete || r.loop) return null;
  const date = ID.exec(r.score)[1], s = read(STORE); s.marks = s.marks || {}; s.played = s.played || {};
  const day = s.marks[date] || (s.marks[date] = {}), old = day[r.score];
  const now = { accuracy: r.accuracy ?? 0, timing: r.timing ?? null, inTime: r.kind === 'play', at: r.time || Date.now() };
  if (!old || now.accuracy > old.accuracy || (now.inTime && !old.inTime)) day[r.score] = old ? { ...now, inTime: now.inTime || old.inTime } : now;
  s.played[date] = true; prune(s); write(STORE, s); changed();
  return day[r.score];
}
// today's set for a level (the learner's by default)
function daySet(opts = {}) {
  const date = opts.date || localDate(), level = Number.isInteger(opts.level) ? opts.level : levelFor(opts.repertoireLevel);
  const features = opts.features !== undefined ? opts.features : featuresFor(level);
  if (features && !isDefault(level, features)) { const s = read(STORE); s.mixes = s.mixes || {}; const h = mixHash(features); if (!s.mixes[h]) { s.mixes[h] = [...features]; write(STORE, s); } }
  const items = Array.from({ length: SET_SIZE }, (_, i) => { const id = idFor(date, level, i + 1, features); return { n: i + 1, id, mark: mark(id) }; });
  const done = items.filter(i => i.mark).length;
  return { date, level, name: LEVELS[level].name, summary: LEVELS[level].summary, features: features || publicDefaults(level), shared: isDefault(level, features), items, done, next: items.find(i => !i.mark) || null };
}
// Reset: clear the marks (and the player's saved passes) on today's ten, so they can be read again.
// The reading level and the day streak are kept.
function reset(opts = {}) {
  const set = daySet(opts), s = read(STORE), day = (s.marks || {})[set.date] || {};
  for (const it of set.items) delete day[it.id];
  write(STORE, s);
  const passes = read(PASS_KEY); let gone = false;
  for (const k of Object.keys(passes)) if (set.items.some(it => k.startsWith(it.id + ':'))) { delete passes[k]; gone = true; }
  if (gone) write(PASS_KEY, passes);
  changed();
  return daySet(opts);
}
// open one piece of today's set: a 30-second look-over, then one run In time (piano-reading-gen.js)
function open(opts = {}) {
  const set = daySet(opts), it = opts.n ? set.items[opts.n - 1] : set.next || set.items[0];
  ensure(it.id);
  window.dispatchEvent(new CustomEvent('piano-select-score', { detail: { id: it.id, reading: true } }));
  return { id: it.id, set };
}
// the Today item (piano-path.js): the next unread piece of today's ten
function todayItem(repertoireLevel) {
  const set = daySet({ repertoireLevel }), it = set.next || set.items[0];
  ensure(it.id);
  return { id: it.id, title: `Today’s ten · Level ${set.level} · No. ${it.n}`, label: set.next ? 'Read' : 'Again', done: !set.next, daily: true, readingLevel: set.level,
    note: set.next ? `${set.done} of ${SET_SIZE} read today. Look it over for 30 seconds, then play it once In time without stopping.` : `All ${SET_SIZE} read today. Reset them in Learn → Sight-reading to read them again, or come back tomorrow for ten new ones.` };
}
// days in a row with at least one piece read (a reset keeps the day)
function streak() {
  const played = read(STORE).played || {}; let n = 0; const d = new Date();
  if (!played[localDate(d)]) d.setDate(d.getDate() - 1);
  while (played[localDate(d)] && n < 3650) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---------- the panel in Learn → Sight-reading ----------
function mount() {
  const studio = typeof document !== 'undefined' && document.getElementById('reading-studio');
  if (!studio || studio.querySelector('.sight-daily')) return;
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const box = el('div', null, 'sight-daily'); box.id = 'sight-daily';
  const head = el('div', null, 'sight-head');
  head.append(el('p', 'DAILY SIGHT READING / TEN NEW PIECES EVERY DAY', 'eyebrow'), el('h3', 'Today’s ten'));
  const summary = el('p', null, 'muted');
  const controls = el('div', null, 'trainer-controls');
  const levelLabel = el('label', 'Level'), levelSel = el('select'); levelSel.id = 'sight-level';
  levelLabel.append(levelSel); controls.append(levelLabel);
  const status = el('p', null, 'sight-status'); status.setAttribute('aria-live', 'polite');
  const grid = el('ol', null, 'sight-set'); grid.id = 'sight-set';
  const buttons = el('div', null, 'actions');
  const readBtn = el('button', 'Read the next one'); readBtn.type = 'button'; readBtn.id = 'sight-read';
  const resetBtn = el('button', 'Reset today’s ten', 'secondary'); resetBtn.type = 'button'; resetBtn.id = 'sight-reset';
  buttons.append(readBtn, resetBtn);
  const shared = el('p', null, 'muted sight-shared');
  const mix = el('details', null, 'sight-mix'); mix.append(el('summary', 'Ingredients: make it easier or harder'));
  const chipsNow = el('div', null, 'sight-chips'), chipsNext = el('div', null, 'sight-chips');
  const resetMix = el('button', 'Back to this level’s ingredients', 'secondary small'); resetMix.type = 'button';
  mix.append(el('p', 'Switch an ingredient off to make the music easier, or add one from the next level as a challenge. A different mix gives you ten pieces of your own instead of the shared ten.', 'muted'),
    el('h4', 'In this level'), chipsNow, el('h4', 'Add a challenge'), chipsNext, resetMix);
  box.append(head, summary, controls, status, grid, buttons, shared, mix);
  const before = studio.querySelector('.trainer-controls');
  if (before) { studio.insertBefore(box, before); studio.insertBefore(el('h3', 'Or a fixed miniature', 'sight-or'), before); } else studio.append(box);

  // what each piece is (key, meter) is filled in a moment later, one piece at a time, so the page stays quick
  let fillToken = 0;
  function fill(set) {
    const token = ++fillToken, todo = set.items.filter(it => !grid.querySelector(`[data-id="${it.id}"] .sight-what`)?.textContent);
    const step = () => {
      if (token !== fillToken || !todo.length) return;
      const it = todo.shift(), entry = ensure(it.id), what = grid.querySelector(`[data-id="${it.id}"] .sight-what`);
      try { const p = entry && pieceOf(set.date, set.level, it.n, set.shared ? null : set.features); if (what && p) what.textContent = `${p.key} · ${p.meter}`; } catch {}
      setTimeout(step, 30);
    };
    setTimeout(step, 300);
  }
  function render() {
    const s = settings(), set = daySet(), auto = followLevel();
    levelSel.replaceChildren();
    const follow = el('option', `Follow my level (Level ${auto} · ${LEVELS[auto].name})`); follow.value = 'auto'; levelSel.append(follow);
    for (const L of LEVELS) { const o = el('option', `Level ${L.id} · ${L.name}`); o.value = String(L.id); levelSel.append(o); }
    levelSel.value = s.level === null ? 'auto' : String(s.level);
    summary.textContent = `Level ${set.level} · ${set.name}. ${set.summary}`;
    const n = streak();
    status.textContent = `${set.done} of ${SET_SIZE} read today` + (n ? ` · ${n} day${n === 1 ? '' : 's'} in a row` : '') + '.';
    grid.replaceChildren(...set.items.map(it => {
      const li = el('li'), b = el('button', null, 'sight-tile' + (it.mark ? ' read' : '')); b.type = 'button'; li.dataset.id = it.id;
      b.append(el('strong', 'No. ' + it.n), el('span', it.mark ? `✓ ${it.mark.accuracy}%${it.mark.inTime ? '' : ' · Wait'}` : 'Not read', 'sight-mark'), el('span', made.has(it.id) ? `${made.get(it.id).key} · ${made.get(it.id).meter}` : '', 'sight-what'));
      b.setAttribute('aria-label', `Piece ${it.n}${it.mark ? `, read, ${it.mark.accuracy} percent` : ', not read yet'}`);
      b.onclick = () => open({ n: it.n });
      li.append(b); return li;
    }));
    readBtn.textContent = set.next ? `Read No. ${set.next.n}` : 'All ten read';
    readBtn.disabled = !set.next;
    resetBtn.disabled = !set.done;
    shared.textContent = set.shared ? `Everyone reading Level ${set.level} today has the same ten. New ones tomorrow.` : 'Your own ten, from your ingredient mix. Go back to the level’s ingredients to read the shared ten.';
    const chip = (f, on) => {
      const label = el('label', null, 'sight-chip'), input = el('input'); input.type = 'checkbox'; input.checked = on; input.value = f.id;
      label.title = f.help; label.append(input, el('span', f.label));
      input.onchange = () => {
        const cur = new Set(daySet().features); input.checked ? cur.add(f.id) : cur.delete(f.id);
        setSettings({ level: set.level, features: [...cur], featuresLevel: set.level }); render();
      };
      return label;
    };
    const has = new Set(set.features), now = FEATURES.filter(f => f.level <= set.level), next = FEATURES.filter(f => f.level === set.level + 1);
    chipsNow.replaceChildren(...(now.length ? now.map(f => chip(f, has.has(f.id))) : [el('p', 'Level 0 keeps to C position, one hand at a time.', 'muted')]));
    chipsNext.replaceChildren(...(next.length ? next.map(f => chip(f, has.has(f.id))) : [el('p', 'Everything is already in.', 'muted')]));
    resetMix.hidden = set.shared;
    fill(set);
  }
  levelSel.onchange = () => { setSettings({ level: levelSel.value === 'auto' ? null : Number(levelSel.value), features: null, featuresLevel: null }); render(); };
  readBtn.onclick = () => open();
  resetBtn.onclick = () => { if (!confirm('Clear your marks on today’s ten so you can read them again? Your reading level stays as it is.')) return; reset(); render(); };
  resetMix.onclick = () => { setSettings({ features: null, featuresLevel: null }); render(); };
  // the learner's level is only known once the path and curriculum are in: render again then, and whenever the panel is shown
  for (const ev of ['piano-progress-changed', 'piano-sightread-changed', 'storage', 'load', 'hashchange']) window.addEventListener(ev, () => { if (!box.contains(document.activeElement)) render(); });
  render();
}

// Re-create a piece of a set when the player is asked for it (after a reload, or from a link). This script
// loads before the reading generator and the player, so the piece exists when they look.
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('piano-select-score', e => {
  ensure(typeof e.detail === 'string' ? e.detail : e.detail?.id);
});
function attach() {
  const P = typeof window !== 'undefined' && window.PianoPractice; if (!P || attach.done) return; attach.done = true;
  P.on('result', record);
}
if (typeof document !== 'undefined') { document.addEventListener('DOMContentLoaded', attach); window.addEventListener('load', attach); }

window.PianoSightReading = {
  LEVELS, FEATURES, KEYS: KEYS.map(k => ({ name: k.name, level: k.level, fifths: k.fifths, mode: k.mode })), METERS: Object.fromEntries(Object.entries(METERS).map(([k, m]) => [k, { level: m.level, feature: m.f || null }])),
  LH_PATTERNS: LH_PATTERNS.map(p => ({ ...p })), FOR_REPERTOIRE, SET_SIZE,
  defaultFeatures: publicDefaults,
  generate, daySet, todayItem, open, reset, record, ensure, mark, settings, setSettings, levelFor, followLevel, streak, idFor, localDate,
};
// after every deferred script has run, so the learning path (piano-path.js) is there to read
if (typeof document !== 'undefined') { if (document.readyState === 'complete') mount(); else document.addEventListener('DOMContentLoaded', mount); }
})();
