'use strict';
// First-reading pieces made in the browser: a fresh eight-bar piece for every reading session, so the
// pool never runs dry. The rules are a faithful port of the reading generator in
// scripts/build-piano-studies.py (the seeded reading-L-3…10 pieces): the same random numbers, keys,
// meters, rhythm cells, left-hand patterns, two four-bar phrases (a half cadence, then the tonic) and the
// same melodic rules. Level 0 is added here: right hand alone in C position, quarters and halves, steps
// and skips. No fingering numbers are ever generated. Original material, CC0.
//
//   PianoReadingGen.generate(level, seed)  a score the player can use, plus MusicXML for the engraving
//   PianoReadingGen.next(level)            registers an unseen piece in PianoRepertoire and returns it
//   PianoReadingGen.level()                the learner's reading level (0–7, in half steps)
//
// The reading staircase (key `openpiano-reading-v1`): the first complete In-time run of a reading piece
// with both hands at 90% notes and 75% timing moves the level up a whole step; a miss moves it down half a
// step. See docs/piano-learning-path.md.
(() => {
const KEY = 'openpiano-reading-v1', SKILL_KEY = 'journey-piano-skills-v1';
const mod = (a, n) => ((a % n) + n) % n;

// ---------- Random numbers: crc32 seed + mulberry32, as in the build script ----------
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); } return t; })();
function crc32(text) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < text.length; i++) c = CRC[(c ^ text.charCodeAt(i)) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
class Rng {
  constructor(text) { this.state = crc32(text); }
  random() {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  pick(items, weights) {
    weights = weights && weights.length ? weights : items.map(() => 1);
    let x = this.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x < 0) return items[i]; }
    return items[items.length - 1];
  }
  // A weighted shuffle: heavier items tend to come first.
  order(items, weights) {
    const keyed = [];
    items.forEach((item, i) => { if (weights[i] > 0) keyed.push([Math.pow(this.random(), 1 / weights[i]), item]); });
    return keyed.sort((a, b) => b[0] - a[0]).map(p => p[1]);
  }
}

// ---------- Keys: steps above the tonic (0 = tonic, 7 = octave); minor uses the harmonic minor ----------
const NAMES = { c: ['c', 'd', 'e', 'f', 'g', 'a', 'b'], g: ['g', 'a', 'b', 'c', 'd', 'e', 'fis'], d: ['d', 'e', 'fis', 'g', 'a', 'b', 'cis'], a: ['a', 'b', 'cis', 'd', 'e', 'fis', 'gis'],
  e: ['e', 'fis', 'gis', 'a', 'b', 'cis', 'dis'], b: ['b', 'cis', 'dis', 'e', 'fis', 'gis', 'ais'], fis: ['fis', 'gis', 'ais', 'b', 'cis', 'dis', 'eis'], des: ['des', 'ees', 'f', 'ges', 'aes', 'bes', 'c'],
  aes: ['aes', 'bes', 'c', 'des', 'ees', 'f', 'g'], ees: ['ees', 'f', 'g', 'aes', 'bes', 'c', 'd'], bes: ['bes', 'c', 'd', 'ees', 'f', 'g', 'a'], f: ['f', 'g', 'a', 'bes', 'c', 'd', 'e'] };
const MINOR = { c: ['c', 'd', 'ees', 'f', 'g', 'aes', 'b'], g: ['g', 'a', 'bes', 'c', 'd', 'ees', 'fis'], d: ['d', 'e', 'f', 'g', 'a', 'bes', 'cis'], a: ['a', 'b', 'c', 'd', 'e', 'f', 'gis'],
  e: ['e', 'fis', 'g', 'a', 'b', 'c', 'dis'], b: ['b', 'cis', 'd', 'e', 'fis', 'g', 'ais'], fis: ['fis', 'gis', 'a', 'b', 'cis', 'd', 'eis'], cis: ['cis', 'dis', 'e', 'fis', 'gis', 'a', 'bis'],
  f: ['f', 'g', 'aes', 'bes', 'c', 'des', 'e'] };
const PC = { c: 0, cis: 1, des: 1, d: 2, ees: 3, e: 4, f: 5, fis: 6, g: 7, aes: 8, a: 9, bes: 10, b: 11 };
const FIFTHS = { major: { c: 0, g: 1, d: 2, a: 3, e: 4, b: 5, fis: 6, f: -1, bes: -2, ees: -3, aes: -4, des: -5 }, minor: { a: 0, e: 1, b: 2, fis: 3, cis: 4, d: -1, g: -2, c: -3, f: -4 } };
const LABEL = n => n[0].toUpperCase() + n.slice(1).replace('is', '♯').replace('es', '♭');
class Key {
  constructor(key, mode) {
    this.key = key; this.mode = mode;
    this.names = mode === 'major' ? NAMES[key] : MINOR[key];
    this.off = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11];
    this.rh = 60 + PC[key];               // treble tonic C4–B4
    this.lh = 40 + mod(PC[key] - 4, 12);  // bass tonic E2–D♯3
  }
  midi(d, base, alt = 0) { return base + 12 * Math.floor(d / 7) + this.off[mod(d, 7)] + alt; }
  // MusicXML spelling of a step: letter, alteration and octave.
  spell(d, base, alt = 0) {
    let n = this.names[mod(d, 7)];
    if (alt === 1) n = n.endsWith('es') ? n.slice(0, -2) : n + 'is';
    const rest = n.slice(1), alter = (rest.match(/is/g) || []).length - (rest.match(/es/g) || []).length;
    return { step: n[0].toUpperCase(), alter, octave: Math.floor((this.midi(d, base, alt) - alter) / 12) - 1 };
  }
}

// ---------- Rhythm cells. Durations in ticks of a twelfth of a quarter (a sixteenth is 3, a triplet eighth 4) ----------
const SIMPLE = { q: [[12], 1], h: [[24], 2], dh: [[36], 3], w: [[48], 4], ee: [[6, 6], 1], dqe: [[18, 6], 2], ssss: [[3, 3, 3, 3], 1], ess: [[6, 3, 3], 1], sse: [[3, 3, 6], 1], des: [[9, 3], 1], trip: [[4, 4, 4], 1] };
const COMPOUND = { dq: [[18], 1], qe: [[12, 6], 1], eee: [[6, 6, 6], 1], dh: [[36], 2], ssee: [[3, 3, 6, 6], 1], eq: [[6, 12], 1] };
const BUSY = new Set(['ssss', 'ess', 'sse', 'des', 'trip', 'ssee']);
const METER = { '4/4': [4, 12], '3/4': [3, 12], '2/4': [2, 12], '6/8': [2, 18] };  // beats per bar, ticks per beat
const MAJOR_BASIC = [[0, 3, 0, 4, 0, 3, 4, 0], [0, 4, 0, 4, 0, 3, 4, 0], [0, 0, 3, 4, 0, 0, 4, 0], [0, 3, 4, 4, 0, 3, 4, 0], [0, 0, 4, 4, 0, 3, 4, 0]];
const MAJOR = MAJOR_BASIC.concat([[0, 5, 3, 4, 0, 5, 4, 0], [0, 0, 3, 4, 5, 3, 4, 0], [0, 5, 1, 4, 0, 3, 4, 0]]);
const MINOR_PROG = [[0, 3, 0, 4, 0, 3, 4, 0], [0, 5, 3, 4, 0, 5, 4, 0], [0, 0, 3, 4, 5, 3, 4, 0], [0, 4, 0, 4, 0, 3, 4, 0], [0, 3, 4, 4, 0, 3, 4, 0]];
const plan = (k, m, t, p) => ({ key: k, mode: m, meter: t, pattern: p });
const same = (p, n) => Array.from({ length: n }, () => p);
// Per level: plans (key, mode, meter, left-hand pattern), melodic range in steps around the tonic, the
// right hand's window in MIDI, the largest leap in steps, rhythm cells with weights, what each piece must show.
// Levels 1–7 are the build script's; Level 0 is new (right hand alone, C position, quarters and halves).
const LEVELS = {
  0: { plans: same(plan('c', 'major', '4/4', 'none'), 8), lo: 0, hi: 4, win: [55, 84], leap: 2, cells: { q: 4, h: 2.5 }, need: [] },
  1: { plans: same(plan('c', 'major', '4/4', 'whole'), 8), lo: 0, hi: 4, win: [55, 84], leap: 2, cells: { q: 4, h: 3, w: .4 }, need: [] },
  2: { plans: [plan('g', 'major', '4/4', 'root5'), plan('f', 'major', '3/4', 'root5'), plan('c', 'major', '3/4', 'root5'), plan('g', 'major', '3/4', 'root5'), plan('f', 'major', '4/4', 'root5'), plan('g', 'major', '4/4', 'root5'), plan('c', 'major', '4/4', 'root5'), plan('f', 'major', '3/4', 'root5')],
    lo: 0, hi: 4, win: [55, 84], leap: 3, cells: { q: 4, h: 2.2, dh: .5, w: .3 }, need: [] },
  3: { plans: [plan('g', 'major', '4/4', 'broken'), plan('e', 'minor', '3/4', 'broken'), plan('f', 'major', '2/4', 'broken'), plan('d', 'minor', '4/4', 'broken'), plan('g', 'major', '3/4', 'broken'), plan('f', 'major', '4/4', 'broken'), plan('e', 'minor', '4/4', 'broken'), plan('d', 'minor', '3/4', 'broken')],
    lo: -7, hi: 12, win: [60, 79], leap: 4, cells: { q: 3, h: 1.5, dh: .6, ee: 3.5 }, need: ['ee'] },
  4: { plans: [plan('d', 'major', '4/4', 'chordal'), plan('g', 'minor', '3/4', 'chordal'), plan('bes', 'major', '6/8', 'chordal'), plan('b', 'minor', '4/4', 'chordal'), plan('d', 'major', '6/8', 'chordal'), plan('bes', 'major', '3/4', 'chordal'), plan('g', 'minor', '4/4', 'chordal'), plan('b', 'minor', '6/8', 'chordal')],
    lo: -7, hi: 12, win: [59, 81], leap: 4, cells: { q: 3, h: 1.2, dh: .3, ee: 2, dqe: 3 }, cells8: { dq: 2, qe: 3, eee: 2, dh: .4 }, need: ['dqe'] },
  5: { plans: [plan('a', 'major', '4/4', 'alberti'), plan('c', 'minor', '3/4', 'alberti'), plan('ees', 'major', '6/8', 'alberti'), plan('fis', 'minor', '2/4', 'alberti'), plan('a', 'major', '3/4', 'alberti'), plan('ees', 'major', '4/4', 'alberti'), plan('c', 'minor', '6/8', 'alberti'), plan('fis', 'minor', '4/4', 'alberti')],
    lo: -7, hi: 12, win: [57, 84], leap: 5, cells: { q: 3, h: 1, ee: 2, dqe: 1, ssss: .8, ess: 1.4, sse: 1.4 }, cells8: { dq: 2, qe: 2, eee: 2, ssee: 1.6 }, need: ['sixteenths', 'ledger'] },
  6: { plans: [plan('ees', 'major', '4/4', 'alberti'), plan('fis', 'minor', '3/4', 'chordal'), plan('d', 'major', '6/8', 'chordal'), plan('c', 'minor', '4/4', 'chordal'), plan('a', 'major', '3/4', 'alberti'), plan('g', 'minor', '6/8', 'alberti'), plan('bes', 'major', '4/4', 'chordal'), plan('b', 'minor', '3/4', 'chordal')],
    lo: -7, hi: 12, win: [57, 81], leap: 5, cells: { q: 3, h: 1.5, ee: 2.5, dqe: 1, ess: .6, sse: .6, des: .6 }, cells8: { dq: 2.5, qe: 2.5, eee: 2, ssee: .5 }, need: ['dyads', 'chromatic'] },
  7: { plans: [plan('e', 'major', '4/4', 'arpeggio'), plan('f', 'minor', '3/4', 'arpeggio'), plan('aes', 'major', '6/8', 'arpeggio'), plan('cis', 'minor', '4/4', 'arpeggio'), plan('e', 'major', '3/4', 'arpeggio'), plan('aes', 'major', '4/4', 'arpeggio'), plan('f', 'minor', '6/8', 'arpeggio'), plan('cis', 'minor', '3/4', 'arpeggio')],
    lo: -7, hi: 12, win: [55, 84], leap: 7, cells: { q: 3, h: 1, ee: 2, dqe: 1, ess: .5, sse: .5, trip: 2.2 }, cells8: { dq: 2, qe: 2, eee: 2, ssee: .6, eq: .5 }, need: ['trip', 'wide'] },
};
// Reading tempo (quarter notes a minute): slow enough to read at sight without stopping.
const TEMPO = { 0: 60, 1: 60, 2: 56, 3: 54, 4: 52, 5: 50, 6: 48, 7: 46 };
// Melodic intervals allowed for each distance in steps (no augmented or diminished leaps, no sevenths).
const GOOD = { 0: [0], 1: [1, 2], 2: [3, 4], 3: [5], 4: [7], 5: [8, 9], 7: [12] };
const GOOD_MASK = [0, 1, 2, 3, 4, 5, 6, 7].map(k => (GOOD[k] || []).reduce((m, x) => m | (1 << x), 0));
const good = (steps, semitones) => steps < 8 && ((GOOD_MASK[steps] >> semitones) & 1) === 1;

function cellsFor(meter) { return meter === '6/8' ? COMPOUND : SIMPLE; }
function fits(meter, name, pos, beats) {
  const span = cellsFor(meter)[name][1];
  if (pos + span > beats) return false;
  if (span === 1) return true;
  if (name === 'w' || name === 'dh') return pos === 0;
  return meter === '4/4' ? pos % 2 === 0 : true;
}
function barFill(rng, meter, weights, beats) {
  for (let tries = 0; tries < 50; tries++) {
    const out = []; let pos = 0;
    while (pos < beats) {
      const opts = Object.keys(weights).filter(c => fits(meter, c, pos, beats));
      if (!opts.length) break;
      const c = rng.pick(opts, opts.map(o => weights[o])); out.push(c); pos += cellsFor(meter)[c][1];
    }
    if (pos === beats && out.filter(c => BUSY.has(c)).length <= 2) return out;
  }
  return Array.from({ length: beats }, () => meter !== '6/8' ? 'q' : 'dq');
}
// kind: 'normal', 'half' (end of the first phrase) or 'final'. A phrase ends on a held note.
function barRhythm(rng, P, meter, kind) {
  const beats = METER[meter][0], compound = meter === '6/8', weights = { ...(compound ? P.cells8 || {} : P.cells) };
  if (kind === 'normal') { delete weights.w; return barFill(rng, meter, weights, beats); }
  let ends;
  if (compound) ends = kind === 'final' ? ['dh'] : ['dq', 'dh'];
  else if (meter === '4/4') ends = 'w' in weights ? ['w', 'h'] : ['h'];
  else if (meter === '3/4') ends = 'dh' in weights ? ['dh', 'h'] : ['h'];
  else ends = kind === 'final' ? ['h'] : ['h', 'q'];
  const last = rng.pick(ends), span = cellsFor(meter)[last][1];
  return barFill(rng, meter, weights, beats - span).concat([last]);
}

// Left hand per bar: [onset, duration, [steps above the bass tonic]] in ticks.
function leftHand(pattern, K, prog, meter, finalRootFifth) {
  const [beats, unit] = METER[meter], L = beats * unit, bars = [];
  if (pattern === 'none') return prog.map(() => []);
  prog.forEach((r, b) => {
    // Five-finger patterns stay in the position on the bass tonic; the others put the root between E2 and D♯3.
    const R = pattern === 'whole' || pattern === 'root5' || K.midi(r, K.lh) <= 51 ? r : r - 7;
    const T = R + 2, F = R + 4, O = R + 7;
    if (b === 7) { bars.push([[0, L, finalRootFifth ? [R, F] : [R]]]); return; }
    let ev;
    if (pattern === 'whole') ev = [[0, L, [R]]];
    else if (pattern === 'root5') {
      // Five-finger position on the bass tonic: the root, then another chord tone in the position.
      const chord = [mod(r, 7), mod(r + 2, 7), mod(r + 4, 7)], tones = [0, 1, 2, 3, 4].filter(x => chord.includes(x % 7));
      const a = r <= 4 ? r : tones[0], others = tones.filter(x => x !== a), c = others.includes(mod(r + 4, 7)) ? mod(r + 4, 7) : others[others.length - 1];
      ev = b === 6 ? [[0, L, [a]]] : [[0, 24, [a]], [24, beats === 4 ? 24 : 12, [c]]];  // the dominant is held before the final bar
    } else if (pattern === 'broken') {
      ev = { '4/4': [R, F, T, F], '3/4': [R, T, F], '2/4': [R, F] }[meter].map((x, i) => [i * 12, 12, [x]]);
    } else if (pattern === 'chordal') {
      ev = { '4/4': [[0, 24, [R]], [24, 24, [T, F]]], '3/4': [[0, 12, [R]], [12, 12, [T, F]], [24, 12, [T, F]]], '2/4': [[0, 12, [R]], [12, 12, [T, F]]], '6/8': [[0, 18, [R]], [18, 18, [T, F]]] }[meter];
    } else if (pattern === 'alberti') {
      ev = { '4/4': [R, F, T, F, R, F, T, F], '3/4': [R, F, T, F, T, F], '2/4': [R, F, T, F], '6/8': [R, F, T, F, T, F] }[meter].map((x, i) => [i * 6, 6, [x]]);
    } else {  // arpeggio
      ev = { '4/4': [R, F, O, F, R, F, O, F], '3/4': [R, F, O, F, T, F], '6/8': [R, F, O, F, O, F] }[meter].map((x, i) => [i * 6, 6, [x]]);
    }
    bars.push(ev);
  });
  return bars;
}

// One piece from a level's rules, a plan and a seed text. Returns the music in steps and ticks.
function compose(level, pl, seedText, { enough = 12, budget = 600 } = {}) {
  const P = LEVELS[level], K = new Key(pl.key, pl.mode), rng = new Rng(seedText), meter = pl.meter;
  const [beats, unit] = METER[meter], L = beats * unit, compound = meter === '6/8', cells = cellsFor(meter), need = new Set(P.need);
  const templates = pl.mode === 'major' ? (level <= 2 ? MAJOR_BASIC : MAJOR) : MINOR_PROG;
  // MIDI pitch of each step, in an array (index d + 14 covers every step the rules reach)
  const [wlo, whi] = P.win, PITCH = [];
  for (let d = P.lo - 7; d < P.hi + 8; d++) PITCH[d + 14] = K.midi(d, K.rh);
  const pitch = d => PITCH[d + 14];
  const center = level <= 2 ? K.rh + 4 : (wlo + whi) / 2;
  const found = [];
  for (let attempt = 0; attempt < 400; attempt++) {
    const prog = rng.pick(templates), parallel = prog[4] === prog[0] && prog[5] === prog[1] && rng.random() < .7;
    const r1 = barRhythm(rng, P, meter, 'normal'), r2 = barRhythm(rng, P, meter, 'normal');
    const r3 = rng.random() < .5 ? r1 : barRhythm(rng, P, meter, 'normal'), r4 = barRhythm(rng, P, meter, 'half');
    let r5 = r1, r6 = r2;
    if (!parallel) { r5 = barRhythm(rng, P, meter, 'normal'); r6 = barRhythm(rng, P, meter, 'normal'); }
    const rhythm = [r1, r2, r3, r4, r5, r6, barRhythm(rng, P, meter, 'normal'), barRhythm(rng, P, meter, 'final')];
    const used = new Set(rhythm.flat());
    if (need.has('ee') && !used.has('ee')) continue;
    if (need.has('dqe') && !used.has(compound ? 'dq' : 'dqe')) continue;  // dotted quarters
    if (need.has('sixteenths') && !['ssss', 'ess', 'sse', 'ssee'].some(c => used.has(c))) continue;
    if (need.has('trip') && !compound && !used.has('trip')) continue;
    const lh = leftHand(pl.pattern, K, prog, meter, level >= 3);
    // Melody slots.
    const slots = [];
    rhythm.forEach((bar, b) => {
      let pos = 0;
      for (const c of bar) cells[c][0].forEach((dur, j) => {
        slots.push({ bar: b, on: pos, dur, strong: pos % (compound ? unit : meter === '4/4' ? 24 : L) === 0, trip: c === 'trip' ? j : null, cell: c });
        pos += dur;
      });
    });
    const n = slots.length, copy = new Map();
    if (parallel) {
      const first = [], later = [];
      slots.forEach((s, i) => { if (s.bar === 0 || s.bar === 1) first.push(i); if (s.bar === 4 || s.bar === 5) later.push(i); });
      later.forEach((i, k) => { if (k < first.length) copy.set(i, first[k]); });
    }
    for (const s of slots) {
      const chord = prog[s.bar]; s.chord = [chord % 7, (chord + 2) % 7, (chord + 4) % 7];
      s.mask = s.chord.reduce((m, x) => m | (1 << x), 0); s.up = [1, 2, 5, 6].includes(s.bar); s.down = s.bar === 3 || s.bar === 7;
      s.needct = s.strong || s.dur >= (compound ? 18 : 24);  // accents and long notes are chord tones
      const end = s.on + s.dur, under = lh[s.bar].filter(([on, dur]) => on < end && on + dur > s.on).flatMap(([, , xs]) => xs.map(x => K.midi(x, K.lh)));
      s.lhmax = under.length ? Math.max(...under) : -Infinity;
    }
    let last4 = 0; slots.forEach((s, i) => { if (s.bar === 3) last4 = i; });
    const res = new Array(n).fill(null); let nodes = 0;
    const ok = (i, d) => {
      const s = slots[i], dm = (d + 14) % 7, ct = ((s.mask >> dm) & 1) === 1;  // steps never go below -14
      if (s.needct && !ct) return false;
      if (i === 0) return dm === 0 || dm === 2 || dm === 4;
      const p = res[i - 1], diff = d - p, ad = Math.abs(diff), prev = slots[i - 1];
      if (!good(ad, Math.abs(pitch(d) - pitch(p)))) return false;
      if (level === 0 && ad > P.leap) return false;  // Level 0: steps and skips only, between the phrases too
      if (i === n - 1 && (dm !== 0 || ad !== 1)) return false;
      if (i === last4 && (dm === 0 || !ct)) return false;  // half cadence on a chord tone of V
      if (diff === 0 && ((i >= 2 && res[i - 2] === p) || s.dur < 6 || prev.dur < 6 || prev.dur >= 24)) return false;  // no restruck long notes or repeated sixteenths
      if (i >= 3 && res[i - 3] === p && res[i - 2] === d && d !== p) return false;  // no a-b-a-b wobble
      if (!ct && ad !== 1) return false;                           // passing or neighbour tone: approached by step
      if (!((prev.mask >> ((p + 14) % 7)) & 1) && ad !== 1) return false;  // ...and left by step
      if ((s.trip === 1 || s.trip === 2) && ad !== 1) return false;
      if ((s.dur < 6 || prev.dur < 6) && ad > 1) return false;      // sixteenths move by step
      if (s.dur <= 6 && prev.dur <= 6 && ad > (level >= 7 ? 3 : 2)) return false;
      if (i >= 2) { const q = res[i - 1] - res[i - 2]; if (Math.abs(q) >= 3 && (diff * q > 0 || ad > 2)) return false; }  // a leap turns back by step or third
      if (i >= 6) {
        let ups = diff > 0 ? 1 : 0, downs = diff < 0 ? 1 : 0;
        for (let j = i - 6; j < i - 1; j++) { const m = res[j + 1] - res[j]; if (m > 0) ups++; else if (m < 0) downs++; }
        if (ups === 6 || downs === 6) return false;  // at most five moves one way
      }
      return true;
    };
    const STEP_WEIGHT = [level <= 1 ? 1.0 : .6, 4, 2.2, 1.1, .7, .5, 0, .4];
    const weight = (i, d) => {
      const s = slots[i], p = i ? res[i - 1] : null;
      if (p === null) return d === 0 || d === 2 || d === 4 ? 3 : 1;
      const ad = Math.abs(d - p); let x = STEP_WEIGHT[ad] ?? 0;
      if (level >= 7 && ad >= 3) x *= 2.2;
      if ((d > p && s.up) || (d < p && s.down)) x *= 1.5;
      if (level === 6 && i >= 2 && res[i - 1] === res[i - 2] - 1 && d === res[i - 2]) x *= 4;
      const t = (pitch(d) - center) / 7;
      return x / (1 + t * t);  // stay near the middle of the range
    };
    // Depth-first search for a melody: the candidates for each note in a weighted random order.
    // (This is the build script's search; for speed, a candidate that breaks a rule is dropped before its
    // place in the order is worked out. It uses the same random numbers, so the music is the same.)
    const rec = i => {
      if (++nodes > budget) return false;
      if (i === n) return true;
      let cands;
      if (copy.has(i)) { const d = res[copy.get(i)]; cands = ok(i, d) ? [d] : []; }
      else {
        const lo = i === 0 ? P.lo : Math.max(P.lo, res[i - 1] - P.leap), hi = i === 0 ? P.hi : Math.min(P.hi, res[i - 1] + P.leap);
        const keys = [], lhmax = slots[i].lhmax; cands = [];
        for (let d = lo; d <= hi; d++) {
          const pd = pitch(d); if (pd < wlo || pd > whi || pd <= lhmax) continue;
          if (i > 0 && !(STEP_WEIGHT[Math.abs(d - res[i - 1])] > 0)) continue;  // weight 0: left out of the order
          const r = rng.random();
          if (!ok(i, d)) continue;
          // r^(1/w), compared through its logarithm; insertion keeps equal keys in their first order
          const key = Math.log(r) / weight(i, d);
          let k = keys.length; while (k > 0 && keys[k - 1] < key) k--;
          keys.splice(k, 0, key); cands.splice(k, 0, d);
        }
      }
      for (const d of cands) { res[i] = d; if (rec(i + 1)) return true; }
      res[i] = null; return false;
    };
    if (!rec(0)) continue;
    const mel = res.slice(), top = Math.max(...mel), bottom = Math.min(...mel);
    if (top - bottom < (level <= 2 ? 3 : 4) || new Set(mel).size < 4) continue;
    if (need.has('ledger') && !mel.some(d => K.midi(d, K.rh) >= 81 || K.midi(d, K.rh) <= 60)) continue;
    if (need.has('wide') && !mel.some((d, i) => i && Math.abs(d - mel[i - 1]) >= 5)) continue;
    // Chromatic lower neighbours (level 6): tone, step below, tone becomes tone, raised step, tone.
    const alt = new Array(n).fill(0);
    if (need.has('chromatic')) {
      const sites = [];
      for (let i = 1; i < n - 1; i++) if (!slots[i].needct && slots[i].trip === null && mel[i + 1] === mel[i - 1] && mel[i] === mel[i - 1] - 1 && K.midi(mel[i - 1], K.rh) - K.midi(mel[i], K.rh) === 2 && !K.names[mod(mel[i], 7)].endsWith('is') && !copy.has(i)) sites.push(i);
      for (const i of rng.order(sites, sites.map(() => 1)).slice(0, 2).sort((a, b) => a - b)) alt[i] = 1;  // one or two per piece
      for (const [i, j] of copy) alt[i] = alt[j];
      if (!alt.some(Boolean)) continue;
    }
    // Two-note right-hand textures (level 6): a third or sixth below long strong-beat notes.
    const low = new Array(n).fill(null);
    if (need.has('dyads')) {
      slots.forEach((s, i) => {
        if (copy.has(i) || !s.strong || s.dur < 12 || rng.random() < .35) return;
        for (const k of [2, 5]) { const x = mel[i] - k; if (s.chord.includes(mod(x, 7)) && K.midi(x, K.rh) > s.lhmax && K.midi(x, K.rh) >= wlo) { low[i] = x; break; } }
      });
      for (const [i, j] of copy) low[i] = low[j];
      if (low.filter(x => x !== null).length < 3) continue;
    }
    // Score: smooth lines, one clear high point, variety, no parallel octaves or fifths with the bass.
    const LEAP_COST = { 0: .8, 1: 0, 2: .4, 3: 1.2, 4: 1.8, 5: 2.5, 7: 3 };
    let cost = 0;
    for (let i = 1; i < n; i++) cost += LEAP_COST[Math.abs(mel[i] - mel[i - 1])] * (level >= 7 && mel[i] !== mel[i - 1] ? .6 : 1);
    cost += 2 * Math.max(0, top - bottom - (level >= 5 ? 9 : 7));  // a compact range
    const peaks = new Set(); mel.forEach((d, i) => { if (d === top) peaks.add(slots[i].bar); });
    if (peaks.size === 1 && [1, 2, 5, 6].includes([...peaks][0])) cost -= 2;
    if (new Set(mel).size < 5) cost += 3;
    const half = Math.floor(n / 2);
    if (new Set(mel.slice(0, half)).size < 4) cost += 3;
    if (new Set(mel.slice(half)).size < 4) cost += 3;
    let wobble = 0; for (let i = 0; i < n - 2; i++) if (mel[i] === mel[i + 2] && mel[i + 2] !== mel[i + 1]) wobble++;
    cost += Math.max(0, wobble - Math.floor(n / 6));
    let repeats = 0; for (let i = 1; i < n; i++) if (mel[i] === mel[i - 1]) repeats++;
    cost += Math.max(0, repeats - 2);
    cost += Math.abs(mel.reduce((a, d) => a + pitch(d), 0) / n - center);
    // Outer voices at every onset of either hand: the melody against the lowest left-hand note.
    const upper = slots.map((s, i) => [s.bar * L + s.on, s.bar * L + s.on + s.dur, pitch(mel[i])]);
    const bass = []; lh.forEach((ev, b) => ev.forEach(([on, dur, xs]) => bass.push([b * L + on, b * L + on + dur, Math.min(...xs.map(x => K.midi(x, K.lh)))])));
    if (bass.length) {
      const times = [...new Set(upper.concat(bass).map(x => x[0]))].sort((a, b) => a - b);
      const at = (list, t) => list.find(([a, e]) => a <= t && t < e)[2];
      const outer = times.map(t => [at(upper, t), at(bass, t)]);
      const parallels = [];
      for (let k = 1; k < times.length; k++) {
        const [a, b] = outer[k - 1], [c, d] = outer[k];
        if ([0, 7].includes(mod(a - b, 12)) && mod(a - b, 12) === mod(c - d, 12) && (c - a) * (d - b) > 0) parallels.push(times[k]);
      }
      if (parallels.some(t => t % (meter === '4/4' ? 24 : L) === 0)) continue;  // no parallel octaves or fifths onto a strong beat
      cost += 2 * parallels.length;
    }
    found.push({ cost, attempt, prog, rhythm, slots, mel, alt, low, lh, parallel });
    if (found.length >= enough) break;
  }
  if (!found.length) return null;
  const best = found.reduce((a, b) => (b.cost < a.cost || (b.cost === a.cost && b.attempt < a.attempt) ? b : a));
  // Dynamics, drawn after the music as the build script does.
  const dyn = rng.pick(level >= 3 ? ['mf', 'p', 'f', 'mf'] : ['mf', 'p']);
  const second = best.parallel ? (dyn !== 'p' ? 'p' : 'mf') : rng.pick(['', 'mf', dyn !== 'f' ? 'f' : 'p']);
  return { ...best, K, meter, L, level, pattern: pl.pattern, dyn, second };
}

// ---------- Practice data and MusicXML ----------
const round = x => Math.round(x * 1e6) / 1e6;
function practiceNotes(m) {
  const notes = [], K = m.K;
  m.slots.forEach((s, i) => {
    const beat = round((s.bar * m.L + s.on) / 12), duration = round(s.dur / 12);
    if (m.low[i] !== null) notes.push({ midi: K.midi(m.low[i], K.rh), beat, duration, hand: 'right' });
    notes.push({ midi: K.midi(m.mel[i], K.rh, m.alt[i]), beat, duration, hand: 'right' });
  });
  m.lh.forEach((ev, b) => ev.forEach(([on, dur, xs]) => { for (const x of xs) notes.push({ midi: K.midi(x, K.lh), beat: round((b * m.L + on) / 12), duration: round(dur / 12), hand: 'left' }); }));
  return notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

const TYPE = { 48: ['whole', 0], 36: ['half', 1], 24: ['half', 0], 18: ['quarter', 1], 12: ['quarter', 0], 9: ['eighth', 1], 6: ['eighth', 0], 4: ['eighth', 0], 3: ['16th', 0] };
const ACC = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Beams: notes shorter than a quarter join within each beat (a dotted quarter in 6/8); sixteenths add a second beam.
function beams(items, beatTicks) {
  const groups = new Map();
  items.forEach((it, k) => { if (it.dur < 12) { const g = Math.floor(it.on / beatTicks); (groups.get(g) || groups.set(g, []).get(g)).push(k); } });
  for (const ks of groups.values()) {
    // only runs of neighbouring notes join
    const runs = []; for (const k of ks) { const run = runs[runs.length - 1]; if (run && run[run.length - 1] === k - 1) run.push(k); else runs.push([k]); }
    for (const run of runs) {
      if (run.length < 2) continue;
      run.forEach((k, j) => { items[k].beam1 = j === 0 ? 'begin' : j === run.length - 1 ? 'end' : 'continue'; });
      run.forEach((k, j) => {
        if (items[k].dur !== 3) return;
        const before = j > 0 && items[run[j - 1]].dur === 3, after = j < run.length - 1 && items[run[j + 1]].dur === 3;
        items[k].beam2 = before && after ? 'continue' : before ? 'end' : after ? 'begin' : j > 0 ? 'backward hook' : 'forward hook';
      });
    }
  }
}
function musicXML(m, title, tempo) {
  const K = m.K, [beats, beatType] = m.meter.split('/').map(Number), beatTicks = m.meter === '6/8' ? 18 : 12, fifths = FIFTHS[K.mode][K.key];
  // key-signature alterations by letter
  const keyAlter = {}; for (const s of 'CDEFGAB') keyAlter[s] = 0;
  if (fifths > 0) for (const s of 'FCGDAEB'.slice(0, fifths)) keyAlter[s] = 1;
  if (fifths < 0) for (const s of 'BEADGCF'.slice(0, -fifths)) keyAlter[s] = -1;
  const firsts = new Set([0, 4].map(b => m.slots.findIndex(s => s.bar === b)));
  const lasts = new Set([3, 7].map(b => m.slots.map(s => s.bar).lastIndexOf(b)));
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>', '<score-partwise version="3.1">', `<work><work-title>${esc(title)}</work-title></work>`,
    '<identification><creator type="composer">OpenPiano</creator><rights>CC0 1.0 · generated first-reading piece</rights><encoding><software>OpenPiano reading generator</software></encoding></identification>',
    '<part-list><score-part id="P1"><part-name print-object="no">Piano</part-name></score-part></part-list>', '<part id="P1">');
  for (let b = 0; b < 8; b++) {
    out.push(`<measure number="${b + 1}">`);
    if (b === 0) {
      out.push(`<attributes><divisions>12</divisions><key><fifths>${fifths}</fifths><mode>${K.mode}</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><staves>2</staves>` +
        '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>');
      out.push(`<sound tempo="${tempo}"/>`);
    }
    const state = { 1: new Map(), 2: new Map() };  // accidentals already shown in this bar, by staff
    const pitchXML = (sp, staff) => {
      const k = sp.step + sp.octave, shown = state[staff].has(k) ? state[staff].get(k) : keyAlter[sp.step];
      let acc = '';
      if (shown !== sp.alter) { acc = `<accidental>${ACC[sp.alter]}</accidental>`; state[staff].set(k, sp.alter); }
      return { pitch: `<pitch><step>${sp.step}</step>${sp.alter ? `<alter>${sp.alter}</alter>` : ''}<octave>${sp.octave}</octave></pitch>`, acc };
    };
    const noteXML = (it, staff, voice) => {
      const [type, dots] = TYPE[it.dur], parts = [];
      it.heads.forEach((sp, h) => {
        const p = pitchXML(sp, staff);
        let x = '<note>' + (h ? '<chord/>' : '') + p.pitch + `<duration>${it.dur}</duration><voice>${voice}</voice><type>${type}</type>` + '<dot/>'.repeat(dots) + p.acc;
        if (it.trip !== null && it.trip !== undefined) x += '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
        x += `<staff>${staff}</staff>`;
        if (!h) { if (it.beam1) x += `<beam number="1">${it.beam1}</beam>`; if (it.beam2) x += `<beam number="2">${it.beam2}</beam>`; }
        const nota = [];
        if (!h && it.trip === 0) nota.push('<tuplet type="start" bracket="yes"/>');
        if (!h && it.trip === 2) nota.push('<tuplet type="stop"/>');
        if (!h && it.slurStart) nota.push('<slur type="start" number="1"/>');
        if (!h && it.slurStop) nota.push('<slur type="stop" number="1"/>');
        if (nota.length) x += '<notations>' + nota.join('') + '</notations>';
        parts.push(x + '</note>');
      });
      return parts.join('');
    };
    // right hand
    const rh = [];
    m.slots.forEach((s, i) => {
      if (s.bar !== b) return;
      const heads = []; if (m.low[i] !== null) heads.push(K.spell(m.low[i], K.rh)); heads.push(K.spell(m.mel[i], K.rh, m.alt[i]));
      rh.push({ i, on: s.on, dur: s.dur, trip: s.trip, heads, slurStart: m.level >= 3 && firsts.has(i), slurStop: m.level >= 3 && lasts.has(i) });
    });
    beams(rh, beatTicks);
    for (const it of rh) {
      const dyn = it.i === 0 ? m.dyn : (b === 4 && firsts.has(it.i) ? m.second : '');
      if (dyn) out.push(`<direction placement="below"><direction-type><dynamics><${dyn}/></dynamics></direction-type><staff>1</staff></direction>`);
      out.push(noteXML(it, 1, 1));
    }
    out.push(`<backup><duration>${m.L}</duration></backup>`);
    // left hand
    if (!m.lh[b].length) out.push(`<note><rest measure="yes"/><duration>${m.L}</duration><voice>5</voice><staff>2</staff></note>`);
    else {
      const lh = m.lh[b].map(([on, dur, xs]) => ({ on, dur, trip: null, heads: xs.map(x => K.spell(x, K.lh)) }));
      beams(lh, beatTicks);
      for (const it of lh) out.push(noteXML(it, 2, 5));
    }
    if (b === 7) out.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    out.push('</measure>');
  }
  out.push('</part>', '</score-partwise>');
  return out.join('\n');
}

// ---------- Public: generate, register, the staircase ----------
const clampLevel = l => Math.max(0, Math.min(7, Math.floor(Number(l) || 0)));
// The search the browser runs: the best of three melodies, each search cut off sooner than the build
// script's (which keeps the best of twelve). Same rules; a few milliseconds instead of a few hundred.
const SEARCH = { enough: 3, budget: 250 };
// What a piece is, without the music: everything the path and the menus show.
function describe(level, seed) {
  level = clampLevel(level); seed = Math.max(1, Math.floor(Number(seed) || 1));
  const P = LEVELS[level], pl = P.plans[(seed - 1) % P.plans.length], bpm = pl.meter === '6/8' ? 3 : METER[pl.meter][0], total = bpm * 8;
  const keyName = LABEL((pl.mode === 'major' ? NAMES : MINOR)[pl.key][0]) + ' ' + pl.mode;
  return {
    id: `gen-reading-${level}-${seed}`, title: `Reading ${level} · No. ${seed}`, composer: 'OpenPiano', kind: 'reading', studyLevel: level, studyKey: pl.key, studyMode: pl.mode,
    timeSignature: pl.meter, tempo: TEMPO[level], generated: true, seed,
    caption: `New first-reading piece · Level ${level} · ${keyName} · ${pl.meter}${level === 0 ? ' · right hand' : ' · both hands'}`,
    attribution: 'OpenPiano · generated first-reading piece · CC0 1.0',
    totalBeats: total, beatsPerMeasure: bpm, movements: [{ title: 'Movement 1', start: 0, end: total }], sections: [{ id: 'block-0', title: 'Practice block 1', start: 0, end: total }],
    originalPages: 0, sourceFingering: false,
  };
}
// The music: notes for the player and MusicXML for the engraving.
function music(entry) {
  const level = entry.studyLevel, pl = LEVELS[level].plans[(entry.seed - 1) % 8];
  // Every seed gives a piece: should the rules find no melody (rare), the next variant of the seed is tried.
  let m = null;
  for (let v = 0; !m && v < 20; v++) m = compose(level, pl, entry.id + (v ? '/' + v : ''), SEARCH);
  if (!m) throw new Error(`No reading piece for ${entry.id}`);
  return { notes: practiceNotes(m), musicxml: musicXML(m, entry.title, entry.tempo) };
}
function generate(level, seed) { const entry = describe(level, seed); return Object.assign(entry, music(entry)); }
// A registered piece writes its music the first time something asks for it (usually when it is opened),
// so offering a piece costs nothing.
function lazy(level, seed) {
  const entry = describe(level, seed); let made = null;
  const field = name => Object.defineProperty(entry, name, { enumerable: true, configurable: true,
    get() { made = made || music(entry); return made[name]; },
    set(v) { Object.defineProperty(entry, name, { value: v, writable: true, enumerable: true, configurable: true }); } });
  field('notes'); field('musicxml');
  return entry;
}
// The engraving is drawn on first use (Verovio, the engraver the site already uses for imported scores).
// Without it the player still works and draws its simple staff.
async function engrave(entry) {
  if (entry.engraving || !window.PianoScoreImport?.fromXML) return entry;
  try {
    const drawn = await window.PianoScoreImport.fromXML(entry.musicxml, { id: entry.id, title: entry.title });
    if (drawn?.engraving && drawn.notes.length === entry.notes.length) { entry.engraving = drawn.engraving; entry.notes = drawn.notes; }
  } catch (e) { console.warn('Reading piece engraving unavailable:', e.message); }
  return entry;
}
function register(entry) {
  const R = window.PianoRepertoire || (window.PianoRepertoire = {});
  if (R[entry.id]) return R[entry.id];
  entry.prepare = function () { return engrave(this); };
  R[entry.id] = entry;
  return entry;
}
const ID = /^gen-reading-([0-7])-([1-9]\d*)$/;
// Make a generated id usable again (after a reload, or from a link): the same id is always the same piece.
function ensure(id) {
  const m = ID.exec(id || ''); if (!m) return null;
  return window.PianoRepertoire?.[id] || register(lazy(Number(m[1]), Number(m[2])));
}

const read = () => { try { const s = JSON.parse(localStorage.getItem(KEY)); return s && typeof s === 'object' ? s : {}; } catch { return {}; } };
const write = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); window.dispatchEvent(new Event('piano-progress-changed')); } catch {} };
function startingLevel() {
  const P = window.PianoPath; if (!P) return 0;
  try { const l = P.learnerLevel(); return l > 0 ? (P.READING?.[l] ?? l) : 0; } catch { return 0; }
}
function level() { const l = Number(read().level); return Number.isFinite(l) ? Math.max(0, Math.min(7, l)) : startingLevel(); }
function setLevel(l) { const s = read(); s.level = Math.max(0, Math.min(7, Math.round(Number(l) * 2) / 2 || 0)); write(s); return s.level; }
function seenIds() {
  const s = read(), out = new Set(Array.isArray(s.seen) ? s.seen : []);
  for (const h of Object.values(s.history || {})) if (h?.id) out.add(h.id);
  try { for (const id of JSON.parse(localStorage.getItem(SKILL_KEY))?.seen || []) out.add(id); } catch {}
  return out;
}
function markSeen(id) { if (!ID.test(id)) return; const s = read(); s.seen = Array.isArray(s.seen) ? s.seen : []; if (!s.seen.includes(id)) { s.seen.push(id); write(s); } }
// The next piece at a level that has not been opened yet. It stays the same until it is opened.
function next(l) {
  const lv = clampLevel(l === undefined ? level() : l), seen = seenIds();
  let seed = 1; while (seen.has(`gen-reading-${lv}-${seed}`)) seed++;
  return ensure(`gen-reading-${lv}-${seed}`);
}

// The staircase. A success: a complete In-time run with both hands (or the only hand written), ≥90% of the
// notes and ≥75% timing. Only the first such run of each piece counts: reading means playing it cold.
const isReading = id => ID.test(id || '') || /^reading-\d+-\d+$/.test(id || '') || window.PianoRepertoire?.[id]?.kind === 'reading';
const success = r => (r.accuracy ?? 0) >= 90 && (r.timing ?? 0) >= 75;
function stepLevel(current, passed) { return Math.max(0, Math.min(7, current + (passed ? 1 : -.5))); }
function record(r) {
  const entry = window.PianoRepertoire?.[r?.score];
  if (!r || r.kind !== 'play' || r.loop || !r.complete || !isReading(r.score) || entry?.placement) return null;
  const oneHand = entry?.notes && !entry.notes.some(n => n.hand === 'left');
  if (r.hands !== 'BH' && !oneHand) return null;
  const s = read(); s.history = s.history && typeof s.history === 'object' ? s.history : {};
  if (Object.values(s.history).some(h => h?.id === r.score)) return null;
  const before = level(), passed = success(r);
  s.level = stepLevel(before, passed);
  s.history[String(r.time || Date.now())] = { id: r.score, level: entry?.studyLevel ?? Math.floor(before), accuracy: r.accuracy, timing: r.timing };
  write(s);
  window.dispatchEvent(new CustomEvent('piano-reading-level', { detail: { level: s.level, passed, id: r.score } }));
  return { level: s.level, passed };
}

// ---------- "Read something new": a 30-second look-over, then In time ----------
let pending = null, lookover = null, readingRun = null;  // readingRun: the piece being read and the view to restore after
function el(tag, text, cls) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
function endLookover() { if (!lookover) return; clearInterval(lookover.timer); lookover.box.remove(); lookover = null; }
// Show the music for reading: the whole piece as a page on a wide screen, one large line on a phone.
// Returns the view it replaced (or null), so it can be put back.
function sheetView() {
  let before = null; try { before = localStorage.getItem('openpiano-stage-view'); } catch {}
  before = before || 'split';  // the stage's own default
  const want = window.matchMedia?.('(max-width: 700px)').matches ? 'sheet' : 'full';
  const b = document.querySelector(`.sg-views button[data-value="${want}"]`); if (!b) return null;
  if (b.getAttribute('aria-pressed') !== 'true') b.click();
  return before && before !== want ? before : null;
}
function restoreView(view) { if (view) document.querySelector(`.sg-views button[data-value="${view}"]`)?.click(); }
function startLookover(score) {
  endLookover();
  const P = window.PianoPractice; if (!P) return;
  const view = sheetView();
  P.setTempo(score.tempo || TEMPO[score.studyLevel] || 56);
  const box = el('div', undefined, 'reading-lookover'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Look over the piece');
  const count = el('strong', '30', 'reading-count'), text = el('div');
  text.append(el('span', 'Look it over', 'reading-kicker'), el('p', 'Find the key, the time signature, the rhythms and where the hands move. Then play it In time without stopping.'));
  const go = el('button', 'Start now'), later = el('button', 'Not now', 'secondary'); go.type = later.type = 'button';
  const actions = el('div', undefined, 'reading-actions'); actions.append(go, later);
  box.append(count, text, actions);
  (document.querySelector('.sg-stage') || document.querySelector('#note-trainer') || document.body).append(box);
  let left = 30;
  const begin = () => { readingRun = { id: score.id, view }; endLookover(); P.start('play'); };
  lookover = { box, id: score.id, view, timer: setInterval(() => { left--; count.textContent = String(left); if (left <= 0) begin(); }, 1000) };
  go.onclick = begin; later.onclick = () => { const v = lookover?.view; endLookover(); restoreView(v); };
  go.focus?.({ preventScroll: true });
}
// Runs before the player's own listener (this script loads first), so a generated id exists when the player looks.
window.addEventListener('piano-select-score', e => {
  const id = typeof e.detail === 'string' ? e.detail : e.detail?.id;
  ensure(id);
  pending = e.detail?.reading && isReading(id) ? id : null;
  if (lookover && lookover.id !== id) endLookover();
});
window.addEventListener('piano-score-viewed', e => markSeen(e.detail));
function attach() {
  const P = window.PianoPractice; if (!P || attach.done) return; attach.done = true;
  P.on('result', r => { record(r); if (readingRun && r?.score === readingRun.id && r.kind === 'play') { restoreView(readingRun.view); readingRun = null; } });
  P.on('load', score => { if (score?.id && score.id === pending) { pending = null; setTimeout(() => startLookover(score), 0); } else if (lookover && score?.id !== lookover.id) endLookover(); });
  P.on('state', () => { if (lookover && P.state !== 'idle') endLookover(); });
}
// This script runs before the player (see index.html), so it listens once every deferred script has run.
if (typeof document !== 'undefined') { attach(); document.addEventListener('DOMContentLoaded', attach); window.addEventListener('load', attach); }

window.PianoReadingGen = { generate, next, ensure, level, setLevel, record, stepLevel, success, markSeen, sheetView, restoreView, TEMPO, LEVELS,
  _compose: compose, _notes: practiceNotes, _engrave: engrave };
})();
