// The generated reading pieces in the real page (Chromium through Playwright): a generated piece is engraved
// by Verovio from its MusicXML, the player loads it from memory, the tap keys play it, a complete In-time
// run moves the reading staircase, the "Read something new" look-over starts In time, and Find your level
// ends with a starting level. Verovio is served from node_modules instead of the CDN; nothing else is fetched.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { execSync } = require('node:child_process');

function playwright() {
  try { return require('playwright'); } catch {}
  try { return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch {}
  for (const p of ['/opt/npm-tools/node_modules/playwright']) try { return require(p); } catch {}
  return null;
}
const pw = playwright();
const SITE = path.join(__dirname, '..', 'site'), VEROVIO = path.join(__dirname, '..', 'node_modules', 'verovio', 'dist', 'verovio-toolkit-wasm.js');
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

let server, base, browser;
const skip = !pw ? 'Playwright is not installed' : !fs.existsSync(VEROVIO) ? 'verovio is not in node_modules (npm ci)' : false;
test.before(async () => {
  if (skip) return;
  server = http.createServer((req, res) => {
    const file = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await pw.chromium.launch();
});
test.after(async () => { await browser?.close(); server?.close(); });

async function page(width = 1280, height = 900) {
  const pg = await browser.newPage({ viewport: { width, height } }), errors = [];
  pg.on('pageerror', e => errors.push(e.message));
  await pg.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('verovio-toolkit-wasm.js')) return route.fulfill({ body: fs.readFileSync(VEROVIO), contentType: 'application/javascript' });
    if (url.startsWith(base)) return route.continue();
    return route.abort();
  });
  await pg.goto(base + '/index.html#home');
  await pg.waitForFunction(() => window.PianoPractice && window.PianoReadingGen && window.PianoPlacement, null, { timeout: 60000 });
  return { pg, errors };
}
// Play the open piece In time with the tap-key API, each group when the line reaches it.
const playInTime = pg => pg.evaluate(() => new Promise(resolve => {
  const P = window.PianoPractice, ev = P.events, held = new Set(); let i = 0;
  const off = P.on('result', r => { off(); for (const n of held) P.noteOff(n); resolve(r); });
  const loop = () => {
    const pos = P.position;
    while (i < ev.length && pos >= ev[i].beat - 0.02) { for (const n of held) P.noteOff(n); held.clear(); for (const n of ev[i++].notes) { P.noteOn(n); held.add(n); } }
    if (P.state === 'play') requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}));

test('a generated piece is engraved from its MusicXML, loads from memory and plays with the tap keys', { skip, timeout: 180000 }, async () => {
  const { pg, errors } = await page();
  const id = await pg.evaluate(() => window.PianoReadingGen.next(3).id);
  assert.equal(id, 'gen-reading-3-1');
  await pg.evaluate(id => window.dispatchEvent(new CustomEvent('piano-select-score', { detail: id })), id);
  await pg.waitForFunction(id => window.PianoPractice.score?.id === id, id, { timeout: 90000 });
  const info = await pg.evaluate(() => {
    const s = window.PianoPractice.score, heads = new Set();
    for (const sys of s.engraving.systems) for (const m of sys.svg.matchAll(/class="score-note"[^>]*data-midi="(\d+)"[^>]*data-beat="([^"]+)"/g)) heads.add(Number(m[2]).toFixed(5) + ':' + m[1]);
    const generated = window.PianoReadingGen.generate(3, 1).notes;
    return { title: s.title, systems: s.engraving.systems.length, notes: s.notes.length, generated: generated.length,
      missing: s.notes.filter(n => !heads.has(n.beat.toFixed(5) + ':' + n.midi)).length,
      same: JSON.stringify(s.notes.map(n => [n.midi, n.beat, n.hand])) === JSON.stringify(generated.map(n => [n.midi, n.beat, n.hand])),
      drawn: document.querySelectorAll('#practice-score .score-note').length, option: !!document.querySelector('#trainer-song option[value="gen-reading-3-1"]') };
  });
  assert.equal(info.title, 'Reading 3 · No. 1');
  assert.ok(info.systems >= 1);
  assert.equal(info.notes, info.generated); assert.ok(info.same, 'the engraved notes are the generated notes');
  assert.equal(info.missing, 0, 'every note has an engraved notehead');
  assert.ok(info.drawn > 0, 'the sheet is on the page'); assert.ok(info.option, 'the piece is in the score list');
  // Wait mode with the tap keys: play the first groups
  await pg.evaluate(() => { window.PianoPractice.setInput('keys'); return window.PianoPractice.start('wait'); });
  await pg.waitForFunction(() => window.PianoPractice.mode === 'keys', null, { timeout: 30000 });
  const after = await pg.evaluate(() => {
    const P = window.PianoPractice;
    for (let k = 0; k < 5; k++) { const notes = P.events[P.index].notes; for (const n of notes) P.noteOn(n); for (const n of notes) P.noteOff(n); }
    return { index: P.index, errors: P.stats.errors };
  });
  assert.deepEqual(after, { index: 5, errors: 0 });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('Read something new: a 30-second look-over, then In time; a clean run moves the reading level up', { skip, timeout: 180000 }, async () => {
  const { pg, errors } = await page();
  const id = await pg.evaluate(() => { window.PianoReadingGen.setLevel(0); return window.PianoReadingGen.next().id; });
  assert.equal(id, 'gen-reading-0-1');
  await pg.evaluate(id => window.dispatchEvent(new CustomEvent('piano-select-score', { detail: { id, reading: true } })), id);
  await pg.waitForSelector('.reading-lookover', { timeout: 90000 });
  const look = await pg.evaluate(() => ({ count: Number(document.querySelector('.reading-count').textContent), tempo: window.PianoPractice.tempo, view: document.querySelector('.sg-views [aria-pressed="true"]')?.dataset.value, state: window.PianoPractice.state }));
  assert.ok(look.count > 25 && look.count <= 30, 'the countdown runs from 30');
  assert.equal(look.tempo, 60, 'the reading tempo of Level 0'); assert.equal(look.view, 'full', 'the whole piece on the page'); assert.equal(look.state, 'idle');
  await pg.evaluate(() => { window.PianoPractice.setInput('keys'); window.PianoPractice.setTempo(120); });
  await pg.click('.reading-lookover button:not(.secondary)');
  await pg.waitForFunction(() => window.PianoPractice.state === 'play', null, { timeout: 30000 });
  assert.equal(await pg.$('.reading-lookover'), null, 'the look-over closes when In time starts');
  const result = await playInTime(pg);
  assert.equal(result.kind, 'play'); assert.equal(result.complete, true); assert.ok(result.accuracy >= 90 && result.timing >= 75, JSON.stringify(result));
  const saved = await pg.evaluate(() => ({ level: window.PianoReadingGen.level(), store: JSON.parse(localStorage.getItem('openpiano-reading-v1')), next: window.PianoReadingGen.next(0).id, view: document.querySelector('.sg-views [aria-pressed="true"]')?.dataset.value }));
  assert.equal(saved.level, 1, 'up a whole step');
  assert.deepEqual(Object.values(saved.store.history).map(h => [h.id, h.level]), [['gen-reading-0-1', 0]]);
  assert.equal(saved.next, 'gen-reading-0-2', 'the piece is not offered again');
  assert.equal(saved.view, 'split', 'the learner\'s own view comes back');
  assert.deepEqual(errors, []);
  await pg.close();
});

test('Find your level: from Home, adaptive pieces, a suggested level that sets the path and the reading level', { skip, timeout: 240000 }, async () => {
  const { pg, errors } = await page(390, 844);
  await pg.click('.today-find');
  await pg.waitForSelector('.placement');
  await pg.click('.placement-choice:nth-child(3)');               // I have played for years: start at Level 4
  await pg.click('.placement-choice:nth-child(3)');               // Tap or type
  const card = () => pg.waitForFunction(() => { const c = document.querySelector('.placement-card'); return c && !c.hidden && c.isConnected; }, null, { timeout: 90000 });
  await card();
  const levels = [await pg.evaluate(() => window.PianoPractice.score.studyLevel)];
  assert.equal(levels[0], 4);
  await pg.click('.placement-card button:nth-child(2)');          // Too hard: down to Level 3
  await card(); levels.push(await pg.evaluate(() => window.PianoPractice.score.studyLevel));
  assert.equal(levels[1], 3);
  // read Level 3 cleanly at sight, In time
  await pg.evaluate(() => window.PianoPractice.setTempo(150));
  await pg.click('.placement-card button:first-child');
  await pg.waitForFunction(() => window.PianoPractice.state === 'play', null, { timeout: 30000 });
  const result = await playInTime(pg);
  assert.ok(result.accuracy >= 90 && result.timing >= 75, JSON.stringify(result));
  await pg.waitForSelector('.placement-backdrop:not([hidden]) .placement-actions', { timeout: 30000 });
  const text = await pg.evaluate(() => document.querySelector('.placement').innerText);
  assert.match(text, /Start at Level 3/); assert.match(text, /Level 3 cleanly at sight and Level 4 was a stretch/);
  assert.equal(await pg.evaluate(() => JSON.parse(localStorage.getItem('openpiano-reading-v1') || '{}').history), undefined, 'placement pieces do not move the staircase');
  await pg.click('.placement-actions button:not(.secondary)');
  const after = await pg.evaluate(() => ({ start: JSON.parse(localStorage.getItem('my-journey-piano-pathway-v2')).startLevel, reading: window.PianoReadingGen.level(), hash: location.hash, open: !!document.querySelector('.placement') }));
  assert.deepEqual(after, { start: 3, reading: 3, hash: '#home', open: false });
  assert.deepEqual(errors, []);
  await pg.close();
});

test('Find your level without an input falls back to the answer', { skip, timeout: 120000 }, async () => {
  const { pg } = await page();
  await pg.evaluate(() => window.PianoPlacement.open());
  await pg.click('.placement-choice:nth-child(2)');               // I play a little
  await pg.click('.placement-actions button.secondary');          // I can't play right now
  const text = await pg.evaluate(() => document.querySelector('.placement').innerText);
  assert.match(text, /Start at Level 1/); assert.match(text, /from your answer alone/);
  await pg.click('.placement-actions button.secondary');          // Choose myself
  assert.equal(await pg.evaluate(() => !!document.querySelector('.placement')), false);
  await pg.close();
});
