// The PDF reader (site/piano-pdf-reader.js) against PDFs engraved by MuseScore 4.6 and LilyPond 2.25
// from one source score, tests/fixtures/pdf/reader-features.musicxml (key and time changes, a triplet,
// two voices in one hand, a whole-bar rest, a grace note, a start repeat with first and second
// endings, a tie over the barline, clef changes and printed fingering). Both PDFs must read back to
// exactly the notes the practice engine takes from the source itself.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), { JSDOM } = require('jsdom');
const dom = new JSDOM(''), ctx = { window: {}, DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer };
vm.runInNewContext(fs.readFileSync('site/piano-import-engine.js', 'utf8'), ctx);
const E = ctx.window.PianoImportEngine;
const reader = () => { const c = { window: {}, TextDecoder, Map, Set }; vm.runInNewContext(fs.readFileSync('site/piano-pdf-reader.js', 'utf8'), c); return c.window.PianoPdfReader; };
const pdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs');
const bytes = name => { const b = fs.readFileSync('tests/fixtures/pdf/' + name); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const read = async name => reader().convert(bytes(name), { pdfjs: await pdfjs(), documentOptions: { verbosity: 0 } });
const truth = () => E.parse(fs.readFileSync('tests/fixtures/pdf/reader-features.musicxml', 'utf8'));
const key = n => `${n.hand}:${n.midi}@${n.beat.toFixed(4)}+${n.duration.toFixed(4)}`;

for (const [engraver, file] of [['MuseScore', 'reader-features-musescore.pdf'], ['LilyPond', 'reader-features-lilypond.pdf']]) {
  test(`a ${engraver} PDF reads back to its source's notes, rhythm, hands, repeats and endings`, async () => {
    const r = await read(file), source = truth(), got = E.parse(r.xml);
    assert.deepEqual(got.notes.map(key), source.notes.map(key));
    assert.equal(got.writtenMeasures, 10);
    assert.equal(got.performedMeasures, 11);
    assert.equal(got.graceCount, source.graceCount);
    assert.equal(r.flagged.length, 0);
    assert.equal(r.warnings.length, 0);
    assert.deepEqual([...r.xml.matchAll(/<clef number="2"><sign>([CFG])/g)].map(m => m[1]), ['F', 'G', 'F']); // left-hand clef changes stay on the sheet
    assert.equal(r.title, 'Reader Test Piece');
    assert.equal(r.composer, 'OpenPiano tests');
  });
  test(`${engraver}: printed fingering is kept on the right notes and ending numbers are not taken for fingering`, async () => {
    const got = E.parse((await read(file)).xml), source = truth();
    assert.equal(got.sourceFingering, true);
    assert.deepEqual(got.records.map(n => n.fingerings.join('')), source.records.map(n => n.fingerings.join('')));
  });
}

test('the MusicXML written from a PDF engraves and unfolds like an imported file', async () => {
  const r = await read('reader-features-musescore.pdf');
  const c = { window: { PianoImportEngine: E }, DOMParser: dom.window.DOMParser, XMLSerializer: dom.window.XMLSerializer, document: dom.window.document, TextDecoder, TextEncoder, Blob, Response, DecompressionStream };
  vm.runInNewContext(fs.readFileSync('site/piano-score-import.js', 'utf8'), c);
  const prepared = c.window.PianoScoreImport.prepare(r.xml);
  assert.equal(prepared.unfolded, true);
  assert.equal(new dom.window.DOMParser().parseFromString(prepared.xml, 'application/xml').querySelectorAll('measure').length, 11);
  assert.match(r.xml, /<ending number="1" type="start"\/>/);
  assert.match(r.xml, /<repeat direction="backward"\/>/);
  assert.ok(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(r.xml));
});

// Cases found in review: each PDF must play exactly like its source.
for (const [what, pdf, source] of [['an 8vb line (the same "8" as 8va, below the staff)', 'ottava-musescore.pdf', 'ottava.musicxml'],
  ['a combined "1., 2." ending followed by a third ending', 'endings-musescore.pdf', 'endings.musicxml']]) {
  test(`${what} reads back to its source`, async () => {
    const got = E.parse((await read(pdf)).xml), want = E.parse(fs.readFileSync('tests/fixtures/pdf/' + source, 'utf8'));
    assert.deepEqual(got.notes.map(key), want.notes.map(key));
  });
}

test('a sharp tied over the barline keeps its sharp and sounds once (tied-sharp.ly, LilyPond)', async () => {
  const got = E.parse((await read('tied-sharp-lilypond.pdf')).xml), right = got.notes.filter(n => n.hand === 'right');
  assert.equal(JSON.stringify(right.map(n => [n.midi, n.beat, n.duration])), JSON.stringify([[72, 0, 1], [74, 1, 1], [76, 2, 1], [78, 3, 3], [79, 6, 2], [81, 8, 4]]));
});

test('a scanned page is reported as a picture of music, not guessed at', async () => {
  await assert.rejects(read('scanned-page.pdf'), e => e.code === 'scan' && /scan or photo/.test(e.message));
});

test('a PDF without music notation, and a file that is not a PDF, are refused plainly', async () => {
  await assert.rejects(read('text-only.pdf'), e => e.code === 'none' && /No music notation/.test(e.message));
  const R = reader(), lib = await pdfjs();
  await assert.rejects(R.convert(new TextEncoder().encode('not a pdf').buffer, { pdfjs: lib, documentOptions: { verbosity: 0 } }), /could not be opened as a PDF/);
  await assert.rejects(R.convert(new ArrayBuffer(15_000_001), { pdfjs: lib }), /smaller than 15 MB/);
});

test('glyph names in embedded fonts (LilyPond) are found through the converted font', () => {
  const R = reader();
  assert.equal(R.symbolFromName('noteheads.s2', 'Emmentaler-20').k, 'head');
  assert.equal(R.symbolFromName('noteheads.s2', 'Emmentaler-20').v, 2);
  assert.equal(R.symbolFromName('fattened.three', 'Emmentaler-11').v, 3);
  assert.equal(R.symbolFromName('uniE0A3', 'Bravura').v, 1);
  assert.equal(R.symbolFromName('three', 'Times-Roman'), null);
  assert.equal(R.sfntGlyphNames(new Uint8Array(4)), null);
});
