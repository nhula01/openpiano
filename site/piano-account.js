'use strict';
// My songs: each person's private library. Signed in, songs and practice checks live in that
// person's account (Supabase, protected by row-level security); signed out, songs stay in this
// browser (IndexedDB). Nothing here is ever published with the site.
// This file owns storage, sign-in and the song shelf; piano-import.js is the "Add a song" panel
// and hands finished songs to window.PianoSongs.save().
(() => {
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const cfg = window.PianoCloudConfig || {};
const CLOUD = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.4/dist/umd/supabase.js';
const PROGRESS_KEYS = ['my-journey-piano-pathway-v2', 'journey-piano-skills-v1'];
const MAX_SONGS = 100;

// ---------- Device storage (IndexedDB) ----------
function request(r) { return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
const device = {
  db: null,
  open() {
    if (!this.db) {
      const req = indexedDB.open('my-journey-piano', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('songs', { keyPath: 'id' });
      this.db = request(req).catch(() => { this.db = null; throw new Error('Browser storage is unavailable here (private window?). You can still practice without saving.'); });
    }
    return this.db;
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('songs', mode), r = fn(t.objectStore('songs'));
      t.oncomplete = () => resolve(r?.result); t.onerror = () => reject(new Error('Could not save in this browser; its storage may be full.'));
    });
  },
  async list() { const all = await this.tx('readonly', s => s.getAll()); return (all || []).sort((a, b) => b.created - a.created); },
  async add(file, meta) {
    const rec = { id: crypto.randomUUID(), title: meta.title, composer: meta.composer, format: meta.format, name: file.name, created: Date.now(), blob: file,
      settings: meta.settings || {}, original: meta.original || null };
    await this.tx('readwrite', s => s.put(rec)); return rec;
  },
  async file(rec) { return new File([rec.blob], rec.name); },
  async original(rec) { return rec.original ? { name: rec.original.name, type: rec.original.type, blob: rec.original.blob } : null; },
  async remove(rec) { await this.tx('readwrite', s => s.delete(rec.id)); },
};

// Scores saved by the earlier "Your scores" page (one browser database) move into My songs once.
async function migrateOldScores() {
  const KEY = 'openpiano-old-scores-moved';
  try { if (localStorage.getItem(KEY) || !indexedDB.databases) return; } catch { return; }
  const names = (await indexedDB.databases()).map(d => d.name);
  if (!names.includes('journey-private-piano-scores')) { try { localStorage.setItem(KEY, '1'); } catch {} return; }
  const db = await request(indexedDB.open('journey-private-piano-scores', 1));
  if (!db.objectStoreNames.contains('scores')) { db.close(); return; }
  const old = await request(db.transaction('scores').objectStore('scores').getAll()); db.close();
  for (const e of old) {
    const midi = e.type === 'midi', name = e.name || (midi ? 'score.mid' : 'score.musicxml');
    const file = new File([midi ? e.bytes : e.xml], midi ? name : name.replace(/\.(mxl|xml)$/i, '') + (/\.musicxml$/i.test(name) ? '' : '.musicxml'));
    const original = e.original?.file ? { name: e.original.name, type: e.original.file.type, blob: e.original.file } : null;
    await device.add(file, { title: (e.name || 'My score').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 200), composer: '', format: midi ? 'midi' : 'musicxml',
      settings: e.assignments ? { hands: e.assignments } : {}, original });
  }
  try { localStorage.setItem(KEY, '1'); } catch {}
}

// ---------- Cloud storage (Supabase) ----------
let sb = null, user = null;
const extOf = name => ((name || '').match(/\.[a-z0-9]{1,8}$/i) || [''])[0].toLowerCase();
const cloud = {
  async list() {
    const { data, error } = await sb.from('songs').select('id,title,composer,format,path,settings,original_path,original_type,created_at').order('created_at', { ascending: false });
    if (error) throw error; return data;
  },
  async add(file, meta) {
    const id = crypto.randomUUID(), path = `${user.id}/${id}${extOf(file.name)}`, done = [];
    try {
      const up = await sb.storage.from('songs').upload(path, file, { upsert: false, contentType: 'application/octet-stream' }); if (up.error) throw up.error; done.push(path);
      let originalPath = null;
      if (meta.original) {
        originalPath = `${user.id}/${id}-original${extOf(meta.original.name)}`;
        const o = await sb.storage.from('songs').upload(originalPath, meta.original.blob, { upsert: false, contentType: meta.original.type }); if (o.error) throw o.error; done.push(originalPath);
      }
      const { data, error } = await sb.from('songs').insert({ id, title: meta.title, composer: meta.composer, format: meta.format, path, settings: meta.settings || {},
        original_path: originalPath, original_type: meta.original?.type || null }).select().single();
      if (error) throw error;
      return data;
    } catch (e) { if (done.length) await sb.storage.from('songs').remove(done); throw e; }
  },
  async file(rec) { const { data, error } = await sb.storage.from('songs').download(rec.path); if (error) throw error; return new File([data], rec.path.split('/').pop()); },
  async original(rec) {
    if (!rec.original_path) return null;
    const { data, error } = await sb.storage.from('songs').download(rec.original_path); if (error) throw error;
    return { name: rec.original_path.split('/').pop(), type: rec.original_type, blob: new Blob([data], { type: rec.original_type }) };
  },
  async remove(rec) {
    const del = await sb.from('songs').delete().eq('id', rec.id); if (del.error) throw del.error;
    await sb.storage.from('songs').remove([rec.path, rec.original_path].filter(Boolean));
  },
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
let section, statusLine, accountBox, songs = [], inBrowser = [];
function say(msg, bad) { if (!statusLine) return; statusLine.textContent = msg; statusLine.classList.toggle('bad', !!bad); }
const where = () => user ? `Private to ${user.email}. Synced to your account.` : (CLOUD ? 'Saved in this browser only. Sign in to keep them in your account on any device.' : 'Saved in this browser only. Keep your original files as a backup.');

function renderAccount() {
  accountBox.replaceChildren();
  if (user) {
    accountBox.append(el('span', 'Signed in', 'acct-label'), el('strong', user.email, 'acct-email'));
    const out = el('button', 'Sign out', 'secondary'); out.type = 'button'; out.onclick = async () => { await sb.auth.signOut(); };
    accountBox.append(out);
  } else {
    const a = el('a', CLOUD ? 'Sign in to sync your songs' : 'My songs', 'acct-link'); a.href = '#mine'; accountBox.append(a);
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
  form.append(el('h3', 'Keep your songs on every device', 'mine-h'), el('p', 'No password: you get a sign-in link by email. Accounts are for people 13 and older.', 'muted'), label, age, go);
  form.onsubmit = async e => {
    e.preventDefault(); if (!ok.checked) return; go.disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email: email.value.trim(), options: { emailRedirectTo: location.origin + location.pathname,
      data: { age_13_or_older: true, accepted_terms_at: new Date().toISOString() } } });
    go.disabled = false;
    say(error ? 'Sign-in failed: ' + error.message : `Check ${email.value.trim()} for your sign-in link. Open it in this browser.`, !!error);
  };
  return form;
}

function render() {
  const body = section.querySelector('.mine-body'); body.replaceChildren();
  body.append(el('p', where(), 'mine-where'));
  const list = el('div', undefined, 'tiles wrap mine-list');
  if (!songs.length) list.append(el('p', 'No songs yet. Add a MusicXML or MIDI file below and it appears here.', 'muted mine-empty'));
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
  const left = el('div'); left.append(list);
  grid.append(left);
  if (CLOUD) {
    const side = el('div', undefined, 'mine-side');
    if (!user) side.append(signInForm());
    else { if (inBrowser.length) side.append(moveBox()); side.append(dangerZone()); }
    grid.append(side);
  } else grid.classList.add('solo');
  body.append(grid);
}

// Songs saved in this browser before signing in can move into the account.
function moveBox() {
  const n = inBrowser.length, box = el('div', undefined, 'move-songs');
  const btn = el('button', `Move ${n} song${n > 1 ? 's' : ''} from this browser into your account`, 'secondary'); btn.type = 'button';
  box.append(el('p', `This browser also has ${n} song${n > 1 ? 's' : ''} you saved before signing in.`, 'muted'), btn);
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      for (const rec of inBrowser) {
        if (songs.length >= MAX_SONGS) throw new Error(`Your account has ${MAX_SONGS} songs; the rest stay in this browser.`);
        songs.push(await cloud.add(await device.file(rec), { title: rec.title, composer: rec.composer || '', format: rec.format, settings: rec.settings || {}, original: await device.original(rec) }));
        await device.remove(rec);
      }
      say('Moved your songs into your account.');
    } catch (e) { say(e.message || String(e), true); }
    await refresh();
  };
  return box;
}

function dangerZone() {
  const box = el('div', undefined, 'danger-zone');
  const btn = el('button', 'Delete all my songs and practice data', 'secondary small'); btn.type = 'button';
  box.append(el('p', 'Removes every song, attached sheet and your synced practice checks from your account. This cannot be undone.'), btn);
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
  inBrowser = user ? await device.list().catch(() => []) : [];
  render();
}

// Put a prepared entry into the player and switch to Practice.
const objectURLs = new Map();
function present(entry, original, label) {
  entry.imported = true;
  for (const url of objectURLs.get(entry.id) || []) URL.revokeObjectURL(url);
  const urls = [];
  if (entry.review?.xml) { entry.originalXMLURL = URL.createObjectURL(new Blob([entry.review.xml], { type: 'application/vnd.recordare.musicxml+xml' })); urls.push(entry.originalXMLURL); }
  if (original) { entry.originalAsset = { url: URL.createObjectURL(original.blob), type: original.type }; entry.originalPages = 1; urls.push(entry.originalAsset.url); }
  objectURLs.set(entry.id, urls);
  delete entry.review;
  window.PianoRepertoire[entry.id] = entry;
  const select = $('#trainer-song');
  if (select) { let o = [...select.options].find(o => o.value === entry.id); if (!o) { o = el('option'); o.value = entry.id; select.append(o); } o.textContent = entry.title + ' · ' + label; }
  window.dispatchEvent(new CustomEvent('piano-select-score', { detail: entry.id }));
}

async function open(rec) {
  say(`Opening “${rec.title}”…`);
  try {
    const file = await store().file(rec), original = await store().original(rec);
    const entry = await window.PianoScoreImport.fromFile(file, { id: 'mine-' + rec.id, title: rec.title, composer: rec.composer, hands: rec.settings?.hands });
    say(''); present(entry, original, 'my song');
  } catch (e) { say(e.message || String(e), true); }
}

async function save(file, meta) {
  if (songs.length >= MAX_SONGS) throw new Error(`You have ${MAX_SONGS} songs. Delete one before adding another.`);
  const rec = await store().add(file, { ...meta, title: meta.title.slice(0, 200), composer: (meta.composer || '').slice(0, 200) });
  await refresh(); say(`Saved “${rec.title}” to My songs.`);
  return rec;
}

document.addEventListener('change', e => { if (e.target.matches('input[type=checkbox]') && !e.target.closest('#my-songs, #score-import')) schedulePush(); });

async function init() {
  section = $('#my-songs'); accountBox = $('#account-box'); if (!section) return;
  statusLine = el('p', '', 'mine-status'); statusLine.setAttribute('role', 'status'); statusLine.setAttribute('aria-live', 'polite');
  section.append(el('div', undefined, 'mine-body'), statusLine);
  renderAccount(); render();
  migrateOldScores().catch(() => {}).then(() => { if (!user) refresh(); });
  if (CLOUD) {
    try {
      await loadScript(SUPABASE_JS);
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } });
      const { data } = await sb.auth.getSession(); user = data.session?.user || null;
      sb.auth.onAuthStateChange((event, session) => {
        const next = session?.user || null; if ((next && next.id) === (user && user.id)) return;
        user = next; renderAccount(); refresh(); window.dispatchEvent(new Event('piano-songs-where')); if (user) pullProgress().catch(() => {});
      });
      if (user) pullProgress().catch(() => {});
    } catch (e) { say(e.message, true); }
  }
  renderAccount(); refresh(); window.dispatchEvent(new Event('piano-songs-where'));
}
document.addEventListener('DOMContentLoaded', init);
window.PianoSongs = { save, open, present, refresh, where, signedIn: () => !!user };
})();
