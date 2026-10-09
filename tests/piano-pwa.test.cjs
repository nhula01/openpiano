'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SITE = path.join(__dirname, '..', 'site');

test('manifest describes an installable, repository-relative OpenPiano app', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(SITE, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'OpenPiano');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.scope, './');
  assert.match(manifest.start_url, /^\.\//);
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose.includes('maskable')));
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(SITE, icon.src)), icon.src);
});

test('generated app icons have the dimensions declared by the manifest', () => {
  for (const size of [180, 192, 512]) {
    const png = fs.readFileSync(path.join(SITE, 'icons', `openpiano-${size}.png`));
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('service worker pre-caches only existing public app files and leaves scores on demand', () => {
  const source = fs.readFileSync(path.join(SITE, 'service-worker.js'), 'utf8');
  const shell = source.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
  const entries = [...shell.matchAll(/'\.\/(.*?)'/g)].map(match => match[1]);
  assert.ok(entries.includes('index.html'));
  assert.ok(entries.includes('piano-pwa.js'));
  assert.equal(entries.some(entry => entry.startsWith('scores/')), false, 'large score library must load and cache on demand');
  for (const entry of entries.filter(Boolean)) assert.ok(fs.existsSync(path.join(SITE, entry)), entry);
  assert.match(source, /url\.origin !== self\.location\.origin/);
});

test('install prompt appears only when the browser offers installation', async () => {
  const dom = new JSDOM('<section id="install-card" hidden><button id="install-app">Install</button></section><dialog id="install-help"><p id="install-instructions"></p><button data-close-install>Done</button></dialog>', {
    url: 'https://example.test/openpiano/',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false });
  window.eval(fs.readFileSync(path.join(SITE, 'piano-pwa.js'), 'utf8'));
  const card = window.document.getElementById('install-card');
  assert.equal(card.hidden, true);

  let prompted = 0;
  const event = new window.Event('beforeinstallprompt');
  event.prompt = async () => { prompted += 1; };
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(event);
  assert.equal(card.hidden, false);
  window.document.getElementById('install-app').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(prompted, 1);
  assert.equal(card.hidden, true);
});
