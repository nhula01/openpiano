'use strict';
// Find your level: a short check (under five minutes) for people who already play. One question about
// experience picks the first piece; then up to four new first-reading pieces (piano-reading-gen.js), read
// at sight In time with the person's own input (MIDI keyboard, microphone or tap keys) through the normal
// player. After a clean reading the next piece is a level up, after a miss a level down; the check stops
// as soon as one level is read cleanly and the next one is not. It ends with a suggested starting level.
// Without an input it suggests a level from the answer alone. Nothing leaves the browser.
(() => {
const START = { never: 0, some: 2, grade: 4 };     // the first piece's level for each answer
const FALLBACK = { never: 0, some: 1, grade: 3 };  // the suggestion from the answer alone
const MAX_PROBES = 4;
const clamp = l => Math.max(0, Math.min(7, l));

// The decision, from the answer and the pieces read so far ([{ level, passed }]). Pure, so it is tested.
// Returns { done: false, next } for the next piece, or { done: true, level, reason }.
function decide(answer, results = []) {
  const done = (level, reason) => ({ done: true, level, reason });
  if (answer === 'never') return done(0, 'You are new to the piano, so the path starts with First keys: the notes around middle C, one hand at a time.');
  const passed = results.filter(r => r.passed).map(r => r.level), failed = results.filter(r => !r.passed).map(r => r.level);
  for (const l of [...passed].sort((a, b) => b - a)) if (failed.includes(l + 1)) return done(l, `You read Level ${l} cleanly at sight and Level ${l + 1} was a stretch, so Level ${l} is a good place to start.`);
  if (passed.includes(7)) return done(7, 'You read even a Level 7 piece cleanly at sight, so the whole path is open to you; start at the top.');
  if (failed.includes(0)) return done(0, 'Level 0 builds reading from the very first notes, so it is the best place to start.');
  if (results.length >= MAX_PROBES) {
    if (passed.length) { const l = Math.max(...passed); return done(l, `You read Level ${l} cleanly at sight, so Level ${l} is a good place to start.`); }
    const l = clamp(Math.min(...failed) - 1); return done(l, `Level ${l} is a step below the first piece that felt hard, so it is a comfortable place to start.`);
  }
  if (!results.length) return { done: false, next: START[answer] ?? 0 };
  const last = results[results.length - 1];
  return { done: false, next: clamp(last.level + (last.passed ? 1 : -1)) };
}
function fallback(answer, why) {
  const level = FALLBACK[answer] ?? 0;
  return { done: true, level, reason: `${why || 'Without playing, this suggestion comes from your answer alone'}: Level ${level} is a careful place to start, and you can move up whenever it feels easy.` };
}

// ---------- UI ----------
const P = () => window.PianoPractice, G = () => window.PianoReadingGen;
function el(tag, text, cls) { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
function button(text, cls, onclick) { const b = el('button', text, cls); b.type = 'button'; b.onclick = onclick; return b; }
let state = null;

function close() {
  if (!state) return;
  state.off?.forEach(f => f());
  state.modal?.remove(); state.card?.remove();
  G()?.restoreView(state.view);
  state = null;
}
function modal() {
  if (state.modal) return state.modal;
  const back = el('div', undefined, 'placement-backdrop'), box = el('div', undefined, 'placement');
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'placement-title');
  back.append(box); back.addEventListener('click', e => { if (e.target === back) close(); });
  back.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  document.body.append(back); state.modal = back;
  return back;
}
function screen(title, ...content) {
  const back = modal(), box = back.firstChild;
  const head = el('div', undefined, 'placement-head'), h = el('h2', title); h.id = 'placement-title';
  head.append(el('span', 'Find your level', 'placement-kicker'), h, button('×', 'placement-close', close));
  head.lastChild.setAttribute('aria-label', 'Close');
  box.replaceChildren(head, ...content);
  back.hidden = false;
  (box.querySelector('.placement-choice, .placement-actions button') || box.querySelector('button'))?.focus({ preventScroll: true });
}

function open() {
  close();
  state = { answer: null, input: null, results: [], off: [] };
  const choices = el('div', undefined, 'placement-choices');
  for (const [value, title, note] of [['never', 'I have never played', 'Start from the first notes.'], ['some', 'I play a little', 'I can read simple music with both hands.'], ['grade', 'I have played for years', 'Lessons, grade exams or regular playing.']]) {
    const b = button('', 'placement-choice', () => { state.answer = value; value === 'never' ? suggest(decide('never')) : chooseInput(); });
    b.append(el('strong', title), el('span', note));
    choices.append(b);
  }
  screen('How much have you played?',
    el('p', 'Up to four short pieces to read at sight, new to you, played once In time without stopping. It takes under five minutes, and you can stop at any time.', 'muted'),
    choices);
}

function chooseInput() {
  const now = P()?.input || 'keys';
  const list = el('div', undefined, 'placement-choices');
  const options = [['MIDI', 'MIDI keyboard', 'The most exact. Connect it with USB.'], ['microphone', 'Microphone', 'Play your piano in a quiet room.'], ['keys', 'Tap or type', 'The on-screen keys or the computer keyboard.']];
  for (const [value, title, note] of options) {
    const b = button('', 'placement-choice' + (value === now ? ' current' : ''), () => checkInput(value));
    b.append(el('strong', title), el('span', note));
    list.append(b);
  }
  const skip = button('I can’t play right now', 'secondary', () => suggest(fallback(state.answer)));
  const actions = el('div', undefined, 'placement-actions'); actions.append(skip);
  screen('What will you play on?', list, actions);
}

async function checkInput(value) {
  const p = P();
  if (!p || !G()) { suggest(fallback(state.answer, 'The practice player is not available here')); return; }
  if (value === 'MIDI') {
    const problem = await p.probeMidi?.();
    if (problem || !p.inputStatus?.midi?.devices?.length) { suggest(fallback(state.answer, problem ? 'MIDI is not available in this browser' : 'No MIDI keyboard was found')); return; }
  }
  if (value === 'microphone' && !navigator.mediaDevices?.getUserMedia) { suggest(fallback(state.answer, 'This browser cannot use the microphone')); return; }
  state.input = value;
  p.setInput(value);
  state.off.push(p.on('result', onResult), p.on('state', showCard));
  probe();
}

// The stage's result summary (a modal dialog) would cover the check; the check shows its own results.
const closeSummary = () => document.querySelector('dialog.sg-summary[open]')?.close();
function probe() {
  closeSummary();
  const step = decide(state.answer, state.results);
  if (step.done) { suggest(step); return; }
  const entry = G().next(step.next); entry.placement = true;
  state.current = { id: entry.id, level: step.next };
  if (state.modal) state.modal.hidden = true;
  const select = () => {
    const off = P().on('load', score => { if (score?.id !== entry.id) return; off(); state.current.loaded = true; const v = G().sheetView(); if (state.view === undefined) state.view = v; P().setTempo(entry.tempo || 56); showCard(); });
    window.dispatchEvent(new CustomEvent('piano-select-score', { detail: entry.id }));
  };
  select();
}

// The small card over the music during the check; it steps aside while the person plays.
function showCard() {
  if (!state?.current?.loaded) return;
  const p = P();
  if (!state.card) { state.card = el('div', undefined, 'reading-lookover placement-card'); state.card.setAttribute('role', 'dialog'); state.card.setAttribute('aria-label', 'Reading check'); }
  const card = state.card, n = state.results.length + 1;
  const text = el('div');
  text.append(el('span', `Reading check · piece ${n} of up to ${MAX_PROBES} · Level ${state.current.level}`, 'reading-kicker'),
    el('p', 'Look it over, then press Start and play it once In time without stopping. Keep going through any slips.'));
  const actions = el('div', undefined, 'reading-actions');
  actions.append(button('Start', '', () => { card.hidden = true; p.start('play'); }), button('Too hard', 'secondary', () => record(false)), button('Stop the check', 'secondary', close));
  card.replaceChildren(text, actions);
  card.hidden = p.state !== 'idle';
  if (!card.isConnected) (document.querySelector('.sg-stage') || document.querySelector('#note-trainer') || document.body).append(card);
}
function onResult(r) {
  if (!state?.current || r.score !== state.current.id || r.kind !== 'play' || r.loop || !r.complete) return;
  record(G().success(r));
}
function record(passed) {
  if (!state?.current) return;
  state.results.push({ level: state.current.level, passed });
  state.current = null; if (state.card) state.card.hidden = true;
  setTimeout(probe, passed ? 600 : 300);
}

function suggest(step) {
  if (!state) return;
  closeSummary();
  if (state.card) state.card.hidden = true;
  const level = step.level;
  const name = window.PianoCurriculum?.levels?.find(l => l.id === level)?.title;
  const actions = el('div', undefined, 'placement-actions');
  actions.append(button(`Start at Level ${level}`, '', () => { start(level); }), button('Choose myself', 'secondary', chooseMyself));
  const results = el('ul', undefined, 'placement-results');
  for (const r of state.results) results.append(el('li', `Level ${r.level}: ${r.passed ? 'read cleanly' : 'a stretch'}`, r.passed ? 'pass' : 'miss'));
  screen(`Start at Level ${level}${name ? ' · ' + name : ''}`, el('p', step.reason), ...(state.results.length ? [results] : []), actions);
}
function goHome() { if (location.hash !== '#home') location.hash = '#home'; }
function start(level) {
  window.PianoPath?.setStartLevel(level);
  G()?.setLevel(level);
  try { const k = 'my-journey-piano-pathway-v2', s = JSON.parse(localStorage.getItem(k)) || {}; delete s.selected; localStorage.setItem(k, JSON.stringify(s)); } catch {}
  window.dispatchEvent(new Event('piano-progress-changed'));
  close(); goHome();
}
function chooseMyself() { close(); goHome(); setTimeout(() => document.querySelector('.today-start select')?.focus(), 50); }

window.PianoPlacement = { open, close, decide, fallback, START, FALLBACK, MAX_PROBES };
})();
