'use strict';
// The learning path: where a learner is and what to do today, worked out from what the player has
// already recorded (attempts in piano-progress.js, the practice log and first-reading pieces seen),
// not from ticked boxes. See docs/piano-learning-path.md. A piece counts as learned once it reaches
// the Secure stage (played through In time at 60% of the marked tempo or faster, 90% right notes,
// 75% timing; older whole-piece passes of 90% count too); a level is finished when enough of its
// pieces are learned. Nothing is locked: the learner can choose a level or any piece, or skip one.
(() => {
const PASS_KEY = 'journey-note-passes-v1', LOG_KEY = 'openpiano-practice-log-v1', PATH_KEY = 'my-journey-piano-pathway-v2', SKILL_KEY = 'journey-piano-skills-v1';
const read = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new Event('piano-progress-changed')); } catch {} };
const DAY = 864e5;
// how many learned pieces finish a level (Level 0: most of the 20 First keys pieces, or the last one)
const EXIT = { 0: 12, 1: 4, 2: 4, 3: 4, 4: 3, 5: 3, 6: 3, 7: 3 };
// first-reading level used alongside each repertoire level (reading runs a little behind repertoire)
const READING = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6 };
// how many cold reviews a day's plan holds at most
const REVIEWS_PER_DAY = 2;

const curriculum = () => window.PianoCurriculum || { levels: [], pieces: [] };
const repertoire = () => window.PianoRepertoire || {};
const progress = () => window.PianoProgress;
// learned: the time the piece first reached Secure, else null. Without the progress store (older
// pages), the best whole-piece, both-hands pass of 90% or better.
function learned(id) {
  if (progress()) return progress().learnedAt(id);
  let best = null;
  for (const [key, v] of Object.entries(read(PASS_KEY))) {
    const [score, voice, part] = key.split(':');
    if (score === id && voice === 'all' && part === 'full' && v?.accuracy >= 90) { const d = Date.parse(v.date) || 0; if (!best || d > best) best = d; }
  }
  return best;
}
function started(id) { return !!progress()?.started(id) || !!read(LOG_KEY).pieces?.[id]?.attempts || Object.keys(read(PASS_KEY)).some(k => k.startsWith(id + ':')); }
const levelOf = id => curriculum().pieces.find(p => p.id === id)?.level;
// pieces the learner chose to skip ("Skip this piece" on Up next); they never block a level
const skipped = () => new Set(read(PATH_KEY).skipped || []);
function skip(id) {
  const s = read(PATH_KEY), list = new Set(s.skipped || []);
  list.add(id); s.skipped = [...list];
  if (s.selected === id) delete s.selected;
  write(PATH_KEY, s);
}
// the pieces of a level in path order (First keys in their numbered order, then the curriculum order)
function levelPieces(level) {
  const R = repertoire();
  return curriculum().pieces.filter(p => p.level === level && !p.reference && R[p.id]).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}
function levelState(level) {
  const list = levelPieces(level), done = list.filter(p => learned(p.id)), skip = skipped();
  const open = list.filter(p => !skip.has(p.id) || learned(p.id)).length;
  const exit = Math.min(EXIT[level] ?? 3, open);
  const finished = done.length >= exit || (level === 0 && !!learned('first-20'));
  return { level, total: list.length, learned: done.length, exit, finished, skipped: list.length - open };
}
// The learner's level: the one they chose to start at, moved on past every finished level.
function learnerLevel() {
  const levels = curriculum().levels.map(l => l.id).sort((a, b) => a - b);
  const chosen = read(PATH_KEY).startLevel;
  let level = Number.isInteger(chosen) ? chosen : levels[0] ?? 0;
  while (levels.includes(level + 1) && levelState(level).finished) level++;
  return level;
}
function setStartLevel(level) { const s = read(PATH_KEY); s.startLevel = level; write(PATH_KEY, s); }
// Up next: the piece being worked on if it is not learned yet, else the next unlearned piece of
// the learner's level (one already started first), else the next level's first. Skipped pieces
// are passed over.
function upNext() {
  const sel = read(PATH_KEY).selected, R = repertoire(), skip = skipped();
  if (sel && R[sel] && !learned(sel) && !skip.has(sel) && started(sel) && levelOf(sel) != null) return { id: sel, why: 'You are learning this piece.' };
  const level = learnerLevel();
  for (const lv of [level, level + 1]) {
    const list = levelPieces(lv).filter(p => !learned(p.id) && !skip.has(p.id));
    const pick = list.find(p => started(p.id)) || list[0];
    if (pick) return { id: pick.id, why: lv === level ? (started(pick.id) ? 'Pick up where you left off.' : 'Next piece on your level.') : 'A step up: the next level.' };
  }
  return { id: sel && R[sel] ? sel : 'ode', why: 'Your choice.' };
}
// a warm-up: the key study for the level, a different key each day (key studies start at Level 2)
function warmUp(level) {
  const R = repertoire(), list = Object.values(R).filter(s => s.kind === 'technique' && s.studyLevel <= Math.max(2, level) && s.studyLevel >= Math.max(2, level) - 1).sort((a, b) => a.id.localeCompare(b.id));
  if (level < 2 || !list.length) return null;
  return list[Math.floor(Date.now() / DAY) % list.length];
}
// a first-reading piece not opened yet. When the reading generator is loaded it picks (and registers)
// the piece at the learner's reading level, which moves with their reading results (a staircase that
// starts a little behind the repertoire level); otherwise one of the built pieces at that level.
function reading(level) {
  try { const generated = window.PianoReadingGen?.next?.(); if (generated) return generated; } catch (e) { console.error(e); }
  const seen = new Set(read(SKILL_KEY).seen || []), R = repertoire(), want = READING[level] ?? 1;
  for (const lv of [want, want - 1, want + 1]) {
    const pick = Object.values(R).filter(s => s.kind === 'reading' && s.studyLevel === lv && !seen.has(s.id)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))[0];
    if (pick) return pick;
  }
  return null;
}
// learned pieces whose cold review is due (piano-progress.js), most overdue first
function reviews(exclude) {
  const R = repertoire();
  return (progress()?.reviewsDue() || []).filter(r => r.id !== exclude && R[r.id]).slice(0, REVIEWS_PER_DAY);
}
const shortTitle = id => repertoire()[id]?.title?.split(' · ')[0] || id;
function today() {
  const level = learnerLevel(), next = upNext(), items = [];
  // cold reviews come first: they must be the first thing played, before any warm-up
  for (const r of reviews(next.id)) items.push({ kind: 'review', id: r.id, title: shortTitle(r.id), stage: r.stage, note: 'First try of the day, no warm-up: play it In time from the start.' + (r.overdueDays > 1 ? ` Due ${r.overdueDays} days ago.` : '') });
  const w = warmUp(level); if (w) items.push({ kind: 'warmup', id: w.id, title: w.title.split(' · ')[0] + ' · warm-up', note: 'Scale fragments and a cadence in today’s key: play it once in Wait mode, once In time.' });
  items.push({ kind: 'piece', id: next.id, title: shortTitle(next.id), stage: progress()?.stage(next.id), note: next.why + ' Wait mode first, then In time; fix the bars that trip you up.' });
  const r = reading(level); if (r) items.push({ kind: 'reading', id: r.id, title: r.title, note: 'Read it once, cold: look it over for 30 seconds, then play it In time without stopping.' });
  // the "Play by chords" route adds its own item: { kind, id?, title, note, action?, label? }
  if (read(PATH_KEY).route === 'chords' && window.PianoChords?.todayItem) {
    try { const c = window.PianoChords.todayItem(level); if (c) items.push(c); } catch (e) { console.error(e); }
  }
  return { level, state: levelState(level), next, items };
}
window.PianoPath = { learned, started, learnerLevel, levelState, levelPieces, setStartLevel, upNext, skip, skipped, today, EXIT, READING };
})();
