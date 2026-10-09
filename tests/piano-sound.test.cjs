const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), zlib = require('node:zlib');

function grand(missing = new Set()) {
  const requested = [];
  const context = {
    currentTime: 0, destination: {},
    decodeAudioData: async buf => ({ duration: 4, key: buf.key }),
    createBufferSource: () => ({ playbackRate: { value: 1 }, connect() {}, start() {}, stop() {} }),
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {} }),
  };
  const ctx = { window: {}, Math, Error, Promise, Set, Map, fetch: async url => { const key = Number(url.match(/(\d+)\.mp3$/)[1]); requested.push(key);
    if (missing.has(key)) return { ok: false, status: 404 }; return { ok: true, arrayBuffer: async () => ({ key }) }; } };
  vm.runInNewContext(fs.readFileSync('site/piano-grand.js', 'utf8'), ctx);
  return { G: ctx.window.PianoGrand, context, requested };
}

test('every key of the 88-key piano has its own grand piano recording', () => {
  for (let n = 21; n <= 108; n++) assert.ok(fs.statSync(`site/audio/grand-piano/${n}.mp3`).size > 1000, `sample ${n}`);
});

test('a key whose recording fails to download is retried, then played from the nearest key at the right pitch', async () => {
  const { G, context, requested } = grand(new Set([60]));
  await G.load(context, [60, 64]);
  assert.equal(requested.filter(k => k === 60).length, 2, 'one retry');
  const voice = G.play(context, 60); assert.ok(voice.stop);
  const node = []; context.createBufferSource = () => { const n = { playbackRate: { value: 1 }, connect() {}, start() {}, stop() {} }; node.push(n); return n; };
  G.play(context, 60); assert.ok(Math.abs(node[0].playbackRate.value - 1) > 0.01, 'borrowed sample is re-pitched');
  G.play(context, 64); assert.equal(node[1].playbackRate.value, 1, 'own sample plays unaltered');
});

test('notes beyond the keyboard still sound as grand piano, never as a synthesized tone', async () => {
  const { G, context } = grand();
  await G.load(context, [110, 15]);
  const node = []; context.createBufferSource = () => { const n = { playbackRate: { value: 1 }, connect() {}, start() {}, stop() {} }; node.push(n); return n; };
  G.play(context, 110); G.play(context, 15);
  assert.ok(Math.abs(node[0].playbackRate.value - Math.pow(2, 2 / 12)) < 1e-9 && Math.abs(node[1].playbackRate.value - Math.pow(2, -6 / 12)) < 1e-9);
  assert.equal(fs.readFileSync('site/piano-player.js', 'utf8').includes('createOscillator'), false, 'the player never synthesizes notes');
  assert.equal(fs.readFileSync('site/piano-skill-studio.js', 'utf8').includes('createOscillator'), false, 'skill examples never synthesize notes');
});

test('every note of every library piece lies on the 88 keys, so it plays its own recording', () => {
  const ctx = { window: { PianoRepertoire: {} } };
  for (const f of ['piano-repertoire', 'piano-library', 'piano-additions', 'piano-famous', 'piano-pdmx', 'piano-studies', 'piano-collection']) vm.runInNewContext(fs.readFileSync(`site/${f}.js`, 'utf8'), ctx);
  const R = ctx.window.PianoRepertoire; let pieces = 0;
  for (const [id, r] of Object.entries(R)) {
    let d = r;
    if (r.dataURL && !r.notes) { const f = 'site/' + r.dataURL.split('?')[0], b = fs.readFileSync(f); d = JSON.parse(f.endsWith('.gz') ? zlib.gunzipSync(b) : b); }
    assert.ok((d.notes || []).every(n => n.midi >= 21 && n.midi <= 108), id); pieces++;
  }
  assert.ok(pieces >= 500, pieces + ' pieces');
});
