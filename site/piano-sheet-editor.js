'use strict';
// Sheet editor: change the notes of an imported score (MusicXML) right on the engraved sheet.
// Click a note or rest (or move with the arrow keys), then change its pitch, length, accidental,
// hand or place; add notes, chords, ties and measures; undo anything. Every change is made to the
// MusicXML itself, so the result saves, downloads and practices like any imported file.
// The model (edit operations) works on a parsed MusicXML document and has no screen; the view
// engraves the document with Verovio after each change.
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

// ---------------------------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------------------------
function load(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror') || doc.documentElement.tagName !== 'score-partwise') throw new Error('Only scores in MusicXML (partwise) can be edited here.');
  doc.nextId = 1;
  for (const n of doc.querySelectorAll('note')) if (!n.getAttribute('id')) n.setAttribute('id', 'e' + doc.nextId++);
  return doc;
}
const serialize = doc => new XMLSerializer().serializeToString(doc);
// the score as saved: without the ids the editor added
const clean = doc => serialize(doc).replace(/ id="e\d+"/g, '');
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
  const part = measure.parentNode, out = { div: 1, fifths: 0, beats: 4, beatType: 4, staves: 1, clefs: {} };
  for (const m of kids(part, 'measure')) {
    for (const a of kids(m, 'attributes')) {
      if (kid(a, 'divisions')) out.div = Number(txt(a, 'divisions'));
      const key = kid(a, 'key'); if (key && kid(key, 'fifths')) out.fifths = Number(txt(key, 'fifths'));
      const time = kid(a, 'time'); if (time && kid(time, 'beats')) { out.beats = Number(txt(time, 'beats').split('+').reduce((s, x) => s + Number(x), 0)); out.beatType = Number(txt(time, 'beat-type')); }
      if (kid(a, 'staves')) out.staves = Number(txt(a, 'staves'));
      for (const c of kids(a, 'clef')) out.clefs[c.getAttribute('number') || '1'] = txt(c, 'sign');
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
// Make the divisions fine enough for a length (scaling every duration of the part).
function ensureDivisions(measure, q) {
  const part = measure.parentNode, { div } = attributesAt(measure);
  if (Number.isInteger(Math.round(q * div * 1e6) / 1e6)) return div;
  let f = 2; while (!Number.isInteger(Math.round(q * div * f * 1e6) / 1e6) && f < 64) f *= 2;
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
    const ok = !e.rest && level(e) > 0 && !kid(e.head, 'time-modification');
    if (!ok || (group.length && Math.floor(e.onset / beat) !== Math.floor(group[0].onset / beat))) flush();
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
      if (i === 0) drop(e.notes[1], 'chord');
      for (const t of kids(note, 'tie')) unTie(doc, note, t.getAttribute('type'));
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
// View
// ---------------------------------------------------------------------------------------------
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
// The page is laid out as wide as the editor so staff spaces come out about 12 px on screen
// (10 px on a phone): big enough to click a note, with as many bars a line as fit.
const VIEW = { pageHeight: 60000, adjustPageHeight: true, breaks: 'auto', scale: 100, svgViewBox: true, svgHtml5: true, footer: 'none', header: 'none',
  pageMarginTop: 40, pageMarginBottom: 40, pageMarginLeft: 30, pageMarginRight: 30, spacingSystem: 10 };
const pageWidth = px => Math.round(Math.max(320, px) * 18 / (px < 600 ? 10 : 12));

async function open(host, xml, options = {}) {
  const doc = load(xml), undo = [], redo = [];
  await window.PianoScoreImport.loadVerovio();
  const tk = new window.verovio.toolkit(); let laidOut = 0;
  let sel = null, busy = false;

  const root = el('div', undefined, 'sheet-editor'); root.tabIndex = 0;
  root.setAttribute('role', 'application'); root.setAttribute('aria-label', 'Sheet editor');
  const intro = el('p', 'Click a note or rest, then change it with the buttons or the keyboard. Drag a note up or down to change its pitch. Every change can be undone.', 'muted');
  const bar = el('div', undefined, 'sheet-tools');
  const status = el('p', 'Nothing selected yet: click a note or a rest on the sheet.', 'sheet-status'); status.setAttribute('aria-live', 'polite');
  const sheet = el('div', undefined, 'sheet-pages');
  const actions = el('div', undefined, 'actions sheet-actions');
  const keysHelp = el('details', undefined, 'fold sheet-keys');
  keysHelp.append(el('summary', 'Keyboard shortcuts'));
  const kl = el('ul');
  for (const t of ['← → choose the previous or next note of the same hand; Alt+← → move it earlier or later', '↑ ↓ a step up or down; Shift+↑ ↓ sharpen or flatten; Ctrl+↑ ↓ an octave',
    'A–G change the note (a rest becomes a note); Shift+A–G add that note to the chord', '3 4 5 6 7 sixteenth, eighth, quarter, half, whole; . dot',
    'R or 0 make it a rest; Delete remove (a chord note goes, a note becomes a rest)', 'T tie to the next note; H move to the other hand', 'Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo; Esc clear the selection']) kl.append(el('li', t));
  keysHelp.append(kl);
  const done = el('button', options.doneLabel || 'Use these changes'), cancel = el('button', 'Cancel', 'secondary');
  done.type = cancel.type = 'button';
  actions.append(done, cancel);
  root.append(el('h3', options.heading || 'Edit the sheet', 'step-label'));
  if (options.notice) root.append(el('p', options.notice, 'note warn'));
  root.append(intro, bar, status, sheet, keysHelp, actions);
  host.replaceChildren(root);

  const say = (t, bad) => { status.textContent = t; status.classList.toggle('bad', !!bad); };
  const tool = (label, title, fn, cls) => { const b = el('button', label, 'secondary small ' + (cls || '')); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.onclick = () => { fn(); root.focus({ preventScroll: true }); }; return b; };
  const group = (name, ...buttons) => { const g = el('div', undefined, 'sheet-group'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', name); g.append(el('span', name, 'sheet-group-name'), ...buttons); bar.append(g); return g; };

  function edit(fn, ...args) {
    if (!sel) { say('Click a note or a rest on the sheet first.', true); return; }
    if (busy) return;
    const before = serialize(doc), beforeId = sel.getAttribute('id');
    try {
      const next = fn(doc, sel, ...args);
      undo.push({ xml: before, id: beforeId }); if (undo.length > 200) undo.shift(); redo.length = 0;
      sel = next || null; render();
    } catch (e) {
      // a refused (or failed) change leaves the score as it was
      const back = new DOMParser().parseFromString(before, 'application/xml'), id = sel?.getAttribute('id');
      doc.replaceChild(doc.importNode(back.documentElement, true), doc.documentElement);
      sel = id ? byId(doc, id) : null;
      say(e instanceof EditError ? e.message : 'That change could not be made: ' + e.message, true);
      if (!(e instanceof EditError)) console.error(e);
    }
  }
  function restore(from, to) {
    if (!from.length) { say('Nothing to ' + (from === undo ? 'undo.' : 'redo.')); return; }
    // each step remembers what was selected, so undo and redo return to the note that changed
    const step = from.pop(), back = new DOMParser().parseFromString(step.xml, 'application/xml');
    to.push({ xml: serialize(doc), id: sel?.getAttribute('id') || step.id });
    doc.replaceChild(doc.importNode(back.documentElement, true), doc.documentElement);
    sel = (step.id && byId(doc, step.id)) || null; render();
  }
  group('Undo', tool('↶ Undo', 'Undo (Ctrl+Z)', () => restore(undo, redo)), tool('↷ Redo', 'Redo (Ctrl+Y)', () => restore(redo, undo)));
  group('Pitch', tool('▲', 'Step up (↑)', () => edit(ops.step, 1)), tool('▼', 'Step down (↓)', () => edit(ops.step, -1)),
    tool('♯', 'Sharp', () => edit(ops.accidental, 1)), tool('♭', 'Flat', () => edit(ops.accidental, -1)), tool('♮', 'Natural', () => edit(ops.accidental, 0)),
    tool('8va ▲', 'Octave up (Ctrl+↑)', () => edit(ops.step, 7)), tool('8vb ▼', 'Octave down (Ctrl+↓)', () => edit(ops.step, -7)));
  group('Note', ...[...LETTERS].map(L => tool(L, `Make it ${L} (key ${L})`, () => edit(ops.letter, L, false))), tool('+ chord', 'Add a note above, to make a chord (Shift+letter adds that letter)', () => {
    const p = sel && pitchOf(sel); edit(ops.letter, p ? LETTERS[(LETTERS.indexOf(p.step) + 2) % 7] : 'C', true);
  }));
  group('Length', tool('16th', 'Sixteenth note (3)', () => edit(ops.length, 0.25)), tool('8th', 'Eighth note (4)', () => edit(ops.length, 0.5)), tool('Quarter', 'Quarter note (5)', () => edit(ops.length, 1)),
    tool('Half', 'Half note (6)', () => edit(ops.length, 2)), tool('Whole', 'Whole note (7)', () => edit(ops.length, 4)), tool('Dot', 'Dotted: half as long again (.)', () => edit(ops.dot)));
  group('Change', tool('Rest', 'Make it a rest (R)', () => edit(ops.rest)), tool('Delete', 'Remove the note (Delete)', () => edit(ops.remove)), tool('Tie', 'Tie to the next note (T)', () => edit(ops.tie)),
    tool('Other hand', 'Move to the other staff (H)', () => edit(ops.hand)), tool('◀ Move', 'Move earlier (Alt+←)', () => edit(ops.move, -1)), tool('Move ▶', 'Move later (Alt+→)', () => edit(ops.move, 1)));
  group('Bar', tool('+ Bar after', 'Add an empty bar after this one', () => edit(ops.addMeasure)), tool('− Delete bar', 'Delete this bar', () => edit(ops.removeMeasure)));

  // moving the selection
  function neighbour(dir) {
    if (!sel) return;
    const e = eventOf(sel); if (!e) return;
    const list = allEvents(doc).filter(x => x.staff === e.staff && x.part === e.measure.parentNode).sort((a, b) => a.mi - b.mi || a.onset - b.onset || (a.voice > b.voice ? 1 : -1));
    const i = list.findIndex(x => x.head === e.head), to = list[i + dir];
    if (to) { sel = to.head; highlight(true); }
  }

  root.addEventListener('keydown', ev => {
    if (ev.target.closest('button, input, select, textarea, summary') && ev.target !== root) return;
    const k = ev.key, mod = ev.ctrlKey || ev.metaKey;
    const act = f => { ev.preventDefault(); f(); };
    if (mod && (k === 'z' || k === 'Z')) return act(() => ev.shiftKey ? restore(redo, undo) : restore(undo, redo));
    if (mod && (k === 'y' || k === 'Y')) return act(() => restore(redo, undo));
    if (k === 'Escape') return act(() => { sel = null; highlight(); });
    if (k === 'ArrowUp' || k === 'ArrowDown') { const d = k === 'ArrowUp' ? 1 : -1; return act(() => mod ? edit(ops.step, 7 * d) : ev.shiftKey ? edit(ops.semitone, d) : edit(ops.step, d)); }
    if (k === 'ArrowLeft' || k === 'ArrowRight') { const d = k === 'ArrowRight' ? 1 : -1; return act(() => ev.altKey ? edit(ops.move, d) : neighbour(d)); }
    if (mod || ev.altKey) return;
    const L = k.toUpperCase();
    if (k.length === 1 && LETTERS.includes(L)) return act(() => edit(ops.letter, L, ev.shiftKey));
    const len = { 3: 0.25, 4: 0.5, 5: 1, 6: 2, 7: 4 }[k]; if (len) return act(() => edit(ops.length, len));
    if (k === '.') return act(() => edit(ops.dot));
    if (k === 'r' || k === 'R' || k === '0') return act(() => edit(ops.rest));
    if (k === 'Delete' || k === 'Backspace') return act(() => edit(ops.remove));
    if (k === 't' || k === 'T') return act(() => edit(ops.tie));
    if (k === 'h' || k === 'H') return act(() => edit(ops.hand));
    if (k === '+') return act(() => edit(ops.semitone, 1));
    if (k === '-') return act(() => edit(ops.semitone, -1));
    if (k === '=') return act(() => edit(ops.accidental, 0));
  });

  // clicking and dragging on the sheet
  const target = t => t.closest?.('g.note, g.rest, g.mRest, g.chord');
  let drag = null;
  // a click a little off a note (between the stem and the head, on a line) takes the nearest one
  const nearest = (x, y) => {
    let best = null, bestD = 28 * 28;
    for (const h of sheet.querySelectorAll('g.notehead, g.rest, g.mRest')) {
      const r = h.getBoundingClientRect(), dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom), d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = h; }
    }
    return best && target(best);
  };
  sheet.addEventListener('pointerdown', ev => {
    const g = target(ev.target) || nearest(ev.clientX, ev.clientY); if (!g) return;
    let id = g.getAttribute('id') || g.dataset?.id;
    if (g.classList.contains('chord')) { // the note of the chord nearest the pointer
      let n = ev.target.closest?.('g.note');
      if (!n) { let bestD = Infinity; for (const c of g.querySelectorAll('g.note')) { const r = (c.querySelector('g.notehead') || c).getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - ev.clientY); if (d < bestD) { bestD = d; n = c; } } }
      id = n?.getAttribute('id') || n?.dataset?.id;
    }
    const n = id && byId(doc, id); if (!n) return;
    sel = n; highlight(); root.focus({ preventScroll: true });
    if (!pitchOf(n)) return; // a note can be dragged up or down right away
    // half a staff space, on screen and in the note's own units, from the staff it sits on
    const gn = sheet.querySelector(`g.note[id="${CSS.escape(id)}"], g.note[data-id="${CSS.escape(id)}"]`);
    const lines = [...(g.closest('g.staff')?.querySelectorAll(':scope > path') || [])].map(p => { const r = p.getBoundingClientRect(); return r.top + r.height / 2; }).sort((a, b) => a - b);
    if (lines.length < 5 || !gn) return;
    const half = (lines[4] - lines[0]) / 8, ctm = gn.getScreenCTM?.(), unit = ctm?.d ? half / ctm.d : 90;
    if (!(half > 0.5)) return;
    drag = { y: ev.clientY, steps: 0, half, unit, gn, pointer: ev.pointerId };
    sheet.setPointerCapture?.(ev.pointerId); ev.preventDefault();
  });
  sheet.addEventListener('pointermove', ev => {
    if (!drag || ev.pointerId !== drag.pointer) return;
    const steps = Math.round((drag.y - ev.clientY) / drag.half);
    if (steps === drag.steps) return;
    drag.steps = steps;
    if (drag.gn) drag.gn.setAttribute('transform', `translate(0 ${-steps * drag.unit})`);
    const p = pitchOf(sel), { fifths } = attributesAt(sel.parentNode);
    if (p) say(`Drop to make it ${noteName(fromDiatonic(diatonic(p) + steps, fifths))}`);
  });
  const endDrag = ev => {
    if (!drag || ev.pointerId !== drag.pointer) return;
    const steps = drag.steps; drag = null;
    if (steps) edit(ops.step, steps); else highlight();
  };
  sheet.addEventListener('pointerup', endDrag); sheet.addEventListener('pointercancel', endDrag);

  function highlight(scroll) {
    for (const g of sheet.querySelectorAll('.ed-sel, .ed-chord')) g.classList.remove('ed-sel', 'ed-chord');
    if (!sel) { say('Nothing selected: click a note or a rest on the sheet.'); return; }
    const e = eventOf(sel), find = id => sheet.querySelector(`[id="${CSS.escape(id)}"], [data-id="${CSS.escape(id)}"]`);
    for (const n of e?.notes || []) find(n.getAttribute('id'))?.classList.add(n === sel ? 'ed-sel' : 'ed-chord');
    say(describe(sel));
    if (scroll) { const g = find(sel.getAttribute('id')); if (g) { const r = g.getBoundingClientRect(), s = sheet.getBoundingClientRect(); if (r.top < s.top + 20 || r.bottom > s.bottom - 20) sheet.scrollTop += r.top - s.top - s.height / 3; } }
  }
  function render() {
    busy = true;
    const top = sheet.scrollTop;
    try {
      const w = sheet.clientWidth || 900; if (w !== laidOut) { tk.setOptions({ ...VIEW, pageWidth: pageWidth(w - 24) }); laidOut = w; }
      if (!tk.loadData(serialize(doc))) throw new Error('The engraver could not read the edited score.');
      let html = ''; for (let p = 1; p <= tk.getPageCount(); p++) html += tk.renderToSVG(p);
      sheet.innerHTML = html;
      sheet.scrollTop = top;
      highlight(true);
    } catch (e) { say(e.message, true); }
    busy = false;
  }
  done.onclick = () => options.onDone?.(clean(doc), { changed: undo.length > 0 });
  cancel.onclick = () => options.onCancel?.();
  render(); root.focus({ preventScroll: true });
  // lay the sheet out again when the editor gets much wider or narrower
  let resizeTimer = 0; const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!root.isConnected) { ro.disconnect(); return; } if (Math.abs(sheet.clientWidth - laidOut) > 40) render(); }, 200); }) : null;
  ro?.observe(sheet);
  return { root, get xml() { return clean(doc); } };
}

window.PianoSheetEditor = { open, model: { load, serialize, clean, byId, events, allEvents, describe, attributesAt, pitchOf, valueOf, pieces, ops, EditError } };
})();
