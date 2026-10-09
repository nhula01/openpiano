// Every engraved score is cut into staff systems for the moving score, the sheet playhead and the
// sheet's auto-scroll. A wrong cut shows the wrong slice of the page or cuts notes off, which is
// easy to miss because it often happens only near the end of a page (Für Elise, page 4).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), zlib = require('node:zlib'), path = require('node:path');
const { JSDOM } = require('jsdom'), vm = require('node:vm');
// The moving score's layout (ScoreView.stripLayout), loaded without a page.
const strip = { window: {}, document: { createElement: () => ({}) } };
vm.runInNewContext(fs.readFileSync('site/piano-score-view.js', 'utf8'), strip);

const viewBox = svg => svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/).slice(1).map(Number);

// One pass over the library (scores are large, so each is checked and then dropped).
const problems = { span: [], heads: [], lily: [], strip: [] }; let checked = 0;
for (const id of fs.readdirSync('site/scores').sort()) {
  const f = ['practice.json', 'practice.json.gz'].map(n => path.join('site/scores', id, n)).find(fs.existsSync);
  if (!f) continue;
  const raw = fs.readFileSync(f), e = JSON.parse(f.endsWith('.gz') ? zlib.gunzipSync(raw) : raw).engraving;
  if (!e?.systems?.length) continue;
  checked++;
  const S = e.systems, k = Math.pow(10, Math.round(Math.log10(viewBox(S[0].svg)[3] / S[0].height)));
  S.forEach((s, i) => {
    if (!(s.start < s.end)) problems.span.push(`${id} system ${i}: no time span`);
    if (s.staffTop < 0 || s.staffTop + s.staffGap > s.height + 1e-6) problems.span.push(`${id} system ${i}: staves outside the crop`);
    const [, y, , h] = viewBox(s.svg);
    if (Math.abs(y - s.y * k) > .02 * k || Math.abs(h - s.height * k) > .02 * k) problems.span.push(`${id} system ${i}: crop and stored geometry disagree`);
  });
  const at = beat => { const i = S.findIndex(s => beat >= s.start && beat < s.end); return i < 0 ? (beat < S[0].start ? 0 : S.length - 1) : i; };
  const inside = (s, n, pi) => s && s.page === pi && n.y >= s.y - .5 && n.y <= s.y + s.height + .5;
  let miss = 0, example = '';
  e.pages.forEach((p, pi) => p.notes.forEach(n => {
    const i = at(n.beat);
    // A grace note printed at the end of a line can share the next line's first moment.
    if (inside(S[i], n, pi) || (n.beat - S[i].start < .25 && inside(S[i - 1], n, pi))) return;
    miss++; example ||= `page ${pi + 1} beat ${n.beat}`;
  }));
  if (miss) problems.heads.push(`${id}: ${miss} noteheads outside their system (${example})`);
  // The moving score shows every line in one panel height; staves and noteheads must fit in it
  // (Schubert's Sonata in A, D. 664 lost its lower staff and ledger-line notes in a fixed 300 px).
  for (const H of [220, 300, 520]) {
    const L = strip.window.PianoScoreView.stripLayout(e, H, k), half = L.space * L.scale / 2;
    let cut = 0, where = '';
    S.forEach((s, i) => { if (L.staffTop[i] < 0 || L.staffTop[i] + s.staffGap * L.scale > H + .5) { cut++; where ||= `staves of system ${i}`; } });
    e.pages.forEach((p, pi) => p.notes.forEach(n => {
      const i = S.findIndex(s => s.page === pi && n.beat >= s.start - .001 && n.beat < s.end - .001 && n.y >= s.y - .01 && n.y <= s.y + s.height + .01);
      if (i < 0) return;
      const y = L.staffTop[i] + (n.y - S[i].y - S[i].staffTop) * L.scale;
      if (y - half < -.5 || y + half > H + .5) { cut++; where ||= `system ${i} beat ${n.beat}`; }
    }));
    if (cut) problems.strip.push(`${id} at ${H} px: ${cut} cut (${where})`);
  }
  if (!e.pages[0].svg.includes('Verovio')) S.forEach((s, i) => {
    const [, y, , h] = viewBox(s.svg);
    for (const m of s.svg.matchAll(/class="score-note"[^>]*>\s*<g transform="translate\(([-\d.]+), ?([-\d.]+)\)/g)) {
      const hy = Number(m[2]);
      if (hy < y - .3 || hy > y + h + .3) { problems.lily.push(`${id} system ${i}: notehead at ${hy} outside ${y.toFixed(1)}–${(y + h).toFixed(1)}`); break; }
    }
  });
}

test('the library has engraved scores to check', () => assert.ok(checked > 500, String(checked)));

test('every staff system has its own stretch of time and holds its staves inside the crop', () => assert.deepEqual(problems.span, []));

test('every notehead lies inside the system that plays it, so the playhead and the moving score show it', () => assert.deepEqual(problems.heads, []));

test('LilyPond crops keep each notehead of the system and no notehead of a neighbouring system', () => assert.deepEqual(problems.lily, []));

test('the moving score keeps every staff and notehead of every line in view at 220, 300 and 520 px', () => assert.deepEqual(problems.strip, []));

test('the sheet playhead and auto-scroll follow systems on Verovio pages drawn in a nested viewBox', () => {
  // Verovio pages: outer <svg> has a pixel size but no viewBox; the drawing sits in an inner
  // <svg viewBox="0 0 21000 29700">, and stored geometry is in hundredths of those units.
  const page = '<svg width="2100px" height="2970px"><svg class="definition-scale" viewBox="0 0 21000 29700"><g class="score-note" data-beat="0" data-midi="60"></g><g class="score-note" data-beat="8" data-midi="62"></g></svg></svg>';
  const dom = new JSDOM(`<div id="score">${page}</div>`, { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync('site/piano-score-view.js', 'utf8'));
  const host = dom.window.document.querySelector('#score'), outer = host.querySelector('svg'), inner = outer.querySelector('svg');
  Object.defineProperty(outer, 'viewBox', { value: { baseVal: { width: 0, y: 0 } } });
  Object.defineProperty(inner, 'viewBox', { value: { baseVal: { width: 21000, y: 0 } } });
  Object.defineProperty(host, 'clientHeight', { value: 720 });
  host.getBoundingClientRect = () => ({ left: 0, top: 0 });
  // Drawn 1050 px wide: 0.05 px per Verovio unit, 5 px per stored unit.
  outer.getBoundingClientRect = inner.getBoundingClientRect = () => ({ width: 1050, top: -host.scrollTop });
  [...host.querySelectorAll('.score-note')].forEach((n, i) => n.getBoundingClientRect = () => ({ left: 100, top: [60, 1000][i] - host.scrollTop }));
  const sys = (start, y) => ({ page: 0, start, end: start + 8, y, height: 40, width: 190, positions: [[start, 10]], svg: `<svg viewBox="1000 ${y * 100} 19000 4000"></svg>` });
  const view = Object.create(dom.window.PianoScoreView.prototype);
  Object.assign(view, { host, mode: 'sheet', page: 0, available: true, score: { title: 'Study' }, keys: new Map(), data: { pages: [{ start: 0 }], systems: [sys(0, 8), sys(8, 190)] } });
  view.unitScale = 100;
  const events = [{ beat: 0, duration: 1, notes: [60], members: [] }, { beat: 8, duration: 1, notes: [62], members: [] }], matcher = { index: 0, held: new Set() };
  const update = () => view.update({ events, matcher, fingers: false, hintsRight: [], hintsLeft: [] });
  update();
  const line = host.querySelector('.normal-playhead');
  assert.equal(line.style.top, '40px'); assert.equal(line.style.height, '200px'); assert.equal(host.scrollTop, 0);
  matcher.index = 1; update();
  // The second line starts at 950 px, below the 720 px window, so the sheet scrolls to it.
  assert.ok(host.scrollTop > 900, 'scrolled to the lower system: ' + host.scrollTop);
  dom.window.close();
});

test('setScore reads the unit scale from the stored crops', () => {
  const dom = new JSDOM('<div id="root"><div id="score"></div></div>', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync('site/piano-score-view.js', 'utf8'));
  const view = new dom.window.PianoScoreView(dom.window.document.querySelector('#score'), dom.window.document.querySelector('#root'));
  const systems = h => [{ svg: `<svg viewBox="0 7 100 ${h}"></svg>`, height: 47.92, staffGap: 20, page: 0, start: 0, end: 4, positions: [] }];
  view.setScore({ id: 'v', engraving: { pages: [], systems: systems(4792) }, originalPages: 0 }); assert.equal(view.unitScale, 100);
  view.setScore({ id: 'l', engraving: { pages: [], systems: systems(47.92) }, originalPages: 0 }); assert.equal(view.unitScale, 1);
  dom.window.close();
});
