// The picture reader (site/piano-scan-reader.js) on a scan and a phone-style photo of printed piano
// music. Pictures are never read perfectly, so these tests pin how much is read right (pitch and
// time of each note, measure by measure) so that a change cannot quietly make it worse, plus the
// things that must always hold: the result passes the practice engine's checks, the key and time
// are found, and a picture without music is refused plainly.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), zlib = require('node:zlib');
const { JSDOM } = require('jsdom'), jpeg = require('jpeg-js');
const dom = new JSDOM('');

function load() {
  const ctx = { console, TextDecoder, atob: s => Buffer.from(s, 'base64').toString('binary'), setTimeout, DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer };
  ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['piano-import-engine.js', 'piano-pdf-reader.js', 'piano-scan-reader.js']) vm.runInContext(fs.readFileSync('site/' + f, 'utf8'), ctx);
  return ctx;
}
const ctx = load(), S = ctx.PianoScanReader, E = ctx.PianoImportEngine;
const pixels = file => { const img = jpeg.decode(fs.readFileSync(file), { useTArray: true }); return { g: S.toGray(img.data, img.width, img.height), w: img.width, h: img.height }; };
const mxl = file => { const b = fs.readFileSync(file); let o = 0; // first stored or deflated .xml entry that is not META-INF
  while (b.readUInt32LE(o) === 0x04034b50) {
    const method = b.readUInt16LE(o + 8), size = b.readUInt32LE(o + 18), nl = b.readUInt16LE(o + 26), xl = b.readUInt16LE(o + 28), name = b.toString('utf8', o + 30, o + 30 + nl), data = b.subarray(o + 30 + nl + xl, o + 30 + nl + xl + size);
    if (name.endsWith('.xml') && !name.startsWith('META')) return (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    o += 30 + nl + xl + size;
  }
  throw new Error('no score in ' + file);
};

// Attacks of each written measure: "onset in quarters:midi".
function measures(xml, limit) {
  const doc = new dom.window.DOMParser().parseFromString(xml, 'application/xml'), out = [];
  const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }; let div = 1;
  for (const m of doc.querySelectorAll('part > measure')) {
    let pos = 0, last = 0; const set = new Set();
    for (const e of m.children) {
      const d = Number(e.querySelector(':scope > duration')?.textContent || 0);
      if (e.tagName === 'attributes' && e.querySelector('divisions')) div = Number(e.querySelector('divisions').textContent);
      else if (e.tagName === 'backup') pos -= d / div;
      else if (e.tagName === 'forward') pos += d / div;
      else if (e.tagName === 'note') {
        const chord = !!e.querySelector(':scope > chord'), onset = chord ? last : pos; if (!chord) { last = pos; pos += d / div; }
        const p = e.querySelector(':scope > pitch'); if (!p || e.querySelector(':scope > grace') || [...e.querySelectorAll(':scope > tie')].some(t => t.getAttribute('type') === 'stop')) continue;
        set.add(`${onset.toFixed(3)}:${12 * (Number(p.querySelector('octave').textContent) + 1) + STEP[p.querySelector('step').textContent] + Math.round(Number(p.querySelector('alter')?.textContent || 0))}`);
      }
    }
    out.push(set); if (limit && out.length >= limit) break;
  }
  return out;
}
// Share of the source's attacks read with the right pitch and time. Measures are matched in order,
// allowing for a measure missed or split (a barline not seen or seen twice).
function recall(truth, got) {
  const hits = (a, b) => { let n = 0; for (const k of a) if (b.has(k)) n++; return n; };
  const T = truth.length, G = got.length, best = Array.from({ length: T + 1 }, () => new Array(G + 1).fill(0));
  for (let i = 1; i <= T; i++) for (let j = 1; j <= G; j++) best[i][j] = Math.max(best[i - 1][j], best[i][j - 1], best[i - 1][j - 1] + hits(truth[i - 1], got[j - 1]));
  return best[T][G] / truth.reduce((n, t) => n + t.size, 0);
}

test('a scanned page (tilted, blurred, noisy) is read with its clefs, key, time and most notes', async () => {
  const r = await S.convert({ pixels: [pixels('tests/fixtures/scan/reader-features-scan.jpg')] });
  assert.equal(r.scanned, true);
  const parsed = E.parse(r.xml); // passes the practice engine's checks
  assert.ok(parsed.notes.length > 40);
  assert.match(r.xml, /<key><fifths>2<\/fifths>/);
  assert.match(r.xml, /<time><beats>\d<\/beats><beat-type>4<\/beat-type><\/time>/); // (the bold 3 of this engraving is still read as a 4)
  assert.deepEqual([...r.xml.matchAll(/<clef number="(\d)"><sign>([CFG])/g)].slice(0, 2).map(m => m[1] + m[2]), ['1G', '2F']);
  const truth = measures(fs.readFileSync('tests/fixtures/pdf/reader-features.musicxml', 'utf8'), 10), got = measures(r.xml);
  assert.ok(recall(truth, got) >= 0.6, `read right: ${recall(truth, got).toFixed(2)}`);
});

test('a photo of a printed page (perspective, uneven light) reads most notes in time', async () => {
  const r = await S.convert({ pixels: [pixels('tests/fixtures/scan/minuet-photo.jpg')] });
  E.parse(r.xml);
  assert.match(r.xml, /<key><fifths>-2<\/fifths>/);
  const truth = measures(mxl('site/scores/bach-minuet-in-g-minor-bwv-842/original.mxl'), 18), got = measures(r.xml);
  assert.equal(got.length, truth.length);
  assert.ok(recall(truth, got) >= 0.8, `read right: ${recall(truth, got).toFixed(2)}`);
  assert.ok(r.warnings.some(w => /Read from a picture/.test(w)));
});

test('the staves of a tilted page are found straight, with their staff space', () => {
  const px = pixels('tests/fixtures/scan/reader-features-scan.jpg'), P = S.preparePage(px.g, px.w, px.h);
  assert.equal(P.staves.length, 4);
  assert.ok(Math.abs(P.d - 18) < 3, String(P.d));
  for (const st of P.staves) assert.ok(Math.abs(st.lineAt(0, st.x0 + 50) - st.lineAt(0, st.x1 - 50)) < 0.5 * P.d, 'staff lines run level after straightening');
});

test('a picture without music, and an empty set of pictures, are refused plainly', async () => {
  const w = 800, h = 1000, g = new Uint8Array(w * h).fill(235);
  for (let y = 100; y < 900; y += 40) for (let x = 100; x < 700; x++) if ((x >> 4) % 3) g[y * w + x] = 40; // lines of "text"
  await assert.rejects(S.convert({ pixels: [{ g, w, h }] }), e => e.code === 'none' && /No staves of music/.test(e.message));
  await assert.rejects(S.convert({ pixels: [] }), e => e.code === 'none');
});

test('the symbol network is built in and classifies a sharp from its shape', () => {
  assert.ok(ctx.PianoScanModel.classes.includes('sharp'));
  // a sharp drawn on a 3 × 1 staff-space canvas: two uprights and two slanted bars
  const sp = 20, w = 30, h = 70, img = new Uint8Array(w * h);
  for (let y = 5; y < 65; y++) { img[y * w + 9] = img[y * w + 10] = img[y * w + 19] = img[y * w + 20] = 1; }
  for (let x = 2; x < 28; x++) for (let t = 0; t < 5; t++) { img[(24 - Math.round(x / 4) + t) * w + x] = 1; img[(44 - Math.round(x / 4) + t) * w + x] = 1; }
  const { label, comps } = S.components(img, w, h), c = comps.sort((a, b) => b.n - a.n)[0];
  const staff = { x0: 0, x1: w - 1, lineAt: k => -5 + k * sp };
  assert.equal(S.classify(S.shapeFeatures(label, c, w, sp, [staff])).cls, 'sharp');
});
