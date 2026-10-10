'use strict';
// The chord trainer in a real browser (Playwright + Chromium), driven with PianoPractice.noteOn as
// the tap keys do: the route question on Home, a Wait-mode run and a passing In-time run.
// Skipped when Playwright or its Chromium is not installed.
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs'), path = require('node:path');

let playwright = null;
for (const name of ['playwright', '/opt/npm-tools/node_modules/playwright']) { try { playwright = require(name); break; } catch {} }
const chromiumPath = (() => { try { const p = playwright?.chromium.executablePath(); return p && fs.existsSync(p) ? p : null; } catch { return null; } })();
const SITE = path.join(__dirname, '..', 'site');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(SITE, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

test('chord trainer: choose the chords route, then play a lesson with tap input', { skip: !chromiumPath && 'Playwright Chromium not installed', timeout: 120000 }, async () => {
  const server = await serve(), base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    await page.goto(base + '#home');
    await page.clock.runFor(1500);
    await page.waitForSelector('.cx-route');
    assert.equal(await page.textContent('.cx-route-q'), 'What do you want to do first?');
    await page.click('.cx-route [data-route=chords]');
    await page.clock.runFor(200);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('my-journey-piano-pathway-v2')).route);
    assert.equal(stored, 'chords');
    const item = page.locator('.today-item.today-chords');
    assert.match(await item.textContent(), /C, F and G/);
    assert.ok(await page.locator('.today-item.today-reading').count(), 'the reading item stays');
    await item.locator('button', { hasText: 'Practise' }).click();
    await page.clock.runFor(300);
    assert.equal(await page.evaluate(() => location.hash), '#chords/ch-1-1');
    assert.equal(await page.isVisible('#chords-app h1'), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scrolling on a phone');

    // Wait mode: each chord waits until it is right
    const play = async notes => { await page.evaluate(n => n.forEach(m => PianoPractice.noteOn(m)), notes); };
    const lift = async notes => { await page.evaluate(n => n.forEach(m => PianoPractice.noteOff(m)), notes); };
    await page.click('#chords-start');
    await play([60, 63, 67]);
    assert.match(await page.textContent('.cx-feedback'), /Leave out E♭/);
    await page.clock.runFor(300); await lift([63]); await play([64]);
    assert.match(await page.textContent('.cx-feedback'), /C ✓ Next: F/);
    assert.equal(await page.locator('.cx-chip.ok').count(), 1);
    await lift([60, 64, 67]);
    const shapes = [[65, 69, 72], [55, 59, 62], [48, 64, 67, 72], [60, 64, 67], [60, 65, 69], [59, 62, 67], [64, 67, 72]];
    for (const s of shapes) { await page.clock.runFor(300); await play(s); await lift(s); }
    await page.waitForSelector('.cx-result:not([hidden])');
    assert.match(await page.textContent('.cx-result'), /Chords right first try7 of 8/);

    // In time at 62 BPM: one bar of count-in, then a chord every bar, struck just after the beat
    await page.click('.cx-seg-btn[data-value=time]');
    for (let i = 0; i < 3; i++) await page.click('.cx-tempo button[aria-label=Faster]');
    assert.equal(await page.textContent('.cx-bpm'), '62 BPM');
    const spb = 60000 / 62;
    await page.click('#chords-start');
    await page.clock.runFor(150 + 4 * spb + 30);
    const chords = [[60, 64, 67], [60, 65, 69], [59, 62, 67], [60, 64, 67]];
    for (let i = 0; i < 8; i++) {
      const c = chords[i % 4];
      await play(c);
      await page.clock.runFor(4 * spb - 120);
      await lift(c);
      await page.clock.runFor(120);
    }
    await page.clock.runFor(1000);
    await page.waitForSelector('.cx-result.passed');
    assert.match(await page.textContent('.cx-result'), /Lesson passed[\s\S]*8 of 8 \(100%\)/);
    const attempts = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('openpiano-chords-v1')).lessons['ch-1-1'].a));
    assert.equal(attempts.length, 2);
    assert.deepEqual(attempts.map(a => [a.m, a.pass]), [['wait', 0], ['time', 1]]);
    // the lesson list now shows it passed and the next lesson up
    await page.evaluate(() => { location.hash = '#chords'; });
    await page.clock.runFor(300);
    assert.match(await page.textContent('.cx-next'), /The shortcut shapes/);
    assert.equal(await page.locator('.cx-lesson.passed').count(), 1);
    // a lead sheet opens with its chords over the melody
    await page.evaluate(() => { location.hash = '#chords/song/amazing-grace'; });
    await page.clock.runFor(300);
    assert.match(await page.textContent('.cx-sheet'), /F[\s\S]*B♭/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
});
