'use strict';
// "My songs": a private library per person. Signed in, songs and practice checks live in
// that person's account (Supabase, protected by row-level security); signed out, songs stay
// in this browser only. Nothing here is ever published with the site.
(() => {
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const cfg = window.PianoCloudConfig || {};
const CLOUD = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.js';
const PROGRESS_KEYS = ['my-journey-piano-pathway-v2', 'journey-piano-skills-v1'];
const ACCEPT = '.mxl,.musicxml,.xml,.mid,.midi';

// ---------- Device storage (IndexedDB) ----------
const device = {
  db: null,
  open() {
    if (this.db) return this.db;
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open('my-journey-piano', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('songs', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    return this.db;
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => { const t = db.transaction('songs', mode); const r = fn(t.objectStore('songs')); t.oncomplete = () => resolve(r?.result); t.onerror = () => reject(t.error); });
  },
  async list() { const all = await this.tx('readonly', s => s.getAll()); return (all || []).sort((a, b) => b.created - a.created); },
  async add(file, meta) { const rec = { id: crypto.randomUUID(), title: meta.title, composer: meta.composer, format: meta.format, name: file.name, created: Date.now(), blob: file }; await this.tx('readwrite', s => s.put(rec)); return rec; },
  async file(rec) { return new File([rec.blob], rec.name); },
  async remove(rec) { await this.tx('readwrite', s => s.delete(rec.id)); },
};

// ---------- Cloud storage (Supabase) ----------
let sb = null, user = null;
const cloud = {
  async list() { const { data, error } = await sb.from('songs').select('id,title,composer,format,path,created_at').order('created_at', { ascending: false }); if (error) throw error; return data; },
  async add(file, meta) {
    const id = crypto.randomUUID(), ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase(), path = `${user.id}/${id}${ext}`;
    const up = await sb.storage.from('songs').upload(path, file, { upsert: false, contentType: 'application/octet-stream' }); if (up.error) throw up.error;
    const { data, error } = await sb.from('songs').insert({ id, title: meta.title, composer: meta.composer, format: meta.format, path }).select().single();
    if (error) { await sb.storage.from('songs').remove([path]); throw error; }
    return data;
  },
  async file(rec) { const { data, error } = await sb.storage.from('songs').download(rec.path); if (error) throw error; return new File([data], rec.path.split('/').pop()); },
  async remove(rec) { const del = await sb.from('songs').delete().eq('id', rec.id); if (del.error) throw del.error; await sb.storage.from('songs').remove([rec.path]); },
};
const store = () => (user ? cloud : device);

function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the sign-in service.')); document.head.append(s); }); }

// ---------- Practice-check sync ----------
const readLocal = () => Object.fromEntries(PROGRESS_KEYS.map(k => { try { return [k, JSON.parse(localStorage.getItem(k)) || {}]; } catch { return [k, {}]; } }));
function merge(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return [...new Set([...(a || []), ...(b || [])])];
  if (a && typeof a === 'object' && b && typeof b === 'object') { const out = { ...a }; for (const k of Object.keys(b)) out[k] = k in a ? merge(a[k], b[k]) : b[k]; return out; }
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === true || b === true;
  return b ?? a;
}
let pushTimer = null;
async function pullProgress() {
  const { data } = await sb.from('progress').select('data').eq('owner', user.id).maybeSingle();
  const local = readLocal(), merged = merge(data?.data || {}, local);
  const changed = PROGRESS_KEYS.some(k => JSON.stringify(merged[k] || {}) !== JSON.stringify(local[k] || {}));
  for (const k of PROGRESS_KEYS) try { localStorage.setItem(k, JSON.stringify(merged[k] || {})); } catch {}
  await sb.from('progress').upsert({ owner: user.id, data: merged, updated_at: new Date().toISOString() });
  if (changed && !sessionStorage.getItem('piano-progress-merged')) { sessionStorage.setItem('piano-progress-merged', '1'); location.reload(); }
}
function schedulePush() {
  if (!user) return; clearTimeout(pushTimer);
  pushTimer = setTimeout(() => sb.from('progress').upsert({ owner: user.id, data: readLocal(), updated_at: new Date().toISOString() }), 1500);
}

// ---------- UI ----------
let section, list, statusLine, accountBox, songs = [];
function say(msg, bad) { statusLine.textContent = msg; statusLine.classList.toggle('bad', !!bad); }

function renderAccount() {
  accountBox.replaceChildren();
  if (user) {
    accountBox.append(el('span', 'Signed in', 'acct-label'), el('strong', user.email, 'acct-email'));
    const out = el('button', 'Sign out', 'secondary'); out.type = 'button'; out.onclick = async () => { await sb.auth.signOut(); };
    accountBox.append(out);
  } else {
    const a = el('a', CLOUD ? 'Sign in to sync your songs' : 'My songs', 'acct-link'); a.href = '#library/mine'; accountBox.append(a);
  }
}

function signInForm() {
  const form = el('form', undefined, 'signin');
  const label = el('label', 'Email'); const email = el('input'); email.type = 'email'; email.required = true; email.autocomplete = 'email'; label.append(email);
  const age = el('label', undefined, 'check'); const ok = el('input'); ok.type = 'checkbox'; ok.required = true;
  const agree = el('span'); agree.append('I’m 13 or older and agree to the ');
  for (const [href, text, sep] of [['terms.html', 'Terms', ' and '], ['privacy.html', 'Privacy Policy', '.']]) { const a = el('a', text); a.href = href; a.target = '_blank'; agree.append(a, sep); }
  age.append(ok, agree);
  const go = el('button', 'Email me a sign-in link'); go.type = 'submit';
  form.append(el('p', 'Sign in to keep a private library that follows you to any device. No password: you get a link by email. Accounts are for people 13 and older.', 'muted'), label, age, go);
  form.onsubmit = async e => {
    e.preventDefault(); if (!ok.checked) return; go.disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname,
      data: { age_13_or_older: true, accepted_terms_at: new Date().toISOString() } } });
    go.disabled = false;
    say(error ? 'Sign-in failed: ' + error.message : `Check ${email.value.trim()} for your sign-in link. Open it in this browser.`, !!error);
  };
  return form;
}

function addForm() {
  const form = el('form', undefined, 'add-song');
  const fileLabel = el('label', 'Score file'); const file = el('input'); file.type = 'file'; file.accept = ACCEPT; file.required = true; fileLabel.append(file);
  const titleLabel = el('label', 'Title'); const title = el('input'); title.maxLength = 200; title.placeholder = 'Taken from the file if empty'; titleLabel.append(title);
  const compLabel = el('label', 'Composer or artist'); const comp = el('input'); comp.maxLength = 200; compLabel.append(comp);
  const rights = el('label', undefined, 'check'); const ok = el('input'); ok.type = 'checkbox'; ok.required = true;
  rights.append(ok, el('span', 'I’m allowed to use this music for my own practice. It stays private: only I can see it.'));
  const go = el('button', 'Add to my songs'); go.type = 'submit';
  form.append(el('p', 'MusicXML (.mxl, .musicxml, from MuseScore: File → Export → MusicXML) shows the sheet music. MIDI (.mid) plays the notes without sheet music.', 'muted'), fileLabel, titleLabel, compLabel, rights, go);
  file.onchange = () => { if (!title.value && file.files[0]) title.value = file.files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '); };
  form.onsubmit = async e => {
    e.preventDefault(); const f = file.files[0]; if (!f) return;
    go.disabled = true; say('Reading the score…');
    try {
      const format = /\.midi?$/i.test(f.name) ? 'midi' : 'musicxml';
      const entry = await window.PianoScoreImport.fromFile(f, { id: 'check', title: title.value.trim(), composer: comp.value.trim() });
      const rec = await store().add(f, { title: entry.title.slice(0, 200), composer: comp.value.trim().slice(0, 200), format });
      form.reset(); say(`Added “${entry.title}” · ${entry.notes.length} notes${entry.engraving ? '' : ' · no sheet music (MIDI)'}.`);
      await refresh(); open(rec);
    } catch (err) { say(err.message || String(err), true); }
    go.disabled = false;
  };
  return form;
}

function render() {
  section.querySelector('.mine-body').replaceChildren();
  const body = section.querySelector('.mine-body');
  const where = el('p', user ? `Private to ${user.email}. Synced to your account.` : (CLOUD ? 'Saved in this browser only. Sign in to keep them in your account.' : 'Saved in this browser only.'), 'mine-where');
  body.append(where);
  list = el('div', undefined, 'tiles wrap mine-list');
  if (!songs.length) list.append(el('p', 'No songs yet. Add a MusicXML or MIDI file to practice it here.', 'muted'));
  for (const rec of songs) {
    const card = el('article', undefined, 'tile mine-tile');
    const art = el('button', undefined, 'tile-art mine-art'); art.type = 'button'; art.setAttribute('aria-label', 'Practice ' + rec.title);
    art.append(el('span', rec.format === 'midi' ? 'MIDI' : '♪', 'mine-glyph')); art.onclick = () => open(rec);
    const b = el('div', undefined, 'tile-body'); b.append(el('h3', rec.title), el('p', rec.composer || (rec.format === 'midi' ? 'MIDI file' : 'MusicXML'), 'tile-sub'));
    const row = el('div', undefined, 'tile-actions mine-actions');
    const play = el('button', 'Play', 'play'); play.onclick = () => open(rec);
    const del = el('button', 'Delete', 'secondary small'); del.onclick = async () => { if (!confirmDelete(del)) return; try { await store().remove(rec); await refresh(); say(`Deleted “${rec.title}”.`); } catch (e) { say(e.message, true); } };
    row.append(play, del); b.append(row); card.append(art, b); list.append(card);
  }
  const grid = el('div', undefined, 'mine-grid');
  const left = el('div'); left.append(el('h3', 'Your songs', 'mine-h'), list);
  const right = el('div', undefined, 'mine-side');
  if (CLOUD && !user) right.append(signInForm());
  right.append(addForm());
  if (user) right.append(dangerZone());
  grid.append(left, right); body.append(grid);
}

function dangerZone() {
  const box = el('div', undefined, 'danger-zone');
  const btn = el('button', 'Delete all my songs and practice data', 'secondary small'); btn.type = 'button';
  box.append(el('p', 'Removes every song file, its listing and your synced practice checks from your account. This cannot be undone.'), btn);
  btn.onclick = async () => {
    if (!confirmDelete(btn, 'Tap again to delete everything')) return;
    try {
      for (const rec of await cloud.list()) await cloud.remove(rec);
      await sb.from('progress').delete().eq('owner', user.id);
      const info = await fetch('piano-support.json').then(r => r.json()).catch(() => ({}));
      await refresh();
      say(`Deleted your songs and practice data. To remove your sign-in email as well, write to ${info.contactEmail || 'the site contact listed in the Privacy Policy'}.`);
    } catch (e) { say(e.message || String(e), true); }
  };
  return box;
}

function confirmDelete(btn, armedText = 'Tap again to delete') {
  if (btn.dataset.armed) return true;
  const label = btn.textContent; btn.dataset.armed = '1'; btn.textContent = armedText;
  setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; }, 3000);
  return false;
}

async function refresh() {
  try { songs = await store().list(); } catch (e) { songs = []; say('Could not load your songs: ' + (e.message || e), true); }
  render();
}

async function open(rec) {
  say(`Opening “${rec.title}”…`);
  try {
    const file = await store().file(rec), id = 'mine-' + rec.id;
    const entry = await window.PianoScoreImport.fromFile(file, { id, title: rec.title, composer: rec.composer });
    window.PianoRepertoire[id] = entry;
    const select = $('#trainer-song');
    if (select && ![...select.options].some(o => o.value === id)) { const o = el('option', entry.title + ' · my song'); o.value = id; select.append(o); }
    say('');
    window.dispatchEvent(new CustomEvent('piano-select-score', { detail: id }));
  } catch (e) { say(e.message || String(e), true); }
}

// Private songs have no bundled source sheet.
window.addEventListener('piano-score-viewed', e => {
  const sheet = $('.original-sheet'); if (sheet) sheet.hidden = !!window.PianoRepertoire[e.detail]?.private;
});
document.addEventListener('change', e => { if (e.target.matches('input[type=checkbox]') && !e.target.closest('.add-song')) schedulePush(); });

async function init() {
  section = $('#my-songs'); accountBox = $('#account-box'); if (!section) return;
  statusLine = el('p', '', 'mine-status'); statusLine.setAttribute('role', 'status'); statusLine.setAttribute('aria-live', 'polite');
  section.append(el('div', undefined, 'mine-body'), statusLine);
  renderAccount(); render();
  if (CLOUD) {
    try {
      await loadScript(SUPABASE_JS);
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } });
      const { data } = await sb.auth.getSession(); user = data.session?.user || null;
      sb.auth.onAuthStateChange((event, session) => {
        const next = session?.user || null; if ((next && next.id) === (user && user.id)) return;
        user = next; renderAccount(); refresh(); if (user) pullProgress().catch(() => {});
      });
      if (user) pullProgress().catch(() => {});
    } catch (e) { say(e.message, true); }
  }
  renderAccount(); refresh();
}
document.addEventListener('DOMContentLoaded', init);
window.PianoAccount = { open, refresh };
})();
