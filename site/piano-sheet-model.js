'use strict';
// Sheet model: the edit operations of the sheet editor (piano-sheet-editor.js), made on a parsed
// MusicXML document (partwise) with no screen. Every operation keeps the score valid for practice:
// bars stay full in their main voice, rests sit on the beat, beams and accidentals are redone,
// tied notes move together, and a change that cannot be made throws an EditError that says why.
// Note input (like MuseScore's) writes over what is there from a point in time, across barlines
// with ties; the same writing powers paste, voices, triplets and re-barring after a new time
// signature.
(() => {
const kids = (el, tag) => [...el.children].filter(c => c.tagName === tag);
const kid = (el, tag) => kids(el, tag)[0] || null;
const txt = (el, tag) => kid(el, tag)?.textContent ?? null;
const LETTERS = 'CDEFGAB', SEMI = [0, 2, 4, 5, 7, 9, 11], SHARPS = 'FCGDAEB';
const ACC = { 2: 'double-sharp', 1: 'sharp', 0: 'natural', '-1': 'flat', '-2': 'flat-flat' };
// MusicXML wants the children of a note in this order
const ORDER = ['grace', 'cue', 'chord', 'pitch', 'unpitched', 'rest', 'duration', 'tie', 'instrument', 'footnote', 'level', 'voice', 'type', 'dot', 'accidental',
  'time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];
const VALUES = [[4, 'whole'], [2, 'half'], [1, 'quarter'], [0.5, 'eighth'], [0.25, '16th'], [0.125, '32nd'], [0.0625, '64th']];
const NAMES = { whole: 'whole note', half: 'half note', quarter: 'quarter note', eighth: 'eighth note', '16th': '16th note', '32nd': '32nd note', '64th': '64th note' };

function load(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.tagName !== 'score-partwise') throw new Error('Only scores in MusicXML (partwise) can be edited here.');
  doc.nextId = 1;
  for (const n of doc.querySelectorAll('note')) if (!n.getAttribute('id')) n.setAttribute('id', 'e' + doc.nextId++);
  // bars whose length the divisions cannot express (3/8 with one division a quarter) get finer divisions
  for (const part of doc.querySelectorAll('part')) for (const m of kids(part, 'measure')) if (kids(m, 'attributes').some(a => kid(a, 'time'))) { const a = attributesAt(m); ensureDivisions(m, 4 * a.beats / a.beatType); }
  return doc;
}
const serialize = doc => new XMLSerializer().serializeToString(doc);
// the score as saved: without the ids the editor added
const clean = doc => serialize(doc).replace(/ id="[ek]\d+"/g, '');
const byId = (doc, id) => doc.querySelector(`note[id="${id}"]`);
function newNote(doc) { const n = doc.createElement('note'); n.setAttribute('id', 'e' + doc.nextId++); return n; }
function place(note, el) {
  const rank = ORDER.indexOf(el.tagName);
  const after = [...note.children].find(c => ORDER.indexOf(c.tagName) > rank);
  note.insertBefore(el, after || null); return el;
}
function setChild(note, tag, value) {
  let e = kid(note, tag); if (!e) e = place(note, note.ownerDocument.createElement(tag));
  if (value != null) e.textContent = String(value);
  return e;
}
const drop = (note, tag) => { for (const e of kids(note, tag)) e.remove(); };

// Attributes in force at each measure (divisions, key, time, staves), part by part.
function attributesAt(measure) {
  const part = measure.parentNode, out = { div: 1, fifths: 0, beats: 4, beatType: 4, staves: 1, clefs: {}, clefLines: {} };
  for (const m of kids(part, 'measure')) {
    for (const a of kids(m, 'attributes')) {
      if (kid(a, 'divisions')) out.div = Number(txt(a, 'divisions'));
      const key = kid(a, 'key'); if (key && kid(key, 'fifths')) out.fifths = Number(txt(key, 'fifths'));
      const time = kid(a, 'time'); if (time && kid(time, 'beats')) { out.beats = Number(txt(time, 'beats').split('+').reduce((s, x) => s + Number(x), 0)); out.beatType = Number(txt(time, 'beat-type')); }
      if (kid(a, 'staves')) out.staves = Number(txt(a, 'staves'));
      for (const c of kids(a, 'clef')) { const n = c.getAttribute('number') || '1', sign = txt(c, 'sign'); out.clefs[n] = sign; out.clefLines[n] = Number(txt(c, 'line') || (sign === 'F' ? 4 : sign === 'C' ? 3 : 2)); }
    }
    if (m === measure) break;
  }
  return out;
}
const keyAlter = (fifths, step) => fifths > 0 ? (SHARPS.slice(0, fifths).includes(step) ? 1 : 0) : fifths < 0 ? ([...SHARPS].reverse().join('').slice(0, -fifths).includes(step) ? -1 : 0) : 0;

// The events of a measure (a chord or a rest, with the notes that sound with it), in time order.
function events(measure) {
  const out = []; let pos = 0, last = null;
  for (const el of [...measure.children]) {
    if (el.tagName === 'backup') { pos -= Number(txt(el, 'duration') || 0); continue; }
    if (el.tagName === 'forward') { pos += Number(txt(el, 'duration') || 0); continue; }
    if (el.tagName !== 'note') continue;
    if (kid(el, 'chord') && last) { last.notes.push(el); continue; }
    const grace = !!kid(el, 'grace'), dur = grace ? 0 : Number(txt(el, 'duration') || 0);
    last = { head: el, notes: [el], onset: pos, dur, grace, rest: !!kid(el, 'rest'), voice: txt(el, 'voice') || '1', staff: txt(el, 'staff') || '1', measure };
    out.push(last); pos += dur;
  }
  return out;
}
function eventOf(note) {
  if (!note) return null;
  return events(note.parentNode).find(e => e.notes.includes(note)) || null;
}
// Every event of the score, for moving the selection.
function allEvents(doc) {
  const out = []; let mi = 0;
  for (const part of doc.querySelectorAll('part')) { mi = 0; for (const m of kids(part, 'measure')) { for (const e of events(m)) out.push({ ...e, mi, part }); mi++; } }
  return out;
}

const pitchOf = n => { const p = kid(n, 'pitch'); if (!p) return null; return { step: txt(p, 'step'), octave: Number(txt(p, 'octave')), alter: Math.round(Number(txt(p, 'alter') || 0)) }; };
const diatonic = p => p.octave * 7 + LETTERS.indexOf(p.step);
const midiOf = p => 12 * (p.octave + 1) + SEMI[LETTERS.indexOf(p.step)] + p.alter;
function setPitch(note, p) {
  const doc = note.ownerDocument; drop(note, 'rest');
  let el = kid(note, 'pitch'); if (!el) el = place(note, doc.createElement('pitch'));
  el.replaceChildren();
  for (const [tag, v] of [['step', p.step], ['alter', p.alter], ['octave', p.octave]]) { if (tag === 'alter' && !v) continue; const e = doc.createElement(tag); e.textContent = String(v); el.append(e); }
  drop(note, 'stem');
}
const fromDiatonic = (D, fifths) => { const step = LETTERS[((D % 7) + 7) % 7]; return { step, octave: Math.floor(D / 7), alter: keyAlter(fifths, step) }; };

// Accidentals shown in a measure follow the pitches: a note whose pitch differs from what the key
// and earlier accidentals in the bar imply shows its accidental; an accidental that contradicts the
// pitch is removed.
function fixAccidentals(measure) {
  const { fifths } = attributesAt(measure), byStaff = new Map();
  for (const e of events(measure).sort((a, b) => a.onset - b.onset)) { if (!byStaff.has(e.staff)) byStaff.set(e.staff, []); byStaff.get(e.staff).push(e); }
  for (const list of byStaff.values()) {
    const state = new Map();
    for (const e of list) for (const n of e.notes) {
      const p = pitchOf(n); if (!p) continue;
      const k = p.step + p.octave, expect = state.has(k) ? state.get(k) : keyAlter(fifths, p.step);
      const tiedIn = kids(n, 'tie').some(t => t.getAttribute('type') === 'stop'), acc = kid(n, 'accidental');
      if (p.alter !== expect && !tiedIn) { setChild(n, 'accidental', ACC[p.alter] || 'natural'); }
      else if (acc && acc.textContent !== (ACC[p.alter] || 'natural')) acc.remove();
      state.set(k, p.alter);
    }
  }
}

// Note values
function valueOf(q) { // quarters → {type, dots}
  for (const [v, type] of VALUES) { if (Math.abs(q - v) < 1e-9) return { type, dots: 0 }; if (Math.abs(q - 1.5 * v) < 1e-9) return { type, dots: 1 }; if (Math.abs(q - 1.75 * v) < 1e-9) return { type, dots: 2 }; }
  return null;
}
function pieces(q) { // a length as written notes (a dotted value when it fits), longest first
  const out = []; let left = q;
  while (left > 1e-9) {
    if (valueOf(left)) { out.push(left); break; }
    const plain = VALUES.find(([x]) => x <= left + 1e-9); if (!plain) break;
    out.push(plain[0]); left -= plain[0];
  }
  return out;
}
function setValue(note, q) {
  const v = valueOf(q);
  drop(note, 'dot'); drop(note, 'type');
  if (v) { setChild(note, 'type', v.type); for (let i = 0; i < v.dots; i++) place(note, note.ownerDocument.createElement('dot')); }
}
// Make the divisions fine enough for a length (scaling every duration of the part): a triplet
// needs divisions that divide by 3.
function ensureDivisions(measure, q) {
  const part = measure.parentNode, { div } = attributesAt(measure), x = q * div;
  if (Math.abs(x - Math.round(x)) < 1e-6) return div;
  let f = 2; while (f < 97 && Math.abs(x * f - Math.round(x * f)) > 1e-6) f++;
  if (f >= 97) throw new EditError('That length is too fine to write.');
  for (const d of part.querySelectorAll('note > duration, backup > duration, forward > duration, divisions, direction > offset, harmony > offset')) d.textContent = String(Math.round(Number(d.textContent) * f));
  return attributesAt(measure).div;
}
function makeRest(doc, dur, div, voice, staff) {
  const n = newNote(doc); place(n, doc.createElement('rest')); setChild(n, 'duration', dur); setChild(n, 'voice', voice); setValue(n, dur / div); if (staff) setChild(n, 'staff', staff);
  return n;
}
// Rests filling a gap that starts at onset (divisions from the start of the bar): each rest starts on
// a multiple of its own length (dotted quarters and halves in 6/8, 9/8, 12/8), as engravers write them.
function restsFor(doc, dur, div, voice, staff, onset, measure) {
  const { beats, beatType } = attributesAt(measure), compound = beatType === 8 && beats % 3 === 0 && beats > 3;
  const sizes = VALUES.map(([v]) => v).concat(compound ? [3, 1.5] : []).sort((a, b) => b - a), out = [];
  let pos = onset / div, left = dur / div;
  while (left > 1e-9) {
    const v = sizes.find(v => v <= left + 1e-9 && Math.abs(pos / v - Math.round(pos / v)) < 1e-9 && (v < 4 || beats * 4 / beatType >= 4));
    if (!v) { for (const q of pieces(left)) out.push(q); break; }
    out.push(v); pos += v; left -= v;
  }
  return out.map(q => makeRest(doc, Math.round(q * div), div, voice, staff));
}
const lastOf = e => e.notes[e.notes.length - 1];
// the events of one voice that follow an event, up to the first backup/forward or other voice
function following(e) {
  const out = [];
  for (let el = lastOf(e).nextElementSibling; el; el = el.nextElementSibling) {
    if (el.tagName === 'backup' || el.tagName === 'forward') break;
    if (el.tagName !== 'note') continue;
    if ((txt(el, 'voice') || '1') !== e.voice) break;
    if (kid(el, 'chord')) continue;
    out.push(eventOf(el));
  }
  return out;
}
function preceding(e) {
  const out = [];
  for (let el = e.head.previousElementSibling; el; el = el.previousElementSibling) {
    if (el.tagName === 'backup' || el.tagName === 'forward') break;
    if (el.tagName !== 'note') continue;
    if ((txt(el, 'voice') || '1') !== e.voice) break;
    if (kid(el, 'chord')) continue;
    out.unshift(eventOf(el));
  }
  return out;
}

// grace notes written just before an event (they belong to it)
function gracesBefore(e) { const out = []; for (const p of preceding(e).reverse()) { if (!p.grace) break; out.unshift(p); } return out; }
// the notes tied to this one, in order (a tied note is one sound and changes pitch as one)
function tieChain(doc, note) {
  let first = note; for (let k = 0; k < 64; k++) { const p = tiePartner(doc, first, 'stop'); if (!p) break; first = p; }
  const out = [first]; for (let k = 0; k < 64; k++) { const n = tiePartner(doc, out[out.length - 1], 'start'); if (!n || out.includes(n)) break; out.push(n); }
  return out;
}
// the note at the other end of this note's tie of the given type ('start' looks forward)
function tiePartner(doc, note, type) {
  const p = pitchOf(note); if (!p || !kids(note, 'tie').some(t => t.getAttribute('type') === type)) return null;
  const e = eventOf(note), all = allEvents(doc), i = all.findIndex(x => x.head === e.head);
  const pool = type === 'start' ? all.slice(i + 1) : all.slice(0, i).reverse();
  const other = pool.find(x => x.part === e.measure.parentNode && x.voice === e.voice && x.staff === e.staff && !x.grace);
  return other?.notes.find(n => { const q = pitchOf(n); return q && midiOf(q) === midiOf(p) && kids(n, 'tie').some(t => t.getAttribute('type') === (type === 'start' ? 'stop' : 'start')); }) || null;
}
// give a note and the notes tied to it a new pitch
function repitch(doc, note, q, shown) {
  const chain = tieChain(doc, note);
  for (const n of chain) { setPitch(n, q); drop(n, 'accidental'); }
  if (shown != null) setChild(note, 'accidental', ACC[shown]);
  for (const m of new Set(chain.map(n => n.parentNode))) fixAccidentals(m);
}

// Beams for one voice of a measure, regrouped by beat after its rhythm changed.
function rebeam(measure, voice) {
  const { beats, beatType, div } = attributesAt(measure), compound = beatType === 8 && beats % 3 === 0;
  const beat = (compound ? 1.5 : beatType === 8 ? 0.5 * beats : 1) * div;
  const evs = events(measure).filter(e => e.voice === voice && !e.grace);
  for (const e of evs) for (const n of e.notes) drop(n, 'beam');
  const level = e => { const t = txt(e.head, 'type'); return { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 }[t] || 0; };
  let group = [];
  const flush = () => {
    if (group.length >= 2) for (let L = 1; L <= 4; L++) group.forEach((e, i) => {
      if (level(e) < L) return;
      const prev = i > 0 && level(group[i - 1]) >= L, next = i + 1 < group.length && level(group[i + 1]) >= L;
      const kind = prev && next ? 'continue' : prev ? 'end' : next ? 'begin' : L === 1 ? null : (i ? 'backward hook' : 'forward hook');
      if (!kind) return;
      for (const n of e.notes) { const b = place(n, n.ownerDocument.createElement('beam')); b.setAttribute('number', String(L)); b.textContent = kind; }
    });
    group = [];
  };
  for (const e of evs) {
    const ok = !e.rest && level(e) > 0, tm = !!kid(e.head, 'time-modification'), tupStart = !!e.head.querySelector('notations > tuplet[type="start"]');
    if (!ok || (group.length && (Math.floor(e.onset / beat) !== Math.floor(group[0].onset / beat) || tm !== !!kid(group[0].head, 'time-modification') || tupStart))) flush();
    if (ok) group.push(e);
  }
  flush();
}

// Where an event's voice ends in its bar, how long the bar is, and a way to lengthen or shorten the
// voice (the backup that follows it changes with it).
function voiceTail(x) {
  const { div, beats, beatType } = attributesAt(x.measure), list = following(x), last = list.length ? list[list.length - 1] : x;
  const end = x.onset + x.dur + list.reduce((s, f) => s + f.dur, 0);
  const bar = x.measure.getAttribute('implicit') === 'yes' ? end : Math.round(div * 4 * beats / beatType);
  const back = lastOf(last).nextElementSibling?.tagName === 'backup' ? lastOf(last).nextElementSibling : null;
  // the backup returns to where the next voice starts (never before the bar)
  return { end, bar, grow(d) { if (d && back) setChild(back, 'duration', end + d - Math.max(0, end - Number(txt(back, 'duration')))); } };
}

class EditError extends Error {}
const fail = msg => { throw new EditError(msg); };

const ops = {
  // a staff step up or down (d), keeping to the key
  step(doc, note, d) {
    const p = pitchOf(note); if (!p) fail('Choose a note (not a rest) to move it up or down.');
    const { fifths } = attributesAt(note.parentNode), q = fromDiatonic(diatonic(p) + d, fifths);
    if (midiOf(q) < 21 || midiOf(q) > 108) fail('That is off the piano keyboard.');
    repitch(doc, note, q); return note;
  },
  semitone(doc, note, d) {
    const p = pitchOf(note); if (!p) fail('Choose a note to sharpen or flatten it.');
    const alter = Math.max(-2, Math.min(2, p.alter + d)); if (alter === p.alter) return note;
    repitch(doc, note, { ...p, alter }); return note;
  },
  accidental(doc, note, alter) {
    const p = pitchOf(note); if (!p) fail('Choose a note to give it an accidental.');
    repitch(doc, note, { ...p, alter }, alter); return note;
  },
  // a letter: the note becomes that letter (nearest octave); a rest becomes a note; with chord,
  // the letter is added above the chord
  letter(doc, note, L, chord) {
    const e = eventOf(note); if (!e || e.grace && !pitchOf(note)) fail('Choose a note or a rest first.');
    const { fifths, clefs } = attributesAt(note.parentNode), li = LETTERS.indexOf(L);
    const near = (D0, up) => { let best = null; for (let o = 0; o <= 9; o++) { const D = o * 7 + li; if (up ? D <= D0 : false) continue; if (!best || Math.abs(D - D0) < Math.abs(best - D0) || (up && D < best)) best = D; } return best; };
    if (chord) {
      if (e.rest) fail('Add a chord note to a note, not to a rest.');
      if (e.grace) fail('A grace note has one pitch; practice cannot use grace-note chords.');
      const top = Math.max(...e.notes.map(n => diatonic(pitchOf(n)))), D = near(top, true);
      const n = newNote(doc), src = e.head;
      place(n, doc.createElement('chord'));
      for (const tag of ['duration', 'voice', 'type', 'staff']) if (kid(src, tag)) setChild(n, tag, txt(src, tag));
      for (const d of kids(src, 'dot')) place(n, d.cloneNode());
      if (kid(src, 'time-modification')) place(n, kid(src, 'time-modification').cloneNode(true));
      setPitch(n, fromDiatonic(D, fifths));
      lastOf(e).after(n); fixAccidentals(note.parentNode); return n;
    }
    let ref = pitchOf(note);
    if (!ref) { // a rest: start near the previous note of this staff, or the middle of the staff
      const prev = allEvents(doc).filter(x => x.staff === e.staff && x.part === e.measure.parentNode && !x.rest).filter(x => x.mi < indexOfMeasure(e.measure) || (x.measure === e.measure && x.onset < e.onset)).pop();
      ref = prev ? pitchOf(prev.head) : (clefs[e.staff] === 'F' ? { step: 'D', octave: 3, alter: 0 } : { step: 'B', octave: 4, alter: 0 });
    }
    const D0 = diatonic(ref), D = [D0 - 7, D0, D0 + 7].map(x => Math.floor(x / 7) * 7 + li).sort((a, b) => Math.abs(a - D0) - Math.abs(b - D0))[0];
    const q = fromDiatonic(D, fifths);
    if (e.rest) {
      const rest = kid(note, 'rest'), measureRest = rest?.getAttribute('measure') === 'yes';
      setPitch(note, q);
      if (measureRest || !kid(note, 'type')) { // a whole-bar rest becomes notes as long as the bar can be written
        const { div } = attributesAt(note.parentNode), parts = pieces(e.dur / div);
        setValue(note, parts[0]); setChild(note, 'duration', Math.round(parts[0] * div));
        let at = note; for (const pq of parts.slice(1)) { const r = makeRest(doc, Math.round(pq * div), div, e.voice, txt(note, 'staff')); at.after(r); at = r; }
      }
      rebeam(note.parentNode, e.voice);
    } else { repitch(doc, note, q); }
    fixAccidentals(note.parentNode); return note;
  },
  // delete: a note of a chord goes; a single note becomes a rest
  remove(doc, note) {
    const e = eventOf(note); if (!e) fail('Choose a note first.');
    if (e.rest) fail('That is already a rest. Change a note’s length to fill the space.');
    if (e.notes.length > 1) {
      const i = e.notes.indexOf(note);
      for (const t of kids(note, 'tie')) unTie(doc, note, t.getAttribute('type')); // while the chord is whole
      if (i === 0) drop(e.notes[1], 'chord');
      note.remove(); fixAccidentals(e.measure); return e.notes[i === 0 ? 1 : i - 1];
    }
    return ops.rest(doc, note);
  },
  // the event becomes a rest of the same length
  rest(doc, note) {
    const e = eventOf(note); if (!e) fail('Choose a note first.');
    if (e.rest) return note;
    if (e.grace) { for (const n of e.notes) n.remove(); return null; }
    const head = e.head;
    for (const g of gracesBefore(e)) for (const n of g.notes) n.remove();
    for (const n of e.notes) for (const t of kids(n, 'tie')) unTie(doc, n, t.getAttribute('type'));
    for (const n of e.notes.slice(1)) n.remove();
    for (const tag of ['pitch', 'unpitched', 'tie', 'accidental', 'stem', 'notehead', 'beam', 'notations', 'lyric']) drop(head, tag);
    place(head, doc.createElement('rest'));
    rebeam(e.measure, e.voice); fixAccidentals(e.measure);
    return head;
  },
  // a new length (in quarters); a shorter note leaves rests after it, a longer one takes the room of
  // what follows in its voice (never past the barline)
  length(doc, note, q) {
    const e = eventOf(note); if (!e || e.grace) fail('Choose a note or a rest first.');
    if (e.notes.some(n => kid(n, 'time-modification'))) fail('Notes in a tuplet keep their length here; change them in a notation editor.');
    const div = ensureDivisions(e.measure, q), x = eventOf(note), measure = x.measure;
    let want = Math.round(q * div); const old = x.dur;
    if (want === old) { for (const n of x.notes) setValue(n, q); return note; }
    const tail = voiceTail(x);
    if (want < old) {
      for (const n of x.notes) { if (kids(n, 'tie').some(t => t.getAttribute('type') === 'start')) unTie(doc, n, 'start'); setChild(n, 'duration', want); setValue(n, q); }
      // a voice that runs past the barline (a misread beat) gets shorter instead of gaining rests
      const over = Math.min(old - want, Math.max(0, tail.end - tail.bar)); tail.grow(-over);
      let at = lastOf(x); for (const r of restsFor(doc, old - want - over, div, x.voice, txt(x.head, 'staff'), x.onset + want, measure)) { at.after(r); at = r; }
    } else {
      let need = want - old;
      for (const f of following(x)) {
        if (need <= 0) break;
        if (f.grace) { for (const n of f.notes) n.remove(); continue; }
        if (f.dur <= need) { for (const n of f.notes) for (const t of kids(n, 'tie')) unTie(doc, n, t.getAttribute('type')); for (const n of f.notes) n.remove(); need -= f.dur; continue; }
        const left = f.dur - need, anchor = f.head.previousElementSibling;
        for (const n of f.notes) for (const t of kids(n, 'tie')) unTie(doc, n, t.getAttribute('type'));
        for (const n of f.notes) n.remove();
        let at = anchor; for (const r of restsFor(doc, left, div, x.voice, txt(x.head, 'staff'), x.onset + want, measure)) { at.after(r); at = r; }
        need = 0;
      }
      if (need > 0) { const room = Math.min(need, Math.max(0, tail.bar - tail.end)); tail.grow(room); need -= room; } // a voice short of the barline fills its bar
      if (need > 0) want -= need; // the bar ends first
      const qq = want / div;
      if (!valueOf(qq)) fail('That length does not fit before the barline.');
      for (const n of x.notes) { setChild(n, 'duration', want); setValue(n, qq); }
      if (kid(x.head, 'rest')?.getAttribute('measure') === 'yes') kid(x.head, 'rest').removeAttribute('measure');
    }
    rebeam(measure, x.voice); return note;
  },
  dot(doc, note) {
    const e = eventOf(note); if (!e) fail('Choose a note or a rest first.');
    const { div } = attributesAt(e.measure), q = e.dur / div, v = valueOf(q);
    if (!v) fail('This note has no plain length to dot.');
    const base = VALUES.find(([, t]) => t === v.type)[0];
    return ops.length(doc, note, v.dots ? base : base * 1.5);
  },
  // tie the note to the same pitch in the next chord of its voice (or untie it)
  tie(doc, note) {
    const p = pitchOf(note); if (!p) fail('Choose a note to tie.');
    if (kids(note, 'tie').some(t => t.getAttribute('type') === 'start')) { unTie(doc, note, 'start'); return note; }
    const e = eventOf(note), all = allEvents(doc), i = all.findIndex(x => x.head === e.head);
    const next = all.slice(i + 1).find(x => x.part === e.measure.parentNode && x.voice === e.voice && x.staff === e.staff && !x.grace);
    const target = next && !next.rest && next.notes.find(n => { const q = pitchOf(n); return q && midiOf(q) === midiOf(p); });
    if (!target) fail('A tie joins a note to the same pitch in the next chord of its hand. Make the next note the same pitch first.');
    if (gracesBefore(next).length) fail('A grace note comes before the next note, so the two cannot be tied.');
    if (next.measure !== e.measure && repeatBetween(e.measure, next.measure)) fail('A tie cannot run over a repeat sign or into an ending: practice plays the repeat, so it would not join.');
    addTie(doc, note, 'start'); addTie(doc, target, 'stop'); fixAccidentals(target.parentNode); return note;
  },
  // the chord moves to the other staff (the other hand)
  hand(doc, note) {
    let e = eventOf(note); if (!e) fail('Choose a note first.');
    const { staves } = attributesAt(e.measure); if (staves < 2) fail('This part has one staff, so there is no other hand to move to.');
    if (e.grace) { e = following(e).find(x => !x.grace); if (!e) fail('This grace note leads to no note in its bar.'); } // the grace notes go with their note
    const to = e.staff === '1' ? '2' : '1';
    for (const n of e.notes) for (const t of kids(n, 'tie')) unTie(doc, n, t.getAttribute('type'));
    for (const n of [...gracesBefore(e).flatMap(g => g.notes), ...e.notes]) { setChild(n, 'staff', to); drop(n, 'stem'); }
    fixAccidentals(e.measure); return note;
  },
  // swap the event with the one before or after it in its voice (same bar)
  move(doc, note, dir) {
    const e = eventOf(note); if (!e) fail('Choose a note or a rest first.');
    if (e.grace) fail('A grace note stays with the note it leads to; move that note instead.');
    const other = dir < 0 ? preceding(e).filter(x => !x.grace).pop() : following(e).filter(x => !x.grace)[0];
    if (!other) fail(dir < 0 ? 'This is the first note of its hand in the bar.' : 'This is the last note of its hand in the bar.');
    const [a, b] = dir < 0 ? [other, e] : [e, other];
    const block = x => [...gracesBefore(x).flatMap(g => g.notes), ...x.notes];
    const A = block(a), B = block(b);
    for (const n of [...A, ...B]) for (const t of kids(n, 'tie')) unTie(doc, n, t.getAttribute('type'));
    const before = A[0];
    for (const n of B) before.before(n);
    rebeam(e.measure, e.voice); fixAccidentals(e.measure); return note;
  },
  // an empty bar after this one (whole-bar rests in every staff)
  addMeasure(doc, note) {
    const m = note.parentNode, { div, beats, beatType, staves } = attributesAt(m), len = Math.round(div * 4 * beats / beatType);
    for (const n of m.querySelectorAll('note')) { const to = tiePartner(doc, n, 'start'); if (to && to.parentNode !== m) unTie(doc, n, 'start'); }
    const fresh = doc.createElement('measure');
    const voices = {}; for (const e of events(m)) if (!voices[e.staff]) voices[e.staff] = e.voice;
    for (let s = 1; s <= staves; s++) {
      if (s > 1) { const b = doc.createElement('backup'); const d = doc.createElement('duration'); d.textContent = String(len); b.append(d); fresh.append(b); }
      const r = makeRest(doc, len, div, voices[s] || String(s === 1 ? 1 : 5), staves > 1 ? String(s) : null);
      kid(r, 'rest').setAttribute('measure', 'yes'); drop(r, 'type'); drop(r, 'dot'); fresh.append(r);
    }
    m.after(fresh); renumber(m.parentNode); return kids(fresh, 'note')[0];
  },
  removeMeasure(doc, note) {
    const m = note.parentNode, part = m.parentNode, list = kids(part, 'measure');
    if (list.length < 2) fail('A score needs at least one bar.');
    const next = m.nextElementSibling, prev = m.previousElementSibling;
    // signatures and clefs that start here carry on in the next bar
    const attrs = kids(m, 'attributes');
    if (next && attrs.length) {
      let into = kids(next, 'attributes')[0];
      if (!into) { into = doc.createElement('attributes'); next.insertBefore(into, next.firstElementChild); }
      for (const a of attrs) for (const c of [...a.children]) {
        const same = [...into.children].find(x => x.tagName === c.tagName && (x.getAttribute('number') || '') === (c.getAttribute('number') || ''));
        if (!same) into.insertBefore(c.cloneNode(true), [...into.children].find(x => ATTR_ORDER.indexOf(x.tagName) > ATTR_ORDER.indexOf(c.tagName)) || null);
      }
    }
    for (const n of m.querySelectorAll('note')) for (const t of kids(n, 'tie')) unTie(doc, n, t.getAttribute('type'));
    m.remove(); renumber(part);
    const to = next || prev; return kids(to, 'note')[0] || null;
  },
};
const ATTR_ORDER = ['footnote', 'level', 'divisions', 'key', 'time', 'staves', 'part-symbol', 'instruments', 'clef', 'staff-details', 'transpose', 'directive', 'measure-style'];
function indexOfMeasure(m) { return kids(m.parentNode, 'measure').indexOf(m); }
function renumber(part) {
  const list = kids(part, 'measure'), implicit = list[0]?.getAttribute('implicit') === 'yes';
  list.forEach((m, i) => m.setAttribute('number', String(implicit ? i : i + 1)));
}
function addTie(doc, note, type) {
  if (kids(note, 'tie').some(t => t.getAttribute('type') === type)) return;
  const t = place(note, doc.createElement('tie')); t.setAttribute('type', type);
  const notations = kid(note, 'notations') || place(note, doc.createElement('notations'));
  const tied = doc.createElement('tied'); tied.setAttribute('type', type); notations.append(tied);
}
// remove a tie from both of its notes
function unTie(doc, note, type) {
  const partner = tiePartner(doc, note, type);
  const strip = (n, ty) => { for (const t of kids(n, 'tie')) if (t.getAttribute('type') === ty) t.remove(); const nt = kid(n, 'notations'); if (nt) { for (const t of kids(nt, 'tied')) if (t.getAttribute('type') === ty) t.remove(); if (!nt.children.length) nt.remove(); } };
  strip(note, type);
  if (partner) strip(partner, type === 'start' ? 'stop' : 'start');
}

function noteName(p) { return p.step + ({ 2: '𝄪', 1: '♯', 0: '', '-1': '♭', '-2': '𝄫' }[p.alter] || '') + p.octave; }
function describe(note) {
  const e = eventOf(note); if (!e) return '';
  const m = e.measure, { staves } = attributesAt(m), num = m.getAttribute('number');
  const hand = staves > 1 ? (e.staff === '1' ? 'right hand' : 'left hand') : '';
  const type = txt(e.head, 'type'), dots = kids(e.head, 'dot').length, len = (dots ? 'dotted ' : '') + (NAMES[type] || (kid(e.head, 'rest')?.getAttribute('measure') === 'yes' ? 'whole bar' : 'note'));
  const what = e.rest ? (len.replace(/ note$/, '') + ' rest') : e.notes.length > 1 ? `${noteName(pitchOf(note))} in a chord of ${e.notes.length} (${e.notes.map(n => noteName(pitchOf(n))).join(' ')}) · ${len}` : `${noteName(pitchOf(note))} · ${len}`;
  return [`Measure ${num}`, hand, what].filter(Boolean).join(' · ');
}


// ---------------------------------------------------------------------------------------------
// Bars as voices in time
// ---------------------------------------------------------------------------------------------
const mk = (doc, tag, text) => { const e = doc.createElement(tag); if (text != null) e.textContent = String(text); return e; };
const staffOf = ev => txt(ev.els[0], 'staff') || '1';
const hasTM = n => !!kid(n, 'time-modification');

// Where each bar of a part starts, in quarter notes from the start of the score.
function starts(part) {
  const out = []; let t = 0, div = 1, beats = 4, beatType = 4;
  for (const m of kids(part, 'measure')) {
    for (const a of kids(m, 'attributes')) {
      if (kid(a, 'divisions')) div = Number(txt(a, 'divisions'));
      const time = kid(a, 'time'); if (time && kid(time, 'beats')) { beats = txt(time, 'beats').split('+').reduce((s, x) => s + Number(x), 0); beatType = Number(txt(time, 'beat-type')); }
    }
    let len = 4 * beats / beatType;
    if (m.getAttribute('implicit') === 'yes') { let end = 0; for (const e of events(m)) end = Math.max(end, e.onset + e.dur); if (end) len = end / div; }
    out.push({ m, t, len, div }); t += len;
  }
  return out;
}
function measureLen(m) { const s = starts(m.parentNode).find(x => x.m === m); return Math.round(s.len * s.div); }
function locate(part, q) { for (const s of starts(part)) if (q < s.t + s.len - 1e-9) return { measure: s.m, offset: Math.max(0, q - s.t), start: s.t, len: s.len }; return null; }
const scoreEnd = part => { const st = starts(part), l = st[st.length - 1]; return l ? l.t + l.len : 0; };
// every event of a part with its time in quarters (q) and length in quarters (len)
function timed(doc, part) {
  const st = new Map(starts(part).map(s => [s.m, s]));
  return allEvents(doc).filter(e => e.part === part).map(e => { const s = st.get(e.measure); return { ...e, q: s.t + e.onset / s.div, len: e.dur / s.div }; });
}
const timeOf = e => { const s = starts(e.measure.parentNode).find(x => x.m === e.measure); return s.t + e.onset / s.div; };
function eventAt(doc, part, staff, voice, q) { return timed(doc, part).find(e => e.staff === staff && e.voice === voice && !e.grace && Math.abs(e.q - q) < 1e-6) || null; }

// The voices a staff can use: its main voice first, then voices 2–4 (numbered as MuseScore does:
// 1–4 on the upper staff, 5–8 on the lower), skipping numbers another staff already uses.
function staffVoices(part, staff) {
  const count = new Map(), staffsOf = new Map();
  for (const m of kids(part, 'measure')) for (const e of events(m)) {
    if (e.staff === staff) count.set(e.voice, (count.get(e.voice) || 0) + 1);
    if (!staffsOf.has(e.voice)) staffsOf.set(e.voice, new Set()); staffsOf.get(e.voice).add(e.staff);
  }
  const conv = Array.from({ length: 4 }, (_, i) => String((Number(staff) - 1) * 4 + i + 1));
  const mine = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  const out = mine.length ? [mine[0]] : [];
  for (const v of conv) if (!out.includes(v) && (!staffsOf.has(v) || [...staffsOf.get(v)].every(s => s === staff))) out.push(v);
  for (const v of mine) if (!out.includes(v)) out.push(v);
  return out.slice(0, 4);
}

// A bar read as voices of events in time, with everything else (directions, attributes,
// barlines) kept at its time, and written back in a clean order: voice after voice, gaps as
// forwards, other elements at their time in the first voice.
function readMeasure(m) {
  const r = { left: [], right: [], others: [], voices: new Map() }; let pos = 0, last = null, i = 0;
  for (const el of [...m.children]) {
    const t = el.tagName;
    if (t === 'backup') { pos -= Number(txt(el, 'duration') || 0); continue; }
    if (t === 'forward') { pos += Number(txt(el, 'duration') || 0); continue; }
    if (t === 'note') {
      if (kid(el, 'chord') && last) { last.els.push(el); continue; }
      const v = txt(el, 'voice') || '1', grace = !!kid(el, 'grace'), dur = grace ? 0 : Number(txt(el, 'duration') || 0);
      last = { onset: pos, dur, grace, els: [el] };
      if (!r.voices.has(v)) r.voices.set(v, []); r.voices.get(v).push(last); pos += dur; continue;
    }
    if (t === 'barline') { const loc = el.getAttribute('location') || 'right'; if (loc === 'left') { r.left.push(el); continue; } if (loc === 'right') { r.right.push(el); continue; } }
    r.others.push({ el, onset: pos, i: i++ });
  }
  return r;
}
function writeMeasure(m, r) {
  const doc = m.ownerDocument, out = [...r.left], others = [...r.others].sort((a, b) => a.onset - b.onset || a.i - b.i);
  let pos = 0, oi = 0;
  const move = (d, v, s) => { if (!d) return; const f = mk(doc, d > 0 ? 'forward' : 'backup'); f.append(mk(doc, 'duration', Math.abs(d))); if (d > 0 && v) { f.append(mk(doc, 'voice', v)); if (s) f.append(mk(doc, 'staff', s)); } out.push(f); pos += d; };
  const othersTo = t => { while (oi < others.length && others[oi].onset <= t) { const o = others[oi++]; if (o.onset > pos) move(o.onset - pos); out.push(o.el); } };
  [...r.voices.keys()].forEach((v, k) => {
    const list = r.voices.get(v).slice().sort((a, b) => a.onset - b.onset || (b.grace - a.grace));
    if (k > 0) move(-pos);
    for (const ev of list) {
      if (k === 0) othersTo(ev.onset);
      if (ev.onset !== pos) move(ev.onset - pos, v, staffOf(ev));
      out.push(...ev.els); pos += ev.dur;
    }
    if (k === 0) othersTo(Infinity);
  });
  othersTo(Infinity);
  out.push(...r.right);
  m.replaceChildren(...out);
}

function cloneNote(doc, n, keepNotations) {
  const c = n.cloneNode(true); c.setAttribute('id', 'e' + doc.nextId++);
  for (const tag of ['tie', 'beam']) drop(c, tag);
  const nt = kid(c, 'notations'); if (nt) { for (const t of kids(nt, 'tied')) t.remove(); if (!keepNotations) { nt.remove(); drop(c, 'lyric'); } else if (!nt.children.length) nt.remove(); }
  return c;
}
// tie the notes of one event to the same pitches in the next
function tieEvents(doc, a, b) {
  for (const n of a.els) { const p = pitchOf(n); if (!p) continue; const t = b.els.find(x => { const q = pitchOf(x); return q && midiOf(q) === midiOf(p); }); if (t) { addTie(doc, n, 'start'); addTie(doc, t, 'stop'); } }
}
function restEvents(doc, m, voice, staff, onset, len) {
  const { div, staves } = attributesAt(m); let at = onset;
  return restsFor(doc, len, div, voice, staves > 1 ? staff : null, onset, m).map(r => { const d = Number(txt(r, 'duration')), ev = { onset: at, dur: d, grace: false, els: [r] }; at += d; return ev; });
}
// an event cut to its first len divisions (a note as tied notes when one value cannot hold it)
function truncate(doc, m, ev, len, voice) {
  const { div } = attributesAt(m), q = len / div;
  if (kid(ev.els[0], 'rest')) return restEvents(doc, m, voice, staffOf(ev), ev.onset, len);
  const parts = valueOf(q) ? [q] : pieces(q), out = []; let at = ev.onset, prev = null;
  parts.forEach((pq, i) => {
    const els = i === 0 ? ev.els : ev.els.map(n => cloneNote(doc, n, false)), d = Math.round(pq * div);
    for (const n of els) { setChild(n, 'duration', d); setValue(n, pq); }
    const e2 = { onset: at, dur: d, grace: false, els }; if (prev) tieEvents(doc, prev, e2); out.push(e2); prev = e2; at += d;
  });
  return out;
}

// Write over [onset, onset + dur) of one voice of one bar. What started earlier is cut short
// (tied notes if needed), what ran on is followed by rests, and the new events come from build.
function overwrite(doc, m, voice, onset, dur, build) {
  const end = onset + dur;
  for (const e of events(m)) {
    if (e.voice !== voice) continue;
    const eEnd = e.onset + e.dur, hit = e.grace ? e.onset >= onset && e.onset < end : eEnd > onset && e.onset < end;
    if (!hit) continue;
    if (!e.grace && e.notes.some(hasTM) && !(e.onset === onset && e.dur === dur)) fail('Notes in a triplet (or other tuplet) are written over one at a time, each with its own length.');
    for (const n of e.notes) { unTie(doc, n, 'start'); if (e.grace || e.onset >= onset) unTie(doc, n, 'stop'); }
  }
  const r = readMeasure(m), list = r.voices.get(voice) || [], keep = []; let replaced = null;
  for (const ev of list) {
    const evEnd = ev.onset + ev.dur;
    if (ev.grace) { if (!(ev.onset >= onset && ev.onset < end)) keep.push(ev); continue; }
    if (evEnd <= onset || ev.onset >= end) { keep.push(ev); continue; }
    if (ev.onset === onset && ev.dur === dur) replaced = ev;
    if (ev.onset < onset) keep.push(...truncate(doc, m, ev, onset - ev.onset, voice));
    if (evEnd > end) keep.push(...restEvents(doc, m, voice, staffOf(ev), end, evEnd - end));
  }
  const fresh = build(replaced);
  keep.push(...fresh); r.voices.set(voice, keep); writeMeasure(m, r);
  return fresh;
}

function chordEls(doc, spec, first) {
  if (spec.rest) { const n = newNote(doc); place(n, mk(doc, 'rest')); return [n]; }
  if (spec.templates) return spec.templates.map((t, i) => { const c = cloneNote(doc, t, first); for (const tag of ['chord', 'grace', 'accidental', 'time-modification', 'stem']) drop(c, tag); if (i) place(c, mk(doc, 'chord')); return c; });
  return spec.pitches.map((p, i) => { const n = newNote(doc); if (i) place(n, mk(doc, 'chord')); setPitch(n, p); return n; });
}
// The events a write puts in [onset, onset + dur) of a bar. Written over a tuplet note, the new
// note takes its place in the tuplet.
function buildEvents(doc, m, voice, staff, onset, dur, spec, replaced) {
  if (spec.gap) return [];
  const { div, staves } = attributesAt(m), withStaff = staves > 1;
  const tmFrom = replaced && hasTM(replaced.els[0]) ? replaced.els[0] : spec.templates && hasTM(spec.templates[0]) ? spec.templates[0] : null;
  if (spec.rest && !tmFrom) return restEvents(doc, m, voice, staff, onset, dur);
  let lens;
  if (tmFrom) lens = [dur];
  else { const ps = valueOf(dur / div) ? [dur / div] : pieces(dur / div); lens = ps.map(q => Math.round(q * div)); }
  const out = []; let at = onset, prev = null;
  lens.forEach((d, i) => {
    const els = chordEls(doc, spec, i === 0);
    for (const n of els) {
      setChild(n, 'duration', d); setChild(n, 'voice', voice); if (withStaff) setChild(n, 'staff', staff); else drop(n, 'staff');
      if (tmFrom) {
        drop(n, 'type'); drop(n, 'dot'); setChild(n, 'type', txt(tmFrom, 'type')); for (let k = 0; k < kids(tmFrom, 'dot').length; k++) place(n, mk(doc, 'dot'));
        place(n, kid(tmFrom, 'time-modification').cloneNode(true));
        if (tmFrom === replaced?.els[0] && n === els[0]) { // the tuplet bracket stays where it was
          const nt0 = kid(n, 'notations'); if (nt0) for (const t of kids(nt0, 'tuplet')) t.remove();
          const tup = kid(tmFrom, 'notations') ? kids(kid(tmFrom, 'notations'), 'tuplet') : [];
          if (tup.length) { const nt = kid(n, 'notations') || place(n, mk(doc, 'notations')); for (const t of tup) nt.append(t.cloneNode(true)); }
        }
      } else setValue(n, d / div);
    }
    const ev = { onset: at, dur: d, grace: false, els };
    if (prev && !spec.rest) tieEvents(doc, prev, ev);
    out.push(ev); prev = ev; at += d;
  });
  return out;
}

// Add an empty bar at the end of every part.
function appendMeasure(doc) {
  for (const part of doc.querySelectorAll('part')) { const list = kids(part, 'measure'); list[list.length - 1].after(emptyMeasure(doc, part, list[list.length - 1])); renumber(part); }
}
function emptyMeasure(doc, part, ref) {
  const { div, beats, beatType, staves } = attributesAt(ref), len = Math.round(div * 4 * beats / beatType), fresh = mk(doc, 'measure');
  for (let s = 1; s <= staves; s++) {
    if (s > 1) { const b = mk(doc, 'backup'); b.append(mk(doc, 'duration', len)); fresh.append(b); }
    const r = makeRest(doc, len, div, staffVoices(part, String(s))[0] || String((s - 1) * 4 + 1), staves > 1 ? String(s) : null);
    kid(r, 'rest').setAttribute('measure', 'yes'); drop(r, 'type'); drop(r, 'dot'); fresh.append(r);
  }
  return fresh;
}

function repeatBetween(a, b) {
  const bar = (m, loc) => kids(m, 'barline').filter(x => (x.getAttribute('location') || 'right') === loc);
  return bar(a, 'right').some(x => kid(x, 'repeat') || kid(x, 'ending')) || bar(b, 'left').some(x => kid(x, 'repeat') || kid(x, 'ending'));
}
// Write a note, chord, rest or gap of len quarters at time q in one voice, over whatever is
// there, continuing across barlines with ties (bars are added at the end of the score as needed).
function writeSpan(doc, part, q, len, voice, staff, spec) {
  const written = []; let prev = null, prevBar = null, left = len, at = q;
  const tuplet = spec.templates && hasTM(spec.templates[0]);
  for (let guard = 0; left > 1e-9 && guard < 500; guard++) {
    let loc = locate(part, at);
    if (!loc) { appendMeasure(doc); loc = locate(part, at); if (!loc) break; }
    const m = loc.measure;
    if (tuplet && loc.len - loc.offset < left - 1e-9) fail('A tuplet note cannot cross a barline.');
    const take = Math.min(loc.len - loc.offset, left);
    ensureDivisions(m, loc.offset); ensureDivisions(m, take);
    const { div } = attributesAt(m), on = Math.round(loc.offset * div), d = Math.round(take * div);
    const fresh = overwrite(doc, m, voice, on, d, rep => buildEvents(doc, m, voice, staff, on, d, spec, rep));
    // a note runs on over a barline with a tie, but not over a repeat sign or into an ending,
    // where the music played next is somewhere else
    if (prev && fresh.length && !spec.rest && !(prevBar && repeatBetween(prevBar, m))) tieEvents(doc, prev, fresh[0]);
    if (fresh.length) prev = fresh[fresh.length - 1];
    prevBar = m;
    written.push(...fresh);
    rebeam(m, voice); fixAccidentals(m);
    at += take; left -= take;
  }
  return written;
}

// ---------------------------------------------------------------------------------------------
// Pitches
// ---------------------------------------------------------------------------------------------
// The spelling of a key number: notes of the key first, then sharps going up (or in sharp keys)
// and flats going down (or in flat keys).
function spell(midi, fifths, pref = 0) {
  const pc = ((midi % 12) + 12) % 12; let best = null, bestScore = Infinity;
  for (let li = 0; li < 7; li++) for (const alter of [0, 1, -1, 2, -2]) {
    if ((((SEMI[li] + alter) % 12) + 12) % 12 !== pc) continue;
    const octave = Math.round((midi - SEMI[li] - alter) / 12) - 1, step = LETTERS[li];
    const dir = pref || (fifths < 0 ? -1 : 1);
    const score = alter === keyAlter(fifths, step) ? 0 : Math.abs(alter) === 2 ? 5 : alter === 0 ? 1 : Math.sign(alter) === dir ? 2 : 3;
    if (score < bestScore) { bestScore = score; best = { step, octave, alter }; }
  }
  return best;
}
function spellings(midi) {
  const out = [];
  for (let li = 0; li < 7; li++) for (const alter of [-2, -1, 0, 1, 2]) if ((((SEMI[li] + alter) % 12) + 12) % 12 === ((midi % 12) + 12) % 12) out.push({ step: LETTERS[li], alter, octave: Math.round((midi - SEMI[li] - alter) / 12) - 1 });
  return out.sort((a, b) => Math.abs(a.alter) - Math.abs(b.alter) || a.alter - b.alter);
}
const clefMiddle = sign => sign === 'F' ? { step: 'D', octave: 3, alter: 0 } : sign === 'C' ? { step: 'C', octave: 4, alter: 0 } : { step: 'B', octave: 4, alter: 0 };
// The pitch a letter names: in the octave nearest the previous note of the staff
function letterPitch(doc, part, staff, voice, q, L) {
  const before = timed(doc, part).filter(e => e.staff === staff && !e.rest && e.q < q - 1e-9);
  const prev = before.filter(e => e.voice === voice).pop() || before.pop();
  const loc = locate(part, Math.min(q, Math.max(0, scoreEnd(part) - 1e-6))), { fifths, clefs } = attributesAt(loc ? loc.measure : kids(part, 'measure')[0]);
  const ref = prev ? pitchOf(prev.head) : clefMiddle(clefs[staff]);
  const D0 = diatonic(ref), li = LETTERS.indexOf(L);
  const D = [D0 - 7, D0, D0 + 7].map(x => Math.floor(x / 7) * 7 + li).sort((a, b) => Math.abs(a - D0) - Math.abs(b - D0))[0];
  return fromDiatonic(D, fifths);
}
const onKeyboard = p => midiOf(p) >= 21 && midiOf(p) <= 108;

// ---------------------------------------------------------------------------------------------
// Notations
// ---------------------------------------------------------------------------------------------
const notationsOf = n => kid(n, 'notations') || place(n, mk(n.ownerDocument, 'notations'));
const tidy = n => { const nt = kid(n, 'notations'); if (!nt) return; for (const c of [...nt.children]) if (['articulations', 'technical', 'ornaments'].includes(c.tagName) && !c.children.length) c.remove(); if (!nt.children.length) nt.remove(); };
const ARTICULATIONS = ['staccato', 'staccatissimo', 'tenuto', 'accent', 'strong-accent', 'detached-legato'];
const DYNAMICS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sf', 'sfz', 'fp'];
const DYN_SOUND = { ppp: 23, pp: 36, p: 49, mp: 62, mf: 76, f: 89, ff: 102, fff: 115, sf: 100, sfz: 100, fp: 89 };
// the attributes at the very start of a bar (made if missing)
function startAttributes(m) {
  const first = [...m.children].find(c => c.tagName !== 'barline' && c.tagName !== 'print');
  if (first?.tagName === 'attributes') return first;
  const a = mk(m.ownerDocument, 'attributes'); m.insertBefore(a, first || null); return a;
}
function putAttr(a, el) { // replace or insert a child of <attributes> in schema order
  const same = [...a.children].find(x => x.tagName === el.tagName && (x.getAttribute('number') || '') === (el.getAttribute('number') || ''));
  if (same) { same.replaceWith(el); return el; }
  a.insertBefore(el, [...a.children].find(x => ATTR_ORDER.indexOf(x.tagName) > ATTR_ORDER.indexOf(el.tagName)) || null); return el;
}
// where something written at an event's time goes: before its grace notes and the event itself
const anchorOf = e => (gracesBefore(e)[0]?.head) || e.head;
const atBarStart = e => e.onset === 0;
function makeBarline(doc, loc) { const b = mk(doc, 'barline'); b.setAttribute('location', loc); return b; }
const BARLINE_ORDER = ['bar-style', 'footnote', 'level', 'wavy-line', 'segno', 'coda', 'fermata', 'ending', 'repeat'];
function barlineOf(m, loc, create) {
  let b = kids(m, 'barline').find(x => (x.getAttribute('location') || 'right') === loc);
  if (!b && create) { b = makeBarline(m.ownerDocument, loc); if (loc === 'left') m.insertBefore(b, m.firstElementChild); else m.append(b); }
  return b;
}
function putBar(b, el) { drop(b, el.tagName); b.insertBefore(el, [...b.children].find(x => BARLINE_ORDER.indexOf(x.tagName) > BARLINE_ORDER.indexOf(el.tagName)) || null); return el; }
const measuresAt = (doc, i) => [...doc.querySelectorAll('part')].map(p => kids(p, 'measure')[i]).filter(Boolean);

// ---------------------------------------------------------------------------------------------
// Re-barring after a time signature change
// ---------------------------------------------------------------------------------------------
function rebar(doc, part, i, beats, beatType) {
  const all = kids(part, 'measure'); let j = i + 1;
  while (j < all.length && !kids(all[j], 'attributes').some(a => kid(a, 'time'))) j++;
  const old = all.slice(i, j), st = new Map(starts(part).map(s => [s.m, s])), t0 = st.get(old[0]).t, div0 = st.get(old[0]).div;
  if (old.some(m => st.get(m).div !== div0)) fail('The bars after this one change their divisions; change the time signature in a notation editor.');
  const voices = new Map(), others = []; let total = 0;
  // ties into the first bar and out of the last are made again after re-barring
  const inside = new Set(old.flatMap(m => [...m.querySelectorAll('note')])), crossIn = [], crossOut = [];
  for (const n of inside) {
    const a = tiePartner(doc, n, 'stop'), b = tiePartner(doc, n, 'start'), key = { voice: txt(n, 'voice') || '1', midi: midiOf(pitchOf(n) || { step: 'C', octave: 4, alter: 0 }) };
    if (a && !inside.has(a)) { crossIn.push(key); unTie(doc, n, 'stop'); addTie(doc, a, 'start'); }
    if (b && !inside.has(b)) { crossOut.push({ ...key, other: b }); unTie(doc, n, 'start'); addTie(doc, b, 'stop'); }
  }
  for (const m of old) {
    const s = st.get(m), r = readMeasure(m);
    for (const [v, list] of r.voices) { if (!voices.has(v)) voices.set(v, []); for (const ev of list) voices.get(v).push({ q: s.t - t0 + ev.onset / s.div, len: ev.dur / s.div, grace: ev.grace, els: ev.els, staff: staffOf(ev), rest: !!kid(ev.els[0], 'rest') }); }
    for (const o of r.others) others.push({ q: s.t - t0 + o.onset / s.div, el: o.el });
    total = s.t - t0 + s.len;
  }
  const left = readMeasure(old[0]).left, right = readMeasure(old[old.length - 1]).right, newLen = 4 * beats / beatType;
  const count = Math.max(1, Math.ceil(total / newLen - 1e-9));
  for (const list of voices.values()) for (const ev of list) if (!ev.grace && hasTM(ev.els[0]) && Math.floor(ev.q / newLen + 1e-9) !== Math.floor((ev.q + ev.len) / newLen - 1e-9)) fail('A triplet would cross one of the new barlines. Change those notes first.');
  // a tied note is one sound: it is written again as one note and split at the new barlines
  for (const [v, list] of voices) {
    const merged = [];
    for (const ev of list) {
      const prev = merged[merged.length - 1];
      const tiedIn = prev && !prev.grace && !ev.grace && !prev.rest && !ev.rest && Math.abs(prev.q + prev.len - ev.q) < 1e-6 && prev.els.length === ev.els.length
        && prev.els.every(n => kids(n, 'tie').some(t => t.getAttribute('type') === 'start') && ev.els.some(x => midiOf(pitchOf(x)) === midiOf(pitchOf(n)) && kids(x, 'tie').some(t => t.getAttribute('type') === 'stop')));
      if (tiedIn && !hasTM(prev.els[0])) prev.len += ev.len; else merged.push({ ...ev });
    }
    voices.set(v, merged);
  }
  const fresh = [];
  for (let k = 0; k < count; k++) {
    const m = mk(doc, 'measure'); if (k === 0) m.append(...left);
    let pos = 0;
    for (const o of others.filter(o => (k === count - 1 ? o.q >= k * newLen - 1e-9 : o.q >= k * newLen - 1e-9 && o.q < (k + 1) * newLen - 1e-9))) {
      const at = Math.round((o.q - k * newLen) * div0); if (at > pos) { const f = mk(doc, 'forward'); f.append(mk(doc, 'duration', at - pos)); m.append(f); pos = at; } m.append(o.el);
    }
    if (pos) { const b = mk(doc, 'backup'); b.append(mk(doc, 'duration', pos)); m.append(b); }
    if (k === count - 1) m.append(...right);
    fresh.push(m);
  }
  old[0].before(...fresh); for (const m of old) m.remove();
  const time = mk(doc, 'time'); time.append(mk(doc, 'beats', beats), mk(doc, 'beat-type', beatType)); putAttr(startAttributes(fresh[0]), time);
  const start = starts(part).find(s => s.m === fresh[0]).t;
  for (const [v, list] of voices) {
    let graces = [];
    for (const ev of list) {
      if (ev.grace) { graces.push(ev); continue; }
      const w = writeSpan(doc, part, start + ev.q, ev.len, v, ev.staff, ev.rest && !hasTM(ev.els[0]) ? { rest: true } : { templates: ev.els });
      if (graces.length && w[0]) { const head = w[0].els[0]; for (const g of graces) for (const n of g.els) { const c = n.cloneNode(true); c.setAttribute('id', 'e' + doc.nextId++); head.before(c); } }
      graces = [];
    }
  }
  for (const m of fresh) fillBar(doc, part, m);
  renumber(part);
  const evs = fresh.flatMap(m => events(m)).filter(e => !e.grace && !e.rest), findNote = (e, midi) => e?.notes.find(n => pitchOf(n) && midiOf(pitchOf(n)) === midi);
  for (const k of crossIn) { const e = evs.find(x => x.measure === fresh[0] && x.onset === 0 && x.voice === k.voice && findNote(x, k.midi)); if (e) addTie(doc, findNote(e, k.midi), 'stop'); else unTieDangling(doc, part, k); }
  for (const k of crossOut) { const last = fresh[fresh.length - 1], e = evs.filter(x => x.measure === last && x.voice === k.voice && findNote(x, k.midi)).pop(); if (e && e.onset + e.dur === measureLen(last)) addTie(doc, findNote(e, k.midi), 'start'); else stripTie(k.other, 'stop'); }
}
// a tie whose other end did not survive re-barring is taken off
function stripTie(n, type) { for (const t of kids(n, 'tie')) if (t.getAttribute('type') === type) t.remove(); const nt = kid(n, 'notations'); if (nt) { for (const t of kids(nt, 'tied')) if (t.getAttribute('type') === type) t.remove(); if (!nt.children.length) nt.remove(); } }
function unTieDangling(doc, part, k) { for (const n of part.querySelectorAll('note')) if (pitchOf(n) && midiOf(pitchOf(n)) === k.midi && (txt(n, 'voice') || '1') === k.voice && kids(n, 'tie').some(t => t.getAttribute('type') === 'start') && !tiePartner(doc, n, 'start')) stripTie(n, 'start'); }
// the main voice of each staff runs the whole bar (rests where nothing is written); a voice that is
// a single rest of the whole bar becomes a whole-bar rest
function fillBar(doc, part, m) {
  const { staves } = attributesAt(m), L = measureLen(m), r = readMeasure(m);
  for (let s = 1; s <= staves; s++) {
    const v = staffVoices(part, String(s))[0] || String((s - 1) * 4 + 1), list = (r.voices.get(v) || []).slice().sort((a, b) => a.onset - b.onset);
    let pos = 0; const add = [];
    for (const ev of list) { if (ev.onset > pos) add.push(...restEvents(doc, m, v, String(s), pos, ev.onset - pos)); pos = Math.max(pos, ev.onset + ev.dur); }
    if (pos < L) add.push(...restEvents(doc, m, v, String(s), pos, L - pos));
    if (add.length) { r.voices.set(v, [...list, ...add]); }
  }
  for (const [, list] of r.voices) if (list.length === 1 && !list[0].grace && kid(list[0].els[0], 'rest') && list[0].dur === L) { kid(list[0].els[0], 'rest').setAttribute('measure', 'yes'); drop(list[0].els[0], 'type'); drop(list[0].els[0], 'dot'); }
  writeMeasure(m, r);
}


// ---------------------------------------------------------------------------------------------
// Lyrics and chord symbols
// ---------------------------------------------------------------------------------------------
function lyricOf(note, verse = 1) {
  const e = eventOf(note); if (!e) return null;
  const l = kids(e.head, 'lyric').find(x => (x.getAttribute('number') || '1') === String(verse));
  return l ? { text: txt(l, 'text') || '', syllabic: txt(l, 'syllabic') || 'single' } : null;
}
// The text below a note (verse 1, 2, …): syllabic is single, begin, middle or end, as in MusicXML
function setLyric(doc, note, text, syllabic = 'single', verse = 1) {
  const e = eventOf(note); if (!e || e.rest) fail('Lyrics go under notes, not rests.');
  if (e.grace) fail('Lyrics go under main notes, not grace notes.');
  for (const l of kids(e.head, 'lyric')) if ((l.getAttribute('number') || '1') === String(verse)) l.remove();
  if (text && text.trim()) {
    const l = mk(doc, 'lyric'); l.setAttribute('number', String(verse));
    l.append(mk(doc, 'syllabic', syllabic), mk(doc, 'text', text.trim()));
    // lyrics come after notations; verses in number order
    const after = kids(e.head, 'lyric').find(x => Number(x.getAttribute('number') || 1) > verse) || [...e.head.children].find(c => ['play', 'listen'].includes(c.tagName));
    e.head.insertBefore(l, after || null);
  }
  return note;
}
// Chord symbols: "C", "F#m7", "Bbmaj7/D", "Gsus4", "Edim7", "Am7b5", "D9", "C/E" …
const KINDS = [['maj13', 'major-13th'], ['maj11', 'major-11th'], ['maj9', 'major-ninth'], ['maj7', 'major-seventh'], ['M7', 'major-seventh'], ['Δ7', 'major-seventh'], ['Δ', 'major-seventh'],
  ['m(maj7)', 'major-minor'], ['mMaj7', 'major-minor'], ['m7b5', 'half-diminished'], ['ø7', 'half-diminished'], ['ø', 'half-diminished'], ['dim7', 'diminished-seventh'], ['°7', 'diminished-seventh'],
  ['dim', 'diminished'], ['°', 'diminished'], ['aug7', 'augmented-seventh'], ['+7', 'augmented-seventh'], ['aug', 'augmented'], ['+', 'augmented'], ['m13', 'minor-13th'], ['m11', 'minor-11th'],
  ['m9', 'minor-ninth'], ['m7', 'minor-seventh'], ['m6', 'minor-sixth'], ['min', 'minor'], ['m', 'minor'], ['-', 'minor'], ['sus4', 'suspended-fourth'], ['sus2', 'suspended-second'], ['sus', 'suspended-fourth'],
  ['13', 'dominant-13th'], ['11', 'dominant-11th'], ['9', 'dominant-ninth'], ['7', 'dominant'], ['6', 'major-sixth'], ['5', 'power']];
function parseChord(text) {
  const t = text.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const m = t.match(/^([A-Ga-g])([#b]?)(.*?)(?:\/([A-Ga-g])([#b]?))?$/);
  if (!m) fail('Write a chord symbol such as C, F#m7, Bbmaj7, Gsus4, Edim or C/E.');
  const suffix = m[3] || '', exact = KINDS.find(([k]) => suffix === k), start = KINDS.find(([k]) => suffix.startsWith(k));
  const kind = !suffix ? 'major' : exact ? exact[1] : start ? start[1] : 'other';
  return { root: m[1].toUpperCase(), alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, suffix, kind, bass: m[4] ? { step: m[4].toUpperCase(), alter: m[5] === '#' ? 1 : m[5] === 'b' ? -1 : 0 } : null };
}
const harmonyBefore = e => { const out = []; for (let p = anchorOf(e).previousElementSibling; p && (p.tagName === 'harmony' || p.tagName === 'direction'); p = p.previousElementSibling) if (p.tagName === 'harmony') out.push(p); return out; };
function chordOf(note) {
  const e = eventOf(note); if (!e) return null;
  const h = harmonyBefore(e)[0]; if (!h) return null;
  const acc = a => ({ 1: '#', '-1': 'b' }[String(Math.round(Number(a || 0)))] || '');
  const root = h.querySelector('root'), kind = kid(h, 'kind'), bass = h.querySelector('bass');
  if (!root) return null;
  const k = kind?.getAttribute('text') ?? '';
  return txt(root, 'root-step') + acc(txt(root, 'root-alter')) + k + (bass ? '/' + txt(bass, 'bass-step') + acc(txt(bass, 'bass-alter')) : '');
}
function setChord(doc, note, text) {
  const e = eventOf(note); if (!e) fail('Choose the note or rest where the chord symbol goes.');
  for (const h of harmonyBefore(e)) h.remove();
  if (text && text.trim()) {
    const c = parseChord(text), h = mk(doc, 'harmony'); h.setAttribute('placement', 'above');
    const root = mk(doc, 'root'); root.append(mk(doc, 'root-step', c.root)); if (c.alter) root.append(mk(doc, 'root-alter', c.alter)); h.append(root);
    const kind = mk(doc, 'kind', c.kind); kind.setAttribute('text', c.suffix); h.append(kind);
    if (c.bass) { const b = mk(doc, 'bass'); b.append(mk(doc, 'bass-step', c.bass.step)); if (c.bass.alter) b.append(mk(doc, 'bass-alter', c.bass.alter)); h.append(b); }
    if (attributesAt(e.measure).staves > 1) h.append(mk(doc, 'staff', e.staff));
    anchorOf(e).before(h);
  }
  return note;
}

// ---------------------------------------------------------------------------------------------
// Ties over repeat signs and into endings: practice plays the repeat, so such a tie cannot join.
// They are taken off when a repeat or ending is added (and the editor says so).
// ---------------------------------------------------------------------------------------------
function untieAcrossRepeats(doc) {
  let n = 0;
  for (const note of [...doc.querySelectorAll('note')]) {
    if (!kids(note, 'tie').some(t => t.getAttribute('type') === 'start')) continue;
    const to = tiePartner(doc, note, 'start');
    if (to && to.parentNode !== note.parentNode && repeatBetween(note.parentNode, to.parentNode)) { unTie(doc, note, 'start'); n++; }
  }
  if (n) doc.notice = n === 1 ? 'A tie over the new repeat sign was taken off: practice plays the repeat, so the tie could not join.' : `${n} ties over the new repeat signs were taken off: practice plays the repeats, so the ties could not join.`;
  return n;
}

// ---------------------------------------------------------------------------------------------
// Operations added for note input, selections and palettes
// ---------------------------------------------------------------------------------------------
Object.assign(ops, {
  // ↑ ↓: a semitone, spelled as the key suggests (sharps going up, flats going down)
  chromatic(doc, note, d) {
    const p = pitchOf(note); if (!p) fail('Choose a note (not a rest) to raise or lower it.');
    const { fifths } = attributesAt(note.parentNode), q = spell(midiOf(p) + d, fifths, Math.sign(d));
    if (!onKeyboard(q)) fail('That is off the piano keyboard.');
    repitch(doc, note, q); return note;
  },
  // an exact pitch (from the on-screen piano or a MIDI keyboard); a rest becomes a note
  pitch(doc, note, p) {
    const e = eventOf(note); if (!e) fail('Choose a note or a rest first.');
    if (e.rest) { ops.letter(doc, note, p.step, false); }
    repitch(doc, note, p); return note;
  },
  // add a pitch to the chord (an exact pitch, or a letter above the top note, or an interval above it)
  addPitch(doc, note, p) {
    const e = eventOf(note); if (!e || e.rest) fail('Add a chord note to a note, not to a rest.');
    if (e.grace) fail('A grace note has one pitch; practice cannot use grace-note chords.');
    if (e.notes.some(n => midiOf(pitchOf(n)) === midiOf(p))) return e.notes.find(n => midiOf(pitchOf(n)) === midiOf(p));
    if (!onKeyboard(p)) fail('That is off the piano keyboard.');
    const n = newNote(doc), src = e.head;
    place(n, mk(doc, 'chord'));
    for (const tag of ['duration', 'voice', 'type', 'staff']) if (kid(src, tag)) setChild(n, tag, txt(src, tag));
    for (const d of kids(src, 'dot')) place(n, d.cloneNode());
    if (hasTM(src)) place(n, kid(src, 'time-modification').cloneNode(true));
    for (const b of kids(src, 'beam')) place(n, b.cloneNode(true));
    setPitch(n, p); lastOf(e).after(n); fixAccidentals(note.parentNode); return n;
  },
  interval(doc, note, steps) {
    const e = eventOf(note); if (!e || e.rest) fail('Add an interval to a note, not to a rest.');
    const top = e.notes.map(pitchOf).sort((a, b) => diatonic(b) - diatonic(a))[0], { fifths } = attributesAt(note.parentNode);
    return ops.addPitch(doc, note, fromDiatonic(diatonic(top) + steps, fifths));
  },
  // note input: write at the cursor and move it on. what = {letter} | {pitches} | {rest}
  enter(doc, cur, len, what) {
    const here = eventAt(doc, cur.part, cur.staff, cur.voice, cur.q);
    if (here && hasTM(here.head)) len = here.len; // inside a tuplet the note takes the tuplet's length
    let spec;
    if (what.rest) spec = { rest: true };
    else if (what.letter) spec = { pitches: [letterPitch(doc, cur.part, cur.staff, cur.voice, cur.q, what.letter)] };
    else spec = { pitches: what.pitches };
    if (spec.pitches && !spec.pitches.every(onKeyboard)) fail('That is off the piano keyboard.');
    const w = writeSpan(doc, cur.part, cur.q, len, cur.voice, cur.staff, spec);
    return { note: w[0]?.els[0] || null, next: { ...cur, q: cur.q + len } };
  },
  // a triplet (or 5, 6, 7) in the time of the chosen note; its first note keeps the pitch
  tuplet(doc, note, n = 3) {
    const e0 = eventOf(note); if (!e0 || e0.grace) fail('Choose a note or rest to turn into a triplet.');
    if (e0.notes.some(hasTM)) fail('This note is already in a tuplet.');
    const normal = n === 3 ? 2 : 4, m = e0.measure, q = e0.dur / attributesAt(m).div, v = valueOf(q / normal);
    if (!v) fail('Choose a note of a plain length (a quarter, eighth or half) to make a triplet from.');
    ensureDivisions(m, q / n);
    const e = eventOf(note), { div } = attributesAt(m), d = Math.round(q / n * div);
    if (Math.abs(d * n - e.dur) > 0) fail('That note cannot be divided evenly here.');
    const pitches = e.rest ? null : e.notes.map(pitchOf);
    for (const x of e.notes) for (const t of kids(x, 'tie')) unTie(doc, x, t.getAttribute('type'));
    const made = overwrite(doc, m, e.voice, e.onset, e.dur, () => Array.from({ length: n }, (_, k) => {
      const els = chordEls(doc, k === 0 && pitches ? { pitches } : { rest: true }, true);
      for (const x of els) {
        setChild(x, 'duration', d); setChild(x, 'voice', e.voice); if (attributesAt(m).staves > 1) setChild(x, 'staff', e.staff);
        setChild(x, 'type', v.type); for (let i = 0; i < v.dots; i++) place(x, mk(doc, 'dot'));
        const tm = mk(doc, 'time-modification'); tm.append(mk(doc, 'actual-notes', n), mk(doc, 'normal-notes', normal)); place(x, tm);
      }
      if (k === 0 || k === n - 1) { const t = mk(doc, 'tuplet'); t.setAttribute('type', k === 0 ? 'start' : 'stop'); if (k === 0) t.setAttribute('bracket', 'yes'); notationsOf(els[0]).append(t); }
      return { onset: e.onset + k * d, dur: d, grace: false, els };
    }));
    rebeam(m, e.voice); fixAccidentals(m);
    return made[0].els[0];
  },
  // move a note or chord to another voice of its staff (index 0–3)
  voice(doc, note, index) {
    const e = eventOf(note); if (!e || e.grace) fail('Choose a note to move it to another voice.');
    if (e.rest) fail('Choose a note (not a rest) to move it to another voice.');
    if (e.notes.some(hasTM)) fail('Notes in a tuplet stay in their voice.');
    const part = e.measure.parentNode, voices = staffVoices(part, e.staff), target = voices[index];
    if (!target) fail('There is no free voice number for that.');
    if (target === e.voice) return note;
    const q = timeOf(e), len = e.dur / attributesAt(e.measure).div, templates = e.notes.map(n => n.cloneNode(true));
    for (const n of e.notes) for (const t of kids(n, 'tie')) unTie(doc, n, t.getAttribute('type'));
    overwrite(doc, e.measure, e.voice, e.onset, e.dur, () => voices[0] === e.voice ? restEvents(doc, e.measure, e.voice, e.staff, e.onset, e.dur) : []);
    rebeam(e.measure, e.voice);
    const w = writeSpan(doc, part, q, len, target, e.staff, { templates });
    return w[0]?.els[0] || null;
  },
  // a note in voice 2–4 can be deleted completely (leaving no rest)
  erase(doc, note) {
    const e = eventOf(note); if (!e) fail('Choose a note or rest first.');
    const part = e.measure.parentNode;
    if (staffVoices(part, e.staff)[0] === e.voice) { if (e.rest) fail('That is already a rest. Write a note over it, or lengthen the note before it.'); return ops.rest(doc, note); }
    if (e.notes.some(hasTM)) fail('Notes in a tuplet stay; make them rests instead.');
    for (const n of e.notes) for (const t of kids(n, 'tie')) unTie(doc, n, t.getAttribute('type'));
    overwrite(doc, e.measure, e.voice, e.onset, e.dur, () => []); return null;
  },
  articulation(doc, note, name) {
    const e = eventOf(note); if (!e || e.rest) fail('Choose a note to mark it.');
    const head = e.head;
    if (name === 'fermata') { const nt = notationsOf(head), f = kid(nt, 'fermata'); if (f) f.remove(); else nt.append(mk(doc, 'fermata')); tidy(head); return note; }
    const nt = notationsOf(head), arts = kid(nt, 'articulations') || nt.appendChild(mk(doc, 'articulations')), had = kid(arts, name);
    if (had) had.remove(); else { if (name === 'staccato') drop(arts, 'staccatissimo'); if (name === 'staccatissimo') drop(arts, 'staccato'); if (name === 'accent') drop(arts, 'strong-accent'); if (name === 'strong-accent') drop(arts, 'accent'); arts.append(mk(doc, name)); }
    tidy(head); return note;
  },
  // the finger (1–5) printed on a note, or none; practice shows it
  fingering(doc, note, f) {
    if (!pitchOf(note)) fail('Choose a note to give it a finger number.');
    const nt = kid(note, 'notations'); if (nt) for (const t of kids(nt, 'technical')) { drop(t, 'fingering'); }
    if (f) { const n2 = notationsOf(note), tech = kid(n2, 'technical') || n2.appendChild(mk(doc, 'technical')); tech.append(mk(doc, 'fingering', f)); }
    tidy(note); return note;
  },
  dynamic(doc, note, mark) {
    const e = eventOf(note); if (!e) fail('Choose a note or rest where the dynamic starts.');
    const at = anchorOf(e);
    for (let p = at.previousElementSibling; p && p.tagName === 'direction'; ) { const prev = p.previousElementSibling; if (p.querySelector('dynamics') && (txt(p, 'staff') || '1') === e.staff) p.remove(); p = prev; }
    if (mark) {
      const d = mk(doc, 'direction'); d.setAttribute('placement', 'below');
      const dt = mk(doc, 'direction-type'), dy = mk(doc, 'dynamics'); dy.append(mk(doc, mark)); dt.append(dy); d.append(dt);
      if (attributesAt(e.measure).staves > 1) d.append(mk(doc, 'staff', e.staff));
      const snd = mk(doc, 'sound'); snd.setAttribute('dynamics', String(DYN_SOUND[mark] || 80)); d.append(snd);
      at.before(d);
    }
    return note;
  },
  // a tempo mark (♩ = bpm) where the note is
  tempo(doc, note, bpm) {
    const e = eventOf(note); if (!e) fail('Choose a note or rest where the tempo starts.');
    const at = anchorOf(e);
    for (let p = at.previousElementSibling; p && p.tagName === 'direction'; ) { const prev = p.previousElementSibling; if (p.querySelector('metronome') || kid(p, 'sound')?.hasAttribute('tempo')) p.remove(); p = prev; }
    if (bpm) {
      const d = mk(doc, 'direction'); d.setAttribute('placement', 'above');
      const dt = mk(doc, 'direction-type'), mt = mk(doc, 'metronome'); mt.append(mk(doc, 'beat-unit', 'quarter'), mk(doc, 'per-minute', bpm)); dt.append(mt); d.append(dt);
      const snd = mk(doc, 'sound'); snd.setAttribute('tempo', String(bpm)); d.append(snd);
      at.before(d);
    }
    return note;
  },
  // a slur from this note to another (or to the next note of its voice); again removes it
  slur(doc, note, to) {
    const e = eventOf(note); if (!e || e.rest) fail('Choose the note where the slur starts.');
    const has = n => kid(n, 'notations') && kids(kid(n, 'notations'), 'slur');
    const startSlur = (has(e.head) || []).find(s => s.getAttribute('type') === 'start');
    if (startSlur && !to) {
      const num = startSlur.getAttribute('number') || '1'; startSlur.remove(); tidy(e.head);
      const all = allEvents(doc), i = all.findIndex(x => x.head === e.head);
      for (const x of all.slice(i + 1)) { const s = (has(x.head) || []).find(s => s.getAttribute('type') === 'stop' && (s.getAttribute('number') || '1') === num); if (s) { s.remove(); tidy(x.head); break; } }
      return note;
    }
    let end = to ? eventOf(to) : null;
    if (!end) { const all = allEvents(doc), i = all.findIndex(x => x.head === e.head); end = all.slice(i + 1).find(x => x.part === e.part && x.voice === e.voice && x.staff === e.staff && !x.rest && !x.grace) || all.slice(i + 1).find(x => x.part === e.measure.parentNode && x.voice === e.voice && !x.rest && !x.grace); }
    if (!end || end.head === e.head) fail('A slur needs a second note after this one.');
    const used = new Set([...doc.querySelectorAll('slur')].map(s => s.getAttribute('number') || '1')); let num = 1; while (used.has(String(num)) && num < 6) num++;
    const a = mk(doc, 'slur'); a.setAttribute('type', 'start'); a.setAttribute('number', String(num)); notationsOf(e.head).append(a);
    const b = mk(doc, 'slur'); b.setAttribute('type', 'stop'); b.setAttribute('number', String(num)); notationsOf(end.head).append(b);
    return note;
  },
  // a grace note before the note (same pitch; change it like any note)
  grace(doc, note, kind = 'acciaccatura') {
    const e = eventOf(note); if (!e || e.rest || e.grace) fail('Choose a note to put a grace note before it.');
    if (e.notes.some(n => kids(n, 'tie').some(t => t.getAttribute('type') === 'stop'))) fail('A grace note cannot go before a note that continues a tie.');
    const g = newNote(doc), gr = mk(doc, 'grace'); if (kind === 'acciaccatura') gr.setAttribute('slash', 'yes');
    place(g, gr); setPitch(g, pitchOf(e.head)); setChild(g, 'voice', e.voice); setChild(g, 'type', kind === 'acciaccatura' ? 'eighth' : '16th');
    if (attributesAt(e.measure).staves > 1) setChild(g, 'staff', e.staff);
    anchorOf(e).before(g); fixAccidentals(e.measure); return g;
  },
  // stems: automatic → up → down → automatic
  flip(doc, note) {
    const e = eventOf(note); if (!e || e.rest) fail('Choose a note to flip its stem.');
    const now = txt(e.head, 'stem'), next = !now ? 'up' : now === 'up' ? 'down' : null;
    for (const n of e.notes) { drop(n, 'stem'); if (next) setChild(n, 'stem', next); }
    return note;
  },
  // the same key under another name (C♯ ↔ D♭)
  respell(doc, note) {
    const p = pitchOf(note); if (!p) fail('Choose a note to respell it.');
    const list = spellings(midiOf(p)), i = list.findIndex(x => x.step === p.step && x.alter === p.alter), q = list[(i + 1) % list.length];
    for (const n of tieChain(doc, note)) { setPitch(n, q); drop(n, 'accidental'); }
    for (const m of new Set(tieChain(doc, note).map(n => n.parentNode))) fixAccidentals(m);
    return note;
  },
  // a clef for this note's staff from this note on
  clef(doc, note, sign, line) {
    const e = eventOf(note); if (!e) fail('Choose the note where the new clef starts.');
    const c = mk(doc, 'clef'); if (attributesAt(e.measure).staves > 1) c.setAttribute('number', e.staff); c.append(mk(doc, 'sign', sign), mk(doc, 'line', line));
    if (atBarStart(e)) putAttr(startAttributes(e.measure), c);
    else {
      const at = anchorOf(e); let a = at.previousElementSibling;
      if (a?.tagName !== 'attributes') { a = mk(doc, 'attributes'); at.before(a); }
      putAttr(a, c);
    }
    return note;
  },
  // a key signature from this bar on (in every part); the pitches stay, the accidentals follow
  key(doc, note, fifths) {
    const i = indexOfMeasure(note.parentNode);
    for (const m of measuresAt(doc, i)) {
      const k = mk(doc, 'key'); k.append(mk(doc, 'fifths', fifths)); putAttr(startAttributes(m), k);
      const list = kids(m.parentNode, 'measure');
      for (let j = i; j < list.length; j++) { if (j > i && kids(list[j], 'attributes').some(a => kid(a, 'key'))) break; fixAccidentals(list[j]); }
    }
    return note;
  },
  // a time signature from this bar on: the music is re-barred until the next time signature
  time(doc, note, beats, beatType) {
    const id = note.getAttribute('id'), i = indexOfMeasure(note.parentNode);
    for (const part of doc.querySelectorAll('part')) if (kids(part, 'measure')[i]) rebar(doc, part, i, beats, beatType);
    return byId(doc, id) || kids(kids(doc.querySelector('part'), 'measure')[i], 'note')[0] || null;
  },
  // the barline at the end of this bar (or a start repeat at its beginning)
  barline(doc, note, kind) {
    const i = indexOfMeasure(note.parentNode);
    for (const m of measuresAt(doc, i)) {
      if (kind === 'repeat-start') {
        const b = barlineOf(m, 'left', true), had = kid(b, 'repeat');
        if (had) { had.remove(); drop(b, 'bar-style'); if (!b.children.length) b.remove(); continue; }
        putBar(b, mk(doc, 'bar-style', 'heavy-light')); const r = mk(doc, 'repeat'); r.setAttribute('direction', 'forward'); putBar(b, r); continue;
      }
      const b = barlineOf(m, 'right', true); drop(b, 'repeat'); drop(b, 'bar-style');
      if (kind === 'double') putBar(b, mk(doc, 'bar-style', 'light-light'));
      if (kind === 'final') putBar(b, mk(doc, 'bar-style', 'light-heavy'));
      if (kind === 'repeat-end') { putBar(b, mk(doc, 'bar-style', 'light-heavy')); const r = mk(doc, 'repeat'); r.setAttribute('direction', 'backward'); putBar(b, r); }
      if (!b.children.length) b.remove();
    }
    untieAcrossRepeats(doc);
    return note;
  },
  // a 1st or 2nd ending over bars a..b (indexes); the 1st ending ends with a repeat
  ending(doc, note, number, lastNote) {
    const a = indexOfMeasure(note.parentNode), b = lastNote ? Math.max(a, indexOfMeasure(lastNote.parentNode)) : a;
    for (const part of doc.querySelectorAll('part')) {
      const list = kids(part, 'measure'), first = list[a], last = list[b]; if (!first || !last) continue;
      const lb = barlineOf(first, 'left', false), existing = lb && kid(lb, 'ending');
      if (existing) { // remove this ending
        existing.remove(); if (!lb.children.length) lb.remove();
        for (let j = a; j < list.length; j++) { const rb = barlineOf(list[j], 'right', false), en = rb && kid(rb, 'ending'); if (en) { en.remove(); if (!rb.children.length) rb.remove(); break; } }
        continue;
      }
      const s = mk(doc, 'ending', number === 1 ? '1.' : '2.'); s.setAttribute('number', String(number)); s.setAttribute('type', 'start'); putBar(barlineOf(first, 'left', true), s);
      const rb = barlineOf(last, 'right', true), en = mk(doc, 'ending'); en.setAttribute('number', String(number)); en.setAttribute('type', number === 1 ? 'stop' : 'discontinue'); putBar(rb, en);
      if (number === 1 && !kid(rb, 'repeat')) { putBar(rb, mk(doc, 'bar-style', 'light-heavy')); const r = mk(doc, 'repeat'); r.setAttribute('direction', 'backward'); putBar(rb, r); }
    }
    untieAcrossRepeats(doc);
    return note;
  },
  // bars in every part: before or after this one
  insertMeasures(doc, note, where, count = 1) {
    const i = indexOfMeasure(note.parentNode); let made = null;
    for (const part of doc.querySelectorAll('part')) {
      const list = kids(part, 'measure'), ref = list[i]; if (!ref) continue;
      // a tie over the place where the bars go in no longer joins
      const before = where === 'before' ? list[i - 1] : ref;
      if (before) for (const n of before.querySelectorAll('note')) { const to = tiePartner(doc, n, 'start'); if (to && to.parentNode !== before) unTie(doc, n, 'start'); }
      // the new bar takes the signatures in force where it goes
      const model = where === 'before' && i > 0 ? list[i - 1] : ref;
      for (let k = 0; k < count; k++) {
        const fresh = emptyMeasure(doc, part, model);
        if (where === 'before') {
          ref.before(fresh);
          if (i === 0) { // the opening signatures and clefs move to the new first bar
            const a = kids(ref, 'attributes').find(x => [...ref.children].indexOf(x) < [...ref.children].findIndex(c => c.tagName === 'note'));
            if (a) fresh.insertBefore(a, fresh.firstChild);
            for (const lb of kids(ref, 'barline').filter(x => x.getAttribute('location') === 'left' && !kid(x, 'repeat') && !kid(x, 'ending'))) fresh.insertBefore(lb, fresh.firstChild);
            if (ref.getAttribute('implicit') === 'yes') { ref.removeAttribute('implicit'); }
          }
        } else ref.after(fresh);
        if (part === doc.querySelector('part') && !made) made = fresh;
      }
      renumber(part);
    }
    return made ? kids(made, 'note')[0] : note;
  },
  appendMeasures(doc, note, count = 1) { for (let k = 0; k < count; k++) appendMeasure(doc); const part = doc.querySelector('part'), list = kids(part, 'measure'); return kids(list[list.length - count], 'note')[0]; },
  // delete bars a..b (indexes) in every part; signatures and clefs that start there carry on
  deleteMeasures(doc, a, b) {
    const part0 = doc.querySelector('part'), n = kids(part0, 'measure').length;
    if (b - a + 1 >= n) fail('A score needs at least one bar.');
    let pick = null;
    for (const part of doc.querySelectorAll('part')) {
      const list = kids(part, 'measure'), gone = list.slice(a, b + 1), next = list[b + 1], prev = list[a - 1];
      const carry = new Map();
      for (const m of gone) for (const at of kids(m, 'attributes')) for (const c of at.children) carry.set(c.tagName + '|' + (c.getAttribute('number') || ''), c);
      if (next && carry.size) {
        const into = startAttributes(next);
        for (const [k, c] of carry) if (![...into.children].some(x => x.tagName + '|' + (x.getAttribute('number') || '') === k)) putAttr(into, c.cloneNode(true));
      }
      for (const m of gone) for (const nt of m.querySelectorAll('note')) for (const t of kids(nt, 'tie')) unTie(doc, nt, t.getAttribute('type'));
      for (const m of gone) m.remove();
      if (a === 0 && next) next.removeAttribute('implicit');
      renumber(part);
      if (part === part0) pick = kids(next || prev, 'note')[0] || null;
    }
    return pick;
  },
  lyric(doc, note, text, syllabic, verse) { return setLyric(doc, note, text, syllabic, verse); },
  chordSymbol(doc, note, text) { return setChord(doc, note, text); },
  // the title and composer shown at the top
  title(doc, title, composer) {
    const root = doc.documentElement;
    if (title != null) {
      let work = kid(root, 'work'); if (!work) { work = mk(doc, 'work'); root.insertBefore(work, root.firstElementChild); }
      setChild(work, 'work-title', title.trim()); const mt = kid(root, 'movement-title'); if (mt) mt.textContent = title.trim();
    }
    if (composer != null) {
      let id = kid(root, 'identification');
      if (!id) { id = mk(doc, 'identification'); const after = [...root.children].find(c => !['work', 'movement-number', 'movement-title'].includes(c.tagName)); root.insertBefore(id, after || null); }
      let c = kids(id, 'creator').find(x => x.getAttribute('type') === 'composer');
      if (!composer.trim()) { c?.remove(); return null; }
      if (!c) { c = mk(doc, 'creator'); c.setAttribute('type', 'composer'); id.insertBefore(c, id.firstElementChild); }
      c.textContent = composer.trim();
    }
    return null;
  },
});
// remove = delete (a note of a chord goes, a note becomes a rest, a rest in voice 2–4 goes)
const removeOne = ops.remove;
ops.remove = (doc, note) => { const e = eventOf(note); if (e?.rest) return ops.erase(doc, note); return removeOne(doc, note); };

// ---------------------------------------------------------------------------------------------
// Selections of several notes (a range of time on one or more staves)
// ---------------------------------------------------------------------------------------------
// range = { part, staves: ['1', …], from, to } in quarters
function rangeEvents(doc, range) { return timed(doc, range.part).filter(e => range.staves.includes(e.staff) && e.q >= range.from - 1e-9 && e.q < range.to - 1e-9); }
const range = {
  events: rangeEvents,
  copy(doc, r) {
    const evs = rangeEvents(doc, r); if (!evs.length) fail('Select some notes to copy.');
    const base = Math.min(...r.staves.map(Number)), blocks = new Map();
    for (const e of evs) {
      const vi = Math.max(0, staffVoices(r.part, e.staff).indexOf(e.voice)), key = (Number(e.staff) - base) + '|' + vi;
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push({ q: e.q - r.from, len: e.len, grace: e.grace, rest: e.rest, templates: e.notes.map(n => n.cloneNode(true)) });
    }
    // triplets are copied whole
    for (const list of blocks.values()) {
      let open = false;
      for (const ev of list) {
        const tm = !ev.grace && hasTM(ev.templates[0]), start = !!ev.templates[0].querySelector('notations > tuplet[type="start"]'), stop = !!ev.templates[0].querySelector('notations > tuplet[type="stop"]');
        if (tm && !open && !start) fail('Select whole triplets (or other tuplets) to copy them.');
        if (tm && start) open = true; if (tm && stop) open = false;
        if (!tm && open) fail('Select whole triplets (or other tuplets) to copy them.');
      }
      if (open) fail('Select whole triplets (or other tuplets) to copy them.');
    }
    return { len: r.to - r.from, staves: r.staves.length, blocks: [...blocks].map(([k, events]) => ({ staffOffset: Number(k.split('|')[0]), voiceIndex: Number(k.split('|')[1]), events })) };
  },
  // paste writes over what is there, from the target time, on the target staff and those below
  paste(doc, clip, target) {
    const part = target.part, { staves } = attributesAt(locate(part, Math.min(target.q, scoreEnd(part) - 1e-6))?.measure || kids(part, 'measure')[0]);
    let first = null;
    const tieOut = n => kids(n, 'tie').some(t => t.getAttribute('type') === 'start'), tieIn = n => kids(n, 'tie').some(t => t.getAttribute('type') === 'stop');
    for (const b of clip.blocks) {
      const staff = String(Number(target.staff) + b.staffOffset); if (Number(staff) > staves) continue;
      const voice = staffVoices(part, staff)[b.voiceIndex] || staffVoices(part, staff)[0];
      let graces = [], prev = null;
      for (const ev of b.events) {
        if (ev.grace) { graces.push(ev); continue; }
        const w = writeSpan(doc, part, target.q + ev.q, ev.len, voice, staff, ev.rest && !hasTM(ev.templates[0]) ? { rest: true } : { templates: ev.templates });
        if (!w.length) continue;
        if (graces.length) { const head = w[0].els[0]; for (const g of graces) for (const n of g.templates) { const c = cloneNote(doc, n, true); setChild(c, 'voice', voice); if (kid(c, 'staff')) setChild(c, 'staff', staff); head.before(c); } }
        if (prev && !ev.rest && prev.src.templates.some(tieOut) && ev.templates.some(tieIn) && !(prev.out.els[0].parentNode !== w[0].els[0].parentNode && repeatBetween(prev.out.els[0].parentNode, w[0].els[0].parentNode))) tieEvents(doc, { els: prev.out.els.filter((n, i) => tieOut(prev.src.templates[i] || n)) }, w[0]);
        graces = []; prev = { src: ev, out: w[w.length - 1] };
        const main = b.staffOffset === 0 && b.voiceIndex === 0;
        if (!first || (main && !first.main)) first = { note: w[0].els[0], main };
      }
    }
    for (const m of kids(part, 'measure')) fixAccidentals(m);
    return { note: first?.note || null, range: { part, staves: clip.blocks.map(b => String(Number(target.staff) + b.staffOffset)).filter((s, i, a) => a.indexOf(s) === i && Number(s) <= staves), from: target.q, to: target.q + clip.len } };
  },
  // rests in the main voices, nothing in the others
  clear(doc, r) {
    for (const staff of r.staves) {
      const voices = staffVoices(r.part, staff), used = new Set(rangeEvents(doc, { ...r, staves: [staff] }).map(e => e.voice));
      for (const v of used) writeSpan(doc, r.part, r.from, r.to - r.from, v, staff, v === voices[0] ? { rest: true } : { gap: true });
    }
  },
  // up or down: kind 'chromatic' (semitones), 'step' (in the key) or 'octave'
  transpose(doc, r, kind, d) {
    const evs = rangeEvents(doc, r).filter(e => !e.rest), notes = new Set(evs.flatMap(e => e.notes));
    for (const n of notes) for (const type of ['start', 'stop']) { const p = tiePartner(doc, n, type); if (p && !notes.has(p)) unTie(doc, n, type); }
    const ms = new Set();
    for (const n of notes) {
      const p = pitchOf(n), { fifths } = attributesAt(n.parentNode);
      const q = kind === 'chromatic' ? spell(midiOf(p) + d, fifths, Math.sign(d)) : fromDiatonic(diatonic(p) + (kind === 'octave' ? 7 * d : d), fifths);
      if (kind === 'octave') q.alter = p.alter;
      if (!onKeyboard(q)) fail('That would take a note off the piano keyboard.');
      setPitch(n, q); drop(n, 'accidental'); ms.add(n.parentNode);
    }
    for (const m of ms) fixAccidentals(m);
  },
  // the range's notes as one list (for showing it on the sheet)
  notes(doc, r) { return rangeEvents(doc, r).flatMap(e => e.notes); },
  ofMeasures(doc, part, a, b) { const st = starts(part); return { part, staves: Array.from({ length: attributesAt(st[a].m).staves }, (_, i) => String(i + 1)), from: st[a].t, to: st[b].t + st[b].len }; },
};

// ---------------------------------------------------------------------------------------------
// Sound: the notes as heard (as written, ties joined), for playback
// ---------------------------------------------------------------------------------------------
function sound(doc) {
  const out = []; let bpm = null;
  const t = doc.querySelector('sound[tempo]'); if (t) bpm = Number(t.getAttribute('tempo'));
  if (!bpm) { const pm = doc.querySelector('metronome per-minute'); if (pm) bpm = Number(pm.textContent); }
  for (const part of doc.querySelectorAll('part')) {
    const held = new Map();
    for (const e of timed(doc, part)) {
      if (e.rest) continue;
      for (const n of e.notes) {
        const p = pitchOf(n); if (!p) continue;
        const midi = midiOf(p), key = e.staff + ':' + e.voice + ':' + midi, stop = kids(n, 'tie').some(x => x.getAttribute('type') === 'stop');
        if (stop && held.has(key)) { const h = held.get(key); if (Math.abs(h.q + h.len - e.q) < 1e-6) { h.len += e.len; h.ids.push(n.getAttribute('id')); continue; } }
        const item = { q: e.grace ? e.q - 0.12 : e.q, len: e.grace ? 0.12 : e.len, midi, ids: [n.getAttribute('id')], staff: e.staff };
        out.push(item); held.set(key, item);
      }
    }
  }
  return { notes: out.sort((a, b) => a.q - b.q), bpm: bpm && bpm > 10 && bpm < 400 ? bpm : 96 };
}

function describeAt(note, voiceList) {
  const e = eventOf(note); if (!e) return '';
  const m = e.measure, a = attributesAt(m), part = m.parentNode, voices = voiceList || staffVoices(part, e.staff), vi = voices.indexOf(e.voice) + 1;
  const beat = e.onset / a.div * a.beatType / 4 + 1, b = Math.abs(beat - Math.round(beat)) < 1e-6 ? String(Math.round(beat)) : beat.toFixed(2).replace(/0$/, '');
  return describe(note).replace(/^Measure (\S+)/, `Measure $1 · beat ${b}`) + (vi > 1 ? ` · voice ${vi}` : '') + (e.grace ? ' · grace note' : '') + (e.notes.some(hasTM) ? ' · in a tuplet' : '');
}

window.PianoSheetModel = { load, serialize, clean, byId, events, allEvents, eventOf, describe, describeAt, attributesAt, pitchOf, midiOf, noteName, valueOf, pieces, spell, spellings,
  starts, timed, locate, scoreEnd, staffVoices, eventAt, timeOf, measureLen, sound, readMeasure, writeMeasure, writeSpan, letterPitch, diatonic, fromDiatonic, keyAlter,
  ops, range, EditError, LETTERS, ARTICULATIONS, DYNAMICS, lyricOf, chordOf, parseChord, untieAcrossRepeats };
})();
