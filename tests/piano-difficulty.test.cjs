// Difficulty score (scripts/difficulty.py → scripts/difficulty.json) and the order it gives inside each
// level (scripts/apply-learning-path.py → site/piano-curriculum.js). A piece more than one level away
// from the level its score data predicts must say why (levelReason), so a new import that lands at the
// wrong level fails here.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');

const ctx = { window: { PianoRepertoire: {} } };
for (const name of ['repertoire', 'library', 'additions', 'famous', 'pdmx', 'collection', 'studies', 'curriculum'])
  vm.runInNewContext(fs.readFileSync(`site/piano-${name}.js`, 'utf8'), ctx);
// copied into this realm, so deepEqual compares plain arrays
const R = ctx.window.PianoRepertoire, C = JSON.parse(JSON.stringify(ctx.window.PianoCurriculum));
const D = JSON.parse(fs.readFileSync('scripts/difficulty.json', 'utf8'));
const MODEL_REASON = 'difficulty model';
const playable = C.pieces.filter(p => !p.reference && R[p.id]);
const levels = [...new Set(C.pieces.map(p => p.level))].sort((a, b) => a - b);

test('every playable curriculum piece has a difficulty score (rerun scripts/difficulty.py after an import)', () => {
  const missing = playable.filter(p => !D[p.id]).map(p => p.id);
  assert.deepEqual(missing, [], 'run: python3 scripts/difficulty.py && python3 scripts/apply-learning-path.py');
  for (const p of playable) {
    const d = D[p.id];
    assert.ok(d.score >= 0 && d.score <= 100, p.id);
    assert.ok(Number.isInteger(d.predictedLevel) && d.predictedLevel >= 0 && d.predictedLevel <= 7, p.id);
    assert.equal(p.difficulty, Math.round(d.score), `${p.id}: curriculum difficulty is stale, run scripts/apply-learning-path.py`);
  }
  // the model's honesty line is kept with the cache
  assert.ok(D._meta.accuracy.some(line => /leave-one-out/.test(line)));
});

test('every piece carries an explicit order, and the curriculum lists pieces by level, then order', () => {
  for (const level of levels) {
    const list = C.pieces.filter(p => p.level === level);
    assert.deepEqual(list.map(p => p.order), list.map((_, i) => i + 1), `level ${level}`);
  }
  const keys = C.pieces.map(p => [p.level, p.order]);
  const sorted = [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.deepEqual(keys, sorted);
  // First keys keep their authored sequence at the start of Level 0
  assert.deepEqual(C.pieces.filter(p => p.level === 0 && p.original).map(p => p.id),
    Array.from({ length: 20 }, (_, i) => 'first-' + String(i + 1).padStart(2, '0')));
});

test('inside a level, pieces go from easiest to hardest; teaching collections keep their printed sequence', () => {
  for (const level of levels) {
    const list = C.pieces.filter(p => p.level === level && !p.original && D[p.id]);
    // outside the teaching collections, difficulty never goes down
    const loose = list.filter(p => !D[p.id].set).map(p => D[p.id].score);
    for (let i = 1; i < loose.length; i++) assert.ok(loose[i] >= loose[i - 1], `level ${level}: ${loose[i - 1]} then ${loose[i]}`);
    // each collection's pieces in number order
    const sets = {};
    for (const p of list) if (D[p.id].set) (sets[D[p.id].set] ||= []).push(D[p.id].setNo);
    for (const [name, numbers] of Object.entries(sets)) assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b), `${name} at level ${level}`);
  }
});

test('no piece sits two or more levels from its predicted level without a reason (see scripts/difficulty-suspects.md)', () => {
  const suspects = playable.filter(p => D[p.id] && Math.abs(D[p.id].predictedLevel - p.level) >= 2)
    .filter(p => !p.levelReason || p.levelReason.startsWith(MODEL_REASON))
    .map(p => `${p.id}: level ${p.level}, predicted ${D[p.id].predictedLevel} (${D[p.id].drivers.join(', ')})`);
  // a levelReason written by the model itself ("difficulty model …") does not excuse a piece
  assert.deepEqual(suspects, [], 'move it in scripts/level-overrides.json or give the evidence or musical reason');
});

