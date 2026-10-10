// The sheet editor's model (site/piano-sheet-model.js) changes an imported score's MusicXML: pitches,
// lengths, rests, chords, ties, hands, the order of notes and whole bars. Every change must leave a
// score the practice engine accepts (each bar full, no overlaps) and change only what was asked.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), { JSDOM } = require('jsdom');
const dom = new JSDOM('');
const ctx = { console, DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer, document: dom.window.document };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['piano-import-engine.js', 'piano-sheet-model.js']) vm.runInContext(fs.readFileSync('site/' + f, 'utf8'), ctx);
const E = ctx.PianoImportEngine, M = ctx.PianoSheetModel, ops = M.ops;

// A two-staff piano score: bar 1 right hand C4–E4 chord, D4, half rest; left hand C3 whole.
// Bar 2 right hand four eighths E F G A then a half G; left hand G2 whole. Bar 3 a whole-bar rest
// and C3 whole.
const note = (p, dur, type, staff, voice, extra = '') => `<note>${extra.includes('<chord/>') ? '<chord/>' : ''}${p ? `<pitch><step>${p[0]}</step>${p.length > 2 ? `<alter>${p[1] === '#' ? 1 : -1}</alter>` : ''}<octave>${p.at(-1)}</octave></pitch>` : '<rest/>'}<duration>${dur}</duration><voice>${voice}</voice>${type ? `<type>${type}</type>` : ''}<staff>${staff}</staff>${extra.replace('<chord/>', '')}</note>`;
const SCORE = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><work><work-title>Edit check</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
${note('C4', 2, 'quarter', 1, 1)}${note('E4', 2, 'quarter', 1, 1, '<chord/>')}${note('D4', 2, 'quarter', 1, 1)}${note(null, 4, 'half', 1, 1)}<backup><duration>8</duration></backup>${note('C3', 8, 'whole', 2, 5)}</measure>
<measure number="2">${note('E4', 1, 'eighth', 1, 1, '<beam number="1">begin</beam>')}${note('F4', 1, 'eighth', 1, 1, '<beam number="1">end</beam>')}${note('G4', 1, 'eighth', 1, 1, '<beam number="1">begin</beam>')}${note('A4', 1, 'eighth', 1, 1, '<beam number="1">end</beam>')}${note('G4', 4, 'half', 1, 1)}<backup><duration>8</duration></backup>${note('G2', 8, 'whole', 2, 5)}</measure>
<measure number="3"><note><rest measure="yes"/><duration>8</duration><voice>1</voice><staff>1</staff></note><backup><duration>8</duration></backup>${note('C3', 8, 'whole', 2, 5)}</measure>
</part></score-partwise>`;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const nm = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
// What practice hears: "measure:beat hand pitch length", in time order.
function heard(xml) {
  return [...E.parse(xml).notes].filter(n => !n.grace).map(n => `${n.measure}:${n.beat} ${n.hand[0]} ${nm(n.midi)} ${n.duration}`).sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));
}
// The written notes of a document: "pitch-or-rest/type" per event, bar by bar, for one staff.
function written(doc, staff = '1') {
  return [...doc.querySelectorAll('part > measure')].map(m => M.events(m).filter(e => e.staff === staff).map(e => (e.rest ? 'r' : e.notes.map(n => { const p = M.pitchOf(n); return p.step + ['bb', 'b', '', '#', 'x'][p.alter + 2] + p.octave; }).join('+')) + '/' + (e.head.querySelector('type')?.textContent || 'bar') + '.'.repeat(e.head.querySelectorAll('dot').length)).join(' '));
}
// Apply an edit to the note found by a selector function and return the document (with checks).
function edit(op, find, ...args) {
  const doc = M.load(SCORE), n = find(doc);
  const out = op(doc, n, ...args);
  heard(M.clean(doc)); // still a valid score
  return { doc, out, xml: M.clean(doc) };
}
const at = (doc, measure, i, staff = '1') => M.events(doc.querySelectorAll('part > measure')[measure - 1]).filter(e => e.staff === staff)[i].head;

test('the score as loaded is unchanged by loading and saving, apart from the editor ids', () => {
  const doc = M.load(SCORE);
  assert.ok(doc.querySelectorAll('note[id]').length > 10);
  assert.deepEqual(heard(M.clean(doc)), heard(SCORE));
  assert.doesNotMatch(M.clean(doc), / id="e\d+"/);
});

test('a note steps up and down the staff in the key, sharps and flats show their accidental', () => {
  let r = edit(ops.step, d => at(d, 1, 1), 1); // D4 → E4
  assert.equal(written(r.doc)[0], 'C4+E4/quarter E4/quarter r/half');
  r = edit((doc, n) => { ops.accidental(doc, n, 1); return n; }, d => at(d, 1, 1)); // D4 → D#4
  assert.match(r.xml, /<step>D<\/step><alter>1<\/alter>/);
  assert.match(r.xml, /<accidental>sharp<\/accidental>/);
  r = edit((doc, n) => { ops.semitone(doc, n, 1); ops.semitone(doc, n, -1); return n; }, d => at(d, 1, 1));
  assert.doesNotMatch(r.xml, /<accidental>/, 'back to D natural, no accidental needed');
  r = edit(ops.step, d => at(d, 1, 1), 7); // octave up
  assert.ok(heard(r.xml).includes('1:1 r D5 1'));
});

test('in a key with sharps, steps follow the key and an accidental shows only where needed', () => {
  const doc = M.load(SCORE.replace('<fifths>0</fifths>', '<fifths>2</fifths>')), d4 = at(doc, 1, 1);
  ops.step(doc, d4, 1); ops.step(doc, d4, 1); // D → E → F#: F is sharp in D major
  assert.deepEqual({ ...M.pitchOf(d4) }, { step: 'F', octave: 4, alter: 1 });
  assert.equal(d4.querySelector('accidental'), null);
  ops.accidental(doc, d4, 0); // F natural needs its sign
  assert.equal(d4.querySelector('accidental').textContent, 'natural');
});

test('a letter changes the note to the nearest such pitch; with chord it adds that note above', () => {
  let r = edit(ops.letter, d => at(d, 1, 1), 'B', false); // D4 → nearest B is B3
  assert.equal(written(r.doc)[0], 'C4+E4/quarter B3/quarter r/half');
  r = edit(ops.letter, d => at(d, 1, 1), 'G', true); // add G above D4
  assert.equal(written(r.doc)[0], 'C4+E4/quarter D4+G4/quarter r/half');
  assert.ok(heard(r.xml).includes('1:1 r G4 1'));
});

test('a rest becomes a note; a whole-bar rest becomes a whole note', () => {
  let r = edit(ops.letter, d => at(d, 1, 2), 'F', false);
  assert.equal(written(r.doc)[0], 'C4+E4/quarter D4/quarter F4/half');
  r = edit(ops.letter, d => at(d, 3, 0), 'C', false);
  assert.equal(written(r.doc)[2], 'C5/whole');
  assert.ok(heard(r.xml).includes('3:8 r C5 4'));
});

test('delete takes a note out of a chord, and makes a single note a rest', () => {
  let r = edit(ops.remove, d => at(d, 1, 0).nextElementSibling); // E4 of the chord
  assert.equal(written(r.doc)[0], 'C4/quarter D4/quarter r/half');
  r = edit(ops.remove, d => at(d, 1, 0)); // C4, the chord's first note: E4 remains
  assert.equal(written(r.doc)[0], 'E4/quarter D4/quarter r/half');
  r = edit(ops.remove, d => at(d, 1, 1));
  assert.equal(written(r.doc)[0], 'C4+E4/quarter r/quarter r/half');
  assert.throws(() => edit(ops.remove, d => at(d, 1, 2)), /already a rest/);
});

test('a shorter note leaves rests after it; a longer one takes the room of what follows, not past the bar', () => {
  let r = edit(ops.length, d => at(d, 1, 1), 0.5); // D4 quarter → eighth + eighth rest
  assert.equal(written(r.doc)[0], 'C4+E4/quarter D4/eighth r/eighth r/half');
  r = edit(ops.length, d => at(d, 1, 1), 2); // D4 half takes a quarter of the half rest
  assert.equal(written(r.doc)[0], 'C4+E4/quarter D4/half r/quarter');
  r = edit(ops.length, d => at(d, 1, 0), 4); // the chord as a whole note fills the bar
  assert.equal(written(r.doc)[0], 'C4+E4/whole');
  r = edit(ops.length, d => at(d, 1, 1), 4); // D4 as a whole note: only three beats remain
  assert.equal(written(r.doc)[0], 'C4+E4/quarter D4/half.');
  r = edit(ops.length, d => at(d, 2, 0), 0.25); // a sixteenth needs finer divisions
  assert.equal(written(r.doc)[1], 'E4/16th r/16th F4/eighth G4/eighth A4/eighth G4/half');
  assert.ok(heard(r.xml).includes('2:4 r E4 0.25'));
  assert.equal(written(r.doc, '2')[1], 'G2/whole', 'the other hand keeps its notes');
});

test('beams are regrouped by beat after a rhythm change', () => {
  const r = edit(ops.length, d => at(d, 2, 4), 0.5); // the half G4 → eighth: rests fill the bar
  const beams = [...r.doc.querySelectorAll('part > measure')[1].querySelectorAll('note')].filter(n => n.querySelector('staff').textContent === '1').map(n => n.querySelector('beam')?.textContent || '-');
  assert.deepEqual(beams.slice(0, 4), ['begin', 'end', 'begin', 'end']);
  assert.equal(beams[4], '-', 'an eighth next to a rest has no beam');
});

test('a dot lengthens by half, and comes off again', () => {
  let r = edit(ops.dot, d => at(d, 1, 1));
  assert.equal(written(r.doc)[0], 'C4+E4/quarter D4/quarter. r/eighth r/quarter');
  const doc = r.doc, n = at(doc, 1, 1); ops.dot(doc, n); heard(M.clean(doc));
  assert.equal(written(doc)[0], 'C4+E4/quarter D4/quarter r/eighth r/eighth r/quarter');
});

test('a tie joins a note to the same pitch next, across the barline, and is undone with another tie', () => {
  const doc = M.load(SCORE), g = at(doc, 2, 4), c3 = at(doc, 1, 0, '2');
  assert.throws(() => ops.tie(doc, g), /same pitch/);
  ops.step(doc, at(doc, 2, 0, '2'), 3); // bar 2's bass G2 → C3
  ops.tie(doc, c3);
  const tied = heard(M.clean(doc)).filter(x => / l C3 /.test(x));
  assert.deepEqual(tied.slice(0, 1), ['1:0 l C3 8'], 'two whole notes tied sound once, eight beats');
  ops.tie(doc, c3);
  assert.equal(doc.querySelectorAll('tie, tied').length, 0);
});

test('a chord moves to the other hand', () => {
  const r = edit(ops.hand, d => at(d, 1, 1));
  assert.ok(heard(r.xml).includes('1:1 l D4 1'));
  assert.equal(written(r.doc)[0], 'C4+E4/quarter r/half');
  assert.equal(written(r.doc, '2')[0], 'D4/quarter C3/whole', 'drawn on the lower staff, still in its voice');
});

test('a note moves earlier or later in its bar', () => {
  let r = edit(ops.move, d => at(d, 1, 1), -1);
  assert.equal(written(r.doc)[0], 'D4/quarter C4+E4/quarter r/half');
  r = edit(ops.move, d => at(d, 2, 1), 1);
  assert.equal(written(r.doc)[1], 'E4/eighth G4/eighth F4/eighth A4/eighth G4/half');
  assert.throws(() => edit(ops.move, d => at(d, 1, 0), -1), /first note/);
});

test('bars are added empty and deleted with their notes; signatures carry on', () => {
  let r = edit(ops.addMeasure, d => at(d, 1, 0));
  assert.equal(r.doc.querySelectorAll('part > measure').length, 4);
  assert.equal(written(r.doc)[1], 'r/bar');
  assert.deepEqual([...r.doc.querySelectorAll('part > measure')].map(m => m.getAttribute('number')), ['1', '2', '3', '4']);
  r = edit(ops.removeMeasure, d => at(d, 1, 0));
  assert.equal(r.doc.querySelectorAll('part > measure').length, 2);
  assert.match(r.xml, /<measure number="1"><attributes><divisions>2<\/divisions><key>/);
  assert.ok(heard(r.xml)[0].startsWith('1:0'));
});

test('lengths are written as plain or dotted notes', () => {
  assert.deepEqual([...M.pieces(3)], [3]);
  assert.deepEqual([...M.pieces(2.5)], [2, 0.5]);
  assert.deepEqual([...M.pieces(1.25)], [1, 0.25]);
  assert.deepEqual([...M.pieces(3.75)], [2, 1.75]);
  assert.equal(M.valueOf(0.75).type, 'eighth');
});

test('the status line describes the selection', () => {
  const doc = M.load(SCORE);
  assert.equal(M.describe(at(doc, 1, 0)), 'Measure 1 · right hand · C4 in a chord of 2 (C4 E4) · quarter note');
  assert.equal(M.describe(at(doc, 3, 0)), 'Measure 3 · right hand · whole bar rest');
});

test('the import fixture can be edited and stays a valid score', () => {
  const doc = M.load(fs.readFileSync('tests/fixtures/import-piano.musicxml', 'utf8'));
  const first = doc.querySelector('note');
  ops.length(doc, first, 0.5); ops.letter(doc, first, 'G', true); ops.step(doc, first, 2);
  assert.ok(heard(M.clean(doc)).length > 5);
});

test('a tied note changes pitch with the note it is tied to, and an inserted bar unties it', () => {
  const doc = M.load(SCORE), c3 = at(doc, 1, 0, '2');
  ops.step(doc, at(doc, 2, 0, '2'), 3); ops.tie(doc, c3);
  ops.step(doc, c3, 1); // C3 → D3, both halves of the tie
  assert.deepEqual([at(doc, 1, 0, '2'), at(doc, 2, 0, '2')].map(n => M.pitchOf(n).step).join(), 'D,D');
  assert.ok(heard(M.clean(doc)).includes('1:0 l D3 8'));
  ops.addMeasure(doc, c3);
  assert.equal(doc.querySelectorAll('tie').length, 0);
  heard(M.clean(doc));
});

test('a score the practice checks refuse can still be loaded and fixed in the editor', () => {
  // a bar one beat short: the editor still opens it, and filling the bar makes it valid
  const short = SCORE.replace(`${note('D4', 2, 'quarter', 1, 1)}${note(null, 4, 'half', 1, 1)}`, `${note('D4', 2, 'quarter', 1, 1)}${note(null, 2, 'quarter', 1, 1)}`);
  assert.throws(() => E.parse(short));
  const doc = M.load(short); ops.length(doc, at(doc, 1, 2), 2);
  heard(M.clean(doc));
});

test('a voice that runs past the barline gets shorter when a note is shortened', () => {
  const long = SCORE.replace(`${note('D4', 2, 'quarter', 1, 1)}${note(null, 4, 'half', 1, 1)}<backup><duration>8</duration>`, `${note('D4', 2, 'quarter', 1, 1)}${note(null, 4, 'half', 1, 1)}${note('G4', 2, 'quarter', 1, 1)}<backup><duration>10</duration>`);
  assert.throws(() => E.parse(long));
  const doc = M.load(long); ops.length(doc, at(doc, 1, 2), 1);
  assert.equal(written(doc)[0], 'C4+E4/quarter D4/quarter r/quarter G4/quarter');
  heard(M.clean(doc));
});

// ---- Note input, voices, tuplets, selections, palettes (like MuseScore's) ----
const part = d => d.querySelector('part');
const cur = (d, q, staff = '1', voice = '1') => ({ part: part(d), staff, voice, q });
const valid = d => heard(M.clean(d));

test('note input writes at the cursor and moves on; letters land near the previous note', () => {
  const d = M.load(SCORE); let c = cur(d, 0);
  for (const L of ['G', 'A', 'B', 'C']) c = ops.enter(d, c, 1, { letter: L }).next;
  assert.equal(c.q, 4);
  assert.equal(written(d)[0], 'G4/quarter A4/quarter B4/quarter C5/quarter');
  valid(d);
});

test('a note longer than the room left in the bar is tied across the barline', () => {
  const d = M.load(SCORE);
  const r = ops.enter(d, cur(d, 3), 2, { pitches: [{ step: 'F', octave: 4, alter: 1 }] });
  assert.equal(r.next.q, 5);
  assert.equal(written(d)[0], 'C4+E4/quarter D4/quarter r/quarter F#4/quarter');
  assert.equal(written(d)[1].split(' ')[0], 'F#4/quarter');
  assert.ok(heard(M.clean(d)).includes('1:3 r F#4 2'), 'the tied note sounds once for two beats');
});

test('writing at the end of the score adds bars; rests are entered like notes', () => {
  const d = M.load(SCORE); let c = cur(d, 8);
  c = ops.enter(d, c, 4, { rest: true }).next; c = ops.enter(d, c, 4, { letter: 'E' }).next;
  assert.equal(d.querySelectorAll('part > measure').length, 4);
  assert.equal(written(d)[3], 'E4/whole');
  valid(d);
});

test('chord notes and intervals are added to a note', () => {
  const d = M.load(SCORE), n = at(d, 1, 1); // D4
  ops.interval(d, n, 2); // a third above: F4
  ops.addPitch(d, n, { step: 'A', octave: 4, alter: 0 });
  assert.equal(written(d)[0], 'C4+E4/quarter D4+F4+A4/quarter r/half');
  valid(d);
});

test('a triplet replaces a quarter with three triplet eighths, which note input then fills', () => {
  const d = M.load(SCORE), first = ops.tuplet(d, at(d, 1, 1));
  assert.equal(written(d)[0], 'C4+E4/quarter D4/eighth r/eighth r/eighth r/half');
  assert.equal(d.querySelectorAll('time-modification').length, 3);
  let c = cur(d, 1 + 1 / 3);
  c = ops.enter(d, c, 1, { letter: 'E' }).next; c = ops.enter(d, c, 1, { letter: 'F' }).next; // each takes the triplet length
  assert.ok(Math.abs(c.q - 2) < 1e-9);
  const h = heard(M.clean(d)).filter(x => x.startsWith('1:1') && / r /.test(x));
  assert.equal(h.length, 3);
  assert.ok(first);
});

test('a second voice holds notes against the first; gaps stay empty and the score stays valid', () => {
  const d = M.load(SCORE), g = at(d, 2, 4); // the half G4 in bar 2
  ops.addPitch(d, g, { step: 'B', octave: 4, alter: 0 });
  const b = at(d, 2, 4).nextElementSibling;
  const moved = ops.voice(d, b, 1);
  assert.equal(M.eventOf(moved).voice, '2');
  const h = heard(M.clean(d));
  assert.ok(h.includes('2:6 r B4 2') && h.includes('2:6 r G4 2'));
  // more notes in voice 2 by note input
  ops.enter(d, { part: part(d), staff: '1', voice: '2', q: 4 }, 2, { pitches: [{ step: 'C', octave: 5, alter: 0 }] });
  assert.ok(heard(M.clean(d)).includes('2:4 r C5 2'));
  assert.equal(ops.erase(d, moved), null);
  valid(d);
});

test('copy and paste a selection; clear and transpose it', () => {
  const d = M.load(SCORE), r = { part: part(d), staves: ['1'], from: 4, to: 6 }; // E F G A of bar 2
  const clip = M.range.copy(d, r);
  const out = M.range.paste(d, clip, { part: part(d), staff: '1', q: 8 });
  assert.equal(written(d)[2], 'E4/eighth F4/eighth G4/eighth A4/eighth r/half');
  assert.deepEqual([...out.range.staves], ['1']);
  M.range.transpose(d, { part: part(d), staves: ['1'], from: 8, to: 10 }, 'octave', 1);
  assert.equal(written(d)[2], 'E5/eighth F5/eighth G5/eighth A5/eighth r/half');
  M.range.transpose(d, { part: part(d), staves: ['1'], from: 8, to: 10 }, 'chromatic', 1);
  assert.equal(written(d)[2], 'F5/eighth F#5/eighth G#5/eighth A#5/eighth r/half');
  M.range.clear(d, { part: part(d), staves: ['1', '2'], from: 8, to: 12 });
  assert.equal(written(d)[2], 'r/whole');
  valid(d);
});

test('both hands are copied together', () => {
  const d = M.load(SCORE), clip = M.range.copy(d, M.range.ofMeasures(d, part(d), 0, 0));
  M.range.paste(d, clip, { part: part(d), staff: '1', q: 8 });
  assert.equal(written(d)[2], written(d)[0]);
  assert.equal(written(d, '2')[2], 'C3/whole');
  valid(d);
});

test('a new time signature re-bars the music, splitting notes with ties', () => {
  const d = M.load(SCORE);
  ops.time(d, at(d, 1, 0), 3, 4);
  const bars = d.querySelectorAll('part > measure');
  assert.equal(bars.length, 4); // 12 beats in 3/4
  assert.match(M.clean(d), /<time><beats>3<\/beats><beat-type>4<\/beat-type><\/time>/);
  const h = heard(M.clean(d)), before = heard(SCORE);
  assert.equal(h.length, before.length, 'every note still sounds once');
  assert.ok(h.includes('1:0 l C3 4'), 'the whole note C3 is tied over the new barline and sounds four beats');
  valid(d);
  ops.time(d, at(d, 1, 0), 6, 8); valid(d);
});

test('key signatures keep the pitches and redo the accidentals', () => {
  const d = M.load(SCORE); ops.key(d, at(d, 1, 0), 1); // G major: the F4 of bar 2 now needs a natural
  assert.match(M.clean(d), /<key><fifths>1<\/fifths><\/key>/);
  const f = at(d, 2, 1); assert.equal(f.querySelector('accidental').textContent, 'natural');
  valid(d);
});

test('clefs, barlines, repeats and endings are written where they belong', () => {
  const d = M.load(SCORE);
  ops.clef(d, at(d, 2, 0, '2'), 'G', 2); // treble clef for the left hand from bar 2
  assert.match(M.clean(d), /<measure number="2"><attributes><clef number="2"><sign>G<\/sign><line>2<\/line><\/clef><\/attributes>/);
  ops.clef(d, at(d, 2, 2), 'F', 4); // mid-bar
  ops.barline(d, at(d, 1, 0), 'repeat-start'); ops.barline(d, at(d, 2, 0), 'repeat-end'); ops.barline(d, at(d, 3, 0), 'final');
  ops.ending(d, at(d, 2, 0), 1);
  const x = M.clean(d);
  assert.match(x, /<barline location="left"><bar-style>heavy-light<\/bar-style><repeat direction="forward"\/><\/barline>/);
  assert.match(x, /<ending number="1" type="stop"\/><repeat direction="backward"\/>/);
  assert.match(x, /<bar-style>light-heavy<\/bar-style><\/barline><\/measure>\s*<\/part>/);
  const h = heard(x); assert.ok(h.length > heard(SCORE).length, 'the repeat is played');
});

test('articulations, fingering, dynamics, tempo, slurs, grace notes, stems and spelling', () => {
  const d = M.load(SCORE), n = at(d, 1, 1);
  ops.articulation(d, n, 'staccato'); ops.articulation(d, n, 'accent'); ops.articulation(d, n, 'fermata');
  ops.fingering(d, n, '2'); ops.fingering(d, n, '3');
  ops.dynamic(d, n, 'mf'); ops.dynamic(d, n, 'p'); ops.tempo(d, at(d, 1, 0), 72);
  ops.slur(d, at(d, 2, 0), at(d, 2, 3)); ops.respell(d, n); ops.flip(d, n);
  const g = ops.grace(d, at(d, 2, 4)); ops.step(d, g, 1);
  const x = M.clean(d);
  assert.match(x, /<articulations><staccato\/><accent\/><\/articulations>/);
  assert.match(x, /<fermata\/>/);
  assert.equal((x.match(/<fingering>/g) || []).length, 1); assert.match(x, /<fingering>3<\/fingering>/);
  assert.equal((x.match(/<dynamics>/g) || []).length, 1); assert.match(x, /<dynamics><p\/><\/dynamics>/);
  assert.match(x, /<per-minute>72<\/per-minute>/);
  assert.equal((x.match(/<slur /g) || []).length, 2);
  assert.match(x, /<stem>up<\/stem>/);
  assert.match(x, /<step>E<\/step><alter>-2<\/alter>/, 'D respelled as E double flat');
  assert.match(x, /<grace slash="yes"\/><pitch><step>A<\/step>/);
  const parsed = E.parse(x); assert.ok(parsed.notes.some(k => k.fingerings.includes('3')), 'practice sees the finger number');
  ops.articulation(d, n, 'staccato'); ops.slur(d, at(d, 2, 0)); ops.dynamic(d, n, null);
  assert.doesNotMatch(M.clean(d), /<staccato|<slur |<dynamics/);
});

test('bars are inserted and deleted in every part; the title and composer are set', () => {
  const d = M.load(SCORE);
  ops.insertMeasures(d, at(d, 1, 0), 'before', 2);
  assert.equal(d.querySelectorAll('part > measure').length, 5);
  assert.match(M.clean(d), /<measure number="1"><attributes><divisions>2<\/divisions>/, 'the signatures move to the new first bar');
  ops.deleteMeasures(d, 0, 1);
  assert.equal(heard(M.clean(d)).join(), heard(SCORE).join());
  ops.appendMeasures(d, at(d, 1, 0), 2); assert.equal(d.querySelectorAll('part > measure').length, 5);
  ops.title(d, 'My piece', 'Me'); ops.title(d, null, '');
  assert.match(M.clean(d), /<work-title>My piece<\/work-title>/); assert.doesNotMatch(M.clean(d), /creator/);
  valid(d);
});

test('playback hears tied notes once, at the tempo marked', () => {
  const d = M.load(SCORE); ops.tempo(d, at(d, 1, 0), 120);
  ops.step(d, at(d, 2, 0, '2'), 3); ops.tie(d, at(d, 1, 0, '2'));
  const s = M.sound(d);
  assert.equal(s.bpm, 120);
  const c3 = s.notes.filter(n => n.midi === 48);
  assert.equal(c3[0].len, 8);
  assert.equal(s.notes[0].q, 0);
});

test('the key and direction decide how a key number is spelled', () => {
  assert.deepEqual({ ...M.spell(66, 0, 1) }, { step: 'F', octave: 4, alter: 1 });
  assert.deepEqual({ ...M.spell(66, -3, -1) }, { step: 'G', octave: 4, alter: -1 });
  assert.deepEqual({ ...M.spell(70, -1) }, { step: 'B', octave: 4, alter: -1 });
  assert.deepEqual({ ...M.spell(60, 7) }, { step: 'B', octave: 3, alter: 1 }, 'C♯ major spells C as B♯');
});

test('a note written over a repeat sign is not tied into the next bar', () => {
  const d = M.load(SCORE); ops.barline(d, at(d, 1, 0), 'repeat-end');
  ops.enter(d, cur(d, 3), 2, { pitches: [{ step: 'G', octave: 4, alter: 0 }] });
  assert.equal(d.querySelectorAll('tie').length, 0);
  valid(d);
});

test('only whole triplets are copied', () => {
  const d = M.load(SCORE); ops.tuplet(d, at(d, 1, 1));
  assert.throws(() => M.range.copy(d, { part: part(d), staves: ['1'], from: 1, to: 1.5 }), /whole triplets/);
  const clip = M.range.copy(d, { part: part(d), staves: ['1'], from: 1, to: 2 });
  M.range.paste(d, clip, { part: part(d), staff: '1', q: 9 });
  assert.equal(d.querySelectorAll('time-modification').length, 6);
  valid(d);
});
