'use strict';
// App shell for the piano studio: tab routing, home dashboard, composer library,
// and the practice stage layout. The lesson, skill and player engines stay in
// their own files; this script only arranges and drives them.
(() => {
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = text; if (cls) n.className = cls; return n; };
const read = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const PATH_KEY = 'my-journey-piano-pathway-v2', SKILL_KEY = 'journey-piano-skills-v1';

// Public-domain portraits (Wikimedia Commons). A missing or failed image falls back to initials.
const W = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/';
const COMPOSERS = {
  'Johann Sebastian Bach': { years: '1685–1750', era: 'Baroque', img: W + '6/6a/Johann_Sebastian_Bach.jpg/500px-Johann_Sebastian_Bach.jpg' },
  'Christian Petzold': { years: '1677–1733', era: 'Baroque' },
  'Wolfgang Amadeus Mozart': { years: '1756–1791', era: 'Classical', img: W + 'a/ad/The_Mozart_Family_-_Wolfgang_Amadeus_Mozart_headshot.jpg/500px-The_Mozart_Family_-_Wolfgang_Amadeus_Mozart_headshot.jpg' },
  'Muzio Clementi': { years: '1752–1832', era: 'Classical', img: W + 'c/c9/Muzio_Clementi.jpeg/500px-Muzio_Clementi.jpeg' },
  'Ludwig van Beethoven': { years: '1770–1827', era: 'Classical to Romantic', img: W + "6/6e/Joseph_Karl_Stieler%27s_Beethoven_mit_dem_Manuskript_der_Missa_solemnis.jpg/500px-Joseph_Karl_Stieler%27s_Beethoven_mit_dem_Manuskript_der_Missa_solemnis.jpg" },
  'Carl Czerny': { years: '1791–1857', era: 'Studies', img: W + '6/6f/Czerny_2_part.jpg/500px-Czerny_2_part.jpg' },
  'Friedrich Burgmüller': { years: '1806–1874', era: 'Romantic', img: W + '1/1d/Friedrich_Burgm%C3%BCller.jpg/500px-Friedrich_Burgm%C3%BCller.jpg' },
  'Frédéric Chopin': { years: '1810–1849', era: 'Romantic', img: W + 'e/e8/Frederic_Chopin_photo.jpeg/500px-Frederic_Chopin_photo.jpeg' },
  'Robert Schumann': { years: '1810–1856', era: 'Romantic', img: W + 'f/fa/Robert_Schumann_1839.jpg/500px-Robert_Schumann_1839.jpg' },
  'Franz Schubert': { years: '1797–1828', era: 'Romantic', img: W + '0/0d/Franz_Schubert_by_Wilhelm_August_Rieder_1875.jpg/500px-Franz_Schubert_by_Wilhelm_August_Rieder_1875.jpg' },
  'Franz Liszt': { years: '1811–1886', era: 'Romantic', img: W + '0/0d/Franz_Liszt_by_Herman_Biow-_1843.png/500px-Franz_Liszt_by_Herman_Biow-_1843.png' },
  'Johannes Brahms': { years: '1833–1897', era: 'Romantic', img: W + 'c/cc/JohannesBrahms_%28cropped%29.jpg/500px-JohannesBrahms_%28cropped%29.jpg' },
  'Edvard Grieg': { years: '1843–1907', era: 'Romantic', img: W + '5/50/Edvard_Grieg_portrait_%28cropped%29.jpg/500px-Edvard_Grieg_portrait_%28cropped%29.jpg' },
  'Sergei Rachmaninoff': { years: '1873–1943', era: 'Late Romantic', img: W + 'b/be/Sergei_Rachmaninoff_cph.3a40575.jpg/500px-Sergei_Rachmaninoff_cph.3a40575.jpg' },
  'Claude Debussy': { years: '1862–1918', era: 'Impressionist', img: W + 'c/c3/Claude_Debussy_by_Atelier_Nadar.jpg/500px-Claude_Debussy_by_Atelier_Nadar.jpg' },
  'Erik Satie': { years: '1866–1925', era: 'Modern', img: W + '5/58/Ericsatie.jpg/500px-Ericsatie.jpg' },
  'Scott Joplin': { years: 'c. 1868–1917', era: 'Ragtime', img: W + '6/68/Scott_Joplin_in_1912.jpg/500px-Scott_Joplin_in_1912.jpg' },
  'Folk songs': { years: 'Traditional', era: 'First tunes', folk: true }
};
// Well-known concert pieces, shown first in the library.
const FAMOUS = ['campanella', 'fur', 'moonlight', 'liebestraum', 'fantaisie-impromptu', 'ballade1', 'tristesse', 'heroic', 'clair', 'alla-turca', 'nocturne', 'minute-waltz', 'entertainer', 'rach-prelude', 'maple-leaf', 'gymnopedie', 'mountain-king', 'raindrop', 'revolutionary', 'arabesque1', 'gnossienne1', 'traumerei', 'impromptu-gflat', 'winter-wind', 'waltz-csharp', 'nocturne-csharp', 'nocturne-op9-1', 'nocturne-op48', 'etude-op10-4', 'consolation3', 'brahms-waltz', 'prelude', 'pathetique'];
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const initials = name => name.split(/\s+/).filter(w => /^[A-ZÀ-Ý]/.test(w)).map(w => w[0]).slice(0, 2).join('');
const lastName = name => name === 'Folk songs' ? 'Folk songs' : name.split(' ').slice(-1)[0];

let pieces = [], levels = [], byComposer = new Map();
function buildData() {
  const C = window.PianoCurriculum, R = window.PianoRepertoire || {};
  levels = C.levels;
  pieces = C.pieces.map(p => {
    const full = R[p.id]?.title || p.title || p.id;
    const [title, ...rest] = full.split(' · ');
    let composer = R[p.id]?.composer || p.composer || (p.id === 'entertainer' ? 'Scott Joplin' : '');
    if (!composer || composer === 'Traditional') composer = 'Folk songs';
    return { ...p, full, title, note: rest.join(' · '), composer, reference: !!p.reference };
  });
  byComposer = new Map();
  for (const p of pieces) { if (!byComposer.has(p.composer)) byComposer.set(p.composer, []); byComposer.get(p.composer).push(p); }
  for (const list of byComposer.values()) list.sort((a, b) => a.level - b.level);
}
const levelName = id => { const l = levels.find(l => l.id === id); const [name, sub] = (l?.title || '').split(' · '); return { name: name || 'Level ' + id, sub: sub || '' }; };

function portrait(name, cls) {
  const c = COMPOSERS[name] || {}, box = el('span', undefined, 'portrait ' + (cls || ''));
  const fallback = () => { box.replaceChildren(el('span', c.folk ? '♪' : initials(name), 'monogram')); box.classList.add(c.folk ? 'folk' : 'mono'); };
  if (c.img) { const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.src = c.img; img.onerror = fallback; box.append(img); }
  else fallback();
  return box;
}

// ---------- Driving the lesson engine through its own controls ----------
let quietUntil = 0;
function courseCard(id) {
  const filter = $('#piece-filter'), search = $('.repertoire input[type=search]');
  if (!filter) return null;
  if (search) search.value = '';
  if (filter.value !== 'all') { filter.value = 'all'; filter.onchange?.(); }
  return $(`#piece-library [data-piece-progress="${CSS.escape(id)}"]`)?.closest('.piece-card') || null;
}
function openLesson(id) {
  quietUntil = Date.now() + 600;
  const btn = courseCard(id)?.querySelector('.actions button');
  if (btn) btn.click(); else go('library/piece');
}
function practicePiece(id) {
  const p = pieces.find(p => p.id === id);
  if (p?.reference) return openLesson(id);
  quietUntil = Date.now() + 600;
  const btns = courseCard(id)?.querySelectorAll('.actions button');
  if (btns && btns[1]) btns[1].click(); else window.dispatchEvent(new CustomEvent('piano-select-score', { detail: id }));
}

// ---------- Router ----------
const views = [...document.querySelectorAll('.view')];
let current = '';
function go(route) { if (location.hash.slice(1) === route) apply(route); else location.hash = route; }
function apply(route, opts = {}) {
  // A sign-in link returns with its tokens in the hash; the account script reads them.
  if (/^(access_token|refresh_token|error)=/.test(route || '')) route = 'mine';
  // Older links: the import page and the My songs shelf in the library are now one page.
  if (route === 'import' || route === 'library/mine') route = 'mine';
  const [view = 'home', sub = '', arg = ''] = (route || 'home').split('/');
  const target = views.find(v => v.dataset.view === view) ? view : 'home';
  for (const v of views) v.hidden = v.dataset.view !== target;
  for (const a of document.querySelectorAll('.tabs a')) { if (a.dataset.tab === target) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  document.body.dataset.view = target;
  if (target === 'home') renderHome();
  if (target === 'library') showLibrary(sub, decodeURIComponent(arg));
  if (target === 'practice') syncPracticeTitle();
  if (target === 'learn' && sub) { const anchor = sub === 'units' ? $('.skill-units') : document.getElementById(sub); if (anchor && !opts.noScroll) { requestAnimationFrame(() => origScroll.call(anchor, { block: 'start' })); return; } }
  if (!opts.noScroll && current !== route) window.scrollTo(0, 0);
  current = route;
}
window.addEventListener('hashchange', () => apply(location.hash.slice(1)));

// Other scripts scroll to their sections; open the tab that holds the section first.
const origScroll = Element.prototype.scrollIntoView;
Element.prototype.scrollIntoView = function (...args) {
  const id = this.id;
  if (id === 'piece-course') { history.replaceState(null, '', '#library/piece'); apply('library/piece', { noScroll: true }); window.scrollTo(0, 0); return; }
  if (id === 'piece-library') { const lv = $('#piece-filter')?.value; history.replaceState(null, '', '#library'); apply('library', { noScroll: true }); const shelf = lv && document.getElementById('shelf-' + lv); if (shelf) return origScroll.call(shelf, { block: 'start' }); window.scrollTo(0, 0); return; }
  const view = this.closest?.('.view');
  if (view && view.hidden) { history.replaceState(null, '', '#' + view.dataset.view); apply(view.dataset.view, { noScroll: true }); }
  return origScroll.apply(this, args);
};

// ---------- Home ----------
function selectedId() { const s = read(PATH_KEY).selected; return pieces.some(p => p.id === s) ? s : 'ode'; }
function renderHome() {
  if (!pieces.length) return;
  const p = pieces.find(p => p.id === selectedId()), card = $('#up-next'), lv = levelName(p.level);
  card.replaceChildren();
  const art = portrait(p.composer, 'large');
  const body = el('div', undefined, 'up-next-body');
  body.append(el('p', 'Up next', 'kicker'), el('h2', p.title), el('p', [p.composer === 'Folk songs' ? 'Traditional' : p.composer, p.note].filter(Boolean).join(', '), 'up-next-sub'));
  const meta = el('p', undefined, 'pill-row'); meta.append(el('span', 'Level ' + p.level, 'pill'), el('span', lv.name, 'pill quiet')); body.append(meta);
  const actions = el('div', undefined, 'actions');
  const play = el('button', p.reference ? 'Open lesson' : 'Practice now'); play.onclick = () => p.reference ? openLesson(p.id) : practicePiece(p.id);
  const lesson = el('button', 'Lesson steps', 'secondary'); lesson.onclick = () => openLesson(p.id);
  actions.append(play); if (!p.reference) actions.append(lesson);
  body.append(actions);
  card.append(art, body);
  renderRange();
}
function levelProgress(id) {
  const skills = read(SKILL_KEY).checks || {}, path = read(PATH_KEY).levelChecks || {};
  const units = (window.PianoSkills?.units || []).filter(u => u.level === id);
  const unitsDone = units.filter(u => skills[u.id] === true).length;
  const lv = levels.find(l => l.id === id), total = lv?.checks.length || 0;
  const checksDone = (lv?.checks || []).filter((_, i) => path[id + ':' + i] === true).length;
  return { unitsDone, units: units.length, checksDone, total };
}
function renderRange() {
  const box = $('#range-keys'); if (!box) return; box.replaceChildren();
  const dimKey = black => { const k = el('span', undefined, black ? 'k b dim' : 'k w dim'); return k; };
  const lead = el('span', undefined, 'octave edge'); lead.append(dimKey(false), dimKey(false)); const lb = el('span', undefined, 'k b dim'); lb.style.left = 'calc(50% - var(--bw) / 2)'; lead.append(lb); box.append(lead);
  for (const l of levels) {
    const pr = levelProgress(l.id), lit = pr.total ? Math.round(7 * pr.checksDone / pr.total) : 0, name = levelName(l.id);
    const oct = el('button', undefined, 'octave'); oct.type = 'button';
    oct.setAttribute('aria-label', `Level ${l.id}, ${name.name}: ${pr.unitsDone} of ${pr.units} skill units, ${pr.checksDone} of ${pr.total} readiness checks. Open level.`);
    for (let i = 0; i < 7; i++) oct.append(el('span', undefined, 'k w' + (i < lit ? ' lit' : '')));
    [1, 2, 4, 5, 6].forEach((pos, i) => { const k = el('span', undefined, 'k b' + (i < pr.unitsDone ? ' lit' : '')); k.style.left = `calc(${pos / 7 * 100}% - var(--bw) / 2)`; oct.append(k); });
    const cap = el('span', undefined, 'oct-cap'); cap.append(el('b', String(l.id)), el('span', name.name)); oct.append(cap);
    oct.onclick = () => openLevel(l.id);
    box.append(oct);
  }
  const tail = el('span', undefined, 'octave edge tail'); tail.append(dimKey(false)); box.append(tail);
}
function openLevel(id) {
  const sel = $('#skill-level'); if (sel) { sel.value = String(id); sel.dispatchEvent(new Event('change')); }
  go('learn/units');
}

// ---------- Library ----------
function pieceCard(p) {
  const card = el('article', undefined, 'tile');
  const art = el('button', undefined, 'tile-art'); art.type = 'button'; art.setAttribute('aria-label', `Open lesson: ${p.full}`); art.append(portrait(p.composer, 'cover'), el('span', 'Level ' + p.level, 'pill on-art'));
  art.onclick = () => openLesson(p.id);
  const body = el('div', undefined, 'tile-body');
  body.append(el('h3', p.title), el('p', p.composer === 'Folk songs' ? 'Traditional' : lastName(p.composer), 'tile-sub'));
  if (p.note) body.append(el('p', p.note, 'tile-note-line'));
  const row = el('div', undefined, 'tile-actions');
  if (!p.reference) { const play = el('button', 'Play', 'play'); play.setAttribute('aria-label', `Practice ${p.full}`); play.onclick = () => practicePiece(p.id); row.append(play); }
  else row.append(el('span', 'Use your own score', 'tile-note'));
  body.append(row); card.append(art, body);
  return card;
}
function renderBrowse() {
  const term = ($('#lib-search')?.value || '').trim().toLowerCase();
  const row = $('#composer-row'), shelves = $('#level-shelves');
  row.replaceChildren(); shelves.replaceChildren();
  const names = [...byComposer.keys()].sort((a, b) => (a === 'Folk songs') - (b === 'Folk songs') || (byComposer.get(b).length - byComposer.get(a).length) || lastName(a).localeCompare(lastName(b)));
  const match = p => !term || [p.full, p.composer, p.skill, p.pattern].join(' ').toLowerCase().includes(term);
  for (const name of names) {
    const list = byComposer.get(name); if (term && !list.some(match) && !name.toLowerCase().includes(term)) continue;
    const a = el('a', undefined, 'composer'); a.href = '#library/composer/' + slug(name);
    a.append(portrait(name, 'round'), el('strong', lastName(name)), el('span', `${list.length} ${list.length === 1 ? 'piece' : 'pieces'}`));
    row.append(a);
  }
  if (!row.children.length) row.append(el('p', 'No composers match.', 'muted'));
  if (term) {
    const found = pieces.filter(match), sec = el('section', undefined, 'shelf');
    sec.append(el('h2', found.length ? `${found.length} ${found.length === 1 ? 'piece' : 'pieces'} found` : 'No pieces match. Try a composer, title or skill.', 'shelf-title'));
    const grid = el('div', undefined, 'tiles wrap'); found.forEach(p => grid.append(pieceCard(p))); sec.append(grid); shelves.append(sec); return;
  }
  const famous = FAMOUS.map(id => pieces.find(p => p.id === id)).filter(Boolean);
  if (famous.length) {
    const sec = el('section', undefined, 'shelf'); sec.id = 'shelf-famous';
    const head = el('div', undefined, 'shelf-head'); head.append(el('h2', 'Famous pieces', 'shelf-title'), el('p', 'Complete scores of the classics', 'shelf-sub'));
    const grid = el('div', undefined, 'tiles'); famous.forEach(p => grid.append(pieceCard(p)));
    sec.append(head, grid); shelves.append(sec);
  }
  for (const l of levels) {
    const list = pieces.filter(p => p.level === l.id); if (!list.length) continue;
    const name = levelName(l.id), sec = el('section', undefined, 'shelf'); sec.id = 'shelf-' + l.id;
    const head = el('div', undefined, 'shelf-head'); const h = el('h2', undefined, 'shelf-title'); h.append(el('span', String(l.id), 'lvl-num'), document.createTextNode(name.name)); head.append(h, el('p', name.sub, 'shelf-sub'));
    const grid = el('div', undefined, 'tiles'); list.forEach(p => grid.append(pieceCard(p)));
    sec.append(head, grid); shelves.append(sec);
  }
}
function renderComposer(s) {
  const name = [...byComposer.keys()].find(n => slug(n) === s), page = $('#composer-page'); page.replaceChildren();
  if (!name) { page.append(el('p', 'That composer isn’t in the library.', 'muted')); return; }
  const c = COMPOSERS[name] || {}, list = byComposer.get(name);
  const back = el('a', 'Library', 'back'); back.href = '#library';
  const hero = el('header', undefined, 'composer-hero');
  const text = el('div'); text.append(el('h1', name), el('p', [c.years, c.era].filter(Boolean).join(' · '), 'composer-meta'), el('p', `${list.length} ${list.length === 1 ? 'piece' : 'pieces'} in your library, from level ${list[0].level}${list.length > 1 && list.at(-1).level !== list[0].level ? ' to ' + list.at(-1).level : ''}.`, 'composer-count'));
  const first = list.find(p => !p.reference);
  if (first) { const b = el('button', `Play ${first.title}`); b.onclick = () => practicePiece(first.id); const a = el('div', undefined, 'actions'); a.append(b); text.append(a); }
  hero.append(portrait(name, 'hero'), text);
  const ol = el('ol', undefined, 'song-list');
  list.forEach((p, i) => {
    const li = el('li'); const n = el('span', String(i + 1), 'idx');
    const info = el('button', undefined, 'song-main'); info.type = 'button'; info.append(el('strong', p.title), el('span', [p.note, p.skill].filter(Boolean).join(' · '))); info.onclick = () => openLesson(p.id);
    const lv = el('span', 'Level ' + p.level, 'pill quiet');
    const acts = el('span', undefined, 'song-actions');
    if (!p.reference) { const play = el('button', 'Play', 'play'); play.setAttribute('aria-label', `Practice ${p.full}`); play.onclick = () => practicePiece(p.id); acts.append(play); }
    else acts.append(el('span', 'Reference', 'tile-note'));
    li.append(n, info, lv, acts); ol.append(li);
  });
  page.append(back, hero, ol);
}
function showLibrary(sub, arg) {
  const parts = { browse: $('.lib-browse'), composer: $('.lib-composer'), piece: $('.lib-piece') };
  const which = sub === 'composer' ? 'composer' : sub === 'piece' ? 'piece' : 'browse';
  for (const [k, n] of Object.entries(parts)) n.hidden = k !== which;
  if (which === 'browse') renderBrowse();
  if (which === 'composer') renderComposer(arg);
  if (which === 'piece') renderPieceArt();
}
function renderPieceArt() {
  const art = $('#piece-art'); if (!art || !pieces.length) return;
  const p = pieces.find(p => p.id === selectedId());
  art.replaceChildren(portrait(p.composer, 'hero'), el('span', p.composer === 'Folk songs' ? 'Folk songs' : 'More by ' + lastName(p.composer)));
  art.href = '#library/composer/' + slug(p.composer);
}

// ---------- Practice stage ----------
function arrangePractice() {
  const root = $('#note-trainer'); if (!root || root.dataset.arranged) return;
  const score = $('#practice-score', root); if (!score) return;
  root.dataset.arranged = '1';
  const kids = [...root.children];
  const eyebrow = kids.find(k => k.matches('p.eyebrow')), h2 = kids.find(k => k.tagName === 'H2');
  const intro = h2?.nextElementSibling?.matches('p.muted') ? h2.nextElementSibling : null;
  const controls = kids.filter(k => k.matches('.trainer-controls'));
  const sheet = $('.original-sheet', root);
  const caption = (sheet || score).previousElementSibling?.matches('p.muted') ? (sheet || score).previousElementSibling : null;
  const keyboard = $('.practice-keyboard', root);
  const actionRows = kids.filter(k => k.matches('.actions'));
  const pager = actionRows.find(a => kids.indexOf(a) < kids.indexOf(score));
  const inputs = actionRows.find(a => kids.indexOf(a) > kids.indexOf(score));
  const device = inputs?.nextElementSibling?.tagName === 'LABEL' ? inputs.nextElementSibling : null;
  const feedback = $('.trainer-feedback', root), progress = $('progress', root);
  const after = progress ? kids.slice(kids.indexOf(progress) + 1) : [];
  const counts = after.find(p => /note groups|attacks|accuracy/.test(p.textContent));

  const head = el('header', undefined, 'practice-head');
  const titles = el('div'); const h1 = el('h1', 'Practice', 'practice-title'); h1.id = 'practice-title';
  titles.append(h1); if (caption) { caption.classList.add('practice-caption'); titles.append(caption); }
  head.append(titles);
  const bar = el('div', undefined, 'practice-bar'); if (controls[0]) bar.append(controls[0]); if (controls[2]) { controls[2].classList.add('mode-row'); bar.append(controls[2]); }
  const stage = el('div', undefined, 'stage');
  const stageTop = el('div', undefined, 'stage-top'); if (feedback) stageTop.append(feedback); if (pager) stageTop.append(pager);
  stage.append(stageTop, score); if (keyboard) stage.append(keyboard);
  const deck = el('div', undefined, 'stage-deck'); if (inputs) deck.append(inputs); if (device) deck.append(device); stage.append(deck);
  const meter = el('div', undefined, 'stage-meter'); if (progress) meter.append(progress); if (counts) meter.append(counts); stage.append(meter);
  const more = el('details', undefined, 'fold practice-more'); more.append(el('summary', 'Practice settings, sources and help'));
  const rest = [...root.children].filter(k => ![eyebrow, h2].includes(k));
  if (intro) intro.classList.add('practice-intro');
  for (const k of rest) more.append(k);
  if (eyebrow) eyebrow.hidden = true; if (h2) h2.hidden = true;
  root.append(head, bar, stage, more);
  if (sheet) sheet.open = false;
  syncPracticeTitle();
  const songSelect = bar.querySelector('select'); songSelect?.addEventListener('change', () => setTimeout(syncPracticeTitle, 0));
  if (caption) new MutationObserver(syncPracticeTitle).observe(caption, { childList: true, characterData: true, subtree: true });
}
function syncPracticeTitle() {
  const sel = $('.practice-bar select'), h = $('#practice-title'); if (!sel || !h) return;
  const text = sel.options[sel.selectedIndex]?.textContent || 'Practice';
  h.textContent = text.replace(/ · (full piece|my song)$/, '');
}

// ---------- Small helpers ----------
function wireMetronome() {
  const tempo = $('#tempo');
  for (const b of document.querySelectorAll('.tempo-row .step')) b.onclick = () => { tempo.value = Math.max(30, Math.min(200, (Number(tempo.value) || 60) + Number(b.dataset.step))); tempo.dispatchEvent(new Event('change')); const pt = $('#practice-tempo'); if (pt && pt.value !== tempo.value) { pt.value = tempo.value; } };
}
function wireToast() {
  const t = $('#course-status'); if (!t) return; let timer;
  new MutationObserver(() => { clearTimeout(timer); if (!t.textContent || Date.now() < quietUntil) { t.classList.remove('show'); return; } t.classList.add('show'); timer = setTimeout(() => t.classList.remove('show'), 3200); }).observe(t, { childList: true, characterData: true, subtree: true });
}

document.addEventListener('DOMContentLoaded', () => {
  buildData();
  const path = $('#level-path'), slot = $('#level-slot'); if (path && slot) slot.append(path);
  arrangePractice();
  wireMetronome(); wireToast();
  $('#lib-search')?.addEventListener('input', renderBrowse);
  document.addEventListener('change', e => { if (e.target.matches('input[type=checkbox]') && document.body.dataset.view === 'home') renderRange(); });
  window.addEventListener('storage', () => { if (document.body.dataset.view === 'home') renderHome(); });
  apply(location.hash.slice(1) || 'home', { noScroll: true });
});
})();
