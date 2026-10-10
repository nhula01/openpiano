// Read degraded pages with the picture reader and score them against their sources.
//   node scripts/scan-reader/evaluate.cjs <meta.json> <pgm dir> <kind,kind…> [N]
// Pages are <pgm dir>/<name>__<kind>.pgm; prints the mean note F1 (pitch and onset, measures aligned).
const fs = require('fs'), path = require('path'), cp = require('child_process');
global.window = {}; global.atob = s => Buffer.from(s, 'base64').toString('binary');
require(path.join(__dirname, '../../site/piano-pdf-reader.js')); require(path.join(__dirname, '../../site/piano-scan-reader.js'));
const { readPGM } = require('./pgm.cjs'), S = window.PianoScanReader, R = window.PianoPdfReader;
const [metaFile, dir, kinds = 'clean', N = '1000'] = process.argv.slice(2), meta = JSON.parse(fs.readFileSync(metaFile)).slice(0, +N);
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'scan-eval-')), agg = {};
for (const m of meta) for (const kind of kinds.split(',')) {
  let f1 = 0;
  try {
    const px = readPGM(path.join(dir, `${m.name}__${kind}.pgm`)), P = S.preparePage(px.g, px.w, px.h), page = P && S.readPage(P);
    const score = page && R.recognize([page]);
    if (score) {
      fs.writeFileSync(path.join(tmp, 'p.xml'), R.toMusicXML(score, { warn() {} }));
      const r = JSON.parse(cp.execFileSync('python3', [path.join(__dirname, 'score.py'), path.join(path.dirname(metaFile), '..', 'xml', m.id + '.xml'), path.join(tmp, 'p.xml'), String(m.measures)]).toString())['pitch+onset'];
      f1 = r.recall + r.precision ? 2 * r.recall * r.precision / (r.recall + r.precision) : 0;
    }
  } catch (e) { console.error(m.name, kind, e.message); }
  (agg[kind] ||= []).push(f1); console.log(m.name, kind, f1.toFixed(3));
}
for (const [k, a] of Object.entries(agg)) console.log(k, 'mean F1', (a.reduce((x, y) => x + y, 0) / a.length).toFixed(3));
