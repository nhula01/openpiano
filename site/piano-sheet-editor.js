'use strict';
// Sheet editor: a full-window score editor in the manner of MuseScore, Flat and Noteflight, for
// the person's own imported scores. Two ways of working, as in MuseScore:
//  · Select: click a note, rest or bar (Shift+click for a range) and change it with the toolbar,
//    the palettes, the keyboard or by dragging it up or down.
//  · Write notes (N): choose a length, then type A–G, click the staff where the note goes (a
//    shadow note shows where), press a key of the on-screen piano or play a MIDI keyboard; each
//    note is written at the blue cursor, over what was there, and the cursor moves on.
// Copy, paste, undo, voices, triplets, ties, slurs, articulations, dynamics, fingering, clefs,
// key and time signatures, barlines, repeats and endings are all here; playback uses the site's
// sampled piano. Every change goes through piano-sheet-model.js, so the result is plain MusicXML
// that saves, downloads and practices like any imported file.
(() => {
const M = () => window.PianoSheetModel;
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const LETTERS = 'CDEFGAB';
const KEYS = [[0, 'C major / A minor'], [1, 'G major / E minor'], [2, 'D major / B minor'], [3, 'A major / F♯ minor'], [4, 'E major / C♯ minor'], [5, 'B major / G♯ minor'], [6, 'F♯ major / D♯ minor'], [7, 'C♯ major / A♯ minor'],
  [-1, 'F major / D minor'], [-2, 'B♭ major / G minor'], [-3, 'E♭ major / C minor'], [-4, 'A♭ major / F minor'], [-5, 'D♭ major / B♭ minor'], [-6, 'G♭ major / E♭ minor'], [-7, 'C♭ major / A♭ minor']];
const DURS = [{ q: 4, key: '7', name: 'Whole note', icon: 'whole' }, { q: 2, key: '6', name: 'Half note', icon: 'half' }, { q: 1, key: '5', name: 'Quarter note', icon: 'quarter' },
  { q: 0.5, key: '4', name: 'Eighth note', icon: 'eighth' }, { q: 0.25, key: '3', name: '16th note', icon: '16th' }, { q: 0.125, key: '2', name: '32nd note', icon: '32nd' }];
const VOICE_NAMES = ['Voice 1', 'Voice 2', 'Voice 3', 'Voice 4'];

// Icons (24 × 24, drawn in currentColor)
const head = (filled, x = 10, y = 17) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="3.3" transform="rotate(-22 ${x} ${y})" ${filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.8"'}/>`;
const stem = '<path d="M14.1 15.6V3.5" stroke="currentColor" stroke-width="1.6"/>';
const flag = y => `<path d="M14.1 ${y}c1.2 2.6 5 3.6 4.3 7.6" fill="none" stroke="currentColor" stroke-width="1.7"/>`;
const ICONS = {
  whole: head(false, 12, 13), half: head(false) + stem, quarter: head(true) + stem, eighth: head(true) + stem + flag(3.5), '16th': head(true) + stem + flag(3.5) + flag(7.5), '32nd': head(true) + stem + flag(3) + flag(6.2) + flag(9.4),
  rest: '<path d="M9.5 3.5l4.5 5.2-3 3.4 4 4.8c-2.6-1.3-4.6-.2-3.2 3.6-3.4-2.4-2.4-6.2 1.2-5.2l-4.2-4.9 3.1-3.3z" fill="currentColor"/>',
  dot: head(true, 9, 14) + stem.replace('14.1', '13.1').replace('V3.5', 'V3') + '<circle cx="19" cy="15" r="2" fill="currentColor"/>',
  tie: '<path d="M3 13c3 5 15 5 18 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="4" cy="10" r="2.2" fill="currentColor"/><circle cx="20" cy="10" r="2.2" fill="currentColor"/>',
  slur: '<path d="M3 16C6 6 18 6 21 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  triplet: '<path d="M3 9V6h18v3" fill="none" stroke="currentColor" stroke-width="1.6"/><text x="12" y="21" text-anchor="middle" font-size="12" font-weight="700" fill="currentColor" font-family="Georgia,serif">3</text>',
  flip: '<path d="M8 20V5M4.5 8.5 8 5l3.5 3.5M16 4v15M12.5 15.5 16 19l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  undo: '<path d="M9 7 4.5 11.5 9 16M5 11.5h9a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  redo: '<path d="M15 7l4.5 4.5L15 16M19 11.5h-9a5 5 0 0 0 0 10h2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>',
  pen: '<path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z M13.5 7l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  pointer: '<path d="M6 3.5v15.5l4.2-4 2.8 6 2.6-1.2-2.8-5.9H18.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  piano: '<rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 5v14M12 5v14M16 5v14" stroke="currentColor" stroke-width="1.4"/><path d="M6.6 5h2.8v8H6.6zM10.6 5h2.8v8h-2.8zM14.6 5h2.8v8h-2.8z" fill="currentColor"/>',
  midi: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="7.8" cy="11" r="1.2" fill="currentColor"/><circle cx="16.2" cy="11" r="1.2" fill="currentColor"/><circle cx="9.4" cy="15" r="1.2" fill="currentColor"/><circle cx="14.6" cy="15" r="1.2" fill="currentColor"/><circle cx="12" cy="16.4" r="1.2" fill="currentColor"/>',
  palette: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  zoomIn: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 15.5 20 20M7.5 10.5h6M10.5 7.5v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  zoomOut: '<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 15.5 20 20M7.5 10.5h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  help: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9.5 9.5a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1.1.9-1.1 1.8v.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.1" fill="currentColor"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 15.5V5.6A1.6 1.6 0 0 1 6.6 4H15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  paste: '<rect x="5" y="5" width="14" height="16" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="9" y="3" width="6" height="4" rx="1" fill="currentColor"/>',
  trash: '<path d="M5 7h14M10 7V4.8h4V7M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>',
};
function icon(name) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICONS[name] || ''; return s; }

// The page is laid out as wide as the sheet so staff spaces come out at the zoom chosen
// (about 12 px, 10 on a phone): big enough to click a note, with as many bars a line as fit.
const VIEW = { pageHeight: 60000, adjustPageHeight: true, breaks: 'auto', scale: 100, svgViewBox: true, svgHtml5: true, footer: 'none', header: 'none',
  pageMarginTop: 30, pageMarginBottom: 60, pageMarginLeft: 40, pageMarginRight: 40, spacingSystem: 12, spacingStaff: 10 };
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

let openCount = 0;
async function open(host, xml, options = {}) {
  const model = M(); if (!model) throw new Error('The sheet editor did not load. Reload the page and try again.');
  const doc = model.load(xml), ops = model.ops;
  await window.PianoScoreImport.loadVerovio();
  const tk = new window.verovio.toolkit();
  const coarse = matchMedia('(pointer: coarse)').matches;
  const S = { sel: null, mode: 'select', cursor: null, dur: 1, dotted: false, voice: 0, last: null, clip: null, zoom: Number(store.get('openpiano-editor-zoom')) || (innerWidth < 700 ? 10 : 12),
    sound: store.get('openpiano-editor-sound') !== 'off', laidOut: 0, geo: null, problem: null, playing: null, undo: [], redo: [], dirty: false };
  const part0 = () => doc.querySelector('part');
  // what the view asks the model again and again is worked out once per version of the score
  S.v = 0;
  const memo = (key, fn) => { if (S.memoV !== S.v) { S.memo = new Map(); S.memoV = S.v; } if (!S.memo.has(key)) S.memo.set(key, fn()); return S.memo.get(key); };
  const voicesOf = staff => memo('v' + staff, () => model.staffVoices(part0(), staff));
  const timedAll = () => memo('t', () => model.timed(doc, part0()));
  const startsAll = () => memo('s', () => model.starts(part0()));
  const describe = n => { const e = model.eventOf(n); return e ? model.describeAt(n, voicesOf(e.staff)) : ''; };

  // ---------------------------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------------------------
  const root = el('div', undefined, 'se'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Sheet editor'); root.tabIndex = -1;
  const bar = el('header', undefined, 'se-head');
  const titleIn = el('input', undefined, 'se-title'), composerIn = el('input', undefined, 'se-composer');
  titleIn.setAttribute('aria-label', 'Title'); composerIn.setAttribute('aria-label', 'Composer'); composerIn.placeholder = 'Composer'; titleIn.placeholder = 'Title';
  titleIn.value = doc.querySelector('work-title, movement-title')?.textContent?.trim() || options.title || '';
  composerIn.value = doc.querySelector('identification > creator[type="composer"]')?.textContent?.trim() || '';
  const names = el('div', undefined, 'se-names'); names.append(titleIn, composerIn);
  const headTools = el('div', undefined, 'se-headtools');
  const done = el('button', options.doneLabel || 'Done', 'se-done'), cancel = el('button', 'Cancel', 'secondary se-cancel');
  done.type = cancel.type = 'button';
  bar.append(names, headTools);

  const tools = el('div', undefined, 'se-tools'); tools.setAttribute('role', 'toolbar'); tools.setAttribute('aria-label', 'Note tools');
  const body = el('div', undefined, 'se-body');
  const sheetWrap = el('div', undefined, 'se-sheetwrap');
  const sheet = el('div', undefined, 'se-sheet'); sheet.tabIndex = 0; sheet.setAttribute('aria-label', 'Score. Click a note to select it.');
  const pages = el('div', undefined, 'se-pages'), overlay = el('div', undefined, 'se-overlay');
  const cursorBox = el('div', undefined, 'se-cursor'), shadow = el('div', undefined, 'se-shadow'), shadowLabel = el('div', undefined, 'se-shadow-label');
  const textIn = el('input', undefined, 'se-textin'); textIn.hidden = true; textIn.autocomplete = 'off'; textIn.spellcheck = false;
  overlay.append(cursorBox, shadow, shadowLabel, textIn); sheet.append(pages, overlay); sheetWrap.append(sheet);
  const side = el('aside', undefined, 'se-side'); side.setAttribute('aria-label', 'Palettes');
  body.append(sheetWrap, side);
  const piano = el('div', undefined, 'se-piano'); piano.hidden = !coarse; piano.setAttribute('aria-label', 'Piano keyboard');
  const statusBar = el('footer', undefined, 'se-status');
  const modeChip = el('span', 'Select', 'se-mode'), status = el('span', '', 'se-msg'), warn = el('button', '', 'se-warn'); warn.type = 'button'; warn.hidden = true;
  status.setAttribute('aria-live', 'polite'); statusBar.append(modeChip, status, warn);
  root.append(bar, tools, body, piano, statusBar);

  const say = (t, bad) => { status.textContent = t; status.classList.toggle('bad', !!bad); };

  // ---------------------------------------------------------------------------------------------
  // Buttons
  // ---------------------------------------------------------------------------------------------
  const btn = (label, title, fn, opts = {}) => {
    const b = el('button', undefined, 'se-btn' + (opts.cls ? ' ' + opts.cls : '')); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title.replace(/ \(.*\)$/, ''));
    if (opts.icon) b.append(icon(opts.icon)); if (label) b.append(el('span', label, opts.icon ? 'se-btn-text' : null));
    if (opts.toggle) b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', ev => { ev.preventDefault(); fn(ev); if (!opts.keepFocus) sheet.focus({ preventScroll: true }); });
    return b;
  };
  const group = (host, name, ...items) => { const g = el('div', undefined, 'se-group'); g.setAttribute('role', 'group'); g.setAttribute('aria-label', name); g.append(...items); host.append(g); return g; };

  const undoB = btn('', 'Undo (Ctrl+Z)', () => restore(S.undo, S.redo), { icon: 'undo' }), redoB = btn('', 'Redo (Ctrl+Y)', () => restore(S.redo, S.undo), { icon: 'redo' });
  const playB = btn('', 'Play from the selection (Space)', () => togglePlay(), { icon: 'play' });
  const soundB = btn('', 'Hear notes as you write them', () => { S.sound = !S.sound; store.set('openpiano-editor-sound', S.sound ? 'on' : 'off'); syncTools(); }, { icon: S.sound ? 'sound' : 'mute', toggle: true });
  const zoomOutB = btn('', 'Zoom out (Ctrl+−)', () => zoom(-1), { icon: 'zoomOut' }), zoomInB = btn('', 'Zoom in (Ctrl++)', () => zoom(1), { icon: 'zoomIn' });
  const helpB = btn('', 'Keyboard shortcuts and help (?)', () => help(true), { icon: 'help' });
  group(headTools, 'History', undoB, redoB); group(headTools, 'Playback', playB, soundB); group(headTools, 'View', zoomOutB, zoomInB, helpB);
  const finish = el('div', undefined, 'se-finish'); finish.append(cancel, done); bar.append(finish);

  const writeB = btn('Write notes', 'Write notes (N): type A–G, click the staff or play the piano', () => setMode(S.mode === 'input' ? 'select' : 'input'), { icon: 'pen', toggle: true, cls: 'se-write' });
  const durB = DURS.map(d => btn('', `${d.name} (${d.key})`, () => duration(d.q), { icon: d.icon, toggle: true }));
  const dotB = btn('', 'Dotted: half as long again (.)', () => dot(), { icon: 'dot', toggle: true });
  const restB = btn('', 'Rest (0)', () => restAction(), { icon: 'rest' });
  const accB = [[-1, '♭', 'Flat (−)'], [0, '♮', 'Natural (=)'], [1, '♯', 'Sharp (+)']].map(([a, t, title]) => btn(t, title, () => accidental(a), { cls: 'se-acc' }));
  const tieB = btn('', 'Tie (T)', () => tieAction(), { icon: 'tie' }), slurB = btn('', 'Slur (S)', () => act(n => ops.slur(doc, n, rangeLast())), { icon: 'slur' });
  const tripB = btn('', 'Triplet (Ctrl+3)', () => tupletAction(3), { icon: 'triplet' });
  const voiceB = VOICE_NAMES.map((v, i) => btn(String(i + 1), `${v} (Ctrl+Alt+${i + 1})`, () => voiceAction(i), { toggle: true, cls: 'se-voice se-v' + (i + 1) }));
  const flipB = btn('', 'Flip stem (X)', () => act(n => ops.flip(doc, n)), { icon: 'flip' });
  const copyB = btn('', 'Copy (Ctrl+C)', () => copy(), { icon: 'copy' }), pasteB = btn('', 'Paste (Ctrl+V)', () => paste(), { icon: 'paste' }), delB = btn('', 'Delete (Del)', () => del(), { icon: 'trash' });
  const pianoB = btn('Piano', 'On-screen piano (P)', () => togglePiano(), { icon: 'piano', toggle: true });
  const midiB = btn('MIDI', 'Write with a MIDI keyboard', () => midi(), { icon: 'midi', toggle: true });
  const sideB = btn('Palettes', 'Palettes: clefs, keys, time, bars, marks, fingering…', () => { root.classList.toggle('se-side-open'); syncTools(); }, { icon: 'palette', toggle: true, cls: 'se-sidebtn' });
  group(tools, 'Mode', writeB);
  group(tools, 'Note length', ...durB, dotB);
  group(tools, 'Notes', restB, ...accB, tieB, slurB, tripB, flipB);
  group(tools, 'Voice', ...voiceB);
  group(tools, 'Edit', copyB, pasteB, delB);
  group(tools, 'Input', pianoB, midiB, sideB);

  // ---------------------------------------------------------------------------------------------
  // Palettes (like MuseScore's): click one with notes selected
  // ---------------------------------------------------------------------------------------------
  const palette = (title, open, fill) => { const d = el('details', undefined, 'se-pal'); d.open = open; d.append(el('summary', title)); const box = el('div', undefined, 'se-pal-items'); fill(box); d.append(box); side.append(d); return d; };
  const chip = (label, title, fn, cls) => { const b = el('button', label, 'se-chip' + (cls ? ' ' + cls : '')); b.type = 'button'; b.title = title; b.onclick = () => { fn(); sheet.focus({ preventScroll: true }); }; return b; };
  const sideHead = el('div', undefined, 'se-side-head'); sideHead.append(el('strong', 'Palettes'), el('span', 'Select notes, then choose', 'se-muted'));
  const sideClose = el('button', '×', 'se-side-close'); sideClose.type = 'button'; sideClose.setAttribute('aria-label', 'Close palettes'); sideClose.onclick = () => { root.classList.remove('se-side-open'); syncTools(); };
  sideHead.append(sideClose); side.append(sideHead);
  const props = el('div', undefined, 'se-props'); side.append(props);
  palette('Articulations', true, box => { for (const [n, t, g] of [['staccato', 'Staccato', '·'], ['staccatissimo', 'Staccatissimo', '▾'], ['tenuto', 'Tenuto', '–'], ['accent', 'Accent', '>'], ['strong-accent', 'Marcato', '^'], ['fermata', 'Fermata', '𝄐']]) box.append(chip(g, t, () => forNotes(n2 => ops.articulation(doc, n2, n), true), 'se-glyph')); });
  palette('Dynamics', true, box => { for (const d of model.DYNAMICS) box.append(chip(d, 'Dynamic ' + d, () => act(n => ops.dynamic(doc, n, d)), 'se-dyn')); box.append(chip('none', 'Remove the dynamic here', () => act(n => ops.dynamic(doc, n, null)))); });
  palette('Fingering', true, box => { for (const f of ['1', '2', '3', '4', '5']) box.append(chip(f, 'Finger ' + f, () => act(n => ops.fingering(doc, n, f)), 'se-fing')); box.append(chip('none', 'Remove the finger number', () => act(n => ops.fingering(doc, n, null)))); });
  palette('Lyrics and chord symbols', true, box => {
    box.append(chip('Lyrics', 'Type lyrics under the notes (Ctrl+L): Space goes to the next note, - to the next syllable', () => textEntry('lyric')), chip('Chord symbol', 'Type a chord symbol above the music (Ctrl+K), such as Am7 or C/E: Space goes to the next beat', () => textEntry('chord')));
    box.append(chip('Remove lyric', 'Remove the lyric under the selected notes', () => forNotes(n => ops.lyric(doc, n, ''))), chip('Remove chord symbol', 'Remove the chord symbol here', () => act(n => ops.chordSymbol(doc, n, null))));
  });
  palette('Clefs', false, box => { for (const [s, l, t] of [['G', 2, 'Treble'], ['F', 4, 'Bass'], ['C', 3, 'Alto'], ['C', 4, 'Tenor']]) box.append(chip(t, t + ' clef from this note on', () => act(n => ops.clef(doc, n, s, l)))); });
  palette('Key signatures', false, box => { for (const [f, t] of KEYS) box.append(chip(f ? `${Math.abs(f)}${f > 0 ? '♯' : '♭'}` : '0', t + ' from this bar on', () => act(n => ops.key(doc, n, f)), 'se-key')); });
  palette('Time signatures', false, box => {
    for (const [b, t] of [[2, 4], [3, 4], [4, 4], [5, 4], [2, 2], [3, 8], [6, 8], [9, 8], [12, 8]]) box.append(chip(`${b}/${t}`, `${b}/${t} from this bar on (the music is re-barred)`, () => act(n => ops.time(doc, n, b, t)), 'se-time'));
    const f = el('form', undefined, 'se-row'), b = el('input'), t = el('select'); b.type = 'number'; b.min = 1; b.max = 32; b.value = 7; b.setAttribute('aria-label', 'Beats');
    for (const v of [2, 4, 8, 16]) { const o = el('option', String(v)); o.value = v; t.append(o); } t.value = 8; t.setAttribute('aria-label', 'Beat type');
    const go = el('button', 'Set', 'se-chip'); go.type = 'submit'; f.append(b, el('span', '/'), t, go);
    f.onsubmit = ev => { ev.preventDefault(); const nb = Math.round(Number(b.value)); if (nb >= 1 && nb <= 32) act(n => ops.time(doc, n, nb, Number(t.value))); sheet.focus(); };
    box.append(f);
  });
  palette('Bar lines and repeats', false, box => {
    for (const [k, t] of [['regular', 'Normal'], ['double', 'Double'], ['final', 'Final'], ['repeat-start', 'Start repeat'], ['repeat-end', 'End repeat']]) box.append(chip(t, `${t} bar line at this bar`, () => act(n => ops.barline(doc, n, k))));
    box.append(chip('1st ending', '1st ending over the selected bars (ends with a repeat)', () => act(n => ops.ending(doc, n, 1, rangeLast()))), chip('2nd ending', '2nd ending over the selected bars', () => act(n => ops.ending(doc, n, 2, rangeLast()))));
  });
  palette('Grace notes and tuplets', false, box => {
    box.append(chip('Grace (slashed)', 'Acciaccatura before the note', () => act(n => ops.grace(doc, n, 'acciaccatura'))), chip('Grace', 'Appoggiatura before the note', () => act(n => ops.grace(doc, n, 'appoggiatura'))));
    for (const k of [3, 5, 6]) box.append(chip(k === 3 ? 'Triplet' : k + '-tuplet', `${k} notes in the time of the selected note`, () => tupletAction(k)));
  });
  palette('Tempo', false, box => {
    const f = el('form', undefined, 'se-row'), v = el('input'); v.type = 'number'; v.min = 20; v.max = 300; v.value = model.sound(doc).bpm; v.setAttribute('aria-label', 'Beats per minute');
    const go = el('button', 'Set ♩ =', 'se-chip'); go.type = 'submit'; f.append(go, v);
    f.onsubmit = ev => { ev.preventDefault(); const b = Math.round(Number(v.value)); if (b >= 20 && b <= 300) act(n => ops.tempo(doc, n, b)); sheet.focus(); };
    box.append(f);
  });
  palette('Bars', false, box => {
    box.append(chip('Insert before', 'An empty bar before the selected one (Ins)', () => act(n => ops.insertMeasures(doc, n, 'before', 1))), chip('Insert after', 'An empty bar after the selected one', () => act(n => ops.insertMeasures(doc, n, 'after', 1))));
    box.append(chip('Add 4 at the end', 'Four empty bars at the end of the score', () => act(n => ops.appendMeasures(doc, n, 4), { any: true })));
    box.append(chip('Delete selected bars', 'Delete the selected bars (Ctrl+Del)', () => deleteBars(), 'se-danger'));
  });

  // ---------------------------------------------------------------------------------------------
  // On-screen piano
  // ---------------------------------------------------------------------------------------------
  const keyEls = new Map();
  { const strip = el('div', undefined, 'se-keys'); let white = 0;
    for (let m = 21; m <= 108; m++) {
      const black = [1, 3, 6, 8, 10].includes(m % 12), k = el('button', undefined, black ? 'se-key-b' : 'se-key-w'); k.type = 'button'; k.tabIndex = -1;
      const name = model.noteName(model.spell(m, 0)); k.setAttribute('aria-label', name); k.dataset.midi = m;
      if (black) k.style.left = `calc(${white} * var(--wk) - var(--bk) / 2)`; else { if (m % 12 === 0) k.append(el('span', 'C' + (m / 12 - 1))); white++; }
      k.addEventListener('pointerdown', ev => { ev.preventDefault(); keyPress(m, ev.shiftKey); });
      strip.append(k); keyEls.set(m, k);
    }
    strip.style.width = `calc(${white} * var(--wk))`; piano.append(strip);
  }

  // ---------------------------------------------------------------------------------------------
  // Help and first-time tip
  // ---------------------------------------------------------------------------------------------
  const helpBox = el('div', undefined, 'se-help'); helpBox.hidden = true; helpBox.setAttribute('role', 'dialog'); helpBox.setAttribute('aria-label', 'Keyboard shortcuts');
  { const card = el('div', undefined, 'se-help-card'), close = el('button', 'Close', 'secondary'); close.type = 'button'; close.onclick = () => help(false);
    card.append(el('h3', 'How to edit'), el('p', 'Select mode: click a note, rest or empty part of a bar; Shift+click to select from there to another note. Change it with the toolbar, a palette, the keys below, or drag a note up or down. Write mode (N): choose a length, then type a letter, click the staff where the note goes, or press a piano key; the blue cursor moves on. Everything can be undone.'));
    const rows = [['Write notes / stop', 'N, Esc'], ['Lengths', '2 32nd · 3 16th · 4 eighth · 5 quarter · 6 half · 7 whole · . dot'], ['Notes', 'A–G (a rest becomes a note) · 0 rest · Shift+A–G add to chord · Alt+1–9 add an interval'],
      ['Pitch', '↑ ↓ semitone · Alt+Shift+↑ ↓ step in the key · Ctrl+↑ ↓ octave · J respell · drag a note'], ['Move', '← → previous / next · Ctrl+← → bar · Alt+↑ ↓ note in chord (writing: the other hand’s staff) · Shift+← → extend selection'],
      ['Change', 'T tie · S slur · X flip stem · H other hand · Ctrl+3 triplet · Ctrl+Alt+1–4 voice · Alt+← → swap with neighbour'], ['Edit', 'Ctrl+C copy · Ctrl+X cut · Ctrl+V paste · R repeat · Del delete · Ctrl+A select all'],
      ['Text', 'Ctrl+L lyrics (Space next note · - next syllable · Shift+Space back · Enter done) · Ctrl+K chord symbol (Space next beat)'], ['Bars', 'Ins insert a bar before · Ctrl+Del delete the selected bars'], ['Play and view', 'Space play / stop · P piano · Ctrl++ / Ctrl+− zoom'], ['History', 'Ctrl+Z undo · Ctrl+Y or Ctrl+Shift+Z redo · Backspace (writing) undo the last note']];
    const t = el('table'); for (const [a, b] of rows) { const tr = el('tr'); tr.append(el('th', a), el('td', b)); t.append(tr); }
    card.append(t, close); helpBox.append(card); root.append(helpBox);
  }
  function help(show) { helpBox.hidden = !show; if (show) helpBox.querySelector('button').focus(); else sheet.focus({ preventScroll: true }); }
  if (!store.get('openpiano-editor-tip')) {
    const tip = el('div', undefined, 'se-tip'), ok = el('button', 'Got it', 'secondary'); ok.type = 'button';
    tip.append(el('span', coarse ? 'Tap a note to select it. To write notes, tap ✎ Write notes, choose a length, then tap the staff or a piano key.' : 'Click a note to select it. Press N (or ✎ Write notes) to write: choose a length, then type A–G, click the staff or use the piano. ? shows every shortcut.'), ok);
    ok.onclick = () => { tip.remove(); store.set('openpiano-editor-tip', '1'); sheet.focus(); };
    sheetWrap.append(tip);
  }

  // ---------------------------------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------------------------------
  const selNote = () => S.sel?.kind === 'note' ? model.byId(doc, S.sel.id) : null;
  const rangeNotes = () => S.sel?.kind === 'range' ? model.range.notes(doc, S.sel.range) : [];
  // the note an action applies to: the selected note, the first note of a range, or the last note written
  const target = () => selNote() || (S.mode === 'input' && S.last && model.byId(doc, S.last)) || rangeNotes()[0] || null;
  const rangeLast = () => { const r = rangeNotes(); return r.length > 1 ? r[r.length - 1] : null; };
  const snapshot = () => ({ xml: model.serialize(doc), sel: S.sel, cursor: S.cursor && { ...S.cursor, part: null }, last: S.last, mode: S.mode });
  function commit(before) { S.undo.push(before); if (S.undo.length > 300) S.undo.shift(); S.redo.length = 0; S.dirty = true; }
  function rollback(before) {
    const back = new DOMParser().parseFromString(before.xml, 'application/xml'), next = doc.nextId;
    doc.replaceChild(doc.importNode(back.documentElement, true), doc.documentElement); doc.nextId = next;
  }
  // Run a change; a refused change leaves the score as it was and says why.
  function change(fn, { quiet } = {}) {
    stopPlay();
    const before = snapshot(); S.v++; doc.notice = null; S.pending = null;
    try { const r = fn(); S.v++; commit(before); if (doc.notice) { S.flash = doc.notice; doc.notice = null; } schedule(); return r ?? true; }
    catch (e) {
      rollback(before); S.v++; S.sel = before.sel; S.last = before.last;
      if (!(e instanceof model.EditError)) console.error(e);
      const msg = e instanceof model.EditError ? e.message : 'That change could not be made: ' + e.message;
      if (!quiet) { say(msg, true); S.pending = msg; } // kept if the sheet is redrawn just after
      return null;
    }
  }
  // an action on the selected note (or the note just written)
  function act(fn, { any } = {}) {
    const n = target() || (any ? doc.querySelector('note') : null);
    if (!n) { say(S.mode === 'input' ? 'Write a note first, or press Esc and click a note.' : 'Click a note or a rest on the sheet first.', true); return; }
    const r = change(() => fn(n));
    if (r && r !== true && r.nodeType === 1) selectNote(r);
    else if (r) keepSel();
  }
  // an action on each selected note (a range: every note in it)
  function forNotes(fn, heads) {
    const list = S.sel?.kind === 'range' ? [...new Set(model.range.events(doc, S.sel.range).filter(e => !e.rest && !e.grace).map(e => heads ? e.head : e.head))] : [target()].filter(Boolean);
    if (!list.length) { say('Select notes first.', true); return; }
    change(() => { for (const n of list) fn(n); }); keepSel();
  }
  const keepSel = () => { if (S.sel?.kind === 'note' && !model.byId(doc, S.sel.id)) S.sel = null; schedule(); };

  function selectNote(n, hearIt) {
    if (!n) { S.sel = null; schedule(); return; }
    S.sel = { kind: 'note', id: n.getAttribute('id') }; S.anchor = null;
    if (hearIt) hear(n);
    schedule(true);
  }
  function selectRange(r) { S.sel = { kind: 'range', range: r }; schedule(); }
  function setMode(mode) {
    if (mode === S.mode) return;
    if (mode === 'input') {
      const n = selNote() || rangeNotes()[0], e = n && model.eventOf(n), part = part0();
      if (e) { const voices = model.staffVoices(part, e.staff); S.voice = Math.max(0, voices.indexOf(e.voice)); S.cursor = { part, staff: e.staff, voice: e.voice, q: model.timeOf(e) }; }
      else if (!S.cursor) { const voices = model.staffVoices(part, '1'); S.cursor = { part, staff: '1', voice: voices[S.voice] || voices[0], q: 0 }; }
      S.last = null; S.mode = 'input';
      if (coarse && piano.hidden) togglePiano();
    } else {
      S.mode = 'select'; const last = S.last && model.byId(doc, S.last);
      if (last) S.sel = { kind: 'note', id: S.last };
      shadow.hidden = shadowLabel.hidden = true;
    }
    schedule(true);
  }
  // ---- note input ----
  function enter(what, { chordAdd } = {}) {
    if (!S.cursor) return;
    if (chordAdd) {
      const last = S.last && model.byId(doc, S.last); if (!last) { say('Write a note first, then add notes to its chord.', true); return; }
      const r = change(() => what.letter ? ops.letter(doc, last, what.letter, true) : ops.addPitch(doc, last, what.pitches[0]));
      if (r && r.nodeType === 1) { hear(r); schedule(); } return;
    }
    const len = S.dur * (S.dotted ? 1.5 : 1);
    S.cursor.part = part0();
    const r = change(() => ops.enter(doc, S.cursor, len, what));
    if (r) { S.cursor = r.next; S.last = r.note?.getAttribute('id') || null; if (r.note && !what.rest) hear(r.note); schedule(true); }
  }
  function cursorMove(dir, bar) {
    const c = S.cursor; if (!c) return; c.part = part0();
    const evs = timedAll().filter(e => e.staff === c.staff && !e.grace);
    if (bar) { const st = model.starts(c.part), i = st.findIndex(s => c.q < s.t + s.len - 1e-9), j = Math.max(0, Math.min(st.length - 1, (i < 0 ? st.length - 1 : i) + dir)); c.q = st[j].t; }
    else {
      const times = [...new Set(evs.filter(e => e.voice === c.voice || true).map(e => +e.q.toFixed(6)))].sort((a, b) => a - b);
      const end = model.scoreEnd(c.part);
      if (dir > 0) c.q = times.find(t => t > c.q + 1e-6) ?? end; else c.q = [...times].reverse().find(t => t < c.q - 1e-6) ?? 0;
    }
    S.last = null; schedule(true);
  }
  // ---- toolbar actions (each works in both modes) ----
  function duration(q) {
    S.dur = q; S.dotted = false;
    if (S.mode === 'select') { const n = target(); if (n) act(x => ops.length(doc, x, q)); else syncTools(); }
    else syncTools();
  }
  function dot() {
    if (S.mode === 'input') { S.dotted = !S.dotted; syncTools(); return; }
    act(n => ops.dot(doc, n));
  }
  function restAction() {
    if (S.mode === 'input') { enter({ rest: true }); return; }
    if (S.sel?.kind === 'range') { change(() => model.range.clear(doc, S.sel.range)); schedule(); return; }
    act(n => ops.rest(doc, n));
  }
  function accidental(a) {
    if (S.sel?.kind === 'range') { forNotes(n => ops.accidental(doc, n, a)); return; }
    act(n => { ops.accidental(doc, n, a); hear(n); return n; });
  }
  function tieAction() {
    if (S.mode === 'input' && S.last) { // a tied note of the same pitch at the cursor
      const last = model.byId(doc, S.last), e = last && model.eventOf(last); if (!e || e.rest) return;
      const pitches = e.notes.map(model.pitchOf), from = S.last;
      const len = S.dur * (S.dotted ? 1.5 : 1); S.cursor.part = part0();
      const r = change(() => { const out = ops.enter(doc, S.cursor, len, { pitches }); const a = model.byId(doc, from); if (a) for (const n of model.eventOf(a).notes) if (!n.querySelector(':scope > tie[type="start"]')) ops.tie(doc, n); return out; });
      if (r) { S.cursor = r.next; S.last = r.note?.getAttribute('id') || null; schedule(true); }
      return;
    }
    act(n => ops.tie(doc, n));
  }
  function tupletAction(k) {
    if (S.mode === 'input') {
      const len = S.dur * (S.dotted ? 1.5 : 1); S.cursor.part = part0();
      const r = change(() => { const w = ops.enter(doc, S.cursor, len, { rest: true }); return ops.tuplet(doc, w.note, k); });
      if (r) { S.last = null; S.flash = `A ${k === 3 ? 'triplet' : k + '-tuplet'} is ready at the cursor: write its ${k} notes (each takes the tuplet's length).`; schedule(true); }
      return;
    }
    act(n => ops.tuplet(doc, n, k));
  }
  function voiceAction(i) {
    if (S.mode === 'input') { S.voice = i; const v = voicesOf(S.cursor.staff)[i]; if (v) S.cursor.voice = v; S.last = null; schedule(true); return; }
    S.voice = i;
    if (S.sel?.kind === 'range') { const heads = model.range.events(doc, S.sel.range).filter(e => !e.rest && !e.grace).map(e => e.head); change(() => { for (const h of heads) if (h.isConnected) ops.voice(doc, h, i); }); schedule(); return; }
    if (target()) act(n => ops.voice(doc, n, i)); else syncTools();
  }
  function copy(cut) {
    const r = S.sel?.kind === 'range' ? S.sel.range : rangeOfNote(selNote());
    if (!r) { say('Select notes to copy (click a note, Shift+click another).', true); return; }
    try { S.clip = model.range.copy(doc, r); say(cut ? 'Cut.' : 'Copied. Select where it goes and paste (Ctrl+V).'); } catch (e) { say(e.message, true); return; }
    if (cut) { change(() => model.range.clear(doc, r)); schedule(); }
  }
  function paste() {
    if (!S.clip) { say('Copy something first (Ctrl+C).', true); return; }
    const where = pastePoint(); if (!where) { say('Click the note or rest where the paste starts.', true); return; }
    const r = change(() => model.range.paste(doc, S.clip, where));
    if (r) { selectRange(r.range); say('Pasted.'); }
  }
  function pastePoint() {
    if (S.mode === 'input' && S.cursor) return { part: part0(), staff: S.cursor.staff, q: S.cursor.q };
    if (S.sel?.kind === 'range') return { part: part0(), staff: S.sel.range.staves[0], q: S.sel.range.from };
    const n = selNote(), e = n && model.eventOf(n); return e ? { part: part0(), staff: e.staff, q: model.timeOf(e) } : null;
  }
  function rangeOfNote(n) { const e = n && model.eventOf(n); if (!e) return null; const q = model.timeOf(e), len = e.dur / model.attributesAt(e.measure).div; return { part: part0(), staves: [e.staff], from: q, to: q + Math.max(len, 1e-3) }; }
  function del() {
    if (S.sel?.kind === 'range') { change(() => model.range.clear(doc, S.sel.range)); schedule(); return; }
    const n = target(); if (!n) { say('Click a note or rest first.', true); return; }
    const r = change(() => ops.remove(doc, n)); if (r && r.nodeType === 1) selectNote(r); else if (r) { S.sel = null; schedule(); }
  }
  function deleteBars() {
    const part = part0(), list = [...part.children].filter(c => c.tagName === 'measure');
    let a, b;
    if (S.sel?.kind === 'range') { const st = model.starts(part); a = st.findIndex(s => S.sel.range.from < s.t + s.len - 1e-9); b = st.findIndex(s => S.sel.range.to - 1e-9 <= s.t + s.len); if (b < 0) b = st.length - 1; }
    else { const n = target(); if (!n) { say('Select the bars to delete.', true); return; } a = b = list.indexOf(n.parentNode); }
    const r = change(() => ops.deleteMeasures(doc, a, b));
    if (r) selectNote(r === true ? null : r);
  }
  function repeatSel() {
    const r = S.sel?.kind === 'range' ? S.sel.range : rangeOfNote(selNote()); if (!r) return;
    let clip; try { clip = model.range.copy(doc, r); } catch (e) { say(e.message, true); return; }
    const res = change(() => model.range.paste(doc, clip, { part: part0(), staff: r.staves[0], q: r.to }));
    if (res) selectRange(res.range);
  }
  function transpose(kind, d) {
    if (S.sel?.kind === 'range') { change(() => model.range.transpose(doc, S.sel.range, kind, d)); schedule(); hearRange(); return; }
    act(n => { if (kind === 'chromatic') ops.chromatic(doc, n, d); else ops.step(doc, n, kind === 'octave' ? 7 * d : d); hear(n); return n; });
  }
  // the key signature where notes are being written or changed
  function fifthsHere() {
    let m = null;
    if (S.mode === 'input' && S.cursor) m = model.locate(part0(), Math.min(S.cursor.q, model.scoreEnd(part0()) - 1e-6))?.measure;
    const n = target(); if (!m && n) m = n.parentNode;
    return model.attributesAt(m || doc.querySelector('measure')).fifths;
  }
  function keyPress(m, shift) {
    const p = model.spell(m, fifthsHere());
    if (S.mode === 'input') { enter({ pitches: [p] }, { chordAdd: shift }); return; }
    const n = target(); if (!n) { hearMidi([m]); say('Click a note first to change it, or press N to write notes.'); return; }
    if (shift) { act(x => { const r = ops.addPitch(doc, x, p); hear(r); return r; }); return; }
    act(x => { ops.pitch(doc, x, p); hear(x); return x; });
  }

  // ---------------------------------------------------------------------------------------------
  // Lyrics and chord symbols typed on the sheet (as in MuseScore)
  // ---------------------------------------------------------------------------------------------
  function textEntry(kind) {
    let n = target(); if (!n) { say('Click the note where the ' + (kind === 'lyric' ? 'lyrics start.' : 'chord symbol goes.'), true); return; }
    let e = model.eventOf(n);
    if (kind === 'lyric' && (e.rest || e.grace)) { const next = textNext(e, 1, true); if (!next) { say('Lyrics go under notes. Click a note first.', true); return; } n = next.head; e = next; }
    if (S.mode === 'input') setMode('select');
    S.sel = { kind: 'note', id: e.head.getAttribute('id') };
    const prev = kind === 'lyric' ? textNext(e, -1, true) : null, pl = prev && model.lyricOf(prev.head);
    S.text = { kind, id: e.head.getAttribute('id'), hyphen: !!pl && (pl.syllabic === 'begin' || pl.syllabic === 'middle') };
    textIn.value = kind === 'lyric' ? (model.lyricOf(e.head)?.text || '') : (model.chordOf(e.head) || '');
    textIn.placeholder = kind === 'lyric' ? 'lyric' : 'e.g. Am7';
    textIn.className = 'se-textin se-text-' + kind; textIn.hidden = false;
    schedule(true); setTimeout(() => { textIn.focus(); textIn.select(); }, 0);
    S.textHint = (kind === 'lyric' ? 'Type the syllable. Space: next note · -: next syllable · Shift+Space: back · Enter: done.' : 'Type a chord symbol (C, F#m7, Bbmaj7, G7sus4, C/E). Space: next beat · Shift+Space: back · Enter: done.');
  }
  // the next (or previous) note of the same staff and voice for lyrics; any note or rest of the staff for chords
  function textNext(e, dir, notesOnly) {
    const list = timedAll().filter(x => x.staff === e.staff && !x.grace && (notesOnly ? !x.rest && x.voice === e.voice : x.voice === e.voice || !x.rest)).sort((a, b) => a.q - b.q);
    const q = model.timeOf(e), seen = new Set(), times = list.filter(x => { const k = x.q.toFixed(6); if (seen.has(k)) return false; seen.add(k); return true; });
    return dir > 0 ? times.find(x => x.q > q + 1e-6) || null : [...times].reverse().find(x => x.q < q - 1e-6) || null;
  }
  function textCommit(how) {
    const T = S.text; if (!T) return;
    const n = model.byId(doc, T.id), value = textIn.value;
    if (n) {
      if (T.kind === 'lyric') {
        const syl = how === 'hyphen' ? (T.hyphen ? 'middle' : 'begin') : (T.hyphen ? 'end' : 'single');
        const had = model.lyricOf(n);
        if ((value.trim() || had) && !(had && had.text === value.trim() && had.syllabic === syl)) change(() => ops.lyric(doc, n, value, syl));
        if (value.trim()) T.hyphen = how === 'hyphen';
      } else if (value.trim() !== (model.chordOf(n) || '')) {
        const r = change(() => ops.chordSymbol(doc, n, value));
        if (!r) { textIn.focus(); textIn.select(); return false; }
      }
    }
    return true;
  }
  function textMove(dir) {
    const T = S.text, n = model.byId(doc, T.id), e = n && model.eventOf(n), next = e && textNext(e, dir, T.kind === 'lyric');
    if (!next) { textClose(); say(dir > 0 ? 'That was the last note.' : 'That was the first note.'); return; }
    T.id = next.head.getAttribute('id'); S.sel = { kind: 'note', id: T.id };
    if (dir < 0 && T.kind === 'lyric') { const p = textNext(next, -1, true), pl = p && model.lyricOf(p.head); T.hyphen = !!pl && (pl.syllabic === 'begin' || pl.syllabic === 'middle'); }
    textIn.value = T.kind === 'lyric' ? (model.lyricOf(next.head)?.text || '') : (model.chordOf(next.head) || '');
    schedule(true); textIn.focus(); textIn.select();
  }
  function textClose() { S.text = null; textIn.hidden = true; schedule(); sheet.focus({ preventScroll: true }); }
  function placeText() {
    const T = S.text; if (!T || !S.geo) return;
    const st = S.geo.staves.find(s => s.items.some(i => i.id === T.id)), it = st?.items.find(i => i.id === T.id);
    if (!it) { textIn.hidden = true; return; }
    const y = T.kind === 'lyric' ? st.bottom + st.sp * 1.6 : st.top - st.sp * 4.6;
    Object.assign(textIn.style, { left: it.x - st.sp * 1.5 + 'px', top: y + 'px', fontSize: Math.max(12, st.sp * 1.25) + 'px' });
    textIn.hidden = false;
  }
  textIn.addEventListener('keydown', ev => {
    const k = ev.key, stop = () => { ev.preventDefault(); ev.stopPropagation(); };
    if (k === 'Enter') { stop(); if (textCommit('space') !== false) textClose(); return; }
    if (k === 'Escape') { stop(); if (textCommit('space') === false) S.pending = null; textClose(); return; } // a symbol that cannot be read is dropped
    if (k === ' ' || k === 'Tab') { stop(); const back = ev.shiftKey; if (textCommit(back ? 'stay' : 'space') !== false) textMove(back ? -1 : 1); return; }
    if (k === '-' && S.text?.kind === 'lyric') { stop(); if (textCommit('hyphen') !== false) textMove(1); return; }
    if ((ev.ctrlKey || ev.metaKey) && (k === 'z' || k === 'Z')) { stop(); textClose(); restore(S.undo, S.redo); }
  });
  textIn.addEventListener('blur', () => { setTimeout(() => { if (S.text && document.activeElement !== textIn) { textCommit('space'); textClose(); } }, 120); });

  // ---------------------------------------------------------------------------------------------
  // Undo
  // ---------------------------------------------------------------------------------------------
  function restore(from, to) {
    stopPlay();
    if (!from.length) { say('Nothing to ' + (from === S.undo ? 'undo.' : 'redo.')); return; }
    const step = from.pop(); to.push(snapshot()); rollback(step); S.v++;
    S.sel = step.sel; S.last = step.last;
    if (step.cursor) S.cursor = { ...step.cursor, part: part0() };
    S.dirty = S.undo.length > 0 || to === S.undo;
    if (S.sel?.kind === 'note' && !model.byId(doc, S.sel.id)) S.sel = null;
    if (S.sel?.kind === 'range') S.sel.range.part = part0();
    schedule(true);
  }

  // ---------------------------------------------------------------------------------------------
  // Sound
  // ---------------------------------------------------------------------------------------------
  let audio = null;
  async function audioReady(midis) {
    if (!window.PianoGrand) return null;
    if (!audio) audio = new AudioContext();
    if (audio.state === 'suspended') await audio.resume();
    await window.PianoGrand.load(audio, midis);
    return audio;
  }
  async function hearMidi(midis) { if (!S.sound || !midis.length) return; try { const a = await audioReady(midis); if (a) for (const m of midis) window.PianoGrand.play(a, m, a.currentTime, 0.7, 80); } catch {} }
  function hear(n) { const e = n && n.isConnected && model.eventOf(n); if (!e || e.rest) return; hearMidi(e.notes.map(x => model.pitchOf(x)).filter(Boolean).map(model.midiOf)); }
  function hearRange() { const evs = rangeNotes().slice(0, 6); hearMidi(evs.map(n => model.pitchOf(n)).filter(Boolean).map(model.midiOf)); }

  async function togglePlay() { if (S.playing) { stopPlay(); return; } play(); }
  // the notes as practice plays them: repeats and endings followed (the practice engine unfolds
  // them), each tied back to its note on the sheet; as written when the engine cannot
  function performed() {
    const bpm = model.sound(doc).bpm, E = window.PianoImportEngine;
    if (E) try {
      const r = E.parse(model.serialize(doc)), ids = new Map();
      for (const m of r.xml.matchAll(/<note\b([^>]*)>/g)) { const id = m[1].match(/ id="(e\d+)"/)?.[1], imp = m[1].match(/data-import-id="(\d+)"/)?.[1]; if (id && imp != null) ids.set(Number(imp), id); }
      return { notes: r.notes.map(n => ({ q: n.beat, len: n.duration, midi: n.midi, ids: [ids.get(n.id)].filter(Boolean) })).sort((a, b) => a.q - b.q), bpm, unfolded: r.performedMeasures !== r.writtenMeasures };
    } catch {}
    return { ...model.sound(doc), unfolded: false };
  }
  async function play() {
    const snd = performed(); if (!snd.notes.length) { say('There are no notes to play yet.'); return; }
    // start at the first time the selected note (or the next note after the selection) is played
    let startId = null; const n = target();
    const firstNoteFrom = q => timedAll().filter(x => !x.rest && x.q >= q - 1e-6).sort((a, b) => a.q - b.q)[0]?.head.getAttribute('id');
    if (S.sel?.kind === 'range') startId = firstNoteFrom(S.sel.range.from);
    else if (n) { const e = model.eventOf(n); startId = e && !e.rest ? e.head.getAttribute('id') : e ? firstNoteFrom(model.timeOf(e)) : null; }
    else if (S.mode === 'input' && S.cursor) startId = firstNoteFrom(S.cursor.q);
    const hit = startId && snd.notes.find(x => x.ids.includes(startId));
    const from = hit ? hit.q : 0, startBar = hit ? model.byId(doc, hit.ids[0])?.parentNode.getAttribute('number') : '1';
    const notes = snd.notes.filter(x => x.q >= from - 1e-6), spb = 60 / snd.bpm;
    say('Loading the piano sound…');
    let a; try { a = await audioReady([...new Set(notes.map(x => x.midi))]); } catch (err) { say(err.message, true); return; }
    if (!a) { say('Sound is not available here.', true); return; }
    const t0 = a.currentTime + 0.15, token = {}; S.playing = token;
    for (const x of notes) window.PianoGrand.play(a, x.midi, t0 + (x.q - from) * spb, Math.max(0.1, x.len * spb), 80);
    playB.replaceChildren(icon('stop')); playB.title = 'Stop (Space)'; say(`Playing from bar ${startBar} at ♩ = ${snd.bpm}${snd.unfolded ? ', with the repeats' : ''}… (Space stops)`);
    const lit = new Set();
    const tick = () => {
      if (S.playing !== token) return;
      const q = from + (a.currentTime - t0) / spb;
      const now = new Set(notes.filter(x => x.q <= q && x.q + x.len > q).flatMap(x => x.ids));
      for (const id of lit) if (!now.has(id)) { find(id)?.classList.remove('se-play'); lit.delete(id); }
      let first = null; for (const id of now) if (!lit.has(id)) { const g = find(id); if (g) { g.classList.add('se-play'); first = first || g; } lit.add(id); }
      if (first) follow(first);
      if (q > notes[notes.length - 1].q + notes[notes.length - 1].len + 0.5) { stopPlay(); say('Finished playing.'); return; }
      requestAnimationFrame(tick);
    };
    S.stopLit = () => { for (const id of lit) find(id)?.classList.remove('se-play'); lit.clear(); };
    requestAnimationFrame(tick);
  }
  function stopPlay() {
    if (!S.playing) return;
    S.playing = null; S.stopLit?.();
    if (audio) { const old = audio; audio = null; old.close().catch(() => {}); }
    playB.replaceChildren(icon('play')); playB.title = 'Play from the selection (Space)';
  }
  const barAt = q => { const st = startsAll(), i = st.findIndex(s => q < s.t + s.len - 1e-9); return st[i < 0 ? st.length - 1 : i].m.getAttribute('number'); };

  // ---------------------------------------------------------------------------------------------
  // MIDI keyboard
  // ---------------------------------------------------------------------------------------------
  let midiAccess = null, chordBuf = null;
  async function midi() {
    if (midiAccess) { for (const i of midiAccess.inputs.values()) i.onmidimessage = null; midiAccess = null; syncTools(); say('MIDI keyboard off.'); return; }
    if (!navigator.requestMIDIAccess) { say('This browser cannot use a MIDI keyboard (try Chrome, Edge or Firefox).', true); return; }
    try { midiAccess = await navigator.requestMIDIAccess({ sysex: false }); } catch { say('The MIDI keyboard was not allowed. Allow MIDI for this site in the browser settings.', true); return; }
    const hook = () => { for (const i of midiAccess.inputs.values()) i.onmidimessage = onMidi; const n = midiAccess.inputs.size; say(n ? `MIDI keyboard ready (${[...midiAccess.inputs.values()].map(i => i.name).join(', ')}). Notes you play are written at the cursor (press N), or change the selected note.` : 'No MIDI keyboard found. Plug one in; it is picked up automatically.'); };
    midiAccess.onstatechange = hook; hook(); syncTools();
  }
  function onMidi(ev) {
    const [st, m, vel] = ev.data; if ((st & 0xf0) !== 0x90 || !vel) return;
    if (chordBuf && performance.now() - chordBuf.t < 45) { chordBuf.notes.push(m); return; } // notes played together make a chord
    chordBuf = { t: performance.now(), notes: [m] };
    setTimeout(() => { const ns = chordBuf.notes; chordBuf = null; midiChord(ns); }, 50);
  }
  function midiChord(ms) {
    const fifths = fifthsHere(), ps = ms.sort((a, b) => a - b).map(m => model.spell(m, fifths));
    if (S.mode === 'input') { enter({ pitches: ps }); return; }
    const n = target(); if (!n) { hearMidi(ms); return; }
    act(x => { ops.pitch(doc, x, ps[0]); for (const p of ps.slice(1)) ops.addPitch(doc, x, p); hear(x); return x; });
  }

  // ---------------------------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------------------------
  let frame = 0, wantScroll = false;
  function schedule(scroll) { wantScroll = wantScroll || !!scroll; if (frame) return; frame = requestAnimationFrame(() => { frame = 0; render(); }); }
  // The sheet is drawn in sections of about eight bars, each engraved on its own; after a change
  // only the sections whose music changed are engraved again, so long scores stay quick to edit.
  const CH = 8, bounds = new Set(), drawn = new Map(), XS = new XMLSerializer(); let keySeq = 1;
  const barKey = m => { let k = m.getAttribute('id'); if (!k || !/^k\d+$/.test(k)) { k = 'k' + keySeq++; m.setAttribute('id', k); } else keySeq = Math.max(keySeq, Number(k.slice(1)) + 1); return k; };
  function sections() {
    const ms = [...part0().children].filter(c => c.tagName === 'measure'), small = ms.length <= 2 * CH, out = []; let cur = null;
    if (!small && !bounds.size) ms.forEach((m, i) => { if (i % CH === 0) bounds.add(barKey(m)); });
    ms.forEach((m, i) => {
      const k = barKey(m);
      if (!cur || (!small && (bounds.has(k) || cur.count >= 2 * CH))) { if (cur && !small) bounds.add(k); cur = { start: i, count: 0, first: k }; out.push(cur); }
      cur.count++;
    });
    return out;
  }
  function sectionXML(list) {
    const root = doc.documentElement, parts = [...root.children].filter(c => c.tagName === 'part');
    let headXML = `<score-partwise version="${root.getAttribute('version') || '4.0'}">`;
    for (const c of root.children) if (c.tagName !== 'part' && c.tagName !== 'credit') headXML += XS.serializeToString(c);
    // the part name ("Piano") is printed once, at the start of the score
    const quiet = headXML.replace(/<(part-name|part-abbreviation)([^>]*)>[^<]*<\/\1>/g, '<$1$2></$1>');
    const xmls = list.map((sec, i) => i ? quiet : headXML);
    for (const p of parts) {
      const ms = [...p.children].filter(c => c.tagName === 'measure'), carry = new Map(); let li = 0;
      ms.forEach((m, i) => {
        while (li < list.length && list[li].start + list[li].count <= i) li++;
        const sec = list[li]; if (!sec) return;
        if (i === sec.start) {
          xmls[li] += `<part id="${p.getAttribute('id')}">`;
          if (i > 0 && carry.size) { // the signatures and clefs in force where the section starts
            const cl = m.cloneNode(true), a = doc.createElement('attributes');
            for (const tag of ['divisions', 'key', 'time', 'staves']) if (carry.has(tag)) { const c = carry.get(tag).cloneNode(true); if (tag === 'time') c.setAttribute('print-object', 'no'); a.append(c); } // no time signature printed again
            for (const [k, c] of carry) if (k.startsWith('clef')) a.append(c.cloneNode(true));
            cl.insertBefore(a, cl.firstChild); xmls[li] += XS.serializeToString(cl);
          } else xmls[li] += XS.serializeToString(m);
        } else xmls[li] += XS.serializeToString(m);
        for (const at of m.children) if (at.tagName === 'attributes') for (const c of at.children) {
          if (['divisions', 'key', 'time', 'staves'].includes(c.tagName)) carry.set(c.tagName, c);
          else if (c.tagName === 'clef') carry.set('clef' + (c.getAttribute('number') || '1'), c);
        }
        if (i === sec.start + sec.count - 1) xmls[li] += '</part>';
      });
    }
    return xmls.map(x => x + '</score-partwise>');
  }
  function render() {
    const w = sheet.clientWidth || 900, px = S.zoom;
    if (w !== S.laidOut || px !== S.laidZoom) { tk.setOptions({ ...VIEW, pageWidth: Math.round(Math.max(280, w - 34) * 18 / px) }); S.laidOut = w; S.laidZoom = px; for (const d of drawn.values()) d.xml = null; }
    const top = sheet.scrollTop, list = sections(), xmls = sectionXML(list), used = new Set(), order = [];
    try {
      list.forEach((sec, i) => {
        let d = drawn.get(sec.first);
        if (!d || d.xml !== xmls[i]) {
          if (!tk.loadData(xmls[i])) throw new Error('The engraver could not read the edited score.');
          let html = ''; for (let p = 1; p <= tk.getPageCount(); p++) html += tk.renderToSVG(p);
          if (!d) { d = { el: el('div', undefined, 'se-section') }; drawn.set(sec.first, d); }
          d.el.innerHTML = html; d.xml = xmls[i]; d.geo = null;
        }
        d.start = sec.start; used.add(sec.first); order.push(d);
      });
    } catch (e) { say(e.message, true); }
    for (const [k, d] of drawn) if (!used.has(k)) { d.el.remove(); drawn.delete(k); }
    order.forEach((d, i) => { if (pages.children[i] !== d.el) pages.insertBefore(d.el, pages.children[i] || null); });
    S.order = order;
    sheet.scrollTop = top;
    measure(); decorate(); syncTools(); checkLater();
    if (wantScroll) { wantScroll = false; const g = S.mode === 'input' ? cursorBox : find(S.sel?.kind === 'note' ? S.sel.id : null); if (g) follow(g); }
  }
  const find = id => id ? pages.querySelector(`[data-id="${CSS.escape(id)}"]`) : null;
  function follow(g) {
    const r = g.getBoundingClientRect(), s = sheet.getBoundingClientRect(); if (!r.height && !r.width) return;
    if (r.top < s.top + 30 || r.bottom > s.bottom - 30) sheet.scrollTop += r.top - s.top - s.height / 3;
  }
  // where the staves and notes are: measured per section (relative to it), placed in the sheet's
  // own coordinates when the sections move
  function sectionGeo(d) {
    const base = d.el.getBoundingClientRect(), measures = [...part0().children].filter(c => c.tagName === 'measure');
    const staffMap = []; for (const p of doc.querySelectorAll('part')) { const a = model.attributesAt([...p.children].find(c => c.tagName === 'measure')); for (let s = 1; s <= a.staves; s++) staffMap.push({ part: p, staff: String(s) }); }
    const staves = [];
    [...d.el.querySelectorAll('g.measure')].forEach((gm, k) => {
      [...gm.querySelectorAll(':scope > g.staff')].forEach((gs, j) => {
        const lines = [...gs.children].filter(e => e.tagName === 'path').map(p => { const r = p.getBoundingClientRect(); return { y: r.top + r.height / 2 - base.top, x0: r.left - base.left, x1: r.right - base.left }; }).sort((a, b) => a.y - b.y);
        if (lines.length < 5) return;
        const items = [...gs.querySelectorAll('g.note, g.rest, g.mRest')].map(g => { const h = g.querySelector('g.notehead') || g, r = h.getBoundingClientRect(); return { id: g.dataset.id, x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top }; });
        const map = staffMap[j] || { part: part0(), staff: String(j + 1) };
        staves.push({ k, part: map.part, staff: map.staff, top: lines[0].y, bottom: lines[4].y, x0: Math.min(...lines.map(l => l.x0)), x1: Math.max(...lines.map(l => l.x1)), sp: (lines[4].y - lines[0].y) / 4, items });
      });
    });
    return staves;
  }
  function measure(all) {
    const measures = [...part0().children].filter(c => c.tagName === 'measure'), staves = [];
    for (const d of S.order || []) {
      if (!d.geo || all) d.geo = sectionGeo(d);
      const dx = pages.offsetLeft + d.el.offsetLeft, dy = pages.offsetTop + d.el.offsetTop;
      for (const s of d.geo) staves.push({ ...s, measure: measures[d.start + s.k], top: s.top + dy, bottom: s.bottom + dy, x0: s.x0 + dx, x1: s.x1 + dx, items: s.items.map(it => ({ id: it.id, x: it.x + dx, y: it.y + dy })) });
    }
    S.geo = { staves };
  }
  function decorate() {
    for (const g of pages.querySelectorAll('.se-sel, .se-chord, .se-range')) g.classList.remove('se-sel', 'se-chord', 'se-range', 'se-v1', 'se-v2', 'se-v3', 'se-v4');
    root.classList.toggle('se-input', S.mode === 'input');
    modeChip.textContent = S.mode === 'input' ? '✎ Writing' : 'Select';
    for (const k of keyEls.values()) k.classList.remove('on');
    const n = selNote();
    if (n) {
      const e = model.eventOf(n), vi = Math.max(0, voicesOf(e.staff).indexOf(e.voice)) + 1;
      for (const x of e.notes) find(x.getAttribute('id'))?.classList.add(x === n ? 'se-sel' : 'se-chord', 'se-v' + vi);
      for (const x of e.notes) { const p = model.pitchOf(x); if (p) keyEls.get(model.midiOf(p))?.classList.add('on'); }
      if (S.mode === 'select') say(S.flash || describe(n));
    } else if (S.sel?.kind === 'range') {
      const notes = rangeNotes(); for (const x of notes) find(x.getAttribute('id'))?.classList.add('se-range');
      const st = startsAll(), a = st.findIndex(s => S.sel.range.from < s.t + s.len - 1e-9), b = st.findIndex(s => S.sel.range.to - 1e-9 <= s.t + s.len);
      const bars = a === b || b < 0 ? `Bar ${st[a]?.m.getAttribute('number')}` : `Bars ${st[a]?.m.getAttribute('number')}–${st[b].m.getAttribute('number')}`;
      const hands = S.sel.range.staves.length > 1 ? 'both hands' : S.sel.range.staves[0] === '1' ? 'right hand' : 'left hand';
      const count = notes.filter(x => model.pitchOf(x)).length;
      if (S.mode === 'select') say(S.flash || `${bars} · ${hands} · ${count === 1 ? '1 note' : count + ' notes'} selected. Copy, delete, transpose with ↑ ↓, or choose a palette item.`);
    } else if (S.mode === 'select') say(S.flash || (coarse ? 'Tap a note or rest to select it, or tap ✎ Write notes.' : 'Click a note or rest to select it, or press N to write notes.'));
    if (S.mode === 'select') S.flash = null;
    if (S.text && S.mode === 'select') say(S.textHint);
    if (S.pending) { say(S.pending, true); S.pending = null; }
    placeText();
    if (S.mode === 'input') {
      const last = S.last && model.byId(doc, S.last); if (last) { const e = model.eventOf(last); for (const x of e?.notes || []) find(x.getAttribute('id'))?.classList.add('se-chord', 'se-v' + (S.voice + 1)); }
      placeCursor();
      const len = DURS.find(d => d.q === S.dur)?.name.toLowerCase() || 'note';
      say(S.flash || `Writing ${S.dotted ? 'dotted ' : ''}${len}s in voice ${S.voice + 1}, ${S.cursor?.staff === '2' ? 'left' : 'right'} hand, bar ${barAt(S.cursor?.q || 0)}. Type A–G, click the staff or play the piano; 0 for a rest; Esc to stop.`); S.flash = null;
    } else cursorBox.hidden = true;
    props.replaceChildren(propsPanel());
  }
  function placeCursor() {
    const c = S.cursor, G = S.geo; if (!c || !G) { cursorBox.hidden = true; return; }
    c.part = part0();
    const evs = timedAll().filter(e => e.staff === c.staff && !e.grace);
    const at = evs.find(e => e.voice === c.voice && Math.abs(e.q - c.q) < 1e-6) || evs.find(e => Math.abs(e.q - c.q) < 1e-6) || evs.find(e => e.q > c.q);
    let x, st;
    if (at) { const id = at.head.getAttribute('id'); st = G.staves.find(s => s.items.some(i => i.id === id)); const it = st?.items.find(i => i.id === id); x = it ? it.x : null; }
    else { st = [...G.staves].reverse().find(s => s.staff === c.staff); x = st ? st.x1 - 6 : null; }
    if (!st || x == null) { cursorBox.hidden = true; return; }
    const pad = st.sp * 2.2;
    Object.assign(cursorBox.style, { left: x - st.sp * 1.1 + 'px', top: st.top - pad + 'px', width: st.sp * 2.2 + 'px', height: st.bottom - st.top + 2 * pad + 'px' });
    cursorBox.className = 'se-cursor se-cv' + (S.voice + 1); cursorBox.hidden = false;
  }
  function syncTools() {
    undoB.disabled = !S.undo.length; redoB.disabled = !S.redo.length;
    writeB.setAttribute('aria-pressed', String(S.mode === 'input'));
    const n = S.mode === 'select' ? selNote() : null, e = n && model.eventOf(n);
    let q = S.dur, dotted = S.dotted;
    if (e && !e.grace) { const v = model.valueOf(e.dur / model.attributesAt(e.measure).div); if (v) { q = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 }[v.type]; dotted = v.dots > 0; } else q = null; }
    DURS.forEach((d, i) => durB[i].setAttribute('aria-pressed', String(d.q === q)));
    dotB.setAttribute('aria-pressed', String(!!dotted));
    let vi = S.voice; if (e) vi = Math.max(0, voicesOf(e.staff).indexOf(e.voice));
    voiceB.forEach((b, i) => b.setAttribute('aria-pressed', String(i === vi)));
    pianoB.setAttribute('aria-pressed', String(!piano.hidden)); midiB.setAttribute('aria-pressed', String(!!midiAccess));
    sideB.setAttribute('aria-pressed', String(root.classList.contains('se-side-open')));
    soundB.setAttribute('aria-pressed', String(S.sound)); soundB.replaceChildren(icon(S.sound ? 'sound' : 'mute'));
    pasteB.disabled = !S.clip;
  }
  // a short summary of the selection with the most used changes, at the top of the palettes
  function propsPanel() {
    const box = el('div'); const n = selNote() || (S.mode === 'input' && S.last && model.byId(doc, S.last));
    if (!n) { box.append(el('p', S.sel?.kind === 'range' ? 'Several notes selected: palette items apply to all of them.' : 'Nothing selected.', 'se-muted')); return box; }
    const e = model.eventOf(n); if (!e) return box;
    box.append(el('p', describe(n), 'se-props-what'));
    const ly = model.lyricOf(n), ch = model.chordOf(n);
    if (ly || ch) box.append(el('p', [ch ? 'Chord symbol ' + ch : '', ly ? `Lyric “${ly.text}${ly.syllabic === 'begin' || ly.syllabic === 'middle' ? '-' : ''}”` : ''].filter(Boolean).join(' · '), 'se-muted'));
    if (!e.rest) {
      const row = el('div', undefined, 'se-row'); row.append(el('span', 'Finger', 'se-muted'));
      const cur = n.querySelector('notations technical fingering')?.textContent;
      for (const f of ['1', '2', '3', '4', '5']) { const b = chip(f, 'Finger ' + f, () => act(x => ops.fingering(doc, x, cur === f ? null : f)), 'se-fing' + (cur === f ? ' on' : '')); row.append(b); }
      box.append(row);
      const row2 = el('div', undefined, 'se-row');
      const staves = model.attributesAt(e.measure).staves;
      if (staves > 1) row2.append(chip(e.staff === '1' ? 'Move to left hand' : 'Move to right hand', 'Other hand (H)', () => act(x => ops.hand(doc, x))));
      row2.append(chip('Respell', 'Same key, other name (J)', () => act(x => ops.respell(doc, x))));
      box.append(row2);
    }
    return box;
  }
  // practice check after each change: a problem is shown, not forced on the person
  let checkTimer = 0;
  function checkLater() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => (window.requestIdleCallback || (f => f()))(() => {
      const E = window.PianoImportEngine; if (!E) return;
      let problem = null; try { E.parse(model.clean(doc)); } catch (e) { problem = e.message; }
      S.problem = problem; warn.hidden = !problem; warn.textContent = problem ? '⚠ ' + problem : '';
      warn.title = problem ? 'Practice may not follow this part of the score yet. Fix it, or undo the last change.' : '';
    }), 1200);
  }
  warn.onclick = () => say((S.problem || '') + ' Fix it, or undo the last change (Ctrl+Z).', true);
  function zoom(d) { S.zoom = Math.max(7, Math.min(24, S.zoom + d * 2)); store.set('openpiano-editor-zoom', String(S.zoom)); schedule(true); }
  function togglePiano() {
    piano.hidden = !piano.hidden; syncTools();
    if (!piano.hidden) { const n = target(), p = n && model.pitchOf(n), k = keyEls.get(p ? model.midiOf(p) : 60); if (k) piano.scrollLeft = k.offsetLeft - piano.clientWidth / 2; }
    schedule();
  }

  // ---------------------------------------------------------------------------------------------
  // Mouse and touch on the sheet
  // ---------------------------------------------------------------------------------------------
  const local = ev => { const b = sheet.getBoundingClientRect(); return { x: ev.clientX - b.left + sheet.scrollLeft, y: ev.clientY - b.top + sheet.scrollTop }; };
  // the staff under a point (within a few spaces of it), and its nearest note or rest
  function staffAt(p) {
    let best = null, bestD = Infinity;
    for (const s of S.geo?.staves || []) {
      if (p.x < s.x0 - 4 || p.x > s.x1 + 4) continue;
      const d = p.y < s.top ? s.top - p.y : p.y > s.bottom ? p.y - s.bottom : 0;
      if (d < bestD && d < s.sp * 6) { bestD = d; best = s; }
    }
    return best;
  }
  function nearestItem(s, p, maxD) { let best = null, bestD = maxD ?? Infinity; for (const it of s.items) { const d = Math.hypot((it.x - p.x) * 1, (it.y - p.y) * 0.35); if (d < bestD) { bestD = d; best = it; } } return best; }
  function pitchAt(s, y) {
    const a = model.attributesAt(s.measure), sign = a.clefs[s.staff] || (s.staff === '2' ? 'F' : 'G'), line = a.clefLines[s.staff] || (sign === 'F' ? 4 : sign === 'C' ? 3 : 2);
    const ref = sign === 'F' ? 24 : sign === 'C' ? 28 : 32, bottomD = ref - 2 * (line - 1);
    const steps = Math.round((s.bottom - y) / (s.sp / 2)), D = bottomD + steps;
    return { p: model.fromDiatonic(D, a.fifths), steps };
  }
  function itemTime(it) { const n = model.byId(doc, it.id), e = n && model.eventOf(n); return e ? { e, q: model.timeOf(e) } : null; }
  let drag = null;
  sheet.addEventListener('pointerdown', ev => {
    if (ev.button > 0) return;
    stopPlay();
    const p = local(ev), s = staffAt(p);
    if (S.mode === 'input') {
      if (!s) return;
      const it = nearestItem(s, p); if (!it) return;
      const t = itemTime(it); if (!t) return;
      const { p: pitch } = pitchAt(s, p.y); if (!model.ops || model.midiOf(pitch) < 21 || model.midiOf(pitch) > 108) return;
      ev.preventDefault();
      const voices = voicesOf(s.staff), v = voices[S.voice] || voices[0];
      if (ev.shiftKey) { // add to the chord at that place
        const here = model.eventAt(doc, part0(), s.staff, v, t.q);
        if (here && !here.rest) { const r = change(() => ops.addPitch(doc, here.head, pitch)); if (r) { S.last = r.getAttribute('id'); hear(r); schedule(); } return; }
      }
      S.cursor = { part: part0(), staff: s.staff, voice: v, q: t.q };
      enter({ pitches: [pitch] });
      return;
    }
    // select mode
    const hit = ev.target.closest?.('g.note, g.rest, g.mRest, g.chord');
    let id = null;
    if (hit) { id = hit.classList.contains('chord') ? null : hit.dataset.id; }
    if (!id && s) { const it = nearestItem(s, p, s.sp * 2.4); id = it?.id || null; }
    if (hit?.classList.contains('chord')) { const notes = [...hit.querySelectorAll('g.note')]; let bd = Infinity; for (const g of notes) { const r = (g.querySelector('g.notehead') || g).getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - ev.clientY); if (d < bd) { bd = d; id = g.dataset.id; } } }
    const n = id && model.byId(doc, id);
    if (!n) {
      if (s) { // an empty part of a bar: the whole bar on that staff
        const st = model.starts(s.part).find(x => x.m === s.measure); if (st) { const r = { part: s.part, staves: [s.staff], from: st.t, to: st.t + st.len }; if (ev.shiftKey && S.sel) extendTo(r.from, r.to - 1e-6, s.staff); else { S.anchor = { q: st.t, staff: s.staff }; selectRange(r); } }
      } else { S.sel = null; schedule(); }
      return;
    }
    if (ev.shiftKey && S.sel) { const e = model.eventOf(n), q = model.timeOf(e); extendTo(q, q + e.dur / model.attributesAt(e.measure).div, e.staff); return; }
    selectNote(n, true); sheet.focus({ preventScroll: true });
    if (!model.pitchOf(n) || !s) return;
    ev.preventDefault();
    const g = find(id); drag = { y: ev.clientY, steps: 0, half: s.sp / 2 * (sheet.getBoundingClientRect().height ? 1 : 1), g, pointer: ev.pointerId, unit: null };
    const ctm = g?.getScreenCTM?.(); drag.unit = ctm?.d ? drag.half / ctm.d : 90;
    sheet.setPointerCapture?.(ev.pointerId);
  });
  function extendTo(q0, q1, staff) {
    let a = S.anchor;
    if (!a) { if (S.sel?.kind === 'note') { const e = model.eventOf(selNote()); a = { q: model.timeOf(e), staff: e.staff, end: model.timeOf(e) + e.dur / model.attributesAt(e.measure).div }; } else if (S.sel?.kind === 'range') a = { q: S.sel.range.from, staff: S.sel.range.staves[0], end: S.sel.range.to }; else return; }
    S.anchor = a;
    const from = Math.min(a.q, q0), to = Math.max(a.end ?? a.q, q1), lo = Math.min(Number(a.staff), Number(staff)), hi = Math.max(Number(a.staff), Number(staff));
    selectRange({ part: part0(), staves: Array.from({ length: hi - lo + 1 }, (_, i) => String(lo + i)), from, to: Math.max(to, from + 1e-3) });
  }
  sheet.addEventListener('pointermove', ev => {
    if (drag && ev.pointerId === drag.pointer) {
      const steps = Math.round((drag.y - ev.clientY) / drag.half); if (steps === drag.steps) return;
      drag.steps = steps; if (drag.g) drag.g.setAttribute('transform', `translate(0 ${-steps * drag.unit})`);
      const n = selNote(), p = n && model.pitchOf(n); if (p) say(`Drop to make it ${model.noteName(model.fromDiatonic(model.diatonic(p) + steps, model.attributesAt(n.parentNode).fifths))}`);
      return;
    }
    if (S.mode !== 'input' || ev.pointerType === 'touch') { shadow.hidden = shadowLabel.hidden = true; return; }
    const p = local(ev), s = staffAt(p); if (!s) { shadow.hidden = shadowLabel.hidden = true; return; }
    const it = nearestItem(s, p); if (!it) return;
    const { p: pitch, steps } = pitchAt(s, p.y), y = s.bottom - steps * s.sp / 2;
    Object.assign(shadow.style, { left: it.x - s.sp * 0.65 + 'px', top: y - s.sp / 2 + 'px', width: s.sp * 1.3 + 'px', height: s.sp + 'px' });
    shadow.classList.toggle('ledger', steps < -1 || steps > 9);
    shadow.className = 'se-shadow se-cv' + (S.voice + 1) + (steps < -1 || steps > 9 ? ' ledger' : '');
    shadowLabel.textContent = model.noteName(pitch); Object.assign(shadowLabel.style, { left: it.x + s.sp + 'px', top: y - s.sp * 1.6 + 'px' });
    shadow.hidden = shadowLabel.hidden = false;
  });
  sheet.addEventListener('pointerleave', () => { shadow.hidden = shadowLabel.hidden = true; });
  const endDrag = ev => { if (!drag || ev.pointerId !== drag.pointer) return; const steps = drag.steps; drag = null; if (steps) act(n => { ops.step(doc, n, steps); hear(n); return n; }); };
  sheet.addEventListener('pointerup', endDrag); sheet.addEventListener('pointercancel', endDrag);
  sheet.addEventListener('scroll', () => { shadow.hidden = shadowLabel.hidden = true; }, { passive: true });

  // ---------------------------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------------------------
  function neighbour(dir, bar) {
    const n = selNote() || rangeNotes()[dir > 0 ? rangeNotes().length - 1 : 0]; if (!n) { const first = doc.querySelector('note'); if (first) selectNote(first, true); return; }
    const e = model.eventOf(n), part = part0(), list = timedAll().filter(x => x.staff === e.staff).sort((a, b) => a.q - b.q || (a.voice > b.voice ? 1 : -1));
    const i = list.findIndex(x => x.head === e.head);
    let to = null;
    if (bar) { const st = model.starts(part), mi = st.findIndex(s => s.m === e.measure), tm = st[mi + dir]; if (tm) to = list.find(x => x.measure === tm.m); }
    else to = list[i + dir];
    if (to) selectNote(to.head, true);
  }
  function chordStep(dir) { const n = selNote(), e = n && model.eventOf(n); if (!e || e.notes.length < 2) return; const sorted = [...e.notes].sort((a, b) => model.midiOf(model.pitchOf(a)) - model.midiOf(model.pitchOf(b))), i = sorted.indexOf(n), to = sorted[i + dir]; if (to) selectNote(to, true); }
  function extendBy(dir) {
    const notes = selNote() ? [selNote()] : rangeNotes(); if (!notes.length) return;
    const part = part0(), staff = S.sel.kind === 'range' ? S.sel.range.staves[0] : model.eventOf(notes[0]).staff;
    const times = [...new Set(timedAll().filter(x => x.staff === staff && !x.grace).map(x => +x.q.toFixed(6)))].sort((a, b) => a - b), end = model.scoreEnd(part);
    let from, to;
    if (S.sel.kind === 'range') { from = S.sel.range.from; to = S.sel.range.to; } else { const e = model.eventOf(notes[0]); from = model.timeOf(e); to = from + e.dur / model.attributesAt(e.measure).div; }
    if (!S.anchor) S.anchor = { q: from, staff, end: to };
    if (dir > 0) { if (to - 1e-6 > S.anchor.q || from >= S.anchor.q - 1e-6) to = times.find(t => t > to + 1e-6) ?? end; else from = times.find(t => t > from + 1e-6) ?? from; }
    else { if (from + 1e-6 < S.anchor.q || to <= (S.anchor.end ?? S.anchor.q) + 1e-6) from = [...times].reverse().find(t => t < from - 1e-6) ?? 0; else to = [...times].reverse().find(t => t < to - 1e-6 && t > from) ?? to; }
    selectRange({ part, staves: S.sel.kind === 'range' ? S.sel.range.staves : [staff], from, to });
  }
  root.addEventListener('keydown', ev => {
    const tgt = ev.target, k = ev.key, mod = ev.ctrlKey || ev.metaKey, typing = tgt.matches('input, textarea, select');
    if (tgt === textIn) return; // the lyric / chord box has its own keys
    if (typing) { if (k === 'Escape' || k === 'Enter') { tgt.blur(); sheet.focus(); } return; }
    if (!helpBox.hidden) { if (k === 'Escape') { ev.preventDefault(); help(false); } return; }
    const go = f => { ev.preventDefault(); ev.stopPropagation(); f(); };
    if (tgt.matches('button, summary') && (k === 'Enter' || k === ' ')) return;
    if (mod && !ev.altKey && (k === 'z' || k === 'Z')) return go(() => ev.shiftKey ? restore(S.redo, S.undo) : restore(S.undo, S.redo));
    if (mod && (k === 'y' || k === 'Y')) return go(() => restore(S.redo, S.undo));
    if (mod && (k === 'c' || k === 'C')) return go(() => copy());
    if (mod && (k === 'x' || k === 'X')) return go(() => copy(true));
    if (mod && (k === 'v' || k === 'V')) return go(() => paste());
    if (mod && (k === 'a' || k === 'A')) return go(() => { const p = part0(), st = model.starts(p); selectRange(model.range.ofMeasures(doc, p, 0, st.length - 1)); });
    if (mod && (k === '=' || k === '+')) return go(() => zoom(1));
    if (mod && k === '-') return go(() => zoom(-1));
    if (mod && k === '3') return go(() => tupletAction(3));
    if (mod && (k === 'l' || k === 'L')) return go(() => textEntry('lyric'));
    if (mod && (k === 'k' || k === 'K')) return go(() => textEntry('chord'));
    if (mod && k === 'Delete') return go(() => deleteBars());
    if (mod && ev.altKey && /^Digit[1-4]$/.test(ev.code)) return go(() => voiceAction(Number(ev.code.slice(5)) - 1));
    if (k === 'Escape') return go(() => { if (S.playing) stopPlay(); else if (S.mode === 'input') setMode('select'); else { S.sel = null; S.anchor = null; schedule(); } });
    if (k === ' ') return go(() => togglePlay());
    if (k === '?' || k === 'F1') return go(() => help(true));
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      const d = k === 'ArrowUp' ? 1 : -1;
      if (ev.altKey && !ev.shiftKey && S.mode === 'select') return go(() => chordStep(d));
      if (ev.altKey && !ev.shiftKey && S.mode === 'input') return go(() => { // the cursor to the other hand's staff
        const staves = model.attributesAt(doc.querySelector('measure')).staves, to = String(Math.max(1, Math.min(staves, Number(S.cursor.staff) - d)));
        S.cursor.staff = to; S.cursor.voice = voicesOf(to)[S.voice] || voicesOf(to)[0]; S.last = null; schedule(true);
      });
      return go(() => transpose(mod ? 'octave' : ev.altKey && ev.shiftKey ? 'step' : 'chromatic', d));
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const d = k === 'ArrowRight' ? 1 : -1;
      if (S.mode === 'input') return go(() => cursorMove(d, mod));
      if (ev.altKey) return go(() => act(n => ops.move(doc, n, d)));
      if (ev.shiftKey) return go(() => extendBy(d));
      return go(() => neighbour(d, mod));
    }
    if (k === 'Backspace' && S.mode === 'input') return go(() => restore(S.undo, S.redo));
    if (k === 'Delete' || k === 'Backspace') return go(() => del());
    if (k === 'Insert') return go(() => act(n => ops.insertMeasures(doc, n, 'before', 1)));
    if (mod) return;
    if (ev.altKey && /^Digit[1-9]$/.test(ev.code)) return go(() => { const steps = Number(ev.code.slice(5)) - 1; if (S.mode === 'input' && S.last) { const last = model.byId(doc, S.last); const r = change(() => ops.interval(doc, last, steps)); if (r) { hear(r); schedule(); } } else act(n => { const r = ops.interval(doc, n, steps); hear(r); return r; }); });
    if (ev.altKey) return;
    const L = k.toUpperCase();
    if (k.length === 1 && LETTERS.includes(L) && /^Key[A-G]$/.test(ev.code)) return go(() => {
      if (S.mode === 'input') enter({ letter: L }, { chordAdd: ev.shiftKey });
      else if (ev.shiftKey) act(n => { const r = ops.letter(doc, n, L, true); hear(r); return r; });
      else act(n => { ops.letter(doc, n, L, false); hear(n); return n; });
    });
    const d = DURS.find(x => x.key === k); if (d && !ev.shiftKey) return go(() => duration(d.q));
    if (k === '.') return go(() => dot());
    if (k === '0') return go(() => restAction());
    if (k === 'n' || k === 'N') return go(() => setMode(S.mode === 'input' ? 'select' : 'input'));
    if (k === 'r' || k === 'R') return go(() => S.mode === 'input' && S.last ? (() => { const last = model.byId(doc, S.last), e = last && model.eventOf(last); if (e && !e.rest) enter({ pitches: e.notes.map(model.pitchOf) }); })() : repeatSel());
    if (k === 't' || k === 'T') return go(() => tieAction());
    if (k === 's' || k === 'S') return go(() => act(n => ops.slur(doc, n, rangeLast())));
    if (k === 'x' || k === 'X') return go(() => act(n => ops.flip(doc, n)));
    if (k === 'j' || k === 'J') return go(() => act(n => { ops.respell(doc, n); return n; }));
    if (k === 'h' || k === 'H') return go(() => act(n => ops.hand(doc, n)));
    if (k === 'p' || k === 'P') return go(() => togglePiano());
    if (k === '+') return go(() => accidental(1));
    if (k === '-') return go(() => accidental(-1));
    if (k === '=') return go(() => accidental(0));
  });

  // ---------------------------------------------------------------------------------------------
  // Title, finishing
  // ---------------------------------------------------------------------------------------------
  const nameChange = () => {
    const t = titleIn.value, c = composerIn.value;
    if (t === (doc.querySelector('work-title, movement-title')?.textContent?.trim() || '') && c === (doc.querySelector('identification > creator[type="composer"]')?.textContent?.trim() || '')) return;
    change(() => ops.title(doc, t, c), { quiet: true });
  };
  titleIn.addEventListener('change', nameChange); composerIn.addEventListener('change', nameChange);
  const unload = ev => { if (S.dirty) { ev.preventDefault(); ev.returnValue = ''; } };
  window.addEventListener('beforeunload', unload);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (Math.abs(sheet.clientWidth - S.laidOut) > 30) schedule(); else { measure(true); decorate(); } }) : null;
  function close() {
    stopPlay(); ro?.disconnect(); window.removeEventListener('beforeunload', unload);
    if (midiAccess) for (const i of midiAccess.inputs.values()) i.onmidimessage = null;
    root.remove(); if (--openCount <= 0) { openCount = 0; document.documentElement.classList.remove('se-open'); }
  }
  done.onclick = () => { nameChange(); const xml = model.clean(doc), changed = S.dirty; close(); options.onDone?.(xml, { changed }); };
  let armed = 0;
  cancel.onclick = () => {
    if (S.dirty && Date.now() - armed > 3000) { armed = Date.now(); cancel.textContent = 'Discard changes?'; setTimeout(() => { cancel.textContent = 'Cancel'; }, 3000); return; }
    close(); options.onCancel?.();
  };

  if (innerWidth > 900) root.classList.add('se-side-open');
  openCount++; document.documentElement.classList.add('se-open');
  document.body.append(root);
  if (options.notice) say(options.notice, true);
  ro?.observe(sheet);
  render(); sheet.focus({ preventScroll: true });
  if (options.notice) say(options.notice, true);
  return { root, get xml() { return model.clean(doc); }, close };
}

window.PianoSheetEditor = { open, get model() { return window.PianoSheetModel; } };
})();
