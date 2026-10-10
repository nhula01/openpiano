'use strict';
// Practice progress: every finished run is kept as a raw attempt, and everything else (the stage of
// a piece, the date it was learned, when its next cold review is due) is worked out from those
// attempts each time. See docs/piano-learning-path.md, "Stages, Fix bar and reviews".
//
// One store, `openpiano-progress-v1`, holding raw attempts only:
//   { pieces: { <id>: { a: { <time key>: attempt } } }, migrated: <time> }
// Attempts are keyed by the time they were played, so the account sync's generic merge unions two
// devices without duplicates, and derived state can never contradict itself after a sync.
//
// An attempt uses short keys to keep the store small:
//   t     time played (ms)                 k   'w' Wait or 'p' In time
//   a     accuracy: % right notes          tm  timing % (absent when there was no moving line)
//   e, l  early and late notes             b   tempo played (BPM)
//   tb    the score's marked tempo (BPM), when it is known
//   h     'LH' | 'RH' | 'BH'               r   [startBeat, endBeat] of a loop or section; absent for the whole piece
//   c     1: played from the start to the end, with no loop
//   cold  1: complete, and at least 12 hours after the previous attempt on this piece
//   v     view: 's' sheet, 'n' falling notes, 'b' both
//   i     input: 'MIDI' | 'keys' | 'microphone'
//   m     mistakes per bar in this attempt only: { <bar index>: count }
//   n     notes in the attempt
//   legacy, src   attempts converted once from the older stores ('pass', 'part' or 'log')
(() => {
const KEY = 'openpiano-progress-v1', PASS_KEY = 'journey-note-passes-v1', PARTS_KEY = 'openpiano-stage-parts-v1';
const LOG_KEY = 'openpiano-practice-log-v1', PATH_KEY = 'my-journey-piano-pathway-v2', VIEW_KEY = 'openpiano-stage-view';
const HOUR = 36e5, DAY = 864e5;
const COLD_GAP = 12 * HOUR;      // a play is cold when it is the first one for at least 12 hours
const KEEP = 60;                 // attempts kept per piece; stage steps and reviews are always kept
const DEFAULT_TEMPO = 80;        // used when a score has no marked tempo
const REVIEW_SLACK = 4 * HOUR;   // a cold play counts as the review from a few hours before it is due
const MAX_INTERVAL = 90;         // days between reviews, at most
const MIN_REVIEWS_TO_ADAPT = 5;  // reviews needed before the interval multiplier adapts to the learner

const STAGES = ['new', 'learning', 'secure', 'fluent', 'performance'];
const LABEL = { new: 'New', learning: 'Learning', secure: 'Secure', fluent: 'Fluent', performance: 'Performance' };
const MEANING = {
  new: 'Not started yet.',
  learning: 'Hands apart, then together, part by part.',
  secure: 'You can play it through in time.',
  fluent: 'You can play it cold from the sheet, near full tempo.',
  performance: 'Ready to play for others.',
};
// The thresholds of each stage (the spec in the learning-path pitch).
const LEARN = { notes: 95, passes: 3 };   // per part: right hand, left hand, then both, in Wait mode
const GOALS = {
  secure: { tempo: 0.6, notes: 90, timing: 75 },
  fluent: { tempo: 0.85, notes: 93, timing: 80, cold: true, sheet: true },
  performance: { tempo: 1, notes: 95, timing: 85, cold: true },
};
const rank = stage => STAGES.indexOf(stage);
const SECURE = rank('secure');

// ---------- Storage ----------
const readJSON = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
function parse(raw) { let s = {}; try { s = JSON.parse(raw) || {}; } catch {} s.pieces = s.pieces || {}; return s; }
function load() { let raw = null; try { raw = localStorage.getItem(KEY); } catch {} return parse(raw); }
function save(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
  try { window.dispatchEvent(new Event('piano-progress-changed')); } catch {}
}
// Derived results are cached against the stored text, so a write from anywhere (another tab, the
// account sync) is picked up on the next read without any invalidation.
let cache = { raw: undefined };
function fresh() {
  let raw = null; try { raw = localStorage.getItem(KEY); } catch {}
  if (raw !== cache.raw) cache = { raw, store: parse(raw), lists: new Map(), derived: new Map(), stats: null };
  return cache;
}
function toList(map) {
  return Object.entries(map || {}).map(([key, a]) => ({ ...a, key })).sort((x, y) => (x.t || 0) - (y.t || 0) || (x.key < y.key ? -1 : 1));
}
function attempts(id) {
  const c = fresh();
  if (!c.lists.has(id)) c.lists.set(id, toList(c.store.pieces[id]?.a));
  return c.lists.get(id);
}

// ---------- Tempo ----------
// The marked tempo in quarter notes per minute: the score's own (First keys pieces), else the map
// generated from the library sources (site/piano-tempos.js), else unknown.
function markedTempo(id) {
  const bpm = window.PianoRepertoire?.[id]?.tempo || window.PianoTempos?.[id];
  return bpm ? Math.max(30, Math.min(200, Math.round(bpm))) : null;
}
const targetTempo = id => markedTempo(id) || DEFAULT_TEMPO;
const needBpm = (goal, target) => Math.round(goal.tempo * target);

// ---------- Stages ----------
function meets(a, goal, id) {
  if (a.k !== 'p' || !a.c || a.h !== 'BH') return false;
  if (!(a.a >= goal.notes) || !(a.tm >= goal.timing)) return false;
  if (!(a.b >= needBpm(goal, a.tb || targetTempo(id)))) return false;
  return (!goal.cold || !!a.cold) && (!goal.sheet || a.v === 's');
}
// A whole-piece, both-hands pass of 90% or better from before stages existed counts as Secure.
const grandfathered = a => !!a.legacy && !!a.c && a.h === 'BH' && a.a >= 90;
const reachesSecure = (a, id) => meets(a, GOALS.secure, id) || grandfathered(a);
function outcome(a, id) { return meets(a, GOALS.secure, id) ? 'good' : a.a >= 80 ? 'weak' : 'fail'; }

// Replays a piece's attempts in order. Stages go up one step per qualifying attempt. Once Secure,
// the first review is due a day later; a cold whole-piece play when a review is due is the review:
// good (meets Secure) multiplies the interval, weak (80% notes or more) halves it, a fail resets it
// to a day and drops a Fluent or Performance piece one stage. Never below Secure once reached.
function derive(id, list, multiplier) {
  const out = { id, stage: list.length ? 'learning' : 'new', learnedAt: null, interval: 0, due: null, last: list.length ? list[list.length - 1].t || 0 : null, reviews: [], keep: new Set() };
  for (const a of list) {
    const at = rank(out.stage);
    if (at >= SECURE && out.due != null && a.c && a.cold && a.t >= out.due - REVIEW_SLACK) {
      const result = outcome(a, id);
      out.reviews.push({ t: a.t, result });
      out.keep.add(a.key);
      if (result === 'good') out.interval = Math.min(MAX_INTERVAL, out.interval * multiplier);
      else if (result === 'weak') out.interval = Math.max(1, out.interval / 2);
      else { out.interval = 1; out.stage = STAGES[Math.max(SECURE, at - 1)]; }
      out.due = a.t + out.interval * DAY;
      if (result === 'fail') continue;
    }
    const now = rank(out.stage);
    if (now < SECURE && reachesSecure(a, id)) { out.stage = 'secure'; out.learnedAt = a.t; out.interval = 1; out.due = a.t + DAY; out.keep.add(a.key); }
    else if (now === SECURE && meets(a, GOALS.fluent, id)) { out.stage = 'fluent'; out.keep.add(a.key); }
    else if (now === SECURE + 1 && meets(a, GOALS.performance, id)) { out.stage = 'performance'; out.keep.add(a.key); }
  }
  return out;
}
// How often this learner's cold reviews pass, and the interval multiplier that follows from it:
// 2.2 by default, 2.5 when at least 90% pass, 1.8 when fewer than 60% do (after 5 reviews).
function reviewStats() {
  const c = fresh();
  if (c.stats) return c.stats;
  let passed = 0, total = 0;
  for (const id of Object.keys(c.store.pieces)) for (const r of derive(id, attempts(id), 2.2).reviews) { total++; if (r.result === 'good') passed++; }
  const share = total ? passed / total : null;
  const multiplier = total >= MIN_REVIEWS_TO_ADAPT ? (share >= 0.9 ? 2.5 : share < 0.6 ? 1.8 : 2.2) : 2.2;
  return (c.stats = { passed, total, share, multiplier });
}
function get(id) {
  const c = fresh();
  if (!c.derived.has(id)) c.derived.set(id, derive(id, attempts(id), reviewStats().multiplier));
  return c.derived.get(id);
}
const stage = id => get(id).stage;
const learnedAt = id => get(id).learnedAt;
const started = id => attempts(id).length > 0;

// ---------- Parts (learning blocks) ----------
// The score's practice blocks (`block-*` sections), or even chunks of 4, 8 or 16 bars. Takes a
// player (meter, barCount, sections) or a repertoire entry (beatsPerMeasure, totalBeats, sections).
function parts(score) {
  if (!score) return [];
  const meter = score.meter || score.beatsPerMeasure || 4;
  const blocks = (score.sections || []).filter(s => /^block-/.test(s.id));
  if (blocks.length > 1) return blocks.map(b => ({ start: b.start, end: b.end }));
  const total = score.totalBeats ?? (score.notes || []).reduce((m, n) => Math.max(m, n.beat + n.duration), 0);
  const bars = score.barCount || Math.ceil(total / meter);
  if (!bars) return [];
  const size = bars <= 24 ? 4 : bars <= 64 ? 8 : 16, out = [];
  for (let b = 0; b < bars; b += size) out.push({ start: b * meter, end: Math.min(bars, b + size) * meter });
  return out;
}
const hasHands = score => score?.handsAvailable ?? (score?.notes ? score.notes.some(n => n.hand) : true);
// Per part: clean passes (95% or better) with the right hand, left hand and both, and whether both
// hands have played it In time at 90%. A whole-piece attempt covers every part. Once a piece is
// Secure every part counts as learned.
function blocks(id, list, { hands = true } = {}) {
  const all = attempts(id), secure = rank(stage(id)) >= SECURE;
  return list.map(part => {
    const covers = a => a.r ? a.r[0] <= part.start + 1e-6 && a.r[1] >= part.end - 1e-6 : !!a.c;
    const clean = a => a.legacy ? a.src === 'part' || grandfathered(a) : a.a >= LEARN.notes;
    const count = h => Math.min(LEARN.passes, all.filter(a => covers(a) && a.h === h && clean(a)).reduce((n, a) => n + (a.legacy ? LEARN.passes : 1), 0));
    const steps = { R: hands ? count('RH') : LEARN.passes, L: hands ? count('LH') : LEARN.passes, B: count('BH'), T: all.some(a => covers(a) && a.k === 'p' && a.h === 'BH' && a.a >= 90) };
    if (secure) Object.assign(steps, { R: LEARN.passes, L: LEARN.passes, B: LEARN.passes, T: true });
    return { ...part, steps, learned: steps.R >= LEARN.passes && steps.L >= LEARN.passes && steps.B >= LEARN.passes };
  });
}

// ---------- Plain-words detail ----------
const HAND_STEPS = [['R', 'right hand'], ['L', 'left hand'], ['B', 'both hands']];
function goalText(goal, target, known) {
  const bpm = needBpm(goal, target);
  const tempo = goal.tempo === 1 ? `at ${bpm} BPM${known ? ' (the marked tempo)' : ''}` : `at ${bpm} BPM or faster`;
  const start = goal.cold ? 'Play it cold (your first try of the day), In time with both hands' : 'Play the whole piece In time with both hands';
  return `${start}${goal.sheet ? ' in the Sheet view' : ''} ${tempo}, with ${goal.notes}% right notes and ${goal.timing}% timing.`;
}
function dayText(ms, now) {
  const days = Math.round((startOfDay(ms) - startOfDay(now)) / DAY);
  if (days < 0) return days === -1 ? 'yesterday' : `${-days} days ago`;
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
}
function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
// What has been met and the exact next requirement. `score` (a loaded player or repertoire entry)
// lets the learning step name the part; without it the step is described in general.
function detail(id, score, now = Date.now()) {
  const d = get(id), target = targetTempo(id), known = !!markedTempo(id), met = [];
  const out = { id, stage: d.stage, label: LABEL[d.stage], meaning: MEANING[d.stage], met, next: '', due: d.due, interval: d.interval, learnedAt: d.learnedAt, target, targetKnown: known, secure: goalText(GOALS.secure, target, known) };
  if (d.learnedAt) met.push(`Secure since ${new Date(d.learnedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`);
  if (d.due != null) met.push(`Next cold play ${dayText(d.due, now)}.`);
  if (rank(d.stage) < SECURE) {
    const entry = score || window.PianoRepertoire?.[id], list = parts(entry);
    const state = list.length ? blocks(id, list, { hands: hasHands(entry) }) : [];
    const learnedParts = state.filter(p => p.learned).length;
    if (state.length) met.push(`${learnedParts} of ${state.length} parts learned hands apart and together.`);
    const meter = entry?.meter || entry?.beatsPerMeasure || 4, bar = beat => Math.floor(beat / meter + 1e-6) + 1;
    const todo = state.findIndex(p => !p.learned);
    if (todo >= 0) {
      const p = state[todo], [step, hand] = HAND_STEPS.find(([k]) => p.steps[k] < LEARN.passes);
      out.part = { index: todo, start: p.start, end: p.end, step };
      out.next = `Part ${todo + 1} (bars ${bar(p.start)}–${bar(p.end - 0.001)}), ${hand}: play it in Wait mode at ${LEARN.notes}% or better, three times (${p.steps[step]} of 3 so far).`;
    } else if (!state.length && d.stage === 'new') {
      out.next = `Learn it part by part in Wait mode: right hand, left hand, then both, at ${LEARN.notes}% three times each. Then: ${goalText(GOALS.secure, target, known).replace(/^P/, 'p')}`;
    } else out.next = goalText(GOALS.secure, target, known);
  } else if (d.stage === 'secure') out.next = goalText(GOALS.fluent, target, known);
  else if (d.stage === 'fluent') out.next = goalText(GOALS.performance, target, known);
  else out.next = 'Nothing more to reach. Play it when it comes back for a cold review to keep it.';
  return out;
}

// ---------- Recording ----------
function viewNow() {
  if (typeof document === 'undefined' || document.body?.dataset?.shell !== 'stage') return 's';  // the classic page shows only the sheet
  let v = 'split'; try { v = localStorage.getItem(VIEW_KEY) || 'split'; } catch {}
  return v === 'notes' ? 'n' : v === 'split' ? 'b' : 's';
}
function keyFor(map, t) { let key = t.toString(36), n = 1; while (map[key]) key = t.toString(36) + '.' + n++; return key; }
// Keeps at most KEEP attempts: drops the oldest loops and sections first, then the oldest whole-piece
// plays, but never an attempt that moved the stage, a review, or the first three clean passes of a part.
function trim(id, piece) {
  const list = toList(piece.a);
  if (list.length <= KEEP) return;
  const keep = derive(id, list, reviewStats().multiplier).keep, seen = new Map();
  for (const a of list) {
    if (!a.r || a.a < LEARN.notes) continue;
    const group = a.r.join('-') + a.h, n = seen.get(group) || 0;
    if (n < LEARN.passes) { keep.add(a.key); seen.set(group, n + 1); }
  }
  const drop = [...list.filter(a => !a.c && !keep.has(a.key)), ...list.filter(a => a.c && !keep.has(a.key))];
  for (let extra = list.length - KEEP, i = 0; extra > 0 && i < drop.length; extra--, i++) delete piece.a[drop[i].key];
}
// Called by the player for every finished run or loop (its result entry). Returns the attempt
// and the stage before and after it.
function record(entry) {
  const id = entry?.score;
  if (!id || entry.kind === 'listen') return null;
  const before = stage(id), store = load(), piece = store.pieces[id] || (store.pieces[id] = {});
  piece.a = piece.a || {};
  const t = entry.time || Date.now(), previous = Object.values(piece.a).reduce((m, a) => Math.max(m, a.t || 0), 0);
  const complete = entry.complete !== false && !entry.loop && !entry.range;
  const a = { t, k: entry.kind === 'play' ? 'p' : 'w', a: Math.round(entry.accuracy || 0), b: entry.bpm, h: entry.hands || 'BH' };
  if (entry.timing != null) a.tm = entry.timing;
  if (entry.early) a.e = entry.early;
  if (entry.late) a.l = entry.late;
  const marked = entry.target || markedTempo(id);
  if (marked) a.tb = marked;
  if (entry.range) a.r = [entry.range.start, entry.range.end];
  if (complete) a.c = 1;
  if (complete && (!previous || t - previous >= COLD_GAP)) a.cold = 1;
  a.v = viewNow();
  if (entry.input) a.i = entry.input;
  if (entry.barMistakes && Object.keys(entry.barMistakes).length) a.m = entry.barMistakes;
  if (entry.total) a.n = entry.total;
  piece.a[keyFor(piece.a, t)] = a;
  trim(id, piece);
  save(store);
  const after = stage(id);
  return { attempt: a, before, after, promoted: rank(after) > rank(before) };
}

// ---------- One-time migration from the older stores ----------
// Passes (`journey-note-passes-v1`), part steps (`openpiano-stage-parts-v1`) and the practice log's
// pieces become attempts flagged legacy. Keys are fixed, so running it on two devices merges cleanly.
const handsOfVoice = v => v === 'all' ? 'BH' : /^left|^bass/.test(v) ? 'LH' : 'RH';
function migrate() {
  const store = load();
  if (store.migrated) return false;
  const passes = readJSON(PASS_KEY), steps = readJSON(PARTS_KEY), log = readJSON(LOG_KEY), R = window.PianoRepertoire || {};
  const add = (id, key, a) => { const p = store.pieces[id] || (store.pieces[id] = {}); p.a = p.a || {}; if (!p.a[key]) p.a[key] = { ...a, legacy: 1 }; };
  const lastPlayed = id => log.pieces?.[id]?.last || 0;
  for (const [key, v] of Object.entries(passes)) {
    const [id, voice = 'all', part = 'full', timed] = key.split(':');
    if (!id || typeof v?.accuracy !== 'number') continue;
    const a = { t: Date.parse(v.date) || 0, k: timed === 'timed' ? 'p' : 'w', a: v.accuracy, h: handsOfVoice(voice), src: 'pass' };
    if (typeof v.timing === 'number') a.tm = v.timing;
    if (v.input) a.i = v.input;
    const section = part !== 'full' && R[id]?.sections?.find(s => s.id === part);
    if (part === 'full') a.c = 1; else if (section) a.r = [section.start, section.end];
    add(id, 'L:pass:' + key, a);
  }
  const STEP_HANDS = { R: 'RH', L: 'LH', B: 'BH', T: 'BH' };
  for (const [id, ranges] of Object.entries(steps)) for (const [range, got] of Object.entries(ranges || {})) {
    const [start, end] = range.split('-').map(Number);
    if (!Array.isArray(got) || !(end > start)) continue;
    for (const step of got) if (STEP_HANDS[step]) add(id, `L:part:${range}:${step}`, { t: lastPlayed(id), k: step === 'T' ? 'p' : 'w', a: 90, h: STEP_HANDS[step], r: [start, end], src: 'part' });
  }
  for (const [id, p] of Object.entries(log.pieces || {})) if (p?.attempts) add(id, 'L:log', { t: p.last || 0, k: 'w', a: p.best || 0, h: 'BH', src: 'log' });
  store.migrated = Date.now();
  save(store);
  return true;
}

// ---------- Reviews and the learner's own numbers ----------
// Pieces whose cold review is due, most overdue first. A piece played in the last 12 hours waits,
// because it cannot be played cold until then.
function reviewsDue(now = Date.now()) {
  return Object.keys(fresh().store.pieces).map(get)
    .filter(d => rank(d.stage) >= SECURE && d.due != null && d.due - REVIEW_SLACK <= now && (d.last == null || now - d.last >= COLD_GAP))
    .sort((x, y) => x.due - y.due)
    .map(d => ({ id: d.id, due: d.due, overdueDays: Math.max(0, Math.floor((now - d.due) / DAY)), interval: d.interval, stage: d.stage }));
}
function weeklyGoal() { const g = readJSON(PATH_KEY).weeklyGoal; return Number.isInteger(g) && g >= 1 && g <= 7 ? g : 4; }
function setWeeklyGoal(days) {
  const s = readJSON(PATH_KEY); s.weeklyGoal = Math.max(1, Math.min(7, Math.round(days) || 4));
  try { localStorage.setItem(PATH_KEY, JSON.stringify(s)); window.dispatchEvent(new Event('piano-progress-changed')); } catch {}
}
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// Monday to Sunday of the week holding `now`, as the practice log's day keys.
function weekDays(now) {
  const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return dayKey(x); });
}
function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}
// Measured numbers for the "Your practice" panel. Nothing leaves the device.
function summary(now = Date.now()) {
  const ids = Object.keys(fresh().store.pieces), R = window.PianoRepertoire || {}, stats = reviewStats();
  const cold = ids.flatMap(id => attempts(id).filter(a => a.cold && a.k === 'p' && typeof a.tm === 'number').map(a => a.tm));
  // reading level: the highest first-reading level with a piece played through at 90% or better
  let reading = null;
  for (const id of ids) if (R[id]?.kind === 'reading' && attempts(id).some(a => a.c && a.a >= 90)) reading = Math.max(reading ?? 0, R[id].studyLevel || 0);
  const days = readJSON(LOG_KEY).days || {}, week = weekDays(now), today = dayKey(new Date(now));
  return {
    learned: ids.filter(id => rank(stage(id)) >= SECURE).length,
    readingLevel: reading,
    coldTiming: median(cold), coldPlays: cold.length,
    reviews: { passed: stats.passed, total: stats.total, share: stats.share },
    multiplier: stats.multiplier,
    minutesThisWeek: Math.round(week.reduce((s, d) => s + (days[d] || 0), 0) / 60),
    week: week.map(day => ({ day, practised: (days[day] || 0) >= 60, today: day === today, future: day > today })),
    daysThisWeek: week.filter(day => (days[day] || 0) >= 60).length,
    goal: weeklyGoal(),
  };
}

window.PianoProgress = {
  KEY, STAGES, LABEL, MEANING, GOALS, LEARN,
  record, attempts, stage, detail, learnedAt, started, parts, blocks, reviewsDue, reviewStats, summary,
  markedTempo, targetTempo, weeklyGoal, setWeeklyGoal, migrate, derive: get, rank,
};
migrate();
})();
