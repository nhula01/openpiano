'use strict';
// Play by chords: the chord checker, progressions in every key, the chords curriculum and the
// learner's chord lessons. The trainer screen is in piano-chords-trainer.js; lead sheets of library
// songs are in piano-leadsheets.js. See docs/piano-learning-path.md ("Play by chords").
//
// What the checker accepts, by stage:
//   A  any voicing or inversion of the right notes: doublings are fine, and the fifth may be left
//      out of a seventh or sixth chord;
//   B  as A, and the lowest note is the root (or the bass of a slash chord such as C/E);
//   C  exactly the notes shown on the keyboard diagram.
// With the microphone the checker hears pitch classes over a short window, so only stage A can be
// checked, and leniently (root and third, at most one stray note).
//
// Nothing here generates fingering; the diagrams show pitch names only.
(() => {
const LETTERS = 'CDEFGAB';
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES_SHARP = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const PROGRESS_KEY = 'openpiano-chords-v1', PATH_KEY = 'my-journey-piano-pathway-v2', SKILL_KEY = 'journey-piano-skills-v1';
const mod = n => ((n % 12) + 12) % 12;
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// ---------------------------------------------------------------------------------------------
// Chord symbols
// ---------------------------------------------------------------------------------------------
// suffix → [MusicXML kind, tones as [semitones above the root, degree]]. Longest suffixes first; the
// suffixes and kind names match the chord-symbol parser in piano-sheet-model.js, so a symbol written
// in the sheet editor means the same chord here. The fifth (degree 5, when it is a perfect fifth)
// may be left out of any chord with a seventh or a sixth.
const KINDS = [
  ['maj13', 'major-13th', [[0, 1], [4, 3], [7, 5], [11, 7], [14, 9], [21, 13]]],
  ['maj9', 'major-ninth', [[0, 1], [4, 3], [7, 5], [11, 7], [14, 9]]],
  ['maj7', 'major-seventh', [[0, 1], [4, 3], [7, 5], [11, 7]]],
  ['M7', 'major-seventh', [[0, 1], [4, 3], [7, 5], [11, 7]]],
  ['Δ7', 'major-seventh', [[0, 1], [4, 3], [7, 5], [11, 7]]],
  ['Δ', 'major-seventh', [[0, 1], [4, 3], [7, 5], [11, 7]]],
  ['m(maj7)', 'major-minor', [[0, 1], [3, 3], [7, 5], [11, 7]]],
  ['mMaj7', 'major-minor', [[0, 1], [3, 3], [7, 5], [11, 7]]],
  ['m7b5', 'half-diminished', [[0, 1], [3, 3], [6, 5], [10, 7]]],
  ['ø7', 'half-diminished', [[0, 1], [3, 3], [6, 5], [10, 7]]],
  ['ø', 'half-diminished', [[0, 1], [3, 3], [6, 5], [10, 7]]],
  ['dim7', 'diminished-seventh', [[0, 1], [3, 3], [6, 5], [9, 7]]],
  ['°7', 'diminished-seventh', [[0, 1], [3, 3], [6, 5], [9, 7]]],
  ['dim', 'diminished', [[0, 1], [3, 3], [6, 5]]],
  ['°', 'diminished', [[0, 1], [3, 3], [6, 5]]],
  ['aug7', 'augmented-seventh', [[0, 1], [4, 3], [8, 5], [10, 7]]],
  ['+7', 'augmented-seventh', [[0, 1], [4, 3], [8, 5], [10, 7]]],
  ['aug', 'augmented', [[0, 1], [4, 3], [8, 5]]],
  ['+', 'augmented', [[0, 1], [4, 3], [8, 5]]],
  ['m9', 'minor-ninth', [[0, 1], [3, 3], [7, 5], [10, 7], [14, 9]]],
  ['m7', 'minor-seventh', [[0, 1], [3, 3], [7, 5], [10, 7]]],
  ['m6', 'minor-sixth', [[0, 1], [3, 3], [7, 5], [9, 6]]],
  ['min', 'minor', [[0, 1], [3, 3], [7, 5]]],
  ['m', 'minor', [[0, 1], [3, 3], [7, 5]]],
  ['-', 'minor', [[0, 1], [3, 3], [7, 5]]],
  ['sus4', 'suspended-fourth', [[0, 1], [5, 4], [7, 5]]],
  ['sus2', 'suspended-second', [[0, 1], [2, 2], [7, 5]]],
  ['sus', 'suspended-fourth', [[0, 1], [5, 4], [7, 5]]],
  ['13', 'dominant-13th', [[0, 1], [4, 3], [7, 5], [10, 7], [14, 9], [21, 13]]],
  ['9', 'dominant-ninth', [[0, 1], [4, 3], [7, 5], [10, 7], [14, 9]]],
  ['7', 'dominant', [[0, 1], [4, 3], [7, 5], [10, 7]]],
  ['6', 'major-sixth', [[0, 1], [4, 3], [7, 5], [9, 6]]],
  ['5', 'power', [[0, 1], [7, 5]]],
  ['', 'major', [[0, 1], [4, 3], [7, 5]]],
];
const ACCIDENTAL = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };
const pretty = s => String(s).replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/bb(?=\d|$|\/|[^a-z])/g, '𝄫').replace(/([A-G])b/g, '$1♭').replace(/\/([A-G])b/g, '/$1♭');
// a note name from a letter and a pitch class (the accidental is whatever makes the letter fit)
function spell(letter, pc) {
  let d = mod(pc - NATURAL[letter]); if (d > 6) d -= 12;
  return letter + (ACCIDENTAL[d] ?? '');
}
function parseName(text) {
  const m = /^([A-Ga-g])(#|b|♯|♭)?/.exec(text); if (!m) return null;
  const alter = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return { letter: m[1].toUpperCase(), pc: mod(NATURAL[m[1].toUpperCase()] + alter), length: m[0].length };
}

// "C", "F#m7", "Bbmaj7/D", "G7", "Am/E", "Ddim" … → the chord, or null if it is not a chord symbol
function parse(text) {
  if (text && typeof text === 'object') return text;
  const t = String(text || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(t);
  if (!m) return null;
  const root = parseName(m[1]), suffix = m[2] || '';
  const entry = KINDS.find(([k]) => k === suffix);
  if (!entry) return null;
  const [, kind, tones] = entry;
  const hasSeventh = tones.some(([, deg]) => deg === 7 || deg === 6);
  const list = tones.map(([semi, degree]) => ({ semi, degree, pc: mod(root.pc + semi), name: spell(LETTERS[(LETTERS.indexOf(root.letter) + degree - 1) % 7], root.pc + semi), optional: hasSeventh && degree === 5 && semi === 7 }));
  const bass = m[3] ? parseName(m[3]) : null;
  const pcs = [...new Set(list.map(x => x.pc))];
  return {
    symbol: t, name: pretty(t), root: root.pc, rootName: m[1], suffix, kind, tones: list, pcs,
    required: [...new Set(list.filter(x => !x.optional).map(x => x.pc))],
    optional: list.filter(x => x.optional).map(x => x.pc),
    bass: bass ? bass.pc : null, bassName: bass ? m[3] : null,
  };
}
// the name of a pitch class as heard in this chord (C, E♭ …): chord tones keep their spelling
function pcName(pc, chord) {
  const t = chord?.tones.find(x => x.pc === mod(pc));
  if (t) return pretty(t.name);
  if (chord?.bass === mod(pc)) return pretty(chord.bassName);
  if (chord) { // a note outside the chord: named by its interval above the root (♭3, ♯4, ♭7 …)
    const degree = [1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 7, 7][mod(pc - chord.root)], letter = chord.tones[0].name[0];
    return pretty(spell(LETTERS[(LETTERS.indexOf(letter) + degree - 1) % 7], pc));
  }
  return NAMES_SHARP[mod(pc)];
}

// ---------------------------------------------------------------------------------------------
// The checker
// ---------------------------------------------------------------------------------------------
const STAGES = ['A', 'B', 'C'];
const stageRank = s => STAGES.indexOf(s);
const listNames = (pcs, chord) => pcs.map(pc => pcName(pc, chord)).join(', ');
// held: MIDI notes sounding now. opts.target: the voicing shown (needed for stage C).
function check(held, symbol, stage = 'A', opts = {}) {
  const chord = parse(symbol);
  const notes = [...new Set(held)].sort((a, b) => a - b), have = new Set(notes.map(mod));
  const missing = chord.required.filter(pc => !have.has(pc));
  const allowed = new Set([...chord.pcs, ...(chord.bass != null ? [chord.bass] : [])]);
  const extra = [...have].filter(pc => !allowed.has(pc));
  const bassPc = chord.bass ?? chord.root, lowest = notes.length ? mod(notes[0]) : null;
  const pitches = !missing.length && !extra.length && notes.length >= Math.min(2, chord.required.length);
  const bassOk = lowest === bassPc;
  const target = (opts.target || []).slice().sort((a, b) => a - b);
  const exact = target.length > 0 && target.length === notes.length && target.every((n, i) => n === notes[i]);
  const rank = stageRank(stage);
  const ok = pitches && (rank !== 1 || bassOk) && (rank !== 2 || exact);
  let message;
  if (!notes.length) message = `Play ${chord.name}: ${listNames(chord.required, chord)}.`;
  else if (extra.length) message = `Leave out ${listNames(extra, chord)}.`;
  else if (missing.length) message = `Add ${listNames(missing, chord)}.`;
  else if (rank === 1 && !bassOk) message = `Right notes. Now put ${pcName(bassPc, chord)} at the bottom.`;
  else if (rank >= 2 && !exact) message = `Right chord. Play exactly the shape shown: ${target.map(n => pcName(n, chord)).join(' ')}.`;
  else message = `${chord.name} ✓`;
  return { ok, stage, chord, pitches, missing, extra, bassOk, exact, lowest, message };
}
// The microphone hears a short window of notes, not exact keys: pass when the root and the third
// (or every required note of a two-note chord) are heard, with at most one note from outside.
function checkHeard(pcsHeard, symbol) {
  const chord = parse(symbol), have = new Set([...pcsHeard].map(mod));
  const third = chord.tones.find(t => t.degree === 3 || t.degree === 2 || t.degree === 4);
  const core = chord.required.length <= 2 ? chord.required : [chord.root, third ? third.pc : chord.required[1]];
  const missing = core.filter(pc => !have.has(pc));
  const extra = [...have].filter(pc => !chord.pcs.includes(pc) && pc !== chord.bass);
  const ok = !missing.length && extra.length <= 1;
  return { ok, stage: 'A', chord, missing, extra, lenient: true,
    message: ok ? `${chord.name} ✓ (heard by the microphone)` : missing.length ? `Listening for ${listNames(missing, chord)}.` : `Too many other notes: ${listNames(extra, chord)}.` };
}

// ---------------------------------------------------------------------------------------------
// Voicings and voice leading
// ---------------------------------------------------------------------------------------------
// total movement in semitones from one shape to the next: equal sizes pair note for note in order
// (the cheapest pairing on a line); otherwise every note travels to the nearest note of the other.
function movement(a, b) {
  const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q);
  if (!x.length || !y.length) return 0;
  if (x.length === y.length) return x.reduce((s, n, i) => s + Math.abs(n - y[i]), 0);
  const near = (from, to) => from.reduce((s, n) => s + Math.min(...to.map(m => Math.abs(m - n))), 0);
  return Math.max(near(x, y), near(y, x));
}
// every close-position shape of a chord (each inversion, every octave) with all notes in [low, high]
function shapes(symbol, low = 48, high = 84) {
  const chord = parse(symbol);
  const order = chord.tones.filter(t => t.degree <= 7).map(t => t.pc);
  const out = [];
  for (let inv = 0; inv < order.length; inv++) {
    let pcsUp = order.slice(inv).concat(order.slice(0, inv));
    if (chord.bass != null && chord.bass !== chord.root) { if (inv) continue; const b = order.indexOf(chord.bass); pcsUp = b >= 0 ? order.slice(b).concat(order.slice(0, b)) : [chord.bass, ...order]; }
    for (let start = low; start < low + 12; start++) {
      if (mod(start) !== pcsUp[0]) continue;
      for (let base = start; base <= high; base += 12) {
        const notes = [base];
        for (const pc of pcsUp.slice(1)) { let n = notes[notes.length - 1] + 1; while (mod(n) !== pc) n++; notes.push(n); }
        if (notes[notes.length - 1] <= high) out.push({ notes, inversion: inv });
      }
    }
  }
  return out;
}
const mean = a => a.reduce((s, n) => s + n, 0) / a.length;
// root position, centred near `center`
function rootShape(symbol, center = 64, low = 48, high = 84) {
  const all = shapes(symbol, low, high), roots = all.filter(s => s.inversion === 0);
  return (roots.length ? roots : all).sort((p, q) => Math.abs(mean(p.notes) - center) - Math.abs(mean(q.notes) - center))[0]?.notes || [];
}
// the "shortcut" path: start in root position, then always the nearest shape to the last one
function nearestPath(symbols, { center = 64, low = 55, high = 79, start } = {}) {
  const out = [];
  for (const s of symbols) {
    if (!out.length) { out.push(start || rootShape(s, center, low, high)); continue; }
    const prev = out[out.length - 1];
    const list = shapes(s, low, high).sort((p, q) => movement(prev, p.notes) - movement(prev, q.notes) || Math.abs(mean(p.notes) - center) - Math.abs(mean(q.notes) - center));
    out.push(list[0]?.notes || rootShape(s, center, low, high));
  }
  return out;
}
// the least total movement any sequence of shapes could manage, starting from `first`
function bestMovement(symbols, first) {
  if (symbols.length < 2) return 0;
  const low = Math.min(...first) - 7, high = Math.max(...first) + 7;
  let states = [{ notes: first, cost: 0 }];
  for (const s of symbols.slice(1)) {
    const cands = shapes(s, low, high);
    if (!cands.length) return 0;
    states = cands.map(c => ({ notes: c.notes, cost: Math.min(...states.map(p => p.cost + movement(p.notes, c.notes))) }));
  }
  return Math.min(...states.map(s => s.cost));
}
// how smoothly a learner moved between chords: their total movement against the best possible
function voiceLeading(played, symbols) {
  const pairs = played.map((v, i) => [v, symbols[i]]).filter(([v]) => v && v.length);
  if (pairs.length < 2) return { moved: 0, best: 0, score: 100 };
  let moved = 0;
  for (let i = 1; i < pairs.length; i++) moved += movement(pairs[i - 1][0], pairs[i][0]);
  const best = bestMovement(pairs.map(p => p[1]), pairs[0][0]);
  return { moved, best, score: moved <= best ? 100 : Math.round(100 * best / moved) };
}

// ---------------------------------------------------------------------------------------------
// Keys and progressions
// ---------------------------------------------------------------------------------------------
const MAJOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const MINOR_KEYS = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm'];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11], MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
// a Roman numeral in a key → a chord symbol spelled correctly ("V7" in E♭ → "B♭7", "vi" in D → "Bm")
function numeral(rn, key) {
  const m = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|ø)?(maj7|7|6|sus4|sus2)?$/.exec(rn);
  if (!m) throw new Error('Unknown Roman numeral ' + rn);
  const minorKey = /m$/.test(key), tonic = parseName(key);
  const degree = NUMERALS.indexOf(m[2].toUpperCase());
  const pc = mod(tonic.pc + (minorKey ? MINOR_STEPS : MAJOR_STEPS)[degree] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0));
  const letter = LETTERS[(LETTERS.indexOf(tonic.letter) + degree) % 7];
  const lower = m[2] === m[2].toLowerCase(), ext = m[4] || '';
  let suffix;
  if (m[3] === '°') suffix = ext === '7' ? 'dim7' : 'dim';
  else if (m[3] === 'ø') suffix = 'm7b5';
  else if (lower) suffix = ext === '7' ? 'm7' : ext === '6' ? 'm6' : 'm';
  else suffix = ext;
  return spell(letter, pc) + suffix;
}
const inKey = (romans, key) => romans.map(rn => numeral(rn, key));
const keysFor = key => (/m$/.test(key) ? MINOR_KEYS : MAJOR_KEYS);
// the same progression in all twelve keys of its mode, round the circle of fifths from `key`
function allKeys(romans, key = 'C') {
  const list = keysFor(key), i = Math.max(0, list.indexOf(key));
  return list.slice(i).concat(list.slice(0, i)).map(k => ({ key: k, chords: inKey(romans, k) }));
}

// ---------------------------------------------------------------------------------------------
// Left-hand patterns: slots of [beat in the bar, role]. Roles name chord tones, so any octave
// counts; "chord" is two or more chord tones together.
// ---------------------------------------------------------------------------------------------
const PATTERNS = {
  block: { name: 'Block chord', meter: 4, slots: [[0, 'chord']], how: 'Hold the whole chord on beat 1.' },
  root: { name: 'Root only', meter: 4, slots: [[0, 'root']], how: 'Play the root of each chord on beat 1.' },
  'root-fifth': { name: 'Root and fifth', meter: 4, slots: [[0, 'root'], [2, 'fifth']], how: 'Root on beat 1, the fifth above it on beat 3.' },
  broken: { name: 'Broken chord 1–5–8', meter: 4, slots: [[0, 'root'], [1, 'fifth'], [2, 'root'], [3, 'fifth']], how: 'Root, fifth, the root an octave up, fifth: one per beat.' },
  waltz: { name: 'Waltz', meter: 3, slots: [[0, 'root'], [1, 'chord'], [2, 'chord']], how: 'Oom-pah-pah: a low root on beat 1, the chord on beats 2 and 3.' },
  arpeggio: { name: 'Arpeggio 1–5–8–10', meter: 4, slots: [[0, 'root'], [0.5, 'fifth'], [1, 'root'], [1.5, 'third'], [2, 'root'], [2.5, 'fifth'], [3, 'root'], [3.5, 'third']], how: 'Eighth notes rising root, fifth, octave, tenth, and back.' },
  alberti: { name: 'Alberti bass', meter: 4, slots: [[0, 'root'], [0.5, 'fifth'], [1, 'third'], [1.5, 'fifth'], [2, 'root'], [2.5, 'fifth'], [3, 'third'], [3.5, 'fifth']], how: 'Low, high, middle, high: root, fifth, third, fifth in eighth notes.' },
  ballad: { name: 'Ballad sweep', meter: 4, slots: [[0, 'root'], [0.5, 'fifth'], [1, 'root'], [1.5, 'ninth'], [2, 'third'], [3, 'fifth']], how: 'Root, fifth, octave, ninth, tenth: a rising sweep, then the fifth.' },
  stride: { name: 'Stride (oom-pah)', meter: 4, slots: [[0, 'root'], [1, 'chord'], [2, 'fifth'], [3, 'chord']], how: 'Low root on 1, chord on 2, low fifth on 3, chord on 4.' },
  boogie: { name: 'Boogie walking bass', meter: 4, swing: true, slots: [[0, 'root'], [0.5, 'third'], [1, 'fifth'], [1.5, 'sixth'], [2, 'seventh'], [2.5, 'sixth'], [3, 'fifth'], [3.5, 'third']], how: 'Swung eighths walking up and down: 1, 3, 5, 6, ♭7, 6, 5, 3.' },
};
function rolePc(role, chord) {
  const deg = d => chord.tones.find(t => t.degree === d)?.pc;
  switch (role) {
    case 'root': return chord.root;
    case 'third': return deg(3) ?? deg(2) ?? deg(4);
    case 'fifth': return deg(5) ?? mod(chord.root + 7);
    case 'sixth': return mod(chord.root + 9);
    case 'seventh': return deg(7) ?? mod(chord.root + 10);
    case 'ninth': return mod(chord.root + 2);
    default: return null;
  }
}
// The time window for "on time": about a fifth of a beat, never tighter than 90 ms or looser than 160 ms.
const windowMs = (bpm, input) => Math.min(160, Math.max(90, 0.18 * 60000 / bpm)) * (input === 'microphone' ? 1.6 : 1);
// Score a left-hand pattern against the click. ons: [{midi, time}] note-ons (ms); steps: [{beat,
// beats, symbol}]; t0: the time of beat 0; bpm. Each slot is hit by an unused note of its role
// inside the window, or for "chord" by two or more chord tones together.
function checkPattern(ons, steps, patternId, { bpm, t0, input } = {}) {
  const pattern = PATTERNS[patternId], spb = 60000 / bpm, win = windowMs(bpm, input), used = new Set();
  const slots = [];
  for (const step of steps) {
    const chord = parse(step.symbol);
    for (let bar = 0; bar < step.beats; bar += pattern.meter) {
      for (const [at, role] of pattern.slots) {
        if (bar + at >= step.beats) continue;
        const swung = pattern.swing && at % 1 === 0.5 ? at + 1 / 6 : at;
        slots.push({ time: t0 + (step.beat + bar + swung) * spb, role, chord, symbol: step.symbol });
      }
    }
  }
  for (const slot of slots) {
    const near = ons.map((n, i) => ({ ...n, i })).filter(n => !used.has(n.i) && Math.abs(n.time - slot.time) <= win);
    if (slot.role === 'chord') {
      const tones = near.filter(n => slot.chord.pcs.includes(mod(n.midi)));
      if (new Set(tones.map(n => mod(n.midi))).size >= 2) { tones.forEach(n => used.add(n.i)); slot.hit = true; slot.offset = Math.round(mean(tones.map(n => n.time)) - slot.time); }
    } else {
      const want = rolePc(slot.role, slot.chord);
      const pick = near.filter(n => mod(n.midi) === want).sort((a, b) => Math.abs(a.time - slot.time) - Math.abs(b.time - slot.time))[0];
      if (pick) { used.add(pick.i); slot.hit = true; slot.offset = Math.round(pick.time - slot.time); }
    }
  }
  const hits = slots.filter(s => s.hit).length;
  const stray = ons.filter((n, i) => !used.has(i)).length;
  return { slots: slots.length, hits, pct: slots.length ? Math.round(100 * hits / slots.length) : 0, stray, detail: slots.map(s => ({ role: s.role, symbol: s.symbol, hit: !!s.hit, offset: s.offset ?? null })) };
}

// ---------------------------------------------------------------------------------------------
// The chords curriculum (original, CC0): levels 1–5 of the "Play by chords" route
// ---------------------------------------------------------------------------------------------
const BLUES = ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'];
const RAG = ['I', 'VI7', 'II7', 'V7'];
const LEVELS = {
  1: { title: 'Three chords, one key', text: 'C, F and G, then the same three chords in G and F, with nearby shapes so your hand barely moves.' },
  2: { title: 'Minor chords and four-chord loops', text: 'Am, Dm and Em, and the loops behind thousands of songs: I–V–vi–IV, vi–IV–I–V, I–vi–IV–V.' },
  3: { title: 'Left-hand patterns', text: 'One progression, seven left-hand patterns: block, root–fifth, broken, waltz, arpeggio, Alberti, ballad.' },
  4: { title: 'New keys and dominant sevenths', text: 'V7 to I, the ragtime circle of sevenths, and one progression round all twelve keys.' },
  5: { title: 'Blues, boogie and stride', text: 'The 12-bar blues, a boogie walking bass, and ragtime’s oom-pah left hand.' },
};
// [id, level, title, goal, key, progression, options]; options: beats per chord, hand, pattern,
// shape ('root' or 'near' for the nearest-shape path), pass rule, loops.
const L = (id, level, title, goal, key, prog, o = {}) => ({
  id, level, title, goal, key, prog, beats: o.beats ?? 4, meter: o.meter ?? (PATTERNS[o.pattern]?.meter || 4), hand: o.hand || 'right',
  pattern: o.pattern || null, shape: o.shape || 'root', loops: o.loops ?? 2, circle: !!o.circle,
  pass: { stage: o.stage || 'A', bpm: o.bpm || 60, onTime: o.onTime ?? 90, ...(o.vl ? { vl: o.vl } : {}), ...(o.patternPct ? { pattern: o.patternPct } : {}) },
});
const LESSONS = [
  L('ch-1-1', 1, 'C, F and G', 'Find the three chords of C major in root position with your right hand.', 'C', ['I', 'IV', 'V', 'I'], { bpm: 60 }),
  L('ch-1-2', 1, 'The shortcut shapes', 'Move from C to F to G by the nearest shape: C–E–G, C–F–A, B–D–G. Play the shapes exactly as shown.', 'C', ['I', 'IV', 'I', 'V', 'I'], { shape: 'near', stage: 'C', bpm: 60, vl: 70 }),
  L('ch-1-3', 1, 'Root in the bass', 'Right hand plays the chord, left hand plays its root below.', 'C', ['I', 'IV', 'V', 'I'], { hand: 'both', shape: 'near', stage: 'B', bpm: 60 }),
  L('ch-1-4', 1, 'Key of G: G, C and D', 'The same three chords in G major, by the nearest shapes.', 'G', ['I', 'IV', 'I', 'V', 'I'], { shape: 'near', bpm: 66, vl: 70 }),
  L('ch-1-5', 1, 'Key of F: F, B♭ and C', 'The three chords of F major. B♭ is the first black-key chord.', 'F', ['I', 'IV', 'I', 'V', 'I'], { shape: 'near', bpm: 66, vl: 70 }),
  L('ch-1-6', 1, 'Two hands in G', 'Chords in the right hand, roots in the left, in G major.', 'G', ['I', 'IV', 'V', 'I'], { hand: 'both', shape: 'near', stage: 'B', bpm: 72 }),
  L('ch-1-7', 1, 'Checkpoint: three chords at 80', 'I–IV–V–I with the root in the bass, in time at 80 beats a minute.', 'C', ['I', 'IV', 'V', 'I'], { hand: 'both', shape: 'near', stage: 'B', bpm: 80 }),
  L('ch-2-1', 2, 'Minor chords: Am, Dm, Em', 'Minor chords have a lower third: three semitones, then four.', 'C', ['vi', 'ii', 'iii', 'vi'], { bpm: 60 }),
  L('ch-2-2', 2, 'The pop loop: I–V–vi–IV', 'C, G, Am, F by the nearest shapes.', 'C', ['I', 'V', 'vi', 'IV'], { shape: 'near', bpm: 70, vl: 70 }),
  L('ch-2-3', 2, 'Minor first: vi–IV–I–V', 'The same four chords, starting on the minor one.', 'C', ['vi', 'IV', 'I', 'V'], { shape: 'near', bpm: 70, vl: 70 }),
  L('ch-2-4', 2, 'The 1950s loop: I–vi–IV–V', 'G, Em, C, D in G major.', 'G', ['I', 'vi', 'IV', 'V'], { shape: 'near', bpm: 72, vl: 70 }),
  L('ch-2-5', 2, 'A minor: i–iv–V', 'Am, Dm and E major: the G♯ in E pulls back home to A.', 'Am', ['i', 'iv', 'V', 'i'], { shape: 'near', bpm: 70 }),
  L('ch-2-6', 2, 'Four chords, two hands', 'I–V–vi–IV in F with the root in the left hand.', 'F', ['I', 'V', 'vi', 'IV'], { hand: 'both', shape: 'near', stage: 'B', bpm: 76 }),
  L('ch-2-7', 2, 'Checkpoint: loops at 80', 'The pop loop in G, root in the bass, at 80.', 'G', ['I', 'V', 'vi', 'IV'], { hand: 'both', shape: 'near', stage: 'B', bpm: 80 }),
  L('ch-3-1', 3, 'Left hand: block chords', 'Hold each chord in the left hand for a whole bar.', 'C', ['I', 'vi', 'IV', 'V'], { hand: 'left', pattern: 'block', bpm: 70, patternPct: 85 }),
  L('ch-3-2', 3, 'Left hand: root and fifth', 'A bouncing bass: root on 1, fifth on 3.', 'C', ['I', 'vi', 'IV', 'V'], { hand: 'left', pattern: 'root-fifth', bpm: 72, patternPct: 85 }),
  L('ch-3-3', 3, 'Left hand: broken 1–5–8', 'Root, fifth, octave, fifth on every beat.', 'C', ['I', 'vi', 'IV', 'V'], { hand: 'left', pattern: 'broken', bpm: 72, patternPct: 85 }),
  L('ch-3-4', 3, 'Left hand: waltz', 'Oom-pah-pah in 3/4: root, chord, chord.', 'F', ['I', 'IV', 'V', 'I'], { hand: 'left', pattern: 'waltz', beats: 3, bpm: 84, patternPct: 85 }),
  L('ch-3-5', 3, 'Left hand: arpeggio', 'Eighth notes up to the tenth and back.', 'C', ['I', 'vi', 'IV', 'V'], { hand: 'left', pattern: 'arpeggio', bpm: 60, patternPct: 85 }),
  L('ch-3-6', 3, 'Left hand: Alberti bass', 'Low–high–middle–high, as in the Classical sonatinas.', 'C', ['I', 'IV', 'V', 'I'], { hand: 'left', pattern: 'alberti', bpm: 60, patternPct: 85 }),
  L('ch-3-7', 3, 'Left hand: ballad sweep', 'A rising sweep under the pop loop.', 'C', ['I', 'V', 'vi', 'IV'], { hand: 'left', pattern: 'ballad', bpm: 60, patternPct: 85 }),
  L('ch-4-1', 4, 'The dominant seventh: V7–I', 'G7 has four notes; you may leave out its fifth. The F falls to E, the B rises to C.', 'C', ['I', 'IV', 'V7', 'I'], { shape: 'near', bpm: 72 }),
  L('ch-4-2', 4, 'D major: I–vi–ii–V7', 'D, Bm, Em, A7 by the nearest shapes.', 'D', ['I', 'vi', 'ii', 'V7'], { shape: 'near', bpm: 72, vl: 70 }),
  L('ch-4-3', 4, 'The ragtime circle', 'I–VI7–II7–V7: each seventh leads to the next chord a fifth lower.', 'C', RAG, { shape: 'near', bpm: 72 }),
  L('ch-4-4', 4, 'All twelve keys', 'I–IV–V7–I round the circle of fifths, two beats a chord.', 'C', ['I', 'IV', 'V7', 'I'], { shape: 'root', beats: 2, loops: 1, circle: true, bpm: 60, onTime: 80 }),
  L('ch-4-5', 4, 'Checkpoint: sevenths, two hands', 'I–vi–ii–V7 in F with the root in the bass, at 84.', 'F', ['I', 'vi', 'ii', 'V7'], { hand: 'both', shape: 'near', stage: 'B', bpm: 84 }),
  L('ch-5-1', 5, 'The 12-bar blues in C', 'Twelve bars of C7, F7 and G7, one chord a bar.', 'C', BLUES, { shape: 'near', loops: 1, bpm: 80 }),
  L('ch-5-2', 5, 'The blues in F, two hands', 'The 12-bar blues in F with the root in the left hand.', 'F', BLUES, { hand: 'both', shape: 'near', stage: 'B', loops: 1, bpm: 84 }),
  L('ch-5-3', 5, 'Boogie walking bass', 'A swung left hand under the 12-bar blues in C.', 'C', BLUES, { hand: 'left', pattern: 'boogie', loops: 1, bpm: 76, patternPct: 80 }),
  L('ch-5-4', 5, 'Stride: oom-pah', 'Low bass on 1 and 3, chord on 2 and 4, over the ragtime circle.', 'C', RAG, { hand: 'left', pattern: 'stride', bpm: 72, patternPct: 85 }),
  L('ch-5-5', 5, 'Checkpoint: stride at 90', 'The ragtime circle in F with a stride left hand, at 90.', 'F', RAG, { hand: 'left', pattern: 'stride', bpm: 90, patternPct: 85 }),
];
const lesson = id => LESSONS.find(l => l.id === id) || null;

// The steps of a lesson in a key: each chord with its beat, length and the shape shown.
// Right hand shapes sit around middle C; left-hand roots and patterns sit an octave or two lower.
function plan(lessonOrId, key) {
  const ls = typeof lessonOrId === 'string' ? lesson(lessonOrId) : lessonOrId;
  key = key || ls.key;
  let symbols = [];
  if (ls.circle) for (const k of allKeys(ls.prog, key)) symbols.push(...k.chords);
  else for (let i = 0; i < ls.loops; i++) symbols.push(...inKey(ls.prog, key));
  const right = ls.hand === 'left' ? null : ls.shape === 'near' ? nearestPath(symbols, { center: 66, low: 59, high: 79 }) : symbols.map(s => rootShape(s, 66, 57, 81));
  const steps = symbols.map((symbol, i) => {
    const chord = parse(symbol);
    let target;
    if (ls.hand === 'left') target = ls.pattern === 'block' ? rootShape(symbol, 50, 40, 59) : patternShape(chord, ls.pattern);
    else if (ls.hand === 'both') { const r = right[i], bass = lowNote(chord.bass ?? chord.root, 43); target = [bass, ...r]; }
    else target = right[i];
    return { symbol, name: chord.name, beat: i * ls.beats, beats: ls.beats, target };
  });
  return { lesson: ls, key, steps, meter: ls.meter, totalBeats: steps.length * ls.beats, pattern: ls.pattern, hand: ls.hand, split: null, rhFrom: ls.hand === 'both' ? 55 : null };
}
const lowNote = (pc, floor) => { let n = floor; while (mod(n) !== pc) n++; return n; };
// the notes a pattern uses over a chord, for the keyboard diagram (root two octaves below middle C)
function patternShape(chord, patternId) {
  const p = PATTERNS[patternId] || PATTERNS.block, root = lowNote(chord.root, 36), out = new Set();
  const up = ['broken', 'arpeggio', 'ballad'].includes(patternId);
  p.slots.forEach(([at, role], i) => {
    if (role === 'chord') { rootShape(chord.symbol, 55, 45, 67).forEach(n => out.add(n)); return; }
    let n = root; while (mod(n) !== rolePc(role, chord)) n++;
    if (up && i > 0 && (role === 'root' || role === 'third' || role === 'ninth')) n += 12;
    out.add(n);
  });
  return [...out].sort((a, b) => a - b);
}
// A lead sheet as a plan: the song's chords (left hand) over its melody (right hand).
function songPlan(song) {
  const ends = song.chords.map((c, i) => (song.chords[i + 1]?.[0] ?? song.total));
  const low = Math.min(...song.melody.map(m => m[0])), split = Math.min(60, low);
  const symbols = song.chords.map(c => c[1]);
  const shapesLH = nearestPath(symbols, { center: split - 9, low: split - 20, high: split - 1 });
  const steps = song.chords.map((c, i) => ({ symbol: c[1], name: parse(c[1]).name, beat: c[0], beats: ends[i] - c[0], target: shapesLH[i] }));
  return { song, key: null, steps, meter: song.meter, totalBeats: song.total, pattern: null, hand: 'song', split, melody: song.melody, bars: song.bars, firstBeat: Math.min(steps[0]?.beat ?? 0, song.melody[0]?.[1] ?? 0) };
}

// ---------------------------------------------------------------------------------------------
// A practice run: feed it notes and the clock, read the result.
// opts: mode 'wait' (the chord waits for you) or 'time' (with the click), stage, bpm, input.
// ---------------------------------------------------------------------------------------------
function session(p, opts = {}) {
  const mode = opts.mode || 'wait', input = opts.input || 'keys', bpm = opts.bpm || 60;
  const stage = input === 'microphone' ? 'A' : (opts.stage || 'A');
  const spb = 60000 / bpm, win = windowMs(bpm, input), countIn = mode === 'time' ? (p.meter || 4) : 0;
  const lh = n => p.split == null || n < p.split;
  const state = { passAt: -Infinity, index: 0, t0: null, done: false, armed: false, ons: [], held: new Map(), steps: p.steps.map(() => ({ ok: false, at: null, misses: 0, voicing: null, tried: false })), last: null };
  const onset = i => state.t0 + p.steps[i].beat * spb;
  const firstBeat = p.firstBeat || 0;
  function heldNotes(time) {
    if (input === 'microphone') return state.ons.filter(n => time - n.time <= 700).map(n => n.midi).filter(lh);
    return [...state.held.keys()].filter(lh);
  }
  function judge(i, time) {
    const step = p.steps[i], notes = heldNotes(time);
    const r = input === 'microphone' ? checkHeard(notes.map(mod), step.symbol) : check(notes, step.symbol, stage, { target: (step.target || []).filter(lh) });
    state.last = { ...r, index: i };
    return r;
  }
  function pass(i, time) {
    const st = state.steps[i];
    st.ok = true; st.at = time; st.voicing = heldNotes(time).sort((a, b) => a - b);
    if (mode === 'time') st.onTime = time - onset(i) <= win;
  }
  function stepAt(time) { let i = -1; for (let k = 0; k < p.steps.length; k++) if (onset(k) - win <= time) i = k; return i; }
  const api = {
    plan: p, mode, stage, bpm, input, win, countIn,
    start(t = now()) { state.t0 = t + countIn * spb - (mode === 'time' ? firstBeat * spb : 0); state.started = t; return state.t0; },
    get t0() { return state.t0; },
    get index() { return state.index; },
    get done() { return state.done; },
    get last() { return state.last; },
    get held() { return [...state.held.keys()].sort((a, b) => a - b); },
    get steps() { return state.steps.map(s => ({ ok: s.ok, onTime: !!s.onTime, misses: s.misses })); },
    beatAt(t = now()) { return (t - state.t0) / spb; },
    input(midi, on, time = now()) {
      if (state.done || state.t0 == null) return null;
      // a note struck within 150 ms of a chord passing belongs to that chord (a rolled chord), not to the next one
      if (on) { state.held.set(midi, time); state.ons.push({ midi, time }); if (!(mode === 'wait' && time - state.passAt < 150)) state.armed = true; } else state.held.delete(midi);
      if (!lh(midi)) return state.last;
      if (mode === 'wait') {
        const i = state.index; if (i >= p.steps.length || !state.armed) return state.last;
        const r = judge(i, time);
        if (r.ok) { pass(i, time); state.index++; state.armed = false; state.passAt = time; if (state.index >= p.steps.length) state.done = true; }
        else if (on && heldNotes(time).length >= r.chord.required.length && !state.steps[i].tried) { state.steps[i].misses++; state.steps[i].tried = true; }
        if (!state.held.size) state.steps[i] && (state.steps[i].tried = false);
        return r;
      }
      const i = stepAt(time);
      if (i < 0) return state.last;
      state.index = i;
      if (!state.steps[i].ok) { const r = judge(i, time); if (r.ok) pass(i, time); return r; }
      return state.last;
    },
    // the clock: in time mode a chord held over its change counts, and the run ends after the last chord
    tick(time = now()) {
      if (state.done || state.t0 == null || mode !== 'time') return state;
      const i = stepAt(time);
      if (i >= 0) {
        state.index = i;
        if (!state.steps[i].ok && time >= onset(i) && heldNotes(time).length) { const r = judge(i, time); if (r.ok) pass(i, Math.max(onset(i), time - 1)); }
      }
      if (time > state.t0 + p.totalBeats * spb + win) state.done = true;
      return state;
    },
    finish() { state.done = true; return api.result(); },
    result() {
      const n = p.steps.length, steps = state.steps;
      const correct = steps.filter(s => s.ok).length, onTime = steps.filter(s => s.ok && (mode === 'wait' || s.onTime)).length;
      const r = { mode, stage, bpm, input, steps: n, correct, correctPct: Math.round(100 * correct / Math.max(1, n)), onTime, onTimePct: Math.round(100 * onTime / Math.max(1, n)), firstTryPct: Math.round(100 * steps.filter(s => s.ok && !s.misses).length / Math.max(1, n)) };
      const isPattern = p.pattern && p.pattern !== 'block' && p.hand === 'left';
      if (!isPattern && p.hand !== 'song' && p.lesson?.shape === 'near') {
        const right = steps.map(s => s.voicing && (p.rhFrom != null ? s.voicing.filter(x => x >= p.rhFrom) : s.voicing));
        r.vl = voiceLeading(right, p.steps.map(s => s.symbol));
      }
      if (p.pattern && mode === 'time') r.pattern = checkPattern(state.ons.filter(n => lh(n.midi)), p.steps, p.pattern, { bpm, t0: state.t0, input });
      if (p.melody && mode === 'time') {
        const used = new Set(); let hit = 0;
        for (const [midi, beat] of p.melody) {
          const t = state.t0 + beat * spb, k = state.ons.findIndex((n, j) => !used.has(j) && !lh(n.midi) && mod(n.midi) === mod(midi) && Math.abs(n.time - t) <= win * 1.5);
          if (k >= 0) { used.add(k); hit++; }
        }
        r.melodyPct = Math.round(100 * hit / Math.max(1, p.melody.length));
      }
      if (p.lesson) r.passed = passes(p.lesson, r);
      return r;
    },
  };
  return api;
}
// The pass rule of a lesson: in time, at least the lesson's stage and tempo, enough chords on time,
// smooth enough voice leading where it asks, and for left-hand patterns enough pattern notes on time.
function passes(ls, r) {
  const rule = ls.pass;
  if (r.mode !== 'time' || r.bpm < rule.bpm) return false;
  if (rule.pattern != null) return (r.pattern?.pct ?? 0) >= rule.pattern;
  if (stageRank(r.stage) < stageRank(rule.stage)) return false;
  if (r.onTimePct < rule.onTime) return false;
  if (rule.vl != null && (r.vl?.score ?? 0) < rule.vl) return false;
  return true;
}
function ruleText(ls) {
  const r = ls.pass;
  if (r.pattern != null) return `In time at ${r.bpm} beats a minute, ${r.pattern}% of the pattern’s notes on time.`;
  const what = { A: 'any shape', B: 'root at the bottom', C: 'the exact shapes shown' }[r.stage];
  return `In time at ${r.bpm} beats a minute, stage ${r.stage} (${what}), ${r.onTime}% of chords on time${r.vl ? `, voice leading ${r.vl} or better` : ''}.`;
}

// ---------------------------------------------------------------------------------------------
// Progress (browser only; synced by the account like the other progress keys)
// ---------------------------------------------------------------------------------------------
const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new Event('piano-progress-changed')); } catch {} };
function record(id, r, extra = {}) {
  const s = read(PROGRESS_KEY), at = String(Date.now());
  s.lessons = s.lessons || {}; const l = s.lessons[id] = s.lessons[id] || {}; l.a = l.a || {};
  l.a[at] = { m: r.mode, s: r.stage, bpm: r.bpm, in: r.input, ot: r.onTimePct, ok: r.correctPct, ...(r.vl ? { vl: r.vl.score } : {}), ...(r.pattern ? { pt: r.pattern.pct } : {}), ...(r.melodyPct != null ? { mel: r.melodyPct } : {}), pass: r.passed ? 1 : 0, ...extra };
  s.last = id;
  write(PROGRESS_KEY, s);
  return at;
}
const attempts = id => Object.entries(read(PROGRESS_KEY).lessons?.[id]?.a || {}).map(([t, a]) => ({ time: Number(t), ...a })).sort((x, y) => x.time - y.time);
const passed = id => attempts(id).some(a => a.pass === 1);
function nextLesson() { return LESSONS.find(l => !passed(l.id)) || null; }
// the chords level: the level of the first lesson not yet passed (6 once every lesson is passed)
function chordsLevel() { return nextLesson()?.level ?? 6; }

// The reading task every chords level asks for: a first-reading piece at the same level.
function readingTask(level) {
  const lv = Math.max(1, Math.min(7, level));
  const gen = window.PianoReadingGen?.next?.(lv);
  if (gen) return { id: gen.id, title: gen.title || 'A new reading piece', done: false, generated: true };
  const R = window.PianoRepertoire || {}, seen = new Set(read(SKILL_KEY).seen || []);
  const list = Object.values(R).filter(s => s.kind === 'reading' && s.studyLevel === lv).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (!list.length) return null;
  const done = list.some(s => seen.has(s.id));
  const pick = list.find(s => !seen.has(s.id)) || list[0];
  return { id: pick.id, title: pick.title, done };
}

// Route: "Read and play pieces" (default) or "Play songs with chords", stored with the path.
function route() { return read(PATH_KEY).route === 'chords' ? 'chords' : 'reading'; }
function setRoute(r) { const s = read(PATH_KEY); s.route = r === 'chords' ? 'chords' : 'reading'; write(PATH_KEY, s); }
const routeChosen = () => !!read(PATH_KEY).route;

// What the Today plan shows on the chords route.
function todayItem(level) {
  const next = nextLesson();
  const open = id => () => { if (window.PianoChords.open) window.PianoChords.open(id); else location.hash = '#chords/' + id; };
  if (!next) {
    const songs = window.PianoLeadSheets?.songs || [], song = songs[Math.floor(Date.now() / 864e5) % Math.max(1, songs.length)];
    return { kind: 'chords', id: song ? 'song-' + song.id : null, title: song ? song.title + ' · chords' : 'Play by chords', note: 'Every chord lesson is passed. Play a song from its lead sheet: melody in the right hand, chords in the left.', label: 'Practise', action: open(song ? 'song/' + song.id : '') };
  }
  const task = readingTask(next.level);
  const reading = task && !task.done ? ` This stage also asks you to read one new piece (${task.title}).` : '';
  return { kind: 'chords', id: next.id, title: next.title, note: `Chords, level ${next.level}: ${next.goal} To pass: ${ruleText(next)}${reading}`, label: 'Practise', action: open(next.id) };
}
// The Today items with the chords lesson added on the chords route (unless the plan has it already).
function planItems(plan) {
  const items = (plan?.items || []).slice();
  if (route() === 'chords' && !items.some(i => i.kind === 'chords')) items.splice(items[0]?.kind === 'warmup' ? 1 : 0, 0, todayItem(plan?.level ?? 1));
  return items;
}

window.PianoChords = Object.assign(window.PianoChords || {}, {
  parse, check, checkHeard, pcName, pretty, STAGES, movement, shapes, rootShape, nearestPath, bestMovement, voiceLeading,
  MAJOR_KEYS, MINOR_KEYS, numeral, inKey, allKeys, keysFor, PATTERNS, checkPattern, windowMs,
  LEVELS, LESSONS, lesson, plan, songPlan, session, passes, ruleText,
  PROGRESS_KEY, record, attempts, passed, nextLesson, chordsLevel, readingTask, route, setRoute, routeChosen, todayItem, planItems,
});
})();
