// Practice progress (site/piano-progress.js): raw attempts, derived stages, Fix bar N, the tempo
// staircase and the cold review queue. See docs/piano-learning-path.md.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { setup } = require('./practice-harness.cjs');
const HOUR = 36e5, DAY = 864e5, T0 = Date.parse('2026-10-01T09:00:00Z');
// values from the vm context have that realm's prototypes; compare them as plain data
const plain = v => v === undefined ? v : JSON.parse(JSON.stringify(v));

// A plain context: localStorage, the library manifests and the progress module (optionally the path).
function progress({ seed = {}, path = false, extra = {} } = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  const w = { PianoRepertoire: { entertainer: {} }, addEventListener() {}, dispatchEvent() {}, ...extra };
  const c = { window: w, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) }, Event: class { constructor(t) { this.type = t; } }, console };
  for (const name of ['piano-library', 'piano-additions', 'piano-famous', 'piano-pdmx', 'piano-studies', 'piano-curriculum', 'piano-tempos', 'piano-progress', ...(path ? ['piano-path'] : [])])
    vm.runInNewContext(fs.readFileSync('site/' + name + '.js', 'utf8'), c);
  return { P: w.PianoProgress, Path: w.PianoPath, w, c, store, json: k => JSON.parse(store.get(k) || '{}') };
}
// first-01 is marked 88 BPM: Secure needs 53 BPM, Fluent 75, Performance 88.
const play = (P, t, o = {}) => P.record({ score: 'first-01', kind: 'play', accuracy: 95, timing: 90, bpm: 88, hands: 'BH', complete: true, time: t, ...o });

test('every run is kept as one raw attempt, keyed by time, with cold plays detected', () => {
  const { P, json } = progress();
  assert.equal(P.markedTempo('first-01'), 88, 'the marked tempo comes from the score');
  P.record({ score: 'first-01', kind: 'wait', accuracy: 80, bpm: 60, hands: 'RH', loop: true, range: { start: 0, end: 8 }, complete: true, time: T0, barMistakes: { 1: 2 }, total: 10, input: 'MIDI' });
  P.record({ score: 'first-01', kind: 'play', accuracy: 92, timing: 81, early: 2, late: 1, bpm: 60, hands: 'BH', complete: true, time: T0 + HOUR });
  P.record({ score: 'first-01', kind: 'play', accuracy: 93, timing: 82, bpm: 60, hands: 'BH', complete: true, time: T0 + 14 * HOUR });
  const list = P.attempts('first-01');
  assert.equal(list.length, 3);
  assert.deepEqual(Object.keys(json('openpiano-progress-v1').pieces['first-01'].a), [T0, T0 + HOUR, T0 + 14 * HOUR].map(t => t.toString(36)));
  const [loop, warm, cold] = list;
  assert.deepEqual(plain([loop.k, loop.h, loop.r, loop.c ?? null, loop.m, loop.n, loop.i, loop.tb]), ['w', 'RH', [0, 8], null, { 1: 2 }, 10, 'MIDI', 88]);
  assert.equal(warm.c, 1); assert.equal(warm.cold, undefined, 'one hour after the loop is not cold');
  assert.deepEqual([warm.tm, warm.e, warm.l, warm.b], [81, 2, 1, 60]);
  assert.equal(cold.cold, 1, 'the first play after 12 hours is cold');
  assert.equal(P.record({ score: 'first-01', kind: 'listen', accuracy: 0, time: T0 + 15 * HOUR }), null, 'listening is not an attempt');
});

test('the player records this attempt’s mistakes per bar, not the session total', async () => {
  const ui = setup({ progress: true });
  ui.api.setTempo(60); ui.api.loopBars(1, 1); ui.api.setInput('MIDI'); await ui.api.start('wait');
  const bar2 = [67, 65, 64, 62];
  ui.note(50); ui.note(50, false); for (const n of bar2) { ui.note(n); ui.note(n, false); }
  for (const n of bar2) { ui.note(n); ui.note(n, false); }
  const [first, second] = ui.api.results;
  assert.deepEqual({ ...first.barMistakes }, { 1: 1 });
  assert.deepEqual({ ...second.barMistakes }, {}, 'a clean second loop has no mistakes of its own');
  assert.deepEqual(plain(ui.api.mistakes), { 1: 1 }, 'the heat map still counts the whole session');
  const stored = Object.values(JSON.parse(ui.storage.get('openpiano-progress-v1')).pieces.ode.a);
  assert.equal(stored.length, 2); assert.deepEqual({ ...stored[0].m }, { 1: 1 }); assert.equal(stored[1].m, undefined);
  assert.equal(first.progress.after, 'learning');
});

test('older passes, part steps and the practice log become legacy attempts once; a whole-piece pass stays learned', () => {
  const seed = {
    'journey-note-passes-v1': { 'first-02:all:full': { accuracy: 92, date: '2026-09-01T10:00:00Z', input: 'MIDI' }, 'first-03:all:full:timed': { accuracy: 85, timing: 70, date: '2026-09-02T10:00:00Z' }, 'first-04:rightHand:full': { accuracy: 99, date: '2026-09-03T10:00:00Z' } },
    'openpiano-stage-parts-v1': { 'first-05': { '0-16': ['R', 'L'] } },
    'openpiano-practice-log-v1': { days: {}, pieces: { 'first-06': { seconds: 300, attempts: 4, best: 70, last: Date.parse('2026-09-05T10:00:00Z') } } },
  };
  const { P, json, w, c } = progress({ seed });
  assert.equal(P.stage('first-02'), 'secure', 'a legacy whole-piece pass of 90% is grandfathered as Secure');
  assert.equal(P.learnedAt('first-02'), Date.parse('2026-09-01T10:00:00Z'));
  assert.equal(P.stage('first-03'), 'learning', 'an 85% pass is not');
  assert.equal(P.stage('first-04'), 'learning', 'a one-hand pass is not');
  assert.equal(P.stage('first-06'), 'learning', 'a piece in the practice log has been started');
  const parts = P.blocks('first-05', [{ start: 0, end: 16 }, { start: 16, end: 32 }]);
  assert.deepEqual([parts[0].steps.R, parts[0].steps.L, parts[0].steps.B], [3, 3, 0]);
  assert.equal(parts[1].steps.R, 0);
  const s = json('openpiano-progress-v1');
  assert.ok(s.migrated);
  assert.ok(Object.values(s.pieces['first-02'].a).every(a => a.legacy));
  // running again changes nothing
  const before = JSON.stringify(s);
  assert.equal(w.PianoProgress.migrate(), false);
  vm.runInNewContext(fs.readFileSync('site/piano-progress.js', 'utf8'), c);
  assert.equal(JSON.stringify(json('openpiano-progress-v1')), before);
});

test('stages: new → learning → secure → fluent → performance, each with its own thresholds', () => {
  const { P, c, store } = progress();
  c.document = { body: { dataset: { shell: 'stage' } } };  // the practice stage, where the view is a choice
  const setView = v => store.set('openpiano-stage-view', v);
  assert.equal(P.stage('first-01'), 'new');
  assert.match(P.detail('first-01').next, /part by part in Wait mode/);
  P.record({ score: 'first-01', kind: 'wait', accuracy: 100, bpm: 60, hands: 'RH', loop: true, range: { start: 0, end: 16 }, time: T0 });
  assert.equal(P.stage('first-01'), 'learning');
  play(P, T0 + HOUR, { bpm: 50 });
  assert.equal(P.stage('first-01'), 'learning', 'too slow for Secure (needs 53 BPM)');
  play(P, T0 + 2 * HOUR, { bpm: 60, accuracy: 92, timing: 70 });
  assert.equal(P.stage('first-01'), 'learning', 'timing below 75%');
  assert.equal(P.detail('first-01').secure, 'Play the whole piece In time with both hands at 53 BPM or faster, with 90% right notes and 75% timing.');
  const r = play(P, T0 + 3 * HOUR, { bpm: 60, accuracy: 90, timing: 75 });
  assert.equal(r.before, 'learning'); assert.equal(r.after, 'secure'); assert.equal(r.promoted, true);
  assert.equal(P.learnedAt('first-01'), T0 + 3 * HOUR);
  assert.equal(P.detail('first-01').next, 'Play it cold (your first try of the day), In time with both hands in the Sheet view at 75 BPM or faster, with 93% right notes and 80% timing.');
  setView('notes');
  play(P, T0 + 27 * HOUR, { bpm: 80 });
  assert.equal(P.stage('first-01'), 'secure', 'cold, but with falling notes: not Fluent');
  setView('full');
  play(P, T0 + 28 * HOUR, { bpm: 80 });
  assert.equal(P.stage('first-01'), 'secure', 'from the sheet, but not cold');
  play(P, T0 + 41 * HOUR, { bpm: 80 });
  assert.equal(P.stage('first-01'), 'fluent');
  assert.match(P.detail('first-01').next, /^Play it cold .* at 88 BPM \(the marked tempo\), with 95% right notes and 85% timing\.$/);
  play(P, T0 + 42 * HOUR, { accuracy: 97 });
  assert.equal(P.stage('first-01'), 'fluent', 'Performance must be cold too');
  play(P, T0 + 100 * HOUR, { accuracy: 96, timing: 86, bpm: 86 });
  assert.equal(P.stage('first-01'), 'fluent', 'Performance needs the full marked tempo');
  play(P, T0 + 160 * HOUR, { accuracy: 96, timing: 86 });
  assert.equal(P.stage('first-01'), 'performance');
});

test('reviews: due a day after Secure, ×2.2 after a good cold play, halved after a weak one, reset and a stage down after a fail, at most 90 days', () => {
  const { P } = progress();
  play(P, T0, { bpm: 60 });                                 // Secure
  let d = P.derive('first-01');
  assert.equal(d.due, T0 + DAY); assert.equal(d.interval, 1);
  assert.equal(P.reviewsDue(T0 + 12 * HOUR).length, 0, 'not due yet');
  assert.equal(P.reviewsDue(T0 + DAY)[0].id, 'first-01');
  play(P, T0 + DAY, { bpm: 60 });                           // good review
  d = P.derive('first-01'); assert.equal(d.interval, 2.2); assert.equal(d.due, T0 + DAY + 2.2 * DAY);
  play(P, T0 + 2 * DAY, { bpm: 60 });                       // cold, but not due: no effect
  assert.equal(P.derive('first-01').interval, 2.2);
  const t3 = P.derive('first-01').due;
  play(P, t3, { kind: 'wait', timing: null, accuracy: 96 });  // weak: not In time
  d = P.derive('first-01'); assert.ok(Math.abs(d.interval - 1.1) < 1e-9); assert.equal(d.stage, 'secure');
  // reach Fluent, then fail a review: interval back to 1 day and one stage down
  play(P, d.due, { bpm: 80 });
  d = P.derive('first-01'); assert.equal(d.stage, 'fluent'); assert.ok(Math.abs(d.interval - 2.42) < 1e-9);
  play(P, d.due, { accuracy: 70 });
  d = P.derive('first-01'); assert.equal(d.stage, 'secure'); assert.equal(d.interval, 1);
  assert.equal(d.reviews.map(r => r.result).join(' '), 'good weak good fail');
  // a failed review never takes a piece below Secure
  play(P, d.due, { accuracy: 50 });
  assert.equal(P.stage('first-01'), 'secure');
  // the interval is capped at 90 days
  for (let i = 0; i < 12; i++) play(P, P.derive('first-01').due, { bpm: 60 });
  assert.equal(P.derive('first-01').interval, 90);
});

test('the review queue is most overdue first and skips a piece played in the last 12 hours', () => {
  const { P } = progress();
  play(P, T0, { bpm: 60 });
  P.record({ score: 'first-02', kind: 'play', accuracy: 95, timing: 90, bpm: 80, hands: 'BH', complete: true, time: T0 - 3 * DAY });
  P.record({ score: 'first-03', kind: 'play', accuracy: 95, timing: 90, bpm: 80, hands: 'BH', complete: true, time: T0 - 2 * DAY });
  const now = T0 + 5 * DAY;
  assert.deepEqual(plain(P.reviewsDue(now).map(r => r.id)), ['first-02', 'first-03', 'first-01']);
  assert.equal(P.reviewsDue(now)[0].overdueDays, 7);
  P.record({ score: 'first-03', kind: 'wait', accuracy: 60, bpm: 60, hands: 'RH', loop: true, range: { start: 0, end: 4 }, time: now - HOUR });
  assert.deepEqual(plain(P.reviewsDue(now).map(r => r.id)), ['first-02', 'first-01'], 'played an hour ago: it cannot be cold today');
});

test('the review multiplier adapts to the learner: 2.5 when 90% of reviews pass, 1.8 below 60%', () => {
  const run = good => {
    const { P } = progress();
    for (let i = 1; i <= 6; i++) P.record({ score: 'first-0' + i, kind: 'play', accuracy: 95, timing: 90, bpm: 80, hands: 'BH', complete: true, time: T0 });
    for (let i = 1; i <= 6; i++) P.record({ score: 'first-0' + i, kind: 'play', accuracy: good ? 95 : 70, timing: 90, bpm: 80, hands: 'BH', complete: true, time: T0 + DAY });
    return P;
  };
  const strong = run(true), weak = run(false);
  assert.equal(strong.reviewStats().multiplier, 2.5); assert.equal(strong.derive('first-01').interval, 2.5);
  assert.equal(weak.reviewStats().multiplier, 1.8); assert.equal(weak.reviewStats().share, 0);
  assert.equal(strong.summary(T0 + DAY).reviews.passed, 6);
});

test('the store keeps at most 60 attempts per piece but never the ones that set the stage or a review', () => {
  const { P } = progress();
  play(P, T0, { bpm: 60 });
  for (let i = 1; i <= 80; i++) P.record({ score: 'first-01', kind: 'wait', accuracy: 70, bpm: 60, hands: 'RH', loop: true, range: { start: 0, end: 4 }, time: T0 + i * 60e3 });
  const list = P.attempts('first-01');
  assert.equal(list.length, 60);
  assert.equal(list[0].t, T0, 'the Secure play is kept');
  assert.equal(P.stage('first-01'), 'secure');
});

test('Fix bar N loops the bar and the next beat 20% slower and rejoins after three clean passes in a row', async () => {
  const ui = setup({ progress: true });
  const fixes = []; ui.api.on('fix', f => fixes.push(f));
  ui.api.setTempo(60); ui.api.setInput('MIDI');
  await ui.api.fixBar(1);
  assert.deepEqual([ui.api.loop.start, ui.api.loop.end], [4, 9], 'bar 2 and the first beat of bar 3');
  assert.equal(ui.api.tempo, 48); assert.equal(ui.api.state, 'wait'); assert.deepEqual(plain(ui.api.fixing), { bar: 1, clean: 0 });
  const loopNotes = [67, 65, 64, 62, 60], pass = (wrong = false) => { if (wrong) { ui.note(50); ui.note(50, false); } for (const n of loopNotes) { ui.note(n); ui.note(n, false); } };
  pass(); pass(); assert.equal(ui.api.fixing.clean, 2);
  pass(true); assert.equal(ui.api.fixing.clean, 0, 'a mistake starts the count again');
  pass(); pass(); pass();
  assert.equal(ui.api.fixing, null);
  assert.equal(ui.api.tempo, 60, 'the previous tempo comes back');
  assert.equal(ui.api.loop, null, 'and the whole piece');
  assert.equal(ui.api.state, 'idle');
  assert.match(ui.feedback(), /Bar 2 is fixed: three clean passes in a row\. Back to the whole piece at 60 BPM\./);
  assert.deepEqual(plain(fixes.at(-1)), { bar: 1, clean: 3, done: true });
});

test('tempo staircase: +5% after a clean loop, hold at 85–95%, −10% after two loops below 85%, capped at the target', async () => {
  const ui = setup();
  ui.api.setTempo(80); ui.api.setSpeedTrainer({ on: true, target: 88 }); ui.api.loopBars(0, 0);
  await ui.button('Connect MIDI').onclick();
  const bar = [64, 64, 65, 67], loop = (wrong = 0) => { for (let i = 0; i < wrong; i++) { ui.note(50); ui.note(50, false); } for (const n of bar) { ui.note(n); ui.note(n, false); } };
  loop(); assert.equal(ui.api.tempo, 84, '100% → +5%');
  loop(); assert.equal(ui.api.tempo, 88, 'capped at the target');
  loop(); assert.equal(ui.api.tempo, 88);
  ui.api.setTempo(80);
  loop(1); assert.equal(ui.api.results.at(-1).accuracy, 80); assert.equal(ui.api.tempo, 80, 'one loop below 85%: hold');
  loop(1); assert.equal(ui.api.tempo, 72, 'two in a row: −10%');
  loop(1); assert.equal(ui.api.tempo, 72);
  ui.api.setTempo(31); loop(1); loop(1); assert.equal(ui.api.tempo, 30, 'never below 30 BPM');
});

test('the path: learned means Secure, skipping a piece moves on, and Today holds cold reviews first plus the reading and chords hooks', () => {
  const generated = { id: 'reading-gen-1', title: 'Generated reading 1', kind: 'reading' };
  const { P, Path, store, w } = progress({ path: true });
  P.record({ score: 'first-01', kind: 'wait', accuracy: 100, bpm: 60, hands: 'BH', complete: true, time: Date.now() - 5 * DAY });
  assert.equal(Path.learned('first-01'), null, 'a Wait-mode pass alone is not Secure');
  play(P, Date.now() - 4 * DAY, { bpm: 60 });
  assert.ok(Path.learned('first-01'));
  assert.equal(Path.upNext().id, 'first-02');
  Path.skip('first-02');
  assert.equal(Path.upNext().id, 'first-03', 'a skipped piece is passed over');
  assert.deepEqual(JSON.parse(store.get('my-journey-piano-pathway-v2')).skipped, ['first-02']);
  assert.equal(Path.levelState(0).skipped, 1);
  let plan = Path.today();
  assert.equal(plan.items[0].kind, 'review'); assert.equal(plan.items[0].id, 'first-01');
  assert.match(plan.items[0].note, /^First try of the day, no warm-up/);
  assert.ok(plan.items.some(i => i.kind === 'reading' && /^reading-1-/.test(i.id)), 'the built reading pieces without the generator');
  w.PianoReadingGen = { next: level => (level === undefined ? generated : null) }; // the generator uses its own reading level
  w.PianoChords = { todayItem: () => ({ kind: 'chords', title: 'C, F and G', note: 'Play the chords', label: 'Open', action() {} }) };
  plan = Path.today();
  assert.ok(plan.items.some(i => i.kind === 'reading' && i.id === 'reading-gen-1'), 'the generator picks the reading piece');
  assert.ok(!plan.items.some(i => i.kind === 'chords'), 'chords only on the chords route');
  store.set('my-journey-piano-pathway-v2', JSON.stringify({ ...JSON.parse(store.get('my-journey-piano-pathway-v2')), route: 'chords' }));
  assert.equal(Path.today().items.at(-1).label, 'Open');
  assert.equal(typeof Path.setStartLevel, 'function');
});

test('Your practice: measured numbers and a weekly goal of practice days', () => {
  const now = Date.parse('2026-10-08T12:00:00'); // a Thursday
  const { P } = progress({ seed: { 'openpiano-practice-log-v1': { days: { '2026-10-05': 600, '2026-10-06': 30, '2026-10-08': 1200, '2026-10-04': 900 }, pieces: {} } } });
  play(P, now - 3 * DAY, { bpm: 60, timing: 80 });
  play(P, now - DAY, { bpm: 60, timing: 90 });
  P.record({ score: 'reading-2-3', kind: 'play', accuracy: 92, timing: 70, bpm: 60, hands: 'BH', complete: true, time: now - 2 * DAY });
  const s = P.summary(now);
  assert.equal(s.learned, 1);
  assert.equal(s.readingLevel, 2);
  assert.equal(s.coldTiming, 80, 'median of 80, 90 and 70');
  assert.equal(s.minutesThisWeek, 31, 'Monday to today only: 1830 seconds');
  assert.equal(s.daysThisWeek, 2, 'days with at least a minute');
  assert.deepEqual(plain(s.week.map(d => d.practised)), [true, false, false, true, false, false, false]);
  assert.equal(s.goal, 4);
  P.setWeeklyGoal(5); assert.equal(P.summary(now).goal, 5);
});
