// Imported scores (MusicXML, MIDI and PDFs read into MusicXML) are engraved in the browser by Verovio
// and cut into staff systems for the moving score. Cutting halfway to the next system sliced off notes
// written on many ledger lines (a left hand far below the bass staff), so each crop now holds
// everything its system draws, and the moving strip makes room for it.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), { JSDOM } = require('jsdom');

// The site's import code with the real engraver (the same Verovio release the site loads).
async function engrave(xml) {
  const dom = new JSDOM('<!doctype html><head></head>');
  const ctx = { DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer, document: dom.window.document, TextDecoder, TextEncoder, Blob, Response, DecompressionStream, WebAssembly, performance, crypto: globalThis.crypto, console, setTimeout };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('site/piano-import-engine.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('site/piano-score-import.js', 'utf8'), ctx);
  dom.window.document.head.append = script => { vm.runInContext(fs.readFileSync('node_modules/verovio/dist/verovio-toolkit-wasm.js', 'utf8'), ctx); script.onload(); };
  const entry = await ctx.PianoScoreImport.fromXML(xml, { id: 'test' });
  return { entry, dom };
}

const numbers = s => (s.match(/[-\d.]+/g) || []).map(Number);

// Every line, beam and stem of the system, and every notehead, must lie inside the crop.
function outside(entry, dom) {
  const bad = [];
  entry.engraving.systems.forEach((s, i) => {
    const svg = new dom.window.DOMParser().parseFromString(s.svg, 'image/svg+xml').documentElement;
    const [, y, , h] = numbers(svg.getAttribute('viewBox')), [, my] = numbers(svg.querySelector('g.page-margin').getAttribute('transform'));
    const lines = [...svg.querySelectorAll('g.staff > path')].map(p => numbers(p.getAttribute('d'))[1]), space = (Math.max(...lines.slice(0, 5)) - Math.min(...lines.slice(0, 5))) / 4;
    const check = (what, py, pad = 0) => { if (py + my - pad < y - 1 || py + my + pad > y + h + 1) bad.push(`system ${i + 1}: ${what} at ${py + my} outside ${y}–${y + h}`); };
    for (const p of svg.querySelectorAll('g.system path, g.system polygon')) { const v = numbers(p.getAttribute(p.tagName === 'path' ? 'd' : 'points')); for (let k = 1; k < v.length; k += 2) check(p.parentNode.getAttribute('class') || p.tagName, v[k]); }
    for (const u of svg.querySelectorAll('g.score-note g.notehead use')) check('notehead', numbers(u.getAttribute('transform'))[1], space / 2);
    if (!(s.ink[0] >= 0 && s.ink[1] <= s.height + 1e-6 && s.ink[0] <= s.staffTop && s.ink[1] >= s.staffTop + s.staffGap)) bad.push(`system ${i + 1}: ink ${s.ink} does not hold the staves inside the crop`);
  });
  return bad;
}

test('notes far below the bass staff and far above the treble staff stay inside their system', async () => {
  const { entry, dom } = await engrave(fs.readFileSync('tests/fixtures/ledger-lines.musicxml', 'utf8'));
  assert.ok(entry.engraving.systems.length >= 3);
  assert.deepEqual(outside(entry, dom), []);
});

test('a score read from a PDF keeps its fingering, tuplet brackets and endings inside the crops', async () => {
  const reader = (() => { const c = { window: {}, TextDecoder, Map, Set }; vm.runInNewContext(fs.readFileSync('site/piano-pdf-reader.js', 'utf8'), c); return c.window.PianoPdfReader; })();
  const b = fs.readFileSync('tests/fixtures/pdf/reader-features-musescore.pdf');
  const r = await reader.convert(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { pdfjs: await import('pdfjs-dist/legacy/build/pdf.mjs'), documentOptions: { verbosity: 0 } });
  const { entry, dom } = await engrave(r.xml);
  assert.deepEqual(outside(entry, dom), []);
});

test('the moving strip makes room for what each imported line draws above and below its staves', () => {
  const dom = new JSDOM('<div id="score"></div>', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync('site/piano-score-view.js', 'utf8'));
  const host = dom.window.document.querySelector('#score'), view = Object.create(dom.window.PianoScoreView.prototype);
  let room = 320; Object.defineProperty(host, 'clientHeight', { get: () => room });
  // One line with notes on many ledger lines below the bass staff: 45 units of ink, the staves 25 of them.
  const svg = '<svg viewBox="0 0 10000 5000"><g class="score-note" data-beat="0" data-midi="29"></g></svg>';
  const systems = [{ svg, page: 0, start: 0, end: 4, y: 0, height: 50, staffTop: 8, staffGap: 25, ink: [3, 48], width: 100, positions: [[0, 5]] },
    { svg, page: 0, start: 4, end: 8, y: 50, height: 40, staffTop: 10, staffGap: 25, ink: [2, 37], width: 100, positions: [[4, 5]] }];
  Object.assign(view, { host, mode: 'scroll', available: true, score: { title: 'Low notes', beatsPerMeasure: 4 }, keys: new Map(), scale: 9, baseScale: 9, data: { pages: [{ start: 0, notes: [] }], systems } });
  const events = [{ beat: 0, duration: 1, notes: [29], members: [] }], matcher = { index: 0, held: new Set() };
  const fits = () => {
    const panels = [...host.querySelectorAll('.scroll-system')];
    panels.forEach((p, i) => {
      const s = systems[i], d = p.querySelector('svg'), top = parseFloat(d.style.top), height = parseFloat(p.style.height), k = view.scale;
      assert.ok(top + s.ink[0] * k >= 0, `line ${i + 1}: ink starts above the strip`);
      assert.ok(top + s.ink[1] * k <= height + 0.5, `line ${i + 1}: ink ends below the strip (${top + s.ink[1] * k} > ${height})`);
    });
    // Every line's staves sit at the same height, so the eye does not jump at a line change.
    assert.equal(new Set(panels.map((p, i) => (parseFloat(p.querySelector('svg').style.top) + systems[i].staffTop * view.scale).toFixed(3))).size, 1);
    return parseFloat(panels[0].style.height);
  };
  view.update({ events, matcher, fingers: false, hintsRight: [], hintsLeft: [] });
  assert.ok(fits() <= 300, 'a 320 px window keeps the strip inside it');
  assert.ok(view.scale < 9, 'the music shrinks to fit a short window');
  room = 800; view.update({ events, matcher, fingers: false, hintsRight: [], hintsLeft: [] });
  assert.equal(view.scale, 9, 'a tall window shows the music at full size again');
  assert.ok(fits() > 300);
  dom.window.close();
});

test('library scores without ink are fitted from their noteheads, staves at one height', () => {
  // Library crops store no ink; the strip measures each line from its noteheads instead (Schubert's
  // Sonata in A, D. 664 lost its lower staff and ledger-line notes in the old fixed 300 px layout).
  const dom = new JSDOM('<div id="score"></div>', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync('site/piano-score-view.js', 'utf8'));
  const host = dom.window.document.querySelector('#score'), view = Object.create(dom.window.PianoScoreView.prototype);
  Object.defineProperty(host, 'clientHeight', { value: 320 });
  const svg = '<svg viewBox="0 0 10000 5000"><g class="score-note" data-beat="0" data-midi="60"></g></svg>';
  const systems = [{ svg, page: 0, start: 0, end: 4, y: 0, height: 50, staffTop: 10, staffGap: 25, width: 100, positions: [[0, 5]] },
    { svg, page: 0, start: 4, end: 8, y: 50, height: 60, staffTop: 8, staffGap: 30, width: 100, positions: [[4, 5]] }];
  // A note eight spaces below the second line's bass staff.
  const notes = [{ beat: 0, midi: 60, x: 5, y: 20 }, { beat: 4, midi: 29, x: 5, y: 50 + 8 + 30 + 8 }];
  Object.assign(view, { host, mode: 'scroll', available: true, score: { title: 'Library', beatsPerMeasure: 4 }, keys: new Map(), scale: 7, baseScale: 7, data: { pages: [{ start: 0, notes }], systems } });
  view.update({ events: [{ beat: 0, duration: 1, notes: [60], members: [] }], matcher: { index: 0, held: new Set() }, fingers: false, hintsRight: [], hintsLeft: [] });
  const panels = [...host.querySelectorAll('.scroll-system')], k = view.scale, H = parseFloat(panels[0].style.height);
  assert.ok(H <= 300, 'the strip stays inside a 320 px window');
  const staffTop = panels.map((p, i) => parseFloat(p.querySelector('svg').style.top) + systems[i].staffTop * k);
  assert.ok(Math.abs(staffTop[0] - staffTop[1]) < 1e-6, 'staves at one height');
  const low = staffTop[1] + (notes[1].y - 50 - 8) * k;
  assert.ok(low + k / 2 <= H, `the low note fits (${low} > ${H})`);
  dom.window.close();
});
