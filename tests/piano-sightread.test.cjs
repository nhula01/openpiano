// Daily sight reading (site/piano-sightread.js): a seeded generator writes a complete original piece
// for each day and level, with the ingredients of the learning path's levels. These tests read the
// MusicXML it writes independently (not through the generator's own data) and check it against each
// level's rules, then send pieces through the site's real import and engraver.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), { JSDOM } = require('jsdom');

const load = (extra = {}) => { const c = { window: { ...extra }, ...extra }; vm.runInNewContext(fs.readFileSync('site/piano-sightread.js', 'utf8'), c); return c.window.PianoSightReading; };
const S = load();
const dates = n => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 0, 1 + i * 7)); return d.toISOString().slice(0, 10); });
const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, SHARPS = 'FCGDAEB', FLATS = 'BEADGCF';
const parser = new (new JSDOM('')).window.DOMParser();

// An independent reader: every note with its staff, onset, length, pitch, printed accidental and type.
function read(xml) {
  const doc = parser.parseFromString(xml, 'application/xml');
  assert.ok(!doc.querySelector('parsererror'), 'well-formed MusicXML');
  const q = (e, s) => e.querySelector(s), t = (e, s) => q(e, s)?.textContent;
  const fifths = Number(t(doc, 'key fifths')), mode = t(doc, 'key mode'), beats = Number(t(doc, 'time beats')), beatType = Number(t(doc, 'time beat-type'));
  const barLen = beats * 48 / beatType, measures = [];
  for (const m of doc.querySelectorAll('part > measure')) {
    const notes = [], used = { 1: 0, 2: 0 }; let pos = 0, last = 0;
    for (const e of m.children) {
      if (e.localName === 'backup') { pos -= Number(t(e, 'duration')); continue; }
      if (e.localName !== 'note') continue;
      const dur = Number(t(e, 'duration')), chord = !!q(e, 'chord'), staff = Number(t(e, 'staff')), on = chord ? last : pos;
      const n = { staff, on, dur, chord, rest: !!q(e, 'rest'), type: t(e, 'type'), dots: e.querySelectorAll('dot').length, triplet: !!q(e, 'time-modification'),
        tieStop: !!q(e, 'tie[type="stop"]'), acc: t(e, 'accidental') || null };
      if (!n.rest) { const step = t(e, 'step'), alter = Number(t(e, 'alter') || 0), octave = Number(t(e, 'octave')); Object.assign(n, { step, alter, octave, midi: 12 * (octave + 1) + NAT[step] + alter }); }
      notes.push(n);
      if (!chord) { last = pos; pos += dur; used[staff] += dur; }
    }
    measures.push({ notes, used });
  }
  return { fifths, mode, beats, beatType, barLen, measures, doc };
}
const keyAlter = (fifths, step) => fifths > 0 && SHARPS.slice(0, fifths).includes(step) ? 1 : fifths < 0 && FLATS.slice(0, -fifths).includes(step) ? -1 : 0;
const ACC = { sharp: 1, flat: -1, natural: 0, 'double-sharp': 2, 'flat-flat': -2 };
const tonicPc = s => s.key.replace(' major', '').replace(' minor', '').split('').reduce((pc, ch, i) => i ? pc + (ch === '♯' ? 1 : ch === '♭' ? -1 : 0) : NAT[ch], 0);
// sounding notes of a staff at a time
const sounding = (m, staff, at) => m.notes.filter(n => n.staff === staff && !n.rest && n.on <= at && n.on + n.dur > at).map(n => n.midi);

const NEW = { 2: ['eighths'], 3: ['dotted', 'runs'], 4: ['sixteenths', 'ledger'], 5: ['secondary', 'modulation'], 6: ['chromatic', 'leaps'] };

test('the same day and level always give the same piece; days, levels and “another piece” differ', () => {
  const a = S.generate({ level: 3, date: '2026-10-10' }), b = S.generate({ level: 3, date: '2026-10-10' });
  assert.equal(a.xml, b.xml);
  assert.notEqual(a.xml, S.generate({ level: 3, date: '2026-10-11' }).xml);
  assert.notEqual(a.xml, S.generate({ level: 3, date: '2026-10-10', variant: 2 }).xml);
  assert.notEqual(a.xml, S.generate({ level: 4, date: '2026-10-10' }).xml);
  const seen = new Set(dates(30).map(d => S.generate({ level: 2, date: d }).xml));
  assert.equal(seen.size, 30, 'thirty different days, thirty different pieces');
});

for (let level = 0; level <= 7; level++) test(`Level ${level}: complete bars, the level’s keys, meters and rhythms, correct accidentals, a tonic ending`, () => {
  const L = S.LEVELS[level], keys = new Set(S.KEYS.filter(k => k.level <= level && (k.mode === 'major' || level >= 2)).map(k => k.name));
  const meters = new Set(Object.entries(S.METERS).filter(([, m]) => m.level <= level && (!m.feature || level >= 3)).map(([k]) => k));
  const seenMeters = new Set(), seenKeys = new Set();
  for (const date of dates(level >= 5 ? 14 : 20)) {
    const p = S.generate({ level, date }), r = read(p.xml), tag = `Level ${level} ${date} (${p.key}, ${p.meter})`;
    seenMeters.add(p.meter); seenKeys.add(p.key);
    assert.ok(keys.has(p.key), `${tag}: key belongs to the level`);
    assert.ok(meters.has(`${r.beats}/${r.beatType}`), `${tag}: meter belongs to the level`);
    assert.equal(r.measures.length, L.bars, `${tag}: ${L.bars} bars`);
    assert.ok(!/fingering/.test(p.xml), `${tag}: no fingering numbers`);
    const key = S.KEYS.find(k => k.name === p.key); assert.equal(r.fifths, key.fifths);
    r.measures.forEach((m, i) => {
      for (const staff of [1, 2]) assert.equal(m.used[staff], r.barLen, `${tag} bar ${i + 1} staff ${staff}: the bar is full`);
      // accidentals: printed exactly when the pitch differs from the key signature or an earlier accidental in the bar
      for (const staff of [1, 2]) {
        const state = new Map();
        for (const n of m.notes.filter(n => n.staff === staff && !n.rest)) {
          const id = n.step + n.octave, have = state.has(id) ? state.get(id) : keyAlter(r.fifths, n.step);
          if (n.acc) { assert.equal(ACC[n.acc], n.alter, `${tag} bar ${i + 1}: accidental matches the pitch`); assert.notEqual(n.alter, have, `${tag} bar ${i + 1}: no needless accidental`); state.set(id, n.alter); }
          else if (!n.tieStop) assert.equal(n.alter, have, `${tag} bar ${i + 1}: ${n.step}${n.octave} needs an accidental`);
        }
      }
      for (const n of m.notes.filter(n => !n.rest)) {
        assert.ok(n.midi >= 28 && n.midi <= 96, `${tag}: ${n.midi} in a sensible range`);
        if (level <= 1) assert.ok(!['eighth', '16th'].includes(n.type), `${tag}: no eighths before Level 2`);
        if (level < 4) assert.ok(n.type !== '16th', `${tag}: no sixteenths before Level 4`);
        if (level < 5) assert.ok(!n.triplet, `${tag}: no triplets before Level 5`);
        if (level < 6) assert.ok(!(n.type === 'eighth' && n.dots), `${tag}: no dotted eighths before Level 6`);
        if (level < 3) assert.ok(!(n.type === 'quarter' && n.dots), `${tag}: no dotted quarters before Level 3`);
      }
      // chords fit in a hand
      const onsets = [...new Set(m.notes.filter(n => !n.rest).map(n => `${n.staff}:${n.on}`))];
      for (const o of onsets) { const [staff, on] = o.split(':').map(Number), ms = m.notes.filter(n => !n.rest && n.staff === staff && n.on === on).map(n => n.midi); assert.ok(Math.max(...ms) - Math.min(...ms) <= 12, `${tag} bar ${i + 1}: a chord spans an octave at most`); }
      if (level === 0) {
        assert.ok(!(m.notes.some(n => n.staff === 1 && !n.rest) && m.notes.some(n => n.staff === 2 && !n.rest)), `${tag} bar ${i + 1}: one hand at a time`);
        for (const n of m.notes.filter(n => !n.rest)) { assert.equal(n.alter, 0); assert.ok(n.staff === 1 ? n.midi >= 60 && n.midi <= 67 : n.midi >= 48 && n.midi <= 55, `${tag}: C position`); }
      } else {
        assert.ok(m.notes.some(n => n.staff === 2 && !n.rest), `${tag} bar ${i + 1}: the left hand plays`);
        // hands together: the right hand stays above the left
        for (const n of m.notes.filter(n => n.staff === 1 && !n.rest)) { const low = Math.max(-1, ...sounding(m, 2, n.on)); assert.ok(n.midi > low, `${tag} bar ${i + 1}: right hand above left hand`); }
      }
    });
    // the end: the top note and the bass are the tonic
    const lastBar = r.measures[r.measures.length - 1], tp = tonicPc(p), sound = lastBar.notes.filter(n => !n.rest);
    // the last note written (the top of its chord); Level 0 may end in either hand
    const lastOn = Math.max(...sound.filter(n => level === 0 || n.staff === 1).map(n => n.on)), top = Math.max(...sound.filter(n => n.on === lastOn && (level === 0 || n.staff === 1)).map(n => n.midi));
    if (level === 0) assert.equal(top % 12, tp, `${tag}: ends on the tonic`);
    else { assert.equal(top % 12, tp, `${tag}: melody ends on the tonic`); assert.equal(Math.min(...sound.filter(n => n.staff === 2).map(n => n.midi)) % 12, tp, `${tag}: bass ends on the tonic`); }
    // this level's new ingredients are in the piece
    for (const [from, list] of Object.entries(NEW)) if (level >= Number(from)) for (const f of list) if (!p.relaxed) assert.ok(p.ingredients.includes(f), `${tag}: has ${f}`);
    if (level >= 5) assert.ok(p.harmony.some(h => h.startsWith('V/') || h.startsWith('V7/')), `${tag}: a secondary dominant`);
    if (level >= 1) assert.ok(p.handsTogether);
  }
  if (level >= 1) assert.ok(seenKeys.size >= 2, `Level ${level}: more than one key over the days`);
  if (level >= 2) assert.ok(seenMeters.size >= 2, `Level ${level}: more than one meter over the days`);
});

test('ingredients can be switched off or added, and the music follows', () => {
  for (const date of dates(6)) {
    const noInv = S.generate({ level: 3, date, features: S.defaultFeatures(3).filter(f => f !== 'inversions') });
    assert.ok(!noInv.patterns.some(p => /inversion/.test(p)), 'no inversions when switched off');
    const plusSixteenths = S.generate({ level: 2, date, features: [...S.defaultFeatures(2), 'sixteenths'] });
    assert.ok(plusSixteenths.ingredients.includes('sixteenths') && /<type>16th<\/type>/.test(plusSixteenths.xml), 'sixteenths added as a challenge');
    const apart = S.generate({ level: 4, date, features: S.defaultFeatures(4).filter(f => f !== 'together') });
    assert.ok(!apart.handsTogether);
    read(apart.xml).measures.forEach(m => assert.ok(!(m.notes.some(n => n.staff === 1 && !n.rest) && m.notes.some(n => n.staff === 2 && !n.rest)), 'hands take turns'));
    const noMinor = S.generate({ level: 3, date, features: S.defaultFeatures(3).filter(f => f !== 'minor') });
    assert.match(noMinor.key, /major/);
  }
  const plusAlberti = S.generate({ level: 3, date: '2026-10-10', features: [...S.defaultFeatures(3).filter(f => !['chords', 'inversions'].includes(f)), 'alberti'] });
  assert.ok(plusAlberti.patterns.includes('Alberti bass') || plusAlberti.patterns.some(p => /five-finger|held/.test(p)));
});

// A browser-like setting: storage, events and the scripts the daily set talks to.
function app({ learner = 4, staircase } = {}) {
  const store = new Map(), listeners = {};
  const ls = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const w = { PianoRepertoire: {}, PianoCurriculum: { levels: Array.from({ length: learner + 1 }, (_, id) => ({ id })), pieces: [] },  // no pieces: the learner stays at the chosen level
    localStorage: ls, addEventListener: (t, f) => (listeners[t] = listeners[t] || []).push(f), dispatchEvent: e => { for (const f of listeners[e.type] || []) f(e); return true; },
    Event: class { constructor(t) { this.type = t; } }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o?.detail; } } };
  if (staircase !== undefined) w.PianoReadingGen = { level: () => staircase, TEMPO: { 0: 60, 1: 60, 2: 56, 3: 54, 4: 52, 5: 50, 6: 48, 7: 46 } };
  const c = Object.assign({ window: w, Date, JSON, Math, Number, Object, console }, w);
  vm.runInNewContext(fs.readFileSync('site/piano-sightread.js', 'utf8'), c);
  vm.runInNewContext(fs.readFileSync('site/piano-path.js', 'utf8'), c);
  c.window.PianoPath.setStartLevel(learner);
  return { w: c.window, store, SR: c.window.PianoSightReading, P: c.window.PianoPath, listeners };
}
const finish = (SR, id, accuracy, kind = 'play') => SR.record({ score: id, complete: true, loop: false, kind, accuracy, timing: 80, time: Date.now() });

test('every day each level has ten pieces, the same for everyone; levels and days differ; a different ingredient mix is a set of its own', () => {
  const a = app().SR, b = app().SR;
  const setA = a.daySet({ level: 3, date: '2026-10-10' }), setB = b.daySet({ level: 3, date: '2026-10-10' });
  assert.equal(setA.items.length, 10);
  assert.equal(JSON.stringify(setA.items.map(i => i.id)), JSON.stringify(setB.items.map(i => i.id)), 'two learners, the same ten ids');
  assert.equal(setA.items[0].id, 'sight-2026-10-10-l3-1');
  assert.ok(setA.shared);
  const xmls = setA.items.map(i => a.ensure(i.id).musicxml);
  assert.equal(JSON.stringify(xmls), JSON.stringify(setB.items.map(i => b.ensure(i.id).musicxml)), 'two learners, the same ten pieces');
  assert.equal(new Set(xmls).size, 10, 'ten different pieces');
  assert.notEqual(JSON.stringify(a.daySet({ level: 4, date: '2026-10-10' }).items.map(i => i.id)), JSON.stringify(setA.items.map(i => i.id)));
  const tomorrow = a.daySet({ level: 3, date: '2026-10-11' }).items.map(i => a.ensure(i.id).musicxml);
  assert.ok(tomorrow.every(x => !xmls.includes(x)), 'ten new ones tomorrow');
  const own = a.daySet({ level: 3, date: '2026-10-10', features: S.defaultFeatures(3).slice(1) });
  assert.ok(!own.shared);
  assert.match(own.items[0].id, /^sight-2026-10-10-l3-1-[a-z0-9]+$/);
  assert.ok(a.ensure(own.items[0].id), 'this browser can make its own mix again');
  assert.equal(b.ensure(own.items[0].id), null, 'another browser does not know that mix');
});

test('a piece is a reading piece the player can open: notes and bars before engraving, re-created after a reload', () => {
  const { SR, w } = app({ staircase: 4 });
  const id = SR.daySet({ level: 4, date: '2026-10-10' }).items[2].id, e = SR.ensure(id);
  assert.equal(e.kind, 'reading'); assert.equal(e.studyLevel, 4); assert.equal(e.tempo, 52, 'the reading tempo of the level (piano-reading-gen.js)');
  assert.ok(e.notes.length > 20 && e.notes.every(n => n.hand === 'left' || n.hand === 'right'));
  assert.equal(e.totalBeats, e.beatsPerMeasure * 8);
  assert.ok(/<score-partwise/.test(e.musicxml) && typeof e.prepare === 'function');
  delete w.PianoRepertoire[id];
  w.dispatchEvent(new w.CustomEvent('piano-select-score', { detail: { id, reading: true } }));
  assert.ok(w.PianoRepertoire[id], 'selecting the id makes the piece again');
  assert.equal(JSON.stringify(w.PianoRepertoire[id].notes), JSON.stringify(e.notes));
});

test('the level follows the reading staircase and stays fixed for the day; a chosen level wins', () => {
  let r = app({ learner: 5, staircase: 2.5 });
  assert.equal(r.SR.daySet().level, 2, 'the reading level (staircase), whole steps');
  r.w.PianoReadingGen.level = () => 3;
  assert.equal(r.SR.daySet().level, 3, 'before anything is opened, the level follows the staircase');
  r.SR.open();
  r.w.PianoReadingGen.level = () => 4;
  assert.equal(r.SR.daySet().level, 3, 'once a piece is opened, the day’s ten stay the same when the level moves');
  r.SR.setSettings({ level: 6 });
  assert.equal(r.SR.daySet().level, 6);
  r = app({ learner: 4 });
  assert.equal(r.SR.daySet().level, 3, 'without the staircase: one level behind repertoire at Level 4');
});

test('reading marks a piece; Today offers the next unread one, then says all ten are read; Reset clears today’s marks', () => {
  const { SR, P, store } = app({ learner: 4 }), set = SR.daySet(), today = SR.localDate();
  let item = P.today().items.find(i => i.kind === 'reading');
  assert.equal(item.id, `sight-${today}-l3-1`); assert.ok(/0 of 10/.test(item.note)); assert.equal(item.label, 'Read');
  assert.ok(SR.ensure(item.id) && P.today() && true);
  assert.equal(finish(SR, set.items[0].id, 72).accuracy, 72);
  finish(SR, set.items[0].id, 64);
  assert.equal(SR.mark(set.items[0].id).accuracy, 72, 'the best run is kept');
  assert.equal(SR.record({ score: set.items[1].id, complete: false, kind: 'play', accuracy: 99 }), null, 'an unfinished run does not count');
  assert.equal(SR.record({ score: set.items[1].id, complete: true, loop: true, kind: 'play', accuracy: 99 }), null, 'a loop does not count');
  item = P.today().items.find(i => i.kind === 'reading');
  assert.equal(item.id, set.items[1].id); assert.ok(/1 of 10/.test(item.note));
  for (const it of set.items.slice(1)) finish(SR, it.id, 90, 'wait');
  item = P.today().items.find(i => i.kind === 'reading');
  assert.ok(item.done); assert.equal(item.label, 'Again'); assert.ok(/All 10 read/.test(item.note));
  assert.equal(SR.streak(), 1);
  store.set('journey-note-passes-v1', JSON.stringify({ [set.items[3].id + ':all:full']: { accuracy: 95 }, 'ode:all:full': { accuracy: 91 } }));
  const after = SR.reset();
  assert.equal(after.done, 0, 'all ten unread again');
  assert.deepEqual(Object.keys(JSON.parse(store.get('journey-note-passes-v1'))), ['ode:all:full'], 'only today’s passes are cleared');
  assert.equal(SR.streak(), 1, 'the day still counts');
  assert.equal(P.today().items.find(i => i.kind === 'reading').id, set.items[0].id);
  assert.equal(SR.daySet({ level: 3, date: '2026-01-01' }).done, 0);
});

test('the Sight-reading panel shows today’s ten, the level, the ingredients and Reset', async () => {
  const dom = new JSDOM('<!doctype html><section id="reading-studio"><h2>Keep going</h2><div class="trainer-controls"></div></section>', { url: 'https://example.org/', runScripts: 'outside-only' });
  const w = dom.window; w.PianoPath = { learnerLevel: () => 3 }; w.confirm = () => true;
  w.eval(fs.readFileSync('site/piano-sightread.js', 'utf8'));
  if (w.document.readyState === 'loading') await new Promise(r => w.document.addEventListener('DOMContentLoaded', r));
  const box = w.document.getElementById('sight-daily');
  assert.ok(box, 'the panel is there');
  assert.ok(box.compareDocumentPosition(w.document.querySelector('.trainer-controls')) & w.Node.DOCUMENT_POSITION_FOLLOWING, 'above the fixed miniatures');
  assert.match(w.document.getElementById('sight-level').options[0].textContent, /Follow my reading level \(Level 2/);
  assert.equal(box.querySelectorAll('.sight-tile').length, 10);
  assert.match(box.querySelector('.sight-shared').textContent, /Everyone reading Level 2 today has the same ten/);
  assert.ok(w.document.getElementById('sight-reset').disabled, 'nothing to reset yet');
  const S2 = w.PianoSightReading, set = S2.daySet();
  finish(S2, set.items[0].id, 88); w.dispatchEvent(new w.Event('piano-sightread-changed'));
  assert.match(box.querySelector('.sight-status').textContent, /1 of 10 read today/);
  assert.ok(box.querySelector('.sight-tile.read'));
  assert.match(w.document.getElementById('sight-read').textContent, /No\. 2/);
  w.document.getElementById('sight-reset').click();
  assert.match(box.querySelector('.sight-status').textContent, /0 of 10 read today/);
  const challenge = [...box.querySelectorAll('.sight-chip input')].find(c => c.value === 'inversions');
  assert.ok(challenge && !challenge.checked, 'Level 3 ingredients are offered as challenges at Level 2');
  challenge.checked = true; challenge.dispatchEvent(new w.Event('change'));
  assert.match(box.querySelector('.sight-shared').textContent, /Your own ten/);
  assert.match(w.PianoSightReading.daySet().items[0].id, /-[a-z0-9]+$/);
});

// The real import and engraver (the same Verovio release the site loads), as in piano-import-crops.test.cjs.
async function engrave(xml, id) {
  const dom = new JSDOM('<!doctype html><head></head>');
  const ctx = { DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer, document: dom.window.document, TextDecoder, TextEncoder, Blob, Response, DecompressionStream, WebAssembly, performance, crypto: globalThis.crypto, console, setTimeout };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('site/piano-import-engine.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('site/piano-score-import.js', 'utf8'), ctx);
  dom.window.document.head.append = script => { vm.runInContext(fs.readFileSync('node_modules/verovio/dist/verovio-toolkit-wasm.js', 'utf8'), ctx); script.onload(); };
  return ctx.PianoScoreImport.fromXML(xml, { id });
}
test('every level engraves and imports: each written attack becomes a playable note in the right hand', { timeout: 240000 }, async () => {
  for (let level = 0; level <= 7; level++) {
    const p = S.generate({ level, date: '2026-10-10' }), r = read(p.xml), entry = await engrave(p.xml, 'sight-test');
    const attacks = r.measures.flatMap(m => m.notes.filter(n => !n.rest && !n.tieStop));
    assert.equal(entry.notes.length, attacks.length, `Level ${level}: every attack is playable`);
    assert.equal(entry.notes.filter(n => n.hand === 'right').length, attacks.filter(n => n.staff === 1).length, `Level ${level}: hands from the staves`);
    assert.equal(entry.totalBeats, r.measures.length * r.barLen / 12, `Level ${level}: the whole piece`);
    assert.ok(entry.engraving.pages.length >= 1 && entry.engraving.systems.length >= 1);
    assert.equal(entry.engraving.pages.reduce((s, pg) => s + pg.notes.length, 0), attacks.length, `Level ${level}: every attack is drawn`);
  }
});
