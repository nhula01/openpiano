// Method-book ladders: provenance and curriculum guidance for every piece in site/piano-method.js.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');

function load() {
  const ctx = { window: { PianoRepertoire: {} } };
  for (const name of ['piano-method', 'piano-curriculum']) vm.runInNewContext(fs.readFileSync('site/' + name + '.js', 'utf8'), ctx);
  return ctx.window;
}

test('every method-book piece keeps its source, licence and attribution with the score', () => {
  const w = load(), sources = JSON.parse(fs.readFileSync('scripts/piano-method-sources.json', 'utf8'));
  assert.deepEqual(Object.keys(w.PianoRepertoire).sort(), Object.keys(sources).sort());
  for (const [id, meta] of Object.entries(w.PianoRepertoire)) {
    const dir = 'site/scores/' + id, readme = fs.readFileSync(dir + '/README.md', 'utf8');
    assert.ok(fs.existsSync(dir + '/original.ly') && fs.existsSync(dir + '/original.pdf'), id + ' bundles its source');
    assert.match(readme, /License: (Public Domain|Creative Commons Attribution)/, id + ' licence');
    assert.doesNotMatch(readme + meta.attribution, /NonCommercial/i, id + ' has no NonCommercial licence');
    if (sources[id].startsWith('Engraved/')) {
      // engraved from a public-domain scan: the IMSLP file is named and the engraving is CC0
      assert.match(meta.sourceURL, /^https:\/\/imslp\.org\/wiki\/Special:ImagefromIndex\/\d+$/, id);
      assert.match(readme, /Scan: https:\/\/imslp\.org/, id);
      const ly = fs.readFileSync('scripts/engravings/' + id + '.ly', 'utf8');
      assert.equal(ly, fs.readFileSync(dir + '/original.ly', 'utf8'), id + ' bundles the engraving unchanged');
      assert.match(ly, /CC0 1\.0/);
    } else {
      assert.match(meta.sourceURL, /^https:\/\/www\.mutopiaproject\.org\/cgibin\/piece-info\.cgi\?id=\d+$/, id);
    }
  }
});

test('every method-book piece has a level with evidence, a place in its set and its own guidance', () => {
  const w = load(), over = JSON.parse(fs.readFileSync('scripts/level-overrides.json', 'utf8'));
  const method = JSON.parse(fs.readFileSync('scripts/piano-method-pieces.json', 'utf8'));
  const pieces = w.PianoCurriculum.pieces.filter(p => w.PianoRepertoire[p.id]);
  assert.equal(pieces.length, Object.keys(w.PianoRepertoire).length);
  for (const p of pieces) {
    assert.ok(over.levels[p.id], p.id + ' level override');
    assert.equal(p.level, over.levels[p.id][0]);
    assert.ok(p.levelReason && p.levelReason.length > 10, p.id + ' evidence');
    assert.ok(Number.isInteger(p.order) && p.set, p.id + ' order and set');
    assert.equal(Math.floor(p.order / 100), p.level, p.id + ' order belongs to its level');
  }
  // guidance is written per piece, not from a template
  for (const field of ['skill', 'pattern', 'exercise', 'check']) assert.equal(new Set(pieces.map(p => p[field])).size, pieces.length, field + ' is unique per piece');
  // a set keeps its printed order within a level
  const num = id => Number((id.match(/(?:no-|anh-|bwv-)(\d+)/) || [])[1]);
  for (const set of new Set(pieces.map(p => p.set))) {
    for (let level = 0; level <= 7; level++) {
      const list = pieces.filter(p => p.set === set && p.level === level && !p.id.startsWith('bach-')).sort((a, b) => a.order - b.order);
      for (let i = 1; i < list.length; i++) if (list[i].id.split('-no-')[0] === list[i - 1].id.split('-no-')[0]) assert.ok(num(list[i].id) > num(list[i - 1].id), set + ' order at ' + list[i].id);
    }
  }
  assert.ok(method.pieces);
});
