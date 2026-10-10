'use strict';
// The chord trainer screen (#chords, #chords/<lesson>, #chords/song/<id>), the "Play by chords"
// shelf in the Library and the route question on Home. The checking itself is in piano-chords.js;
// this file only draws the screen and feeds it notes from MIDI, the on-screen keys and the
// microphone. Keyboard diagrams show pitch names only, never finger numbers.
(() => {
const C = window.PianoChords;
if (!C) return;
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = text; if (cls) n.className = cls; return n; };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const UI_KEY = 'openpiano-chords-ui-v1';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(prefs)); } catch {} };
const STAGE_TEXT = { A: 'Any shape', B: 'Root at the bottom', C: 'Exact shape' };
const STAGE_HELP = { A: 'Any inversion or spacing of the right notes counts. Doubling a note is fine; a seventh chord may leave out its fifth.', B: 'As A, and the lowest note you play must be the root (or the bass note after the slash).', C: 'Play exactly the notes shown on the keyboard.' };
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);

let screen = null;      // what is on screen: { kind: 'lesson'|'song', plan, lesson, song, ... }
let run = null;         // the current session
let loop = null, nextClick = 0, audio = null, latched = new Set(), mic = null;

// ---------- Sound: the sampled piano for tapped keys and a click for the beat ----------
function ctx() {
  if (audio) return audio;
  try { const A = window.AudioContext || window.webkitAudioContext; audio = A ? new A() : null; } catch { audio = null; }
  return audio;
}
const voices = new Map();
function sound(midi, on) {
  const c = ctx(); if (!c || !window.PianoGrand) return;
  if (c.state === 'suspended') c.resume?.();
  voices.get(midi)?.stop?.(); voices.delete(midi);
  if (on) try { voices.set(midi, window.PianoGrand.play(c, midi, c.currentTime, 1.6, 80)); } catch {}
}
function click(atPerf, accent) {
  const c = audio; if (!c || !window.PianoClick) return;
  window.PianoClick.at(c, c.currentTime + Math.max(0, (atPerf - now()) / 1000), accent);
}

// ---------- Input: everything arrives through PianoPractice's raw input event ----------
function press(midi, on) {
  // the on-screen keys go through the player too, so every source takes the same path
  if (window.PianoPractice?.noteOn) { if (on) window.PianoPractice.noteOn(midi); else window.PianoPractice.noteOff(midi); }
  else receive(midi, on, now(), 'keys');
}
function receive(midi, on, time, source) {
  if (!screen || document.body.dataset.view !== 'chords') return;
  markKey(midi, on);
  if (!run || run.done) return;
  const before = run.index;
  run.input(midi, on, time);
  if (run.mode === 'wait' && run.index !== before) releaseLatched();
  draw();
  if (run.done) finish();
}
function hookInput() {
  if (hookInput.done || !window.PianoPractice?.on) return;
  hookInput.done = true;
  window.PianoPractice.on('input', d => { if (d && d.midi != null) receive(d.midi, d.on, d.time ?? now(), d.source); });
}
function releaseLatched() { for (const m of [...latched]) { latched.delete(m); press(m, false); } }

// The microphone: its own listener, so the trainer does not depend on a score being loaded.
async function startMic() {
  const Listen = window.PianoListen;
  if (!Listen || !navigator.mediaDevices?.getUserMedia) { say('The microphone cannot be used in this browser. Use tap keys or a MIDI keyboard.'); return false; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    const c = ctx(); await c.resume?.();
    const analyser = c.createAnalyser(); analyser.fftSize = 16384;
    c.createMediaStreamSource(stream).connect(analyser);
    const listener = new Listen.MicListener(c.sampleRate), samples = new Float32Array(analyser.fftSize);
    mic = { stream, timer: setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const step = run && screen?.plan.steps[Math.min(run.index, screen.plan.steps.length - 1)];
      const r = listener.frame(samples, step?.target || [], c.currentTime);
      for (const [n, on, ago] of r.events) receive(n, on, now() - ago * 1000, 'microphone');
    }, 45) };
    return true;
  } catch (e) { say(e?.name === 'NotAllowedError' ? 'The microphone is blocked for this site. Allow it in the browser’s site settings, or use tap keys or MIDI.' : 'The microphone could not start.'); return false; }
}
function stopMic() { if (!mic) return; clearInterval(mic.timer); mic.stream.getTracks().forEach(t => t.stop()); mic = null; }

// ---------- Routing ----------
function routeNow() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h.startsWith('chords')) { stopRun(); stopMic(); screen = null; return; }
  hookInput();
  if (window.PianoPractice?.state && window.PianoPractice.state !== 'idle') try { window.PianoPractice.pause(); } catch {}
  const [, a, b] = h.split('/');
  stopRun();
  if (a === 'song' && b) showSong(b); else if (a && C.lesson(a)) showLesson(a); else showList();
  window.scrollTo?.(0, 0);
}
C.open = id => { const h = '#chords' + (id ? '/' + id : ''); if (location.hash === h) routeNow(); else location.hash = h; };

// ---------- The lesson list ----------
function root() { return $('#chords-app'); }
function showList() {
  screen = null;
  const box = root(); if (!box) return; box.replaceChildren();
  const head = el('header', undefined, 'view-head cx-head');
  const t = el('div'); t.append(el('p', 'Play by chords', 'kicker'), el('h1', 'Chords, patterns and songs'), el('p', 'Learn the chords and left-hand patterns behind thousands of songs, then play songs from a lead sheet: melody in the right hand, chords in the left. Every stage also asks you to read one new piece, so reading keeps up.', 'lead cx-lead'));
  head.append(t); box.append(head);
  const next = C.nextLesson();
  if (next) {
    const card = el('section', undefined, 'cx-next');
    const body = el('div'); body.append(el('span', `Next · Level ${next.level}`, 'today-kind'), el('h2', next.title), el('p', next.goal, 'muted'));
    const go = el('button', 'Practise'); go.type = 'button'; go.onclick = () => C.open(next.id);
    card.append(body, go); box.append(card);
  }
  for (const level of [1, 2, 3, 4, 5]) {
    const sec = el('section', undefined, 'cx-level'); sec.id = 'chords-level-' + level;
    const info = C.LEVELS[level], list = C.LESSONS.filter(l => l.level === level), done = list.filter(l => C.passed(l.id)).length;
    const h = el('div', undefined, 'cx-level-head');
    h.append(el('h2', `Level ${level} · ${info.title}`), el('p', `${info.text} ${done} of ${list.length} passed.`, 'muted'));
    sec.append(h);
    const ol = el('ol', undefined, 'cx-lessons');
    for (const l of list) {
      const li = el('li', undefined, 'cx-lesson' + (C.passed(l.id) ? ' passed' : '') + (next?.id === l.id ? ' next' : ''));
      const a = el('a'); a.href = '#chords/' + l.id;
      a.append(el('strong', l.title), el('span', C.inKey(l.circle ? l.prog : l.prog, l.key).map(C.pretty).join(' – ') + (l.pattern ? ` · ${C.PATTERNS[l.pattern].name}` : '') + (l.circle ? ' · all 12 keys' : ''), 'cx-lesson-prog'));
      li.append(a, el('span', C.passed(l.id) ? 'Passed' : next?.id === l.id ? 'Next' : '', 'cx-badge'));
      ol.append(li);
    }
    sec.append(ol, readingCard(level));
    box.append(sec);
  }
  box.append(songShelf());
}
function readingCard(level) {
  const task = C.readingTask(level), card = el('div', undefined, 'cx-reading');
  if (!task) return card;
  const text = el('div');
  text.append(el('span', `Reading for level ${level}`, 'today-kind'), el('strong', task.title), el('span', task.done ? 'Done: you have read a piece at this level. Read another any time.' : 'Required for this stage: look it over for 30 seconds, then play it once without stopping.', 'today-note'));
  const b = el('button', task.done ? 'Read another' : 'Read', 'secondary small'); b.type = 'button';
  b.onclick = () => window.dispatchEvent(new CustomEvent('piano-select-score', { detail: { id: task.id, reading: true } }));
  card.classList.toggle('done', !!task.done);
  card.append(text, b);
  return card;
}
function songShelf() {
  const sec = el('section', undefined, 'cx-level cx-songs'); sec.id = 'chords-songs';
  const songs = window.PianoLeadSheets?.songs || [];
  sec.append(el('h2', 'Songs with chords'), el('p', 'Lead sheets of public-domain songs in the library whose scores carry chord symbols. Right hand: the melody. Left hand: the chords, checked as you play.', 'muted'));
  const ol = el('ol', undefined, 'cx-lessons');
  for (const s of songs) {
    const li = el('li', undefined, 'cx-lesson' + (C.passed('song-' + s.id) ? ' passed' : ''));
    const a = el('a'); a.href = '#chords/song/' + s.id;
    a.append(el('strong', s.title), el('span', `Level ${s.level} · ${s.note}`, 'cx-lesson-prog'));
    li.append(a, el('span', C.attempts('song-' + s.id).length ? 'Played' : '', 'cx-badge'));
    ol.append(li);
  }
  sec.append(ol);
  return sec;
}

// ---------- The trainer ----------
function controlsFor(kind, lesson) {
  const pattern = lesson?.pattern && lesson.pattern !== 'block';
  return {
    stage: pattern ? 'A' : prefs.stage || 'A',
    mode: prefs.mode || 'wait',
    bpm: prefs.bpm?.[lesson?.id || kind] ?? (lesson ? Math.max(50, lesson.pass.bpm - 20) : 60),
    click: prefs.click !== false,
    input: prefs.input || 'keys',
  };
}
function showLesson(id) {
  const lesson = C.lesson(id), key = prefs.keys?.[id] || lesson.key;
  const p = C.plan(lesson, key);
  screen = { kind: 'lesson', lesson, plan: p, key, opts: controlsFor('lesson', lesson), pattern: !!lesson.pattern && lesson.pattern !== 'block' };
  build();
}
function showSong(songId) {
  const song = (window.PianoLeadSheets?.songs || []).find(s => s.id === songId);
  if (!song) { showList(); return; }
  const p = C.songPlan(song);
  const opts = controlsFor('song-' + song.id, null);
  if (opts.stage === 'C') opts.stage = 'B';
  screen = { kind: 'song', song, plan: p, opts, pattern: false };
  build();
}
let refs = {};
function build() {
  const box = root(); if (!box) return; box.replaceChildren(); refs = {};
  const s = screen, L = s.lesson;
  const top = el('div', undefined, 'cx-top');
  const back = el('a', 'All chord lessons', 'back'); back.href = '#chords'; top.append(back);
  box.append(top);
  const head = el('header', undefined, 'cx-trainer-head');
  if (L) head.append(el('p', `Chords · Level ${L.level}${L.pattern ? ' · ' + C.PATTERNS[L.pattern].name : ''}`, 'kicker'), el('h1', L.title), el('p', L.goal, 'cx-goal'));
  else head.append(el('p', `Lead sheet · Level ${s.song.level}`, 'kicker'), el('h1', s.song.title), el('p', 'Right hand: the melody (top line). Left hand: the chords above it, any shape, below middle C. ' + s.song.note, 'cx-goal'));
  if (L?.pattern) head.append(el('p', 'Pattern: ' + C.PATTERNS[L.pattern].how, 'cx-help cx-pattern'));
  box.append(head);

  const stagePanel = el('section', undefined, 'cx-stage');
  // the progression or the lead sheet
  refs.prog = el('div', undefined, s.kind === 'song' ? 'cx-sheet' : 'cx-prog');
  stagePanel.append(refs.prog);
  refs.feedback = el('p', '', 'cx-feedback'); refs.feedback.setAttribute('role', 'status'); refs.feedback.setAttribute('aria-live', 'polite');
  refs.beat = el('div', undefined, 'cx-beats'); refs.beat.setAttribute('aria-hidden', 'true');
  refs.actions = el('div', undefined, 'actions cx-actions');
  const bar = el('div', undefined, 'cx-runbar'); bar.append(refs.actions, refs.beat);
  stagePanel.append(bar, refs.feedback);
  refs.keys = el('div', undefined, 'cx-keys'); stagePanel.append(refs.keys);
  refs.keysNote = el('p', '', 'cx-keys-note'); stagePanel.append(refs.keysNote);
  box.append(stagePanel);

  const actions = refs.actions;
  refs.start = el('button', 'Start'); refs.start.type = 'button'; refs.start.id = 'chords-start'; refs.start.onclick = () => (run && !run.done ? stopRun(true) : startRun());
  actions.append(refs.start);
  if (s.kind === 'song') { const open = el('button', 'Open the full score', 'secondary'); open.type = 'button'; open.onclick = () => window.dispatchEvent(new CustomEvent('piano-select-score', { detail: s.song.id })); actions.append(open); }
  if (L) box.append(el('p', 'To pass: ' + C.ruleText(L), 'cx-rule'));
  refs.result = el('section', undefined, 'cx-result'); refs.result.hidden = true; refs.result.setAttribute('aria-live', 'polite');
  box.append(refs.result);
  // controls
  const ctl = el('section', undefined, 'cx-controls'); ctl.setAttribute('aria-label', 'Practice settings');
  const pattern = L?.pattern && L.pattern !== 'block';
  if (!pattern) {
    const g = segmented('Stage', (s.kind === 'song' ? ['A', 'B'] : C.STAGES).map(x => [x, `${x} · ${STAGE_TEXT[x]}`]), s.opts.stage, v => { s.opts.stage = v; prefs.stage = v; savePrefs(); reset(); });
    refs.stageHelp = el('p', STAGE_HELP[s.opts.stage], 'cx-help'); g.append(refs.stageHelp); ctl.append(g);
  }
  ctl.append(segmented('Mode', [['wait', 'Wait for me'], ['time', 'In time']], s.opts.mode, v => { s.opts.mode = v; prefs.mode = v; savePrefs(); reset(); }));
  const tempo = el('div', undefined, 'cx-field cx-tempo');
  tempo.append(el('span', 'Tempo', 'cx-label'));
  const minus = el('button', '−', 'secondary small'), plus = el('button', '+', 'secondary small'), val = el('output', '', 'cx-bpm');
  minus.type = plus.type = 'button'; minus.setAttribute('aria-label', 'Slower'); plus.setAttribute('aria-label', 'Faster');
  const setBpm = v => { s.opts.bpm = Math.max(30, Math.min(200, v)); val.textContent = s.opts.bpm + ' BPM'; prefs.bpm = prefs.bpm || {}; prefs.bpm[L?.id || 'song-' + s.song.id] = s.opts.bpm; savePrefs(); };
  minus.onclick = () => { setBpm(s.opts.bpm - 4); reset(); }; plus.onclick = () => { setBpm(s.opts.bpm + 4); reset(); };
  const row = el('div', undefined, 'cx-tempo-row'); row.append(minus, val, plus); tempo.append(row); setBpm(s.opts.bpm);
  const clickBox = el('label', undefined, 'check cx-click'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = s.opts.click; cb.onchange = () => { s.opts.click = cb.checked; prefs.click = cb.checked; savePrefs(); };
  clickBox.append(cb, el('span', 'Click')); tempo.append(clickBox);
  ctl.append(tempo);
  if (L && !L.circle) {
    const f = el('label', undefined, 'cx-field'); f.append(el('span', 'Key', 'cx-label'));
    const sel = el('select'); for (const k of C.keysFor(L.key)) { const o = el('option', C.pretty(k.replace(/m$/, ' minor')) + (k === L.key ? ' (lesson)' : '')); o.value = k; sel.append(o); }
    sel.value = s.key; sel.onchange = () => { prefs.keys = prefs.keys || {}; prefs.keys[L.id] = sel.value; savePrefs(); showLesson(L.id); };
    f.append(sel); ctl.append(f);
  }
  const inF = el('label', undefined, 'cx-field'); inF.append(el('span', 'Input', 'cx-label'));
  const inSel = el('select'); for (const [v, t] of [['keys', 'Tap keys / MIDI keyboard'], ['microphone', 'Microphone']]) { const o = el('option', t); o.value = v; inSel.append(o); }
  inSel.value = s.opts.input === 'microphone' ? 'microphone' : 'keys';
  inSel.onchange = async () => { s.opts.input = inSel.value; prefs.input = inSel.value; savePrefs(); if (inSel.value === 'microphone') { if (!(await startMic())) { inSel.value = 'keys'; s.opts.input = 'keys'; } } else stopMic(); reset(); };
  inF.append(inSel); ctl.append(inF);

  box.append(ctl);
  if (L) box.append(readingCard(L.level));
  if (s.kind === 'song') box.append(songCredit(s.song));
  if (s.opts.input === 'microphone' && !mic) startMic().then(ok => { if (!ok) { s.opts.input = 'keys'; inSel.value = 'keys'; } });
  reset();
}
function songCredit(song) {
  const box = el('details', undefined, 'cx-credit');
  box.append(el('summary', 'About this lead sheet'));
  box.append(el('p', `${song.attribution}. Chord symbols as written in that transcription; the melody is its top right-hand line. ${song.why}`, 'muted'));
  if (song.source) { const a = el('a', 'Transcription source'); a.href = song.source; a.target = '_blank'; a.rel = 'noopener'; box.append(a); }
  return box;
}
function segmented(label, options, value, onChange) {
  const g = el('div', undefined, 'cx-field'); g.append(el('span', label, 'cx-label'));
  const seg = el('div', undefined, 'cx-seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', label);
  for (const [v, t] of options) {
    const b = el('button', t, 'cx-seg-btn'); b.type = 'button'; b.dataset.value = v; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(v === value));
    b.onclick = () => { for (const x of seg.children) x.setAttribute('aria-checked', String(x === b)); if (label === 'Stage' && refs.stageHelp) refs.stageHelp.textContent = STAGE_HELP[v]; onChange(v); };
    seg.append(b);
  }
  g.append(seg);
  return g;
}

// ---------- A run ----------
function reset() {
  stopRun();
  if (!screen) return;
  run = null;
  refs.result.hidden = true;
  drawProgression(); drawKeys(); draw();
  const first = refs.keys.querySelector('.cx-key.target');
  if (first && refs.keys.scrollWidth > refs.keys.clientWidth) refs.keys.scrollLeft = Math.max(0, first.offsetLeft - 60);
  const s = screen;
  say(s.opts.input === 'microphone' ? 'Microphone: chords are estimated from the notes heard over a short window, so only stage A (any shape) is checked. Press Start.' : s.opts.mode === 'wait' ? (s.pattern ? 'Wait mode: press Start and find each chord with your left hand, any shape. Switch to In time to play the pattern with the click.' : 'Press Start, then play each chord. The next one waits until this one is right.') : 'Press Start: one bar of clicks counts you in, then play each chord on its beat.');
}
function startRun() {
  const s = screen; if (!s) return;
  ctx()?.resume?.();
  latched.clear(); markAll();
  run = C.session(s.plan, { mode: s.opts.mode, stage: s.opts.stage, bpm: s.opts.bpm, input: s.opts.input === 'microphone' ? 'microphone' : 'keys' });
  run.start(now() + 150);
  refs.start.textContent = 'Stop';
  refs.result.hidden = true;
  nextClick = Math.ceil(run.beatAt(now()) - 0.001);
  if (run.mode === 'time') loop = setInterval(tickRun, 20);
  draw();
}
function tickRun() {
  if (!run) return;
  const t = now(), beat = run.beatAt(t);
  // schedule clicks 100 ms ahead: always during the count-in, then only if the click is on
  while (run.t0 + nextClick * (60000 / run.bpm) < t + 100) {
    const at = run.t0 + nextClick * (60000 / run.bpm), meter = screen.plan.meter || 4;
    if (nextClick < 0 || screen.opts.click) click(at, ((nextClick % meter) + meter) % meter === 0);
    nextClick++;
  }
  const before = run.index;
  run.tick(t);
  if (run.index !== before) releaseLatched();
  drawBeat(beat);
  if (run.index !== before) draw();
  if (run.done) finish();
}
function stopRun(manual) {
  clearInterval(loop); loop = null;
  if (manual && run && !run.done) { const r = run.finish(); run = null; showResult(r, true); }
  if (refs.start) refs.start.textContent = 'Start';
}
function finish() {
  clearInterval(loop); loop = null;
  const r = run.result(); run = null;
  refs.start.textContent = 'Start';
  showResult(r, false);
}
function showResult(r, stopped) {
  const s = screen; if (!s) return;
  const id = s.lesson ? s.lesson.id : 'song-' + s.song.id;
  if (!stopped || r.correct) C.record(id, r, s.key ? { key: s.key } : {});
  const box = refs.result; box.replaceChildren(); box.hidden = false;
  const pattern = s.lesson?.pattern && s.lesson.pattern !== 'block';
  box.classList.toggle('passed', !!r.passed);
  box.append(el('h2', r.passed ? 'Lesson passed' : stopped ? 'Stopped' : r.mode === 'wait' ? 'Run finished' : 'Run finished'));
  const dl = el('dl', undefined, 'cx-stats');
  const stat = (k, v) => { dl.append(el('dt', k), el('dd', v)); };
  if (!pattern || r.mode === 'wait') {
    if (r.mode === 'time') stat('Chords on time', `${r.onTime} of ${r.steps} (${r.onTimePct}%)`);
    else stat('Chords right first try', `${Math.round(r.firstTryPct * r.steps / 100)} of ${r.steps} (${r.firstTryPct}%)`);
    stat('Stage', `${r.stage} · ${STAGE_TEXT[r.stage]}${r.input === 'microphone' ? ' (microphone estimate)' : ''}`);
  }
  if (r.vl) stat('Voice leading', `You moved ${r.vl.moved} semitones; the closest shapes move ${r.vl.best} (${r.vl.score}).`);
  if (r.pattern) stat('Left-hand pattern', `${r.pattern.hits} of ${r.pattern.slots} notes on time (${r.pattern.pct}%)${r.pattern.stray ? `, ${r.pattern.stray} extra` : ''}`);
  if (r.melodyPct != null) stat('Melody', `${r.melodyPct}% of the notes`);
  stat('Tempo', r.mode === 'time' ? `${r.bpm} BPM` : 'Wait mode (no tempo)');
  box.append(dl);
  if (s.lesson) {
    const L = s.lesson;
    if (r.passed) box.append(el('p', 'Well done. The next lesson is ready; come back to this one any time.', 'cx-next-step'));
    else box.append(el('p', advice(L, r), 'cx-next-step'));
    const acts = el('div', undefined, 'actions');
    const again = el('button', 'Again', r.passed ? 'secondary' : ''); again.type = 'button'; again.onclick = () => { reset(); startRun(); };
    acts.append(again);
    const nxt = C.LESSONS[C.LESSONS.indexOf(L) + 1];
    if (nxt) { const b = el('button', 'Next lesson', r.passed ? '' : 'secondary'); b.type = 'button'; b.onclick = () => C.open(nxt.id); acts.append(b); }
    box.append(acts);
  } else {
    const acts = el('div', undefined, 'actions'); const again = el('button', 'Again'); again.type = 'button'; again.onclick = () => { reset(); startRun(); }; acts.append(again); box.append(acts);
  }
  box.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}
function advice(L, r) {
  const rule = L.pass;
  if (r.mode !== 'time') return `Wait mode is for learning the shapes. To pass, switch to In time. ${C.ruleText(L)}`;
  if (r.bpm < rule.bpm) return `Good practice. To pass, reach ${rule.bpm} BPM: raise the tempo a little each time you play it cleanly.`;
  if (rule.pattern != null) return `Aim for ${rule.pattern}% of the pattern’s notes on time. Slow down until it feels easy, then speed up.`;
  if (C.STAGES.indexOf(r.stage) < C.STAGES.indexOf(rule.stage)) return `To pass, choose stage ${rule.stage} (${STAGE_TEXT[rule.stage].toLowerCase()}).`;
  if (r.onTimePct < rule.onTime) return `Aim for ${rule.onTime}% of chords on time: look ahead to the next chord while you hold this one.`;
  if (rule.vl && (r.vl?.score ?? 0) < rule.vl) return 'Right chords, but your hand jumps. Keep shared notes where they are and move the others to the nearest key.';
  return 'Nearly there. Play it again.';
}

// ---------- Drawing ----------
function say(text) { if (refs.feedback) refs.feedback.textContent = text; }
function drawProgression() {
  const s = screen, box = refs.prog; box.replaceChildren();
  if (s.kind === 'song') {
    const p = s.plan, bars = p.bars, chords = p.steps;
    bars.forEach((start, bi) => {
      const end = bars[bi + 1] ?? p.totalBeats;
      const bar = el('div', undefined, 'cx-bar');
      const syms = el('div', undefined, 'cx-bar-chords');
      chords.forEach((c, i) => { if (c.beat >= start - 1e-6 && c.beat < end - 1e-6) { const x = el('span', c.name, 'cx-chip small'); x.dataset.step = i; syms.append(x); } });
      if (!syms.children.length) { const cur = chords.filter(c => c.beat < start + 1e-6).pop(); syms.append(el('span', cur ? '/' : '', 'cx-chip small cont')); }
      const mel = el('div', undefined, 'cx-bar-melody');
      mel.textContent = p.melody.filter(m => m[1] >= start - 1e-6 && m[1] < end - 1e-6).map(m => NAMES[m[0] % 12]).join(' ');
      bar.append(syms, mel); box.append(bar);
    });
    return;
  }
  s.plan.steps.forEach((st, i) => { const x = el('span', st.name, 'cx-chip'); x.dataset.step = i; box.append(x); });
}
function draw() {
  if (!screen) return;
  const s = screen, idx = run ? Math.min(run.index, s.plan.steps.length - 1) : 0, steps = run ? run.steps : [];
  for (const chip of refs.prog.querySelectorAll('[data-step]')) {
    const i = Number(chip.dataset.step), st = steps[i];
    chip.classList.toggle('now', !!run && i === idx);
    chip.classList.toggle('ok', !!st?.ok);
    chip.classList.toggle('late', !!st?.ok && run.mode === 'time' && !st.onTime);
  }
  const cur = refs.prog.querySelector(`[data-step="${idx}"]`);
  if (cur && run) { const r = cur.getBoundingClientRect(), pr = refs.prog.getBoundingClientRect(); if (r.top < pr.top || r.bottom > pr.bottom) refs.prog.scrollTop += r.top - pr.top - 8; }
  showTarget(idx);
  if (run?.last?.message) say(run.last.message + (run.mode === 'wait' && run.index < s.plan.steps.length && run.last.ok ? ` Next: ${s.plan.steps[run.index].name}.` : ''));
}
function drawBeat(beat) {
  const box = refs.beat; if (!box || !run) return;
  const meter = screen.plan.meter || 4;
  if (beat < 0) { box.textContent = 'Count-in: ' + (meter + Math.floor(beat) + 1); box.classList.add('count'); return; }
  box.classList.remove('count');
  const b = Math.floor(beat) % meter;
  if (box.dataset.beat === String(b) && box.children.length === meter) return;
  box.dataset.beat = String(b); box.replaceChildren();
  for (let i = 0; i < meter; i++) box.append(el('span', undefined, i === b ? 'on' : ''));
}

// tapped keys stay down until tapped again (so a mouse can build a chord), except for patterns in time
const latch = () => !screen.pattern || screen.opts.mode === 'wait';

// ---------- The keyboard: target notes named, keys you hold lit; tap to play ----------
function range() {
  const s = screen, all = s.plan.steps.flatMap(st => st.target || []);
  if (s.plan.melody) all.push(...s.plan.melody.map(m => m[0]));
  let lo = Math.min(...all), hi = Math.max(...all);
  lo = Math.floor(lo / 12) * 12; hi = Math.ceil((hi + 1) / 12) * 12 - 1;
  if (hi - lo < 23) hi = lo + 23;
  return [lo, hi];
}
function drawKeys() {
  const box = refs.keys; box.replaceChildren();
  const [lo, hi] = range(), whites = [];
  for (let m = lo; m <= hi; m++) if (!BLACK.has(m % 12)) whites.push(m);
  box.style.setProperty('--whites', whites.length);
  const kb = el('div', undefined, 'cx-kb');
  for (let m = lo; m <= hi; m++) {
    const black = BLACK.has(m % 12), k = el('button', undefined, 'cx-key ' + (black ? 'b' : 'w'));
    k.type = 'button'; k.dataset.midi = m; k.setAttribute('aria-label', NAMES[m % 12] + Math.floor(m / 12 - 1));
    if (black) { const left = whites.filter(w => w < m).length; k.style.left = `calc(${left} * 100% / var(--whites) - var(--bkw) / 2)`; }
    k.append(el('span', '', 'cx-name'));
    const down = e => { e.preventDefault(); ctx()?.resume?.(); const momentary = !latch() || (screen.plan.split != null && m >= screen.plan.split);
      if (momentary) { press(m, true); sound(m, true); k.setPointerCapture?.(e.pointerId); }
      else if (latched.has(m)) { latched.delete(m); press(m, false); sound(m, false); }
      else { latched.add(m); press(m, true); sound(m, true); } };
    const up = () => { const momentary = !latch() || (screen.plan.split != null && m >= screen.plan.split); if (momentary && k.classList.contains('held')) { press(m, false); sound(m, false); } };
    k.addEventListener('pointerdown', down); k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up);
    k.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); down(e); setTimeout(up, 250); } });
    kb.append(k);
  }
  box.append(kb);
  refs.keysNote.textContent = latch() ? (screen.plan.split != null ? 'Tap a key below middle C to hold it and tap again to lift it; chord keys lift by themselves when the chord is right. Melody keys play while you press them. A MIDI keyboard works as it is.' : 'Tap keys to hold them, tap again to lift. They lift by themselves when the chord is right. A MIDI keyboard works as it is.') : 'Tap and release each key in time. A MIDI keyboard works as it is.';
}
function showTarget(i) {
  const s = screen, st = s.plan.steps[i]; if (!st) return;
  const chord = C.parse(st.symbol), want = new Set(st.target || []);
  for (const k of refs.keys.querySelectorAll('.cx-key')) {
    const m = Number(k.dataset.midi), on = want.has(m);
    k.classList.toggle('target', on);
    k.querySelector('.cx-name').textContent = on ? C.pcName(m, chord) : '';
  }
}
function markKey(midi, on) { const k = refs.keys?.querySelector(`[data-midi="${midi}"]`); if (k) k.classList.toggle('held', on); }
function markAll() { for (const k of refs.keys?.querySelectorAll('.cx-key.held') || []) k.classList.remove('held'); }

// ---------- Library shelf and the route question on Home ----------
function renderShelf() {
  const box = $('#chords-shelf'); if (!box) return;
  box.hidden = false; box.replaceChildren();
  const next = C.nextLesson(), songs = window.PianoLeadSheets?.songs || [];
  const text = el('div');
  text.append(el('h2', 'Play by chords', 'shelf-title'), el('p', `${C.LESSONS.length} chord lessons in five levels, and ${songs.length} songs with chords to play from a lead sheet.${next ? ` Next: ${next.title}.` : ''}`, 'shelf-sub'));
  const go = el('a', next ? 'Open chord lessons' : 'Songs with chords', 'button'); go.href = '#chords';
  box.append(text, go);
}
// "What do you want to do first?": stored as route 'reading' or 'chords' with the learning path.
C.routeControl = plan => {
  const chosen = C.routeChosen(), current = C.route();
  const box = el('div', undefined, 'cx-route' + (!chosen && (plan?.level ?? 0) >= 1 ? ' ask' : ''));
  box.append(el('span', chosen ? 'Your route' : 'What do you want to do first?', 'cx-route-q'));
  const seg = el('div', undefined, 'cx-seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Route');
  for (const [v, t] of [['reading', 'Read and play pieces'], ['chords', 'Play songs with chords']]) {
    const b = el('button', t, 'cx-seg-btn'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(current === v)); b.dataset.route = v;
    b.onclick = () => C.setRoute(v);
    seg.append(b);
  }
  box.append(seg);
  if (!chosen) box.append(el('span', 'Both stay open; this only changes what Today suggests first.', 'today-note'));
  return box;
};

function init() {
  hookInput();
  renderShelf();
  routeNow();
}
window.addEventListener('hashchange', routeNow);
window.addEventListener('piano-progress-changed', () => { renderShelf(); if (!screen && location.hash.startsWith('#chords')) showList(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
