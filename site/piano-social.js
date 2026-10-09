'use strict';
// OpenPiano community: a social space for people learning piano.
//   #feed            Following / Discover feeds, the post composer, people to follow, activity
//   #post/<id>       one post with its comments
//   #profile/<id>    a member's community profile: follow/friends, what they are working on, posts
//   #profile         your own community settings, working-on list, follow requests, blocked people
//   library pieces   "From the community" strip: progress and clips about that piece
// Reels (#reels) live in piano-social-reels.js and reuse the helpers exported here.
// Posts can carry a photo (re-encoded here as JPEG, which also drops camera location data) or a link
// to a YouTube performance. Direct video uploads are built but switched off on the server until
// support covers a paid storage plan; the composer then shows them as "coming as support grows".
// Everything goes through the RPCs in scripts/supabase-social.sql; text is always set with
// textContent, never as HTML.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const auth = () => window.PianoCommunityAuth;
  const signed = () => !!auth()?.signedIn();
  let setupMissing = false;

  // ---------- data ----------
  const waiters = [];
  const whenReady = () => auth()?.ready() ? Promise.resolve() : new Promise(r => waiters.push(r));
  function flushWaiters() { if (auth()?.ready()) waiters.splice(0).forEach(f => f()); }
  function friendly(message = '') {
    if (/could not find the function|schema cache|does not exist|PGRST20/i.test(message)) {
      setupMissing = true;
      return 'The community is not switched on yet. The site owner still needs to install its database update.';
    }
    return message;
  }
  async function rpc(name, args = {}) {
    await whenReady();
    const { data, error } = await auth().rpc(name, args);
    if (error) throw new Error(friendly(error.message));
    return data;
  }
  let me = null, meEpoch = 0;
  async function refreshMe() {
    const epoch = ++meEpoch;
    if (!signed()) { me = null; emit(); return null; }
    try { const m = await rpc('social_me'); if (epoch === meEpoch) me = m; }
    catch { if (epoch === meEpoch) me = null; }
    emit(); return me;
  }
  const joined = () => !!me?.member;
  const active = () => !!me?.active;
  const isTeen = () => me?.member?.age_band === 'teen';
  function emit() { window.dispatchEvent(new Event('piano-social-me')); }

  async function media(paths) {
    try { return await auth()?.mediaUrls?.(paths) || new Map(); } catch { return new Map(); }
  }

  // ---------- YouTube links and photos ----------
  function youtube(url) {
    let u; try { u = new URL(String(url || '').trim()); } catch { return null; }
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else { const m = u.pathname.match(/^\/(shorts|live|embed|v)\/([^/?#]+)/); if (m) id = m[2]; }
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) return null;
    const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
    const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    const start = m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
    return { id, start: Math.min(86400, start || 0) };
  }
  const ytThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const ytEmbed = (id, start = 0, extra = '') => `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1${start ? '&start=' + start : ''}${extra}`;
  // Photos: scale to at most 1600 px and save as JPEG. Re-encoding drops EXIF (including GPS).
  async function preparePhoto(file) {
    if (!/^image\//.test(file?.type || '')) throw new Error('Choose a photo (JPG, PNG, WebP or HEIC your browser can open).');
    if (file.size > 30 * 1024 * 1024) throw new Error('That photo is too large.');
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw new Error('This browser cannot open that photo. Try a JPG or PNG.'); }
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
    for (const q of [0.84, 0.72, 0.6]) {
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= 4.5 * 1024 * 1024) return blob;
    }
    throw new Error('That photo is still too large after shrinking.');
  }
  function comingSoon(compact = false) {
    const box = el('div', undefined, 'sp-soon' + (compact ? ' compact' : ''));
    box.append(el('strong', 'Coming as support grows'), el('p', 'Uploading video clips straight to OpenPiano needs paid storage. For now, upload your performance to YouTube (Unlisted works) and share the link. Every bit of support brings direct clips closer.'));
    const a = el('a', 'Support OpenPiano →'); a.href = '#support'; box.append(a);
    return box;
  }

  // ---------- small UI helpers ----------
  const ICONS = {
    heart: 'M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z',
    comment: 'M4 5h16v11H9l-5 4z',
    share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    friends: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-3.6 3.2-6 6.5-6s6 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18.5 14c1.8.8 3 2.9 3.3 6',
    lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    play: 'M8 5v14l11-7z',
    video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
    music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    close: 'M6 6l12 12M18 6L6 18',
    sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
    mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.5l4.5 4.5L19 7',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    image: 'M4 5h16v14H4zM4 15l4.5-4.5 4 4 3-3L20 16M15.5 9.5h.01',
    up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6',
  };
  function icon(name, cls = 'sp-ic') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', cls);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name] || ''); svg.append(p);
    return svg;
  }
  function button(text, fn, cls = 'secondary small', ic) {
    const b = el('button', undefined, cls); b.type = 'button';
    if (ic) b.append(icon(ic));
    if (text) b.append(el('span', text));
    if (fn) b.onclick = e => fn(e, b);
    return b;
  }
  async function busy(b, fn) {
    if (b) b.disabled = true;
    try { return await fn(); } catch (e) { toast(e.message || String(e), true); } finally { if (b) b.disabled = false; }
  }
  let toastEl, toastTimer;
  function toast(text, bad = false) {
    if (!toastEl) { toastEl = el('p', '', 'sp-toast'); toastEl.setAttribute('role', 'status'); document.body.append(toastEl); }
    toastEl.textContent = text; toastEl.classList.toggle('bad', bad); toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), bad ? 6000 : 2800);
  }
  function when(ts) {
    const t = new Date(ts).getTime(); if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'now';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    if (s < 7 * 86400) return Math.floor(s / 86400) + ' d';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  const cleanTitle = t => String(t || '').replace(/ · (complete|full piece|learning arrangement|theme arrangement)$/i, '');
  const catalog = () => new Set((window.PianoCurriculum?.pieces || []).map(p => p.id));
  function pieceInfo(id, fallback) {
    const r = id && window.PianoRepertoire?.[id];
    if (r) return { title: cleanTitle(r.title), composer: r.composer || '', href: '#library/piece/' + encodeURIComponent(id), id };
    if (id) return { title: fallback || 'Library piece', composer: '', href: '#library/piece/' + encodeURIComponent(id), id };
    return fallback ? { title: fallback, composer: '', href: '', id: null } : null;
  }
  function pieceChip(id, fallback) {
    const info = pieceInfo(id, fallback); if (!info) return null;
    const chip = el(info.href ? 'a' : 'span', undefined, 'sp-piece');
    if (info.href) chip.href = info.href;
    chip.append(icon('music'), el('span', info.title + (info.composer ? ' · ' + info.composer : '')));
    return chip;
  }
  function avatar(author, cls = '') {
    const a = window.PianoProfiles?.avatar?.(author?.name || '?', author?.avatar_path) || el('span', (author?.name || '?').slice(0, 1), 'profile-avatar');
    if (cls) a.classList.add(cls);
    return a;
  }
  function authorLink(author, cls = 'sp-name') {
    const a = el('a', author?.name || 'Musician', cls); a.href = '#profile/' + (author?.id || ''); return a;
  }
  const VIS = { public: ['globe', 'Public'], friends: ['friends', 'Friends'], private: ['lock', 'Only me'] };
  function visChip(v) { const [ic, t] = VIS[v] || VIS.public; const s = el('span', undefined, 'sp-vis'); s.title = 'Visible to: ' + t; s.append(icon(ic), el('span', t)); return s; }
  const STATUS = { starting: 'Just started', learning: 'Learning', polishing: 'Polishing', performing: 'Performance-ready' };
  const HANDS = { RH: 'Right hand', LH: 'Left hand', BH: 'Both hands' };

  function signInPrompt(text = 'Sign in to join the community.') {
    const p = el('p', text + ' ', 'sp-note'); const a = el('a', 'Sign in'); a.href = '#mine'; p.append(a); return p;
  }

  // Close any open menu when clicking elsewhere.
  document.addEventListener('click', e => { for (const m of document.querySelectorAll('.sp-menu[open]')) if (!m.contains(e.target)) m.removeAttribute('open'); });
  function menu(items, cls = '') {
    const d = el('details', undefined, 'sp-menu ' + cls), s = el('summary');
    s.setAttribute('aria-label', 'More actions'); s.append(icon('more'));
    const list = el('div', undefined, 'sp-menu-list');
    for (const [text, fn, danger] of items.filter(Boolean)) {
      const b = el('button', text, danger ? 'danger' : ''); b.type = 'button';
      b.onclick = e => { e.preventDefault(); d.removeAttribute('open'); fn(b); };
      list.append(b);
    }
    d.append(s, list); return d;
  }
  // Two taps to confirm destructive actions, like elsewhere on the site.
  function armed(b, text = 'Tap again to confirm') {
    if (b.dataset.armed) return true;
    const old = b.textContent; b.dataset.armed = '1'; b.textContent = text;
    setTimeout(() => { delete b.dataset.armed; b.textContent = old; }, 3000);
    return false;
  }

  // ---------- follow / friends ----------
  function followLabel(r) {
    if (!r || r.mine) return null;
    if (r.following === 'active' && r.follows_me === 'active') return ['Friends', 'is-on', 'check'];
    if (r.following === 'active') return ['Following', 'is-on', 'check'];
    if (r.following === 'pending') return ['Requested', 'is-on', null];
    if (r.follows_me === 'active') return ['Follow back', '', 'plus'];
    return [r.approval ? 'Ask to follow' : 'Follow', '', 'plus'];
  }
  function followButton(person, onChange, small = true) {
    const r = person.relation; const label = followLabel(r); if (!label) return null;
    const b = button(label[0], null, (small ? 'small ' : '') + 'sp-follow ' + label[1], label[2]);
    b.title = r?.following === 'active' && r?.follows_me === 'active' ? 'You follow each other' : r?.follows_me === 'active' ? 'Follows you' : '';
    b.onclick = () => busy(b, async () => {
      if (!signed()) { location.hash = '#mine'; toast('Sign in to follow musicians.'); return; }
      if (!active()) { location.hash = '#feed'; toast('Join the community first.'); return; }
      const on = !r.following;
      if (!on && !armed(b, r.following === 'pending' ? 'Cancel request?' : 'Unfollow?')) return;
      person.relation = await rpc('social_follow', { p_id: person.id, p_on: on });
      if (on && person.relation.following === 'pending') toast('Request sent. They need to accept it.');
      const next = followButton(person, onChange, small); b.replaceWith(next || el('span'));
      onChange?.(person.relation); refreshMe();
    });
    return b;
  }
  function personRow(person, extra) {
    const row = el('div', undefined, 'sp-person');
    const info = el('div', undefined, 'sp-person-info');
    info.append(authorLink(person), el('small', person.experience ? person.experience + ' · self-described' : ''));
    row.append(avatar(person), info);
    if (extra) row.append(extra);
    else { const f = followButton(person); if (f) row.append(f); }
    return row;
  }

  // ---------- reports and blocks ----------
  function reportForm(kind, target, after) {
    const f = el('form', undefined, 'sp-report');
    const label = el('label', 'What is wrong?'), reason = el('textarea'); reason.maxLength = 500; reason.rows = 2; reason.required = true;
    reason.placeholder = 'For example: not about music, unkind, spam, private information, someone under 13';
    label.append(reason);
    const send = el('button', 'Send report', 'small'); send.type = 'submit';
    const cancel = button('Cancel', () => f.remove());
    const row = el('div', undefined, 'sp-row'); row.append(send, cancel);
    f.append(label, row, el('p', 'Reports go privately to the site maintainer. Videos reported by several people are hidden until reviewed.', 'muted'));
    f.onsubmit = e => { e.preventDefault(); busy(send, async () => { await rpc('social_report', { p_kind: kind, p_target: target, p_reason: reason.value.trim() }); f.replaceWith(el('p', 'Thank you. The report was sent.', 'sp-note')); after?.(); }); };
    return f;
  }
  async function block(person, b) {
    if (!signed()) { location.hash = '#mine'; return false; }
    if (b && !armed(b, 'Block ' + (person.name || 'this person') + '?')) return false;
    await rpc('social_block', { p_id: person.id, p_on: true });
    toast('Blocked. You will not see each other’s posts, and follows were removed.');
    refreshMe(); return true;
  }

  // ---------- comments ----------
  function comments(post, onCount) {
    const box = el('div', undefined, 'sp-comments');
    const list = el('ul', undefined, 'sp-comment-list');
    box.append(list);
    async function load() {
      list.replaceChildren(el('li', 'Loading comments…', 'muted'));
      try {
        const items = await rpc('social_comments_list', { p_post: post.id });
        list.replaceChildren();
        if (!items.length) list.append(el('li', 'No comments yet.', 'muted sp-empty-line'));
        for (const c of items) list.append(commentRow(c));
        onCount?.(items.length);
      } catch (e) { list.replaceChildren(el('li', e.message, 'bad')); }
    }
    function commentRow(c) {
      const li = el('li', undefined, 'sp-comment');
      const body = el('div', undefined, 'sp-comment-body');
      const top = el('div', undefined, 'sp-comment-top');
      top.append(authorLink(c.author), el('time', when(c.created_at)));
      body.append(top, el('p', c.body));
      const acts = el('div', undefined, 'sp-comment-acts');
      if (c.can_delete) acts.append(button('Remove', (e, b) => { if (armed(b, 'Remove?')) busy(b, async () => { await rpc('social_comment_delete', { p_id: c.id }); li.remove(); post.comments = Math.max(0, (post.comments || 1) - 1); onCount?.(post.comments); }); }, 'linkish'));
      if (!c.mine && signed()) acts.append(button('Report', () => { if (!li.querySelector('.sp-report')) li.append(reportForm('comment', c.id)); }, 'linkish'));
      body.append(acts);
      li.append(avatar(c.author), body);
      return li;
    }
    if (post.can_comment) {
      const f = el('form', undefined, 'sp-comment-form');
      const input = el('input'); input.maxLength = 1000; input.placeholder = 'Add an encouraging comment…'; input.setAttribute('aria-label', 'Comment');
      const send = el('button', 'Send', 'small'); send.type = 'submit';
      f.append(avatar(me?.profile || {}), input, send);
      f.onsubmit = e => { e.preventDefault(); const text = input.value.trim(); if (!text) return; busy(send, async () => { await rpc('social_comment', { p_post: post.id, p_body: text }); input.value = ''; post.comments = (post.comments || 0) + 1; await load(); }); };
      box.append(f);
    } else if (!signed()) box.append(signInPrompt('Sign in to comment.'));
    else if (!active()) { const p = el('p', 'Join the community to comment. ', 'sp-note'); const a = el('a', 'Join'); a.href = '#feed'; p.append(a); box.append(p); }
    else box.append(el('p', 'Only friends can comment on this post.', 'sp-note'));
    load();
    return box;
  }

  // ---------- post cards ----------
  function statsBlock(stats) {
    if (!stats) return null;
    const box = el('div', undefined, 'sp-stats');
    if (typeof stats.accuracy === 'number') {
      const ring = el('div', undefined, 'sp-ring'); ring.style.setProperty('--p', stats.accuracy);
      ring.append(el('strong', stats.accuracy + '%'), el('small', 'accuracy'));
      box.append(ring);
    }
    const facts = el('ul', undefined, 'sp-facts');
    const add = (k, v) => { if (v != null && v !== '') { const li = el('li'); li.append(el('strong', String(v)), el('span', k)); facts.append(li); } };
    add('BPM', stats.bpm); add('hands', stats.hands && HANDS[stats.hands]?.replace(' hands', '').replace(' hand', ''));
    add('right', stats.correct); add('to fix', stats.wrong); add('bars', stats.bars); add('minutes', stats.minutes);
    if (facts.children.length) box.append(facts);
    return box;
  }
  function videoBlock(post) {
    const fig = el('figure', undefined, 'sp-video');
    const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.hidden = true;
    const play = button('', null, 'sp-play', 'play'); play.setAttribute('aria-label', 'Play video');
    const len = el('span', post.video_seconds ? Math.round(post.video_seconds) + ' s' : '', 'sp-len');
    fig.append(img, play, len);
    if (post.poster_path) media([post.poster_path]).then(m => { const u = m.get(post.poster_path); if (u) { img.src = u; img.hidden = false; } });
    play.onclick = () => busy(play, async () => {
      const m = await media([post.video_path]); const src = m.get(post.video_path);
      if (!src) throw new Error('This video is not available.');
      const v = el('video'); v.controls = true; v.playsInline = true; v.preload = 'auto'; v.src = src;
      if (img.src) v.poster = img.src;
      fig.replaceChildren(v); v.play().catch(() => {});
    });
    const open = el('a', 'Watch in Reels', 'sp-to-reels'); open.href = '#reels/' + post.id;
    const wrap = el('div', undefined, 'sp-video-wrap'); wrap.append(fig, open);
    return wrap;
  }
  function photoBlock(post) {
    const fig = el('figure', undefined, 'sp-photo');
    const img = el('img'); img.alt = post.body ? 'Photo: ' + post.body.slice(0, 80) : 'Photo'; img.loading = 'lazy';
    fig.append(img);
    media([post.image_path]).then(m => { const u = m.get(post.image_path); if (u) img.src = u; else fig.remove(); });
    img.onclick = () => { if (!img.src) return; const d = el('dialog', undefined, 'sp-lightbox'); const big = el('img'); big.src = img.src; big.alt = img.alt; d.append(big); d.onclick = () => d.close(); d.onclose = () => d.remove(); document.body.append(d); d.showModal(); };
    return fig;
  }
  function youtubeBlock(post) {
    const wrap = el('div', undefined, 'sp-video-wrap');
    const fig = el('figure', undefined, 'sp-video sp-yt');
    const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.src = ytThumb(post.youtube_id); img.referrerPolicy = 'no-referrer';
    const play = button('', null, 'sp-play', 'play'); play.setAttribute('aria-label', 'Play the performance');
    fig.append(img, play, el('span', 'YouTube', 'sp-len'));
    play.onclick = () => {
      const f = el('iframe'); f.src = ytEmbed(post.youtube_id, post.youtube_start, '&autoplay=1'); f.title = 'Performance on YouTube';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.referrerPolicy = 'strict-origin-when-cross-origin';
      fig.replaceChildren(f); fig.classList.add('playing');
    };
    const row = el('div', undefined, 'sp-row sp-yt-links');
    const open = el('a', 'Watch in Reels', 'sp-to-reels'); open.href = '#reels/' + post.id;
    row.append(open);
    wrap.append(fig, row);
    return wrap;
  }
  function editForm(post, card, bodyEl) {
    const f = el('form', undefined, 'sp-edit');
    const t = el('textarea'); t.maxLength = 2000; t.rows = 3; t.value = post.body || ''; t.setAttribute('aria-label', 'Post text');
    const vis = visibilitySelect(post.chosen_visibility || post.visibility);
    const save = el('button', 'Save', 'small'); save.type = 'submit';
    const row = el('div', undefined, 'sp-row'); row.append(vis, save, button('Cancel', () => { f.replaceWith(bodyEl); }));
    f.append(t, row);
    f.onsubmit = e => { e.preventDefault(); busy(save, async () => {
      const p = await rpc('social_post_save', { p_id: post.id, p_body: t.value, p_piece: post.piece, p_piece_title: post.piece_title, p_visibility: vis.value });
      card.replaceWith(postCard(p));
    }); };
    return f;
  }
  function postCard(post, opts = {}) {
    if (post.type === 'note' || post.type === 'addon') return activityCard(post);
    const card = el('article', undefined, 'sp-card sp-kind-' + post.kind); card.dataset.post = post.id;
    const head = el('header', undefined, 'sp-card-head');
    const who = el('div', undefined, 'sp-who');
    const meta = el('div', undefined, 'sp-meta');
    const t = el('a', when(post.created_at), 'sp-time'); t.href = '#post/' + post.id; t.title = new Date(post.created_at).toLocaleString();
    meta.append(t);
    if (post.mine || post.visibility !== 'public') meta.append(visChip(post.visibility));
    if (post.edited_at) meta.append(el('span', 'edited', 'muted'));
    const kindNote = post.kind === 'progress' ? 'shared practice progress' : post.kind === 'video' ? 'posted a clip' : post.youtube_id ? 'shared a performance' : post.image_path ? 'shared a photo' : '';
    const line = el('div', undefined, 'sp-who-line'); line.append(authorLink(post.author)); if (kindNote) line.append(el('span', ' ' + kindNote, 'muted'));
    who.append(line, meta);
    head.append(avatar(post.author), who);
    if (!post.mine && !post.following && signed() && active()) { const f = followButton({ ...post.author, relation: post.relation || { following: null, follows_me: null, approval: false } }); if (f) { f.classList.add('sp-follow-quiet'); head.append(f); } }
    const bodyEl = el('p', post.body || '', 'sp-body'); if (!post.body) bodyEl.hidden = true;
    const items = post.mine ? [
      ['Edit', () => bodyEl.replaceWith(editForm(post, card, bodyEl))],
      ['Delete post', b => { if (armed(b, 'Delete for good?')) busy(null, async () => { const r = await rpc('social_post_delete', { p_id: post.id }); await auth()?.removeMedia?.(r?.media || []).catch(() => {}); card.remove(); toast('Post deleted.'); opts.onRemove?.(); }); }, true],
    ] : [
      signed() && ['Report post', () => { if (!card.querySelector(':scope > .sp-report')) card.append(reportForm('post', post.id)); }],
      signed() && ['Block ' + (post.author?.name || 'author'), b => busy(null, async () => { if (await block(post.author, b)) { card.remove(); opts.onRemove?.(); } }), true],
      ['Copy link', () => share(post)],
    ];
    head.append(menu(items));
    card.append(head);
    const chip = pieceChip(post.piece, post.piece_title); if (chip) card.append(chip);
    if (post.kind === 'progress' || post.stats) { const s = statsBlock(post.stats); if (s) card.append(s); }
    card.append(bodyEl);
    if (post.kind === 'video') card.append(videoBlock(post));
    if (post.image_path) card.append(photoBlock(post));
    if (post.youtube_id) card.append(youtubeBlock(post));
    card.append(actionsBar(post, card, opts));
    if (opts.expanded) card.append(comments(post));
    return card;
  }
  function actionsBar(post, card, opts = {}) {
    const bar = el('footer', undefined, 'sp-actions');
    const like = button(String(post.likes || 0), null, 'sp-act' + (post.liked ? ' is-on' : ''), 'heart');
    like.setAttribute('aria-pressed', String(!!post.liked)); like.setAttribute('aria-label', (post.liked ? 'Unlike' : 'Like') + ' · ' + (post.likes || 0) + ' likes');
    like.onclick = () => busy(like, async () => {
      if (!signed()) { location.hash = '#mine'; toast('Sign in to like posts.'); return; }
      if (!active()) { location.hash = '#feed'; toast('Join the community first.'); return; }
      const r = await rpc('social_like', { p_post: post.id, p_on: !post.liked });
      post.liked = r.liked; post.likes = r.likes;
      like.classList.toggle('is-on', post.liked); like.setAttribute('aria-pressed', String(post.liked)); like.querySelector('span').textContent = String(post.likes);
      if (post.liked) { like.classList.remove('pop'); void like.offsetWidth; like.classList.add('pop'); }
      opts.onLike?.(post);
    });
    const talk = button(String(post.comments || 0), null, 'sp-act', 'comment'); talk.setAttribute('aria-label', 'Comments');
    const count = n => { talk.querySelector('span').textContent = String(n); };
    talk.onclick = () => {
      if (opts.onComments) { opts.onComments(post, count); return; }
      const open = card.querySelector(':scope > .sp-comments');
      if (open) open.remove(); else card.append(comments(post, count));
    };
    const sh = button('Share', () => share(post), 'sp-act', 'share');
    bar.append(like, talk, sh);
    return bar;
  }
  async function share(post) {
    const url = location.origin + location.pathname + '#post/' + post.id;
    try {
      if (navigator.share && matchMedia('(pointer:coarse)').matches) { await navigator.share({ title: 'OpenPiano', text: post.body?.slice(0, 80) || 'Practice on OpenPiano', url }); return; }
      await navigator.clipboard.writeText(url); toast(post.visibility === 'public' ? 'Link copied.' : 'Link copied. Only people who can see this post can open it.');
    } catch { toast(url); }
  }
  function activityCard(item) {
    const card = el('article', undefined, 'sp-card sp-activity-card');
    const info = pieceInfo(item.piece) || { title: 'a piece', href: '#library' };
    const line = el('p', undefined, 'sp-activity-line');
    line.append(authorLink(item.author),
      item.type === 'addon' ? ` published a fingering add-on (${item.notes} note${item.notes === 1 ? '' : 's'}) for ` : item.reply ? ' replied in the notes on ' : item.kind === 'fingering' ? ' shared fingering on ' : ' commented on ');
    const a = el('a', info.title, 'sp-strong'); a.href = info.href; line.append(a);
    const head = el('div', undefined, 'sp-activity-head'); head.append(avatar(item.author, 'sm'), line, el('time', when(item.created_at), 'sp-time'));
    card.append(head);
    if (item.body) { const q = el('blockquote', item.body, 'sp-quote'); if (item.note_label) q.prepend(el('span', item.note_label + ' · ', 'sp-strong')); card.append(q); }
    const go = el('a', item.type === 'addon' ? 'Open the piece to try it →' : 'Join the discussion →', 'sp-go'); go.href = info.href; card.append(go);
    return card;
  }

  // ---------- piece picker ----------
  let pickerDialog;
  function pickPiece(onPick) {
    if (!pickerDialog) {
      pickerDialog = el('dialog', undefined, 'sp-dialog sp-picker');
      pickerDialog.setAttribute('aria-label', 'Choose a piece');
      document.body.append(pickerDialog);
      pickerDialog.addEventListener('click', e => { if (e.target === pickerDialog) pickerDialog.close(); });
    }
    const d = pickerDialog; d.replaceChildren();
    const top = el('div', undefined, 'sp-dialog-top');
    const input = el('input'); input.type = 'search'; input.placeholder = 'Find a library piece, or type your own song'; input.setAttribute('aria-label', 'Piece');
    top.append(input, button('', () => d.close(), 'sp-icon-btn', 'close'));
    const list = el('ul', undefined, 'sp-pick-list');
    d.append(top, list);
    const ids = catalog();
    const all = Object.values(window.PianoRepertoire || {}).filter(p => p?.id && p.title && ids.has(p.id));
    const recent = (() => { try { return Object.entries(JSON.parse(localStorage.getItem('openpiano-practice-log-v1'))?.pieces || {}).sort((a, b) => (b[1].last || 0) - (a[1].last || 0)).map(([id]) => id); } catch { return []; } })();
    function render() {
      const q = input.value.trim().toLowerCase(); list.replaceChildren();
      const items = q ? all.filter(p => (p.title + ' ' + (p.composer || '')).toLowerCase().includes(q)).slice(0, 30)
        : recent.map(id => window.PianoRepertoire?.[id]).filter(p => p && ids.has(p.id)).slice(0, 8).concat(all.slice(0, 12)).filter((p, i, a) => a.indexOf(p) === i).slice(0, 16);
      if (q) {
        const own = el('li'); const b = button(`Use “${input.value.trim().slice(0, 120)}” (your own song)`, () => { d.close(); onPick({ piece: null, title: input.value.trim().slice(0, 120) }); }, 'sp-pick sp-pick-own', 'plus');
        own.append(b); list.append(own);
      }
      for (const p of items) {
        const li = el('li'); const b = button('', () => { d.close(); onPick({ piece: p.id, title: cleanTitle(p.title) }); }, 'sp-pick');
        b.append(el('strong', cleanTitle(p.title)), el('small', p.composer || ''));
        li.append(b); list.append(li);
      }
      if (!list.children.length) list.append(el('li', 'Type to search the library.', 'muted'));
    }
    input.oninput = render; render();
    d.showModal(); input.focus();
  }

  // ---------- composer ----------
  let prefill = null;
  function visibilitySelect(value) {
    const s = el('select', undefined, 'sp-vis-select'); s.setAttribute('aria-label', 'Who can see this');
    for (const [v, [, t]] of Object.entries(VIS)) { const o = el('option', t); o.value = v; s.append(o); }
    s.value = value || me?.member?.default_visibility || 'public';
    return s;
  }
  function composer(onPosted) {
    const box = el('form', undefined, 'sp-composer');
    const state = { piece: null, title: '', stats: null, file: null, info: null, start: 0, photo: null, photoUrl: '', yt: null };
    if (prefill) { Object.assign(state, { piece: prefill.piece || null, title: prefill.title || '', stats: prefill.stats || null }); }
    const top = el('div', undefined, 'sp-composer-top');
    const text = el('textarea'); text.maxLength = 2000; text.rows = 2; text.placeholder = prefill?.placeholder || 'What are you practicing? Share a win, a question or a goal.'; text.setAttribute('aria-label', 'Post text');
    if (prefill?.body) text.value = prefill.body;
    top.append(avatar(me?.profile || {}), text);
    const extras = el('div', undefined, 'sp-composer-extras');
    const preview = el('div', undefined, 'sp-composer-preview');
    const tools = el('div', undefined, 'sp-composer-tools');
    const pieceBtn = button('Piece', () => pickPiece(p => { state.piece = p.piece; state.title = p.title; draw(); }), 'sp-tool', 'music');
    const file = el('input'); file.type = 'file'; file.accept = 'video/mp4,video/quicktime,video/webm,video/*'; file.hidden = true;
    const videoBtn = button('Video', () => file.click(), 'sp-tool', 'video');
    const photoIn = el('input'); photoIn.type = 'file'; photoIn.accept = 'image/*'; photoIn.hidden = true;
    const photoBtn = button('Photo', () => photoIn.click(), 'sp-tool', 'image');
    const ytBtn = button('YouTube', () => askYoutube(), 'sp-tool', 'play');
    const soonBtn = button('Clips', () => { if (!preview.querySelector('.sp-soon')) preview.prepend(comingSoon(true)); }, 'sp-tool sp-tool-soon', 'video');
    soonBtn.title = 'Direct video uploads are coming as support grows'; soonBtn.append(el('small', 'soon'));
    if (prefill?.video) (me?.video_uploads ? videoBtn : ytBtn).classList.add('pulse');
    const vis = visibilitySelect();
    const post = el('button', 'Post', 'sp-post'); post.type = 'submit';
    const status = el('p', '', 'sp-composer-status'); status.setAttribute('role', 'status');
    const spacer = el('span', undefined, 'sp-grow');
    tools.append(pieceBtn, photoBtn, photoIn, ytBtn, ...(me?.video_uploads ? [videoBtn, file] : [soonBtn]), spacer, vis, post);
    function clearMedia() {
      if (state.info?.url) URL.revokeObjectURL(state.info.url);
      if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
      Object.assign(state, { file: null, info: null, photo: null, photoUrl: '', yt: null });
      preview.replaceChildren(); status.textContent = '';
    }
    function askYoutube() {
      clearMedia();
      const f = el('div', undefined, 'sp-yt-ask');
      const l = el('label', 'Link to your performance on YouTube'), input = el('input'); input.type = 'url'; input.placeholder = 'https://youtu.be/…'; l.append(input);
      const add = button('Add', null, 'small'), cancel = button('Cancel', () => clearMedia());
      const row = el('div', undefined, 'sp-row'); row.append(add, cancel);
      f.append(l, row, el('p', 'Share only your own playing. Unlisted videos work; private ones will not play for others.', 'muted'));
      const accept = () => {
        const yt = youtube(input.value);
        if (!yt) { status.textContent = 'That does not look like a YouTube video link.'; status.classList.add('bad'); return; }
        state.yt = yt; status.textContent = ''; status.classList.remove('bad');
        const card = el('div', undefined, 'sp-yt-chosen'); const img = el('img'); img.src = ytThumb(yt.id); img.alt = ''; img.referrerPolicy = 'no-referrer';
        card.append(img, el('span', 'YouTube performance' + (yt.start ? ` · starts at ${Math.floor(yt.start / 60)}:${String(yt.start % 60).padStart(2, '0')}` : '')), button('Remove', () => clearMedia(), 'secondary small'));
        preview.replaceChildren(card); draw();
      };
      add.onclick = accept; input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); accept(); } };
      preview.replaceChildren(f); input.focus();
    }
    photoIn.onchange = async () => {
      const f = photoIn.files?.[0]; photoIn.value = ''; if (!f) return;
      clearMedia(); preview.append(el('p', 'Preparing photo…', 'muted'));
      try {
        const blob = await preparePhoto(f);
        state.photo = blob; state.photoUrl = URL.createObjectURL(blob);
        const card = el('div', undefined, 'sp-photo-chosen'); const img = el('img'); img.src = state.photoUrl; img.alt = 'Photo to post';
        card.append(img, button('Remove photo', () => clearMedia(), 'secondary small'));
        preview.replaceChildren(card, el('p', 'Location data from your camera is removed. Avoid photos of copyrighted sheet music or of other people without asking them.', 'muted'));
        draw();
      } catch (e) { preview.replaceChildren(el('p', e.message, 'bad')); }
    };
    box.append(top, extras, preview, tools, status);
    function draw() {
      extras.replaceChildren();
      if (state.piece || state.title) {
        const chip = pieceChip(state.piece, state.title); chip.classList.add('removable');
        const x = button('', () => { state.piece = null; state.title = ''; draw(); }, 'sp-x', 'close'); x.setAttribute('aria-label', 'Remove piece');
        const wrap = el('span', undefined, 'sp-chip-wrap'); wrap.append(chip, x); extras.append(wrap);
      }
      if (state.stats) {
        const s = state.stats, chip = el('span', undefined, 'sp-chip-wrap');
        chip.append(el('span', [s.accuracy != null && s.accuracy + '%', s.bpm && s.bpm + ' BPM', s.hands && HANDS[s.hands]].filter(Boolean).join(' · '), 'sp-piece'));
        const x = button('', () => { state.stats = null; draw(); }, 'sp-x', 'close'); x.setAttribute('aria-label', 'Remove result'); chip.append(x); extras.append(chip);
      }
      if (isTeen() && (state.file || state.photo || state.yt)) status.textContent = 'Photos and videos from members aged 13–17 are shown to friends only.';
    }
    file.onchange = async () => {
      const f = file.files?.[0]; file.value = '';
      if (!f) return;
      clearMedia(); preview.replaceChildren(el('p', 'Reading video…', 'muted'));
      try {
        if (state.info?.url) URL.revokeObjectURL(state.info.url);
        const info = await window.PianoSocialVideo.inspect(f);
        state.file = f; state.info = info; state.start = 0;
        const v = el('video'); v.src = info.url; v.muted = true; v.playsInline = true; v.controls = true; v.preload = 'metadata';
        const row = el('div', undefined, 'sp-video-pick');
        const facts = el('p', `${Math.round(info.seconds)} s · ${(info.size / 1048576).toFixed(1)} MB`, 'muted');
        const remove = button('Remove video', () => { URL.revokeObjectURL(info.url); state.file = null; state.info = null; preview.replaceChildren(); status.textContent = ''; }, 'secondary small');
        row.append(v);
        const side = el('div'); side.append(facts);
        if (info.needsTrim) {
          const label = el('label', `Clips are up to ${info.maxSeconds} s. Start at`); const r = el('input'); r.type = 'range'; r.min = 0; r.step = 0.5;
          r.max = Math.max(0, Math.floor(info.seconds - info.maxSeconds)); r.value = 0; const out = el('output', '0:00');
          r.oninput = () => { state.start = Number(r.value); out.textContent = Math.floor(state.start / 60) + ':' + String(Math.floor(state.start % 60)).padStart(2, '0'); v.currentTime = state.start; };
          label.append(r, out); side.append(label);
          if (!window.PianoSocialVideo.canReencode()) side.append(el('p', 'This browser cannot shorten videos. Trim it on your phone first.', 'bad'));
        }
        side.append(el('p', 'Share only your own playing. Anyone you show in the video should agree.', 'muted'), remove);
        row.append(side); preview.replaceChildren(row); draw();
      } catch (e) { preview.replaceChildren(el('p', e.message, 'bad')); }
    };
    let posting = false;
    box.onsubmit = async e => {
      e.preventDefault(); if (posting) return;
      const body = text.value.trim();
      if (!body && !state.file && !state.stats && !state.photo && !state.yt) { text.focus(); status.textContent = 'Write something, or add a photo or a YouTube performance.'; return; }
      posting = true; post.disabled = true; let uploaded = [];
      try {
        const kind = state.file ? 'video' : state.stats ? 'progress' : 'post';
        const args = { p_kind: kind, p_body: body, p_piece: state.piece, p_piece_title: state.title || '', p_visibility: vis.value, p_stats: state.stats };
        if (state.yt) Object.assign(args, { p_youtube_id: state.yt.id, p_youtube_start: state.yt.start });
        if (state.photo) {
          status.textContent = 'Uploading photo…';
          const ipath = `${me?.profile?.id}/${crypto.randomUUID()}.jpg`;
          await auth().uploadMedia(state.photo, ipath, 'image/jpeg'); uploaded.push(ipath);
          args.p_image_path = ipath;
        }
        if (state.file) {
          const space = await rpc('social_media_space').catch(() => null);
          if (space?.full) throw new Error('Video space is full for now. Text and progress posts still work.');
          if (space && space.today + 2 > space.uploads_per_day) throw new Error('You have reached today’s video limit. Try again tomorrow.');
          status.textContent = 'Preparing video…';
          const out = await window.PianoSocialVideo.prepare(state.file, { start: state.start, onProgress: p => { status.textContent = `Preparing video ${Math.round(p * 100)}%…`; } });
          status.textContent = 'Uploading…';
          const folder = me?.profile?.id, id = crypto.randomUUID();
          const vpath = `${folder}/${id}.${out.ext}`;
          await auth().uploadMedia(out.blob, vpath, out.type); uploaded.push(vpath);
          let ppath = null;
          if (out.poster) { ppath = `${folder}/${crypto.randomUUID()}.jpg`; try { await auth().uploadMedia(out.poster, ppath, 'image/jpeg'); uploaded.push(ppath); } catch { ppath = null; } }
          Object.assign(args, { p_video_path: vpath, p_poster_path: ppath, p_video_seconds: out.seconds });
        }
        status.textContent = 'Posting…';
        const saved = await rpc('social_post_save', args);
        uploaded = [];
        prefill = null;
        clearMedia();
        status.textContent = saved.visibility !== vis.value ? 'Posted. Shown to friends only (members aged 13–17).' : '';
        onPosted?.(saved);
        toast('Posted.');
      } catch (err) {
        if (uploaded.length) await auth()?.removeMedia?.(uploaded).catch(() => {});
        status.textContent = err.message || String(err); status.classList.add('bad');
      } finally { posting = false; post.disabled = false; }
    };
    text.addEventListener('input', () => status.classList.remove('bad'));
    draw();
    return box;
  }

  // ---------- join ----------
  function joinCard(onJoined) {
    const f = el('form', undefined, 'sp-join');
    f.append(el('p', 'OpenPiano community', 'eyebrow'), el('h2', 'Practice is better together.'),
      el('p', 'Post your progress, photos and performances, follow other pianists, see what everyone is working on, and cheer each other on.', 'muted'));
    const hasProfile = !!me?.profile?.name;
    let name;
    if (!hasProfile) { const l = el('label', 'Your name in the community'); name = el('input'); name.required = true; name.minLength = 2; name.maxLength = 40; name.autocomplete = 'off'; l.append(name); f.append(l); }
    const ages = el('fieldset', undefined, 'sp-ages'); ages.append(el('legend', 'Your age group'));
    const teenNote = el('p', 'For 13–17: people must ask to follow you, your videos are shown only to friends, only friends can comment, and you are not suggested to adults.', 'sp-note');
    teenNote.hidden = true;
    for (const [v, t] of [['adult', 'I’m 18 or older'], ['teen', 'I’m 13 to 17']]) {
      const l = el('label', undefined, 'sp-radio'); const r = el('input'); r.type = 'radio'; r.name = 'sp-age'; r.value = v; r.required = true;
      r.onchange = () => { teenNote.hidden = v !== 'teen'; };
      l.append(r, el('span', t)); ages.append(l);
    }
    f.append(ages, teenNote);
    const agree = el('label', undefined, 'check'); const ok = el('input'); ok.type = 'checkbox'; ok.required = true;
    const span = el('span', 'Make my music profile public (name, picture, experience, skills and bio) and follow the '); const rules = el('a', 'community rules'); rules.href = 'terms.html#community'; rules.target = '_blank';
    span.append(rules, '.'); agree.append(ok, span); f.append(agree);
    const go = el('button', 'Join the community'); go.type = 'submit'; f.append(go);
    f.onsubmit = e => { e.preventDefault(); busy(go, async () => {
      const age = f.querySelector('input[name=sp-age]:checked')?.value; if (!age) throw new Error('Choose your age group.');
      if (!hasProfile) await rpc('profile_save', { p_name: name.value.trim(), p_skills: '', p_bio: '', p_experience: 'Learning', p_published: false, p_avatar_path: null });
      me = await rpc('social_join', { p_age_band: age }); emit();
      window.dispatchEvent(new Event('piano-community-auth'));
      toast('Welcome to the community!'); onJoined?.();
    }); };
    return f;
  }
  function republishCard(onDone) {
    const box = el('div', undefined, 'sp-join sp-warn');
    box.append(el('h3', 'Your profile is private'), el('p', 'While your music profile is private, nobody else sees your posts, clips or profile.', 'muted'));
    box.append(button('Make my profile public again', (e, b) => busy(b, async () => { me = await rpc('social_join', { p_age_band: me.member.age_band }); emit(); window.dispatchEvent(new Event('piano-community-auth')); onDone?.(); }), 'small'));
    return box;
  }

  // ---------- feed page ----------
  const feed = { scope: null, items: [], before: null, done: false, loading: false, epoch: 0 };
  let feedRoot, feedList, feedMore, feedSide, feedComposerSlot, feedTabs, observer;
  function buildFeed() {
    const host = $('#social-feed'); if (!host || feedRoot) return;
    feedRoot = el('div', undefined, 'sp-page');
    const head = el('header', undefined, 'sp-head');
    const titles = el('div'); titles.append(el('h1', 'Community'), el('p', 'Share your practice, follow other pianists and keep each other going.', 'lead'));
    const tools = el('div', undefined, 'sp-head-tools');
    const search = el('div', undefined, 'sp-search');
    const sIn = el('input'); sIn.type = 'search'; sIn.placeholder = 'Find musicians'; sIn.setAttribute('aria-label', 'Find musicians');
    const sOut = el('div', undefined, 'sp-search-out'); sOut.hidden = true;
    let sTimer; sIn.oninput = () => { clearTimeout(sTimer); sTimer = setTimeout(async () => {
      const q = sIn.value.trim(); if (q.length < 2) { sOut.hidden = true; return; }
      try { const people = await rpc('social_search', { p_query: q }); sOut.replaceChildren(...(people.length ? people.map(p => personRow(p)) : [el('p', 'Nobody found.', 'muted')])); sOut.hidden = false; }
      catch (e) { sOut.replaceChildren(el('p', e.message, 'bad')); sOut.hidden = false; }
    }, 250); };
    document.addEventListener('click', e => { if (!search.contains(e.target)) sOut.hidden = true; });
    const lab = el('label', undefined, 'sp-search-box'); lab.append(icon('search'), sIn);
    search.append(lab, sOut);
    const bell = button('', () => openActivity(), 'sp-bell', 'bell'); bell.setAttribute('aria-label', 'Activity'); bell.append(el('span', '', 'sp-badge'));
    tools.append(search, bell);
    head.append(titles, tools);
    const grid = el('div', undefined, 'sp-grid');
    const main = el('div', undefined, 'sp-main');
    feedTabs = el('nav', undefined, 'sp-tabs'); feedTabs.setAttribute('aria-label', 'Feeds');
    for (const [v, t] of [['following', 'Following'], ['discover', 'Discover']]) {
      const a = el('a', t); a.href = '#feed/' + v; a.dataset.scope = v; feedTabs.append(a);
    }
    const reelsLink = el('a', undefined, 'sp-tab-reels'); reelsLink.href = '#reels'; reelsLink.append(icon('play'), el('span', 'Reels')); feedTabs.append(reelsLink);
    feedComposerSlot = el('div', undefined, 'sp-composer-slot');
    feedList = el('div', undefined, 'sp-list'); feedList.setAttribute('aria-live', 'polite');
    feedMore = button('Show more', () => loadFeed(), 'secondary sp-more'); feedMore.hidden = true;
    main.append(feedTabs, feedComposerSlot, feedList, feedMore);
    feedSide = el('aside', undefined, 'sp-side'); feedSide.setAttribute('aria-label', 'People and pieces');
    grid.append(main, feedSide);
    feedRoot.append(head, grid);
    host.append(feedRoot);
    observer = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !feed.done && !feed.loading && feed.items.length) loadFeed(); }, { rootMargin: '400px' }) : null;
    observer?.observe(feedMore);
  }
  function chooseScope(sub) {
    if (sub === 'following' || sub === 'discover') return sub;
    return signed() && active() ? 'following' : 'discover';
  }
  async function showFeed(sub) {
    buildFeed(); if (!feedRoot) return;
    const scope = chooseScope(sub);
    for (const a of feedTabs.querySelectorAll('a[data-scope]')) a.toggleAttribute('aria-current', a.dataset.scope === scope);
    renderComposerSlot(); renderSide();
    if (feed.scope !== scope || !feed.items.length) { feed.scope = scope; resetFeed(); await loadFeed(); }
  }
  function resetFeed() { feed.items = []; feed.before = null; feed.done = false; feed.epoch++; feedList.replaceChildren(); feedMore.hidden = true; }
  function renderComposerSlot() {
    if (!feedComposerSlot) return;
    feedComposerSlot.replaceChildren();
    if (setupMissing) { feedComposerSlot.append(el('p', friendly('does not exist'), 'sp-note sp-warn')); return; }
    if (!signed()) { const c = el('div', undefined, 'sp-join'); c.append(el('h2', 'Practice is better together.'), el('p', 'Sign in to post your progress and performances and follow other pianists. You can browse public posts without an account.', 'muted')); const a = el('a', 'Sign in', 'button'); a.href = '#mine'; c.append(a); feedComposerSlot.append(c); return; }
    if (!me) { feedComposerSlot.append(el('p', 'Loading…', 'muted')); return; }
    if (!joined()) { feedComposerSlot.append(joinCard(() => { renderComposerSlot(); renderSide(); feed.scope = null; showFeed('following'); })); return; }
    if (!active()) { feedComposerSlot.append(republishCard(() => { renderComposerSlot(); resetFeed(); loadFeed(); })); return; }
    const c = composer(saved => { feedComposerSlot.replaceChildren(); renderComposerSlot(); if (feed.scope === 'discover' && saved.visibility !== 'public') { location.hash = '#feed/following'; return; } feed.items.unshift(saved); feedList.prepend(postCard(saved)); feedList.querySelector('.sp-empty')?.remove(); });
    feedComposerSlot.append(c);
    if (!me?.video_uploads && matchMedia('(max-width:1000px)').matches && !sessionStorage.getItem('sp-soon-seen')) { const n = comingSoon(true); feedComposerSlot.append(n); try { sessionStorage.setItem('sp-soon-seen', '1'); } catch {} }
    if (prefill) { c.scrollIntoView({ block: 'center' }); c.querySelector('textarea')?.focus(); }
  }
  async function loadFeed() {
    const epoch = feed.epoch;
    if (feed.loading === epoch || feed.done) return;
    feed.loading = epoch;
    const loading = el('p', 'Loading…', 'muted sp-loading'); feedList.append(loading);
    try {
      const items = await rpc('social_feed', { p_scope: feed.scope, p_before: feed.before });
      if (epoch !== feed.epoch) return;
      for (const item of items) { feed.items.push(item); feedList.append(postCard(item, { onRemove: () => {} })); }
      if (items.length) feed.before = items[items.length - 1].created_at;
      feed.done = items.length < 20;
      if (!feed.items.length) feedList.append(emptyFeed());
    } catch (e) { if (epoch === feed.epoch) feedList.append(el('p', e.message, 'bad')); feed.done = true; if (setupMissing) renderComposerSlot(); }
    finally { loading.remove(); if (feed.loading === epoch) feed.loading = false; if (epoch === feed.epoch) feedMore.hidden = feed.done; }
  }
  function emptyFeed() {
    const box = el('div', undefined, 'sp-empty');
    if (feed.scope === 'following') {
      box.append(el('h3', 'Your feed is quiet.'), el('p', 'Follow a few pianists, or look at what everyone is sharing.', 'muted'));
      const a = el('a', 'Discover posts', 'button'); a.href = '#feed/discover'; box.append(a);
    } else box.append(el('h3', 'Nothing here yet.'), el('p', 'Be the first to share what you are practicing.', 'muted'));
    return box;
  }
  async function renderSide() {
    if (!feedSide) return;
    feedSide.replaceChildren();
    if (signed() && me?.member) {
      const card = el('section', undefined, 'sp-side-card sp-me');
      const top = el('div', undefined, 'sp-me-top'); top.append(avatar(me.profile || {}));
      const info = el('div'); const n = el('a', me.profile?.name || 'You', 'sp-name'); n.href = '#profile/' + (me.profile?.id || ''); info.append(n, el('small', `${me.followers} followers · ${me.following} following`)); top.append(info);
      card.append(top);
      if (me.requests) { const r = button(`${me.requests} follow request${me.requests > 1 ? 's' : ''}`, () => openActivity(), 'small sp-requests'); card.append(r); }
      const w = el('div', undefined, 'sp-working');
      w.append(el('h3', 'Working on'));
      if (me.working_on?.length) { const ul = el('ul'); for (const it of me.working_on.slice(0, 5)) ul.append(workingItem(it)); w.append(ul); }
      else w.append(el('p', 'Tell people what you are learning.', 'muted'));
      const edit = el('a', 'Edit list'); edit.href = '#profile'; w.append(edit);
      card.append(w); feedSide.append(card);
    }
    const sug = el('section', undefined, 'sp-side-card');
    sug.append(el('h3', 'Pianists to follow'));
    const list = el('div', undefined, 'sp-people'); list.append(el('p', 'Loading…', 'muted')); sug.append(list); feedSide.append(sug);
    if (!me?.video_uploads) feedSide.append(comingSoon());
    const rules = el('p', undefined, 'sp-fine'); const ra = el('a', 'Community rules'); ra.href = 'terms.html#community'; rules.append(ra, ' · Be kind, post your own playing, and report anything that worries you.');
    feedSide.append(rules);
    try {
      const people = await rpc('social_suggest');
      list.replaceChildren(...(people.length ? people.map(p => personRow(p)) : [el('p', 'No suggestions yet.', 'muted')]));
    } catch (e) { list.replaceChildren(el('p', e.message, 'muted')); }
  }
  function workingItem(it, compact = true) {
    const li = el('li', undefined, 'sp-work');
    const info = pieceInfo(it.piece, it.title);
    const t = el(info?.href ? 'a' : 'span', info?.title || it.title, 'sp-work-title'); if (info?.href) t.href = info.href;
    li.append(t, el('span', STATUS[it.status] || it.status, 'sp-status sp-status-' + it.status));
    if (!compact && it.note) li.append(el('small', it.note, 'muted'));
    return li;
  }

  // ---------- activity ----------
  let activityDialog, unread = 0;
  function badge(n) {
    unread = n || 0;
    for (const b of document.querySelectorAll('.sp-badge')) { b.textContent = unread > 9 ? '9+' : unread ? String(unread) : ''; b.hidden = !unread; }
  }
  async function pollActivity() {
    if (!signed() || !joined() || document.hidden) return;
    try { const a = await rpc('social_activity'); badge(a.unread); } catch {}
  }
  async function openActivity() {
    if (!signed()) { location.hash = '#mine'; return; }
    if (!activityDialog) {
      activityDialog = el('dialog', undefined, 'sp-dialog sp-activity'); activityDialog.setAttribute('aria-label', 'Activity');
      activityDialog.addEventListener('click', e => { if (e.target === activityDialog) activityDialog.close(); });
      document.body.append(activityDialog);
    }
    const d = activityDialog, top = el('div', undefined, 'sp-dialog-top');
    top.append(el('h2', 'Activity'), button('', () => d.close(), 'sp-icon-btn', 'close'));
    const list = el('ul', undefined, 'sp-activity-list'); list.append(el('li', 'Loading…', 'muted'));
    d.replaceChildren(top, list); d.showModal();
    try {
      const a = await rpc('social_activity');
      list.replaceChildren();
      if (!a.items.length) list.append(el('li', 'Nothing yet. When people follow you, like or comment on your posts, it shows up here.', 'muted'));
      for (const it of a.items) list.append(activityRow(it));
      await rpc('social_activity_seen'); badge(0);
    } catch (e) { list.replaceChildren(el('li', e.message, 'bad')); }
  }
  function activityRow(it) {
    const li = el('li', undefined, 'sp-act-row' + (it.type === 'follow' && it.detail === 'pending' ? ' is-request' : ''));
    const text = el('p');
    text.append(authorLink(it.person));
    if (it.type === 'follow') text.append(it.detail === 'pending' ? ' asked to follow you.' : ' started following you.');
    else {
      const what = it.detail === 'video' ? 'clip' : it.detail === 'progress' ? 'progress update' : 'post';
      const a = el('a', 'your ' + (it.type === 'like' ? what : 'post')); a.href = '#post/' + it.post;
      if (it.type === 'like') text.append(' liked ', a, '.');
      else { text.append(' commented on ', a, ': '); text.append(el('q', it.detail)); }
    }
    const body = el('div'); body.append(text, el('time', when(it.at), 'sp-time'));
    li.append(avatar(it.person, 'sm'), body);
    if (it.type === 'follow' && it.detail === 'pending') {
      const acts = el('div', undefined, 'sp-row');
      acts.append(button('Accept', (e, b) => busy(b, async () => { it.person.relation = await rpc('social_follower_set', { p_id: it.person.id, p_accept: true }); acts.replaceWith(followButton(it.person) || el('span', 'Accepted', 'muted')); refreshMe(); }), 'small'),
        button('Decline', (e, b) => busy(b, async () => { await rpc('social_follower_set', { p_id: it.person.id, p_accept: false }); acts.replaceWith(el('span', 'Declined', 'muted')); refreshMe(); })));
      li.append(acts);
    } else if (it.type === 'follow') { const f = followButton(it.person); if (f) li.append(f); }
    return li;
  }

  // ---------- single post ----------
  let postEpoch = 0;
  async function showPost(id) {
    const host = $('#social-post'); if (!host) return;
    const epoch = ++postEpoch;
    host.replaceChildren(el('p', 'Loading…', 'muted'));
    const back = el('a', 'Community', 'back'); back.href = '#feed';
    try {
      if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw new Error('This link is not valid.');
      const p = await rpc('social_post', { p_id: id });
      if (epoch !== postEpoch) return;
      const wrap = el('div', undefined, 'sp-single');
      wrap.append(back, p ? postCard(p, { expanded: true, onRemove: () => { location.hash = '#feed'; } }) : el('p', 'This post is private, was removed, or is not available to you.', 'sp-note'));
      if (!p && !signed()) wrap.append(signInPrompt('If it was shared with friends, sign in first.'));
      host.replaceChildren(wrap);
    } catch (e) { if (epoch === postEpoch) host.replaceChildren(back, el('p', e.message, 'bad')); }
  }

  // ---------- profiles ----------
  let profileEpoch = 0;
  async function showProfile(id) {
    const host = $('#profile-social'); if (!host) return;
    const epoch = ++profileEpoch;
    host.replaceChildren();
    if (!id) { if (signed()) host.append(await ownSettings(epoch)); return; }
    try {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return;
      const prof = await rpc('social_profile', { p_id: id });
      if (epoch !== profileEpoch || !prof) return;
      host.append(profileSocial(prof, epoch));
    } catch (e) { if (epoch === profileEpoch) host.append(el('p', e.message, setupMissing ? 'sp-note' : 'bad')); }
  }
  function profileSocial(prof, epoch) {
    const box = el('section', undefined, 'sp-profile');
    const stats = el('div', undefined, 'sp-profile-stats');
    const stat = (n, t, which) => { const b = el(which && prof.lists_visible ? 'button' : 'div', undefined, 'sp-stat'); if (b.tagName === 'BUTTON') { b.type = 'button'; b.onclick = () => showPeople(which); } b.append(el('strong', String(n)), el('span', t)); return b; };
    stats.append(stat(prof.posts, 'posts'), stat(prof.followers, 'followers', 'followers'), stat(prof.following, 'following', 'following'), stat(prof.friends, 'friends', 'friends'));
    const acts = el('div', undefined, 'sp-profile-acts');
    const relLine = el('p', '', 'muted sp-rel');
    const rel = r => { relLine.textContent = r?.friends ? 'You follow each other.' : r?.follows_me === 'active' ? 'Follows you.' : ''; };
    rel(prof.relation);
    if (prof.relation?.mine) { const a = el('a', 'Community settings', 'secondary'); a.href = '#profile'; acts.append(a); }
    else if (prof.member) {
      const f = followButton({ ...prof, relation: prof.relation }, r => { rel(r); }, false); if (f) acts.append(f);
      if (signed()) acts.append(menu([
        ['Report profile', () => { if (!box.querySelector(':scope > .sp-report')) box.insertBefore(reportForm('profile', prof.id), stats.nextSibling); }],
        ['Block', b => busy(null, async () => { if (await block(prof, b)) { location.hash = '#feed'; } }), true],
      ]));
    }
    const head = el('div', undefined, 'sp-profile-head'); head.append(stats, acts);
    box.append(head, relLine);
    if (!prof.member) { box.append(el('p', 'This musician has not joined the community yet.', 'muted')); return box; }
    const work = el('section', undefined, 'sp-working-shelf');
    work.append(el('h2', 'Working on'));
    if (prof.working_on?.length) {
      const ul = el('ul', undefined, 'sp-work-grid');
      for (const it of prof.working_on) ul.append(workingCard(it));
      work.append(ul);
    } else work.append(el('p', prof.relation?.mine ? 'Add the pieces you are learning in your community settings.' : 'Nothing listed yet.', 'muted'));
    box.append(work);
    const tabs = el('nav', undefined, 'sp-tabs'); const list = el('div', undefined, 'sp-list'); const more = button('Show more', null, 'secondary sp-more'); more.hidden = true;
    const views = [['posts', 'Posts'], ['clips', 'Performances']];
    for (const [v, t] of views) { const b = button(t, () => show(v), 'sp-tab'); b.dataset.v = v; tabs.append(b); }
    box.append(tabs, list, more);
    let before = null, mode = 'posts';
    async function show(v) {
      mode = v; before = null; list.replaceChildren();
      for (const b of tabs.querySelectorAll('button')) b.toggleAttribute('aria-current', b.dataset.v === v);
      await loadMore();
    }
    async function loadMore() {
      more.hidden = true;
      try {
        if (mode === 'clips') {
          const items = await rpc('social_feed', { p_scope: 'reels', p_profile: prof.id, p_offset: list.children.length });
          if (epoch !== profileEpoch) return;
          if (!list.classList.contains('sp-clip-grid')) list.className = 'sp-list sp-clip-grid';
          for (const it of items) list.append(clipTile(it, `#reels/profile/${prof.id}/${it.id}`));
          if (!list.children.length) list.append(el('p', 'No performances yet.', 'muted'));
          more.hidden = items.length < 10; more.onclick = loadMore; return;
        }
        list.className = 'sp-list';
        const items = await rpc('social_feed', { p_scope: 'profile', p_profile: prof.id, p_before: before });
        if (epoch !== profileEpoch) return;
        for (const it of items) list.append(postCard(it));
        if (items.length) before = items[items.length - 1].created_at;
        if (!list.children.length) list.append(el('p', 'No posts to show.', 'muted'));
        more.hidden = items.length < 20; more.onclick = loadMore;
      } catch (e) { list.append(el('p', e.message, 'bad')); }
    }
    async function showPeople(which) {
      mode = which; list.className = 'sp-list sp-people'; list.replaceChildren(el('p', 'Loading…', 'muted'));
      for (const b of tabs.querySelectorAll('button')) b.removeAttribute('aria-current');
      try {
        const people = await rpc('social_people', { p_id: prof.id, p_which: which });
        if (epoch !== profileEpoch) return;
        list.replaceChildren(el('h3', which[0].toUpperCase() + which.slice(1)), ...(people.length ? people.map(p => personRow(p)) : [el('p', 'Nobody yet.', 'muted')]));
      } catch (e) { list.replaceChildren(el('p', e.message, 'muted')); }
      list.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    show('posts');
    return box;
  }
  function workingCard(it) {
    const li = el('li', undefined, 'sp-work-card sp-status-' + it.status);
    const info = pieceInfo(it.piece, it.title);
    const t = el(info?.href ? 'a' : 'strong', info?.title || it.title, 'sp-work-title'); if (info?.href) t.href = info.href;
    li.append(el('span', STATUS[it.status] || it.status, 'sp-status sp-status-' + it.status), t);
    if (info?.composer) li.append(el('small', info.composer, 'muted'));
    if (it.note) li.append(el('p', it.note, 'sp-work-note'));
    return li;
  }
  function clipTile(post, href) {
    const a = el('a', undefined, 'sp-clip'); a.href = href;
    const img = el('img'); img.alt = ''; img.loading = 'lazy'; a.append(img, icon('play', 'sp-ic sp-clip-play'));
    a.append(el('span', '♥ ' + (post.likes || 0), 'sp-clip-likes'));
    if (post.youtube_id) { img.src = ytThumb(post.youtube_id); img.referrerPolicy = 'no-referrer'; }
    else if (post.poster_path) media([post.poster_path]).then(m => { const u = m.get(post.poster_path); if (u) img.src = u; });
    const t = pieceInfo(post.piece, post.piece_title); a.setAttribute('aria-label', 'Clip' + (t ? ': ' + t.title : '') + (post.body ? ' — ' + post.body.slice(0, 60) : ''));
    return a;
  }

  // Your own profile page: join, settings, working-on list, requests, blocked people, leave.
  async function ownSettings(epoch) {
    const box = el('section', undefined, 'sp-own');
    box.append(el('h2', 'Community'));
    await refreshMe();
    if (epoch !== profileEpoch) return box;
    if (setupMissing) { box.append(el('p', friendly('does not exist'), 'sp-note')); return box; }
    if (!me?.member) { box.append(joinCard(() => showProfile(null))); return box; }
    if (!me.active) box.append(republishCard(() => showProfile(null)));
    const link = el('a', 'View my community profile', 'secondary'); link.href = '#profile/' + me.profile?.id;
    box.append(link);
    // Settings
    const s = el('form', undefined, 'sp-settings');
    s.append(el('h3', 'Privacy'));
    const ageL = el('label', 'Age group'), age = el('select');
    for (const [v, t] of [['adult', '18 or older'], ['teen', '13 to 17']]) { const o = el('option', t); o.value = v; age.append(o); }
    age.value = me.member.age_band; ageL.append(age);
    const appL = el('label', undefined, 'check'), app = el('input'); app.type = 'checkbox'; app.checked = me.member.approve_follows;
    appL.append(app, el('span', 'Approve new followers before they can follow me'));
    const visL = el('label', 'New posts are visible to'), vis = visibilitySelect(me.member.default_visibility); visL.append(vis);
    const teenNote = el('p', 'Members aged 13–17 always approve followers, their videos reach friends only, and only friends can comment.', 'muted');
    const grown = el('p', 'Changing to 18 or older: your earlier posts with photos or performances that you set to Public become public, and follower approval stays on until you turn it off.', 'sp-note sp-warn');
    const sync = () => { const teen = age.value === 'teen'; app.disabled = teen; if (teen) app.checked = true; teenNote.hidden = !teen; grown.hidden = !(me.member.age_band === 'teen' && !teen); };
    age.onchange = sync; sync();
    const save = el('button', 'Save privacy', 'small'); save.type = 'submit';
    s.append(ageL, grown, appL, teenNote, visL, save);
    s.onsubmit = e => { e.preventDefault(); busy(save, async () => { me = await rpc('social_settings_save', { p_age_band: age.value, p_approve_follows: app.checked, p_default_visibility: vis.value }); emit(); toast('Saved.'); }); };
    box.append(s);
    box.append(workingEditor());
    // Requests
    const req = el('section', undefined, 'sp-settings');
    req.append(el('h3', 'Follow requests'));
    const reqList = el('div', undefined, 'sp-people'); req.append(reqList); box.append(req);
    rpc('social_people', { p_id: me.profile.id, p_which: 'requests' }).then(people => {
      reqList.replaceChildren(...(people.length ? people.map(p => {
        const acts = el('div', undefined, 'sp-row');
        acts.append(button('Accept', (e, b) => busy(b, async () => { await rpc('social_follower_set', { p_id: p.id, p_accept: true }); acts.replaceWith(el('span', 'Accepted', 'muted')); refreshMe(); }), 'small'),
          button('Decline', (e, b) => busy(b, async () => { await rpc('social_follower_set', { p_id: p.id, p_accept: false }); acts.replaceWith(el('span', 'Declined', 'muted')); refreshMe(); })));
        return personRow(p, acts);
      }) : [el('p', 'No requests waiting.', 'muted')]));
    }).catch(e => reqList.replaceChildren(el('p', e.message, 'bad')));
    // Blocked
    const bl = el('section', undefined, 'sp-settings');
    bl.append(el('h3', 'Blocked'));
    const blList = el('div'); bl.append(blList); box.append(bl);
    rpc('social_blocked_list').then(list => {
      blList.replaceChildren(...(list.length ? list.map(p => { const row = el('div', undefined, 'sp-person'); row.append(el('span', p.name), button('Unblock', (e, b) => busy(b, async () => { await rpc('social_block', { p_id: p.id, p_on: false }); row.remove(); }))); return row; }) : [el('p', 'Nobody blocked.', 'muted')]));
    }).catch(() => {});
    // Leave
    const leave = el('section', undefined, 'sp-settings danger-zone');
    leave.append(el('h3', 'Leave the community'), el('p', 'Deletes your posts, photos, comments, likes, follows and working-on list. Posts that were reported are kept hidden until reviewed. People you blocked stay blocked. Your music profile (public or private, as set above), songs and practice stay.', 'muted'));
    leave.append(button('Leave and delete my posts', (e, b) => { if (armed(b, 'Tap again to delete everything')) busy(b, async () => { const r = await rpc('social_leave'); await auth()?.removeMedia?.(r?.media || []).catch(() => {}); await refreshMe(); toast('You left the community. Your posts were deleted.'); showProfile(null); }); }, 'secondary small'));
    box.append(leave);
    return box;
  }
  function workingEditor() {
    const sec = el('section', undefined, 'sp-settings sp-working-edit');
    sec.append(el('h3', 'Working on'), el('p', 'Up to 12 pieces. They show on your community profile and help people with the same pieces find you.', 'muted'));
    let items = (me?.working_on || []).map(x => ({ ...x }));
    const list = el('ol', undefined, 'sp-work-edit'); sec.append(list);
    const add = button('Add a piece', () => { if (items.length >= 12) { toast('Up to 12 pieces.', true); return; } pickPiece(p => { if (p.piece && items.some(i => i.piece === p.piece)) return; items.push({ piece: p.piece, title: p.title, status: 'learning', note: '' }); draw(); }); }, 'secondary small', 'plus');
    const save = button('Save list', (e, b) => busy(b, async () => { const saved = await rpc('social_working_on_save', { p_items: items.map(({ piece, title, status, note }) => ({ piece, title, status, note })) }); if (me) me.working_on = saved; items = saved.map(x => ({ ...x })); draw(); toast('Saved.'); emit(); }), 'small');
    const row = el('div', undefined, 'sp-row'); row.append(add, save); sec.append(row);
    function draw() {
      list.replaceChildren();
      if (!items.length) list.append(el('li', 'Nothing yet.', 'muted'));
      items.forEach((it, i) => {
        const li = el('li', undefined, 'sp-work-edit-row');
        const info = pieceInfo(it.piece, it.title);
        const st = el('select'); st.setAttribute('aria-label', 'Status for ' + (info?.title || it.title));
        for (const [v, t] of Object.entries(STATUS)) { const o = el('option', t); o.value = v; st.append(o); }
        st.value = it.status; st.onchange = () => { it.status = st.value; };
        const note = el('input'); note.maxLength = 200; note.placeholder = 'Note (optional), e.g. “bars 9–16 are tricky”'; note.value = it.note || ''; note.oninput = () => { it.note = note.value; };
        note.setAttribute('aria-label', 'Note');
        const ctl = el('div', undefined, 'sp-row');
        const up = button('', () => { if (i) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; draw(); } }, 'sp-icon-btn', 'up'); up.setAttribute('aria-label', 'Move up'); up.disabled = !i;
        const down = button('', () => { if (i < items.length - 1) { [items[i + 1], items[i]] = [items[i], items[i + 1]]; draw(); } }, 'sp-icon-btn', 'down'); down.setAttribute('aria-label', 'Move down'); down.disabled = i === items.length - 1;
        const rm = button('', () => { items.splice(i, 1); draw(); }, 'sp-icon-btn', 'close'); rm.setAttribute('aria-label', 'Remove');
        ctl.append(up, down, rm);
        li.append(el('strong', info?.title || it.title), st, note, ctl);
        list.append(li);
      });
    }
    draw();
    return sec;
  }

  // ---------- library piece page ----------
  let pieceEpoch = 0, pieceRoot;
  async function showPiece(id) {
    const layout = $('.lib-piece .piece-layout'); if (!layout) return;
    if (!pieceRoot) { pieceRoot = el('section', undefined, 'sp-piece-strip'); pieceRoot.setAttribute('aria-label', 'From the community'); }
    const epoch = ++pieceEpoch;
    if (!id || !catalog().has(id)) { pieceRoot.remove(); return; }
    const community = $('#community-library-slot');
    if (community) community.before(pieceRoot); else layout.append(pieceRoot);
    pieceRoot.replaceChildren();
    const head = el('div', undefined, 'sp-strip-head');
    head.append(el('h2', 'From the community'));
    const acts = el('div', undefined, 'sp-row');
    const work = button('I’m working on this', null, 'secondary small', 'plus');
    const sync = () => { const on = !!me?.working_on?.some(w => w.piece === id); work.querySelector('span').textContent = on ? 'Working on this' : 'I’m working on this'; work.classList.toggle('is-on', on); work.setAttribute('aria-pressed', String(on)); };
    work.onclick = () => busy(work, async () => {
      if (!signed()) { location.hash = '#mine'; toast('Sign in to keep a working-on list.'); return; }
      const list = (me?.working_on || []).map(({ piece, title, status, note }) => ({ piece, title, status, note }));
      const i = list.findIndex(w => w.piece === id);
      if (i >= 0) list.splice(i, 1); else { if (list.length >= 12) throw new Error('Your list has 12 pieces. Remove one first.'); list.unshift({ piece: id, title: pieceInfo(id)?.title || id, status: 'learning', note: '' }); }
      const saved = await rpc('social_working_on_save', { p_items: list });
      if (me) me.working_on = saved; sync(); toast(i >= 0 ? 'Removed from your list.' : 'Added to your working-on list.');
    });
    const shareBtn = button('Share progress', () => compose({ piece: id, title: pieceInfo(id)?.title }), 'small', 'share');
    acts.append(work, shareBtn);
    head.append(acts);
    pieceRoot.append(head);
    sync();
    const list = el('div', undefined, 'sp-strip-list'); list.append(el('p', 'Loading…', 'muted')); pieceRoot.append(list);
    try {
      const items = await rpc('social_feed', { p_scope: 'piece', p_piece: id });
      if (epoch !== pieceEpoch) return;
      list.replaceChildren();
      const clips = items.filter(p => p.kind === 'video' || p.youtube_id);
      if (clips.length) {
        const grid = el('div', undefined, 'sp-clip-grid sp-clip-row');
        for (const c of clips.slice(0, 6)) grid.append(clipTile(c, `#reels/piece/${encodeURIComponent(id)}/${c.id}`));
        list.append(grid);
      }
      for (const p of items.filter(p => p.kind !== 'video' && !p.youtube_id).slice(0, 3)) list.append(postCard(p));
      if (!items.length) list.append(el('p', 'No posts about this piece yet. Practice it and be the first to share.', 'muted'));
    } catch (e) { if (epoch === pieceEpoch) list.replaceChildren(el('p', e.message, setupMissing ? 'muted' : 'bad')); }
  }

  // ---------- compose from elsewhere (Stage summary, piece page) ----------
  function compose(p = {}) {
    prefill = { ...p, placeholder: p.stats ? 'How did it go? Add a note for your followers.' : undefined };
    if (location.hash.startsWith('#feed')) { renderComposerSlot(); }
    else location.hash = '#feed';
  }
  function shareResult(r) {
    const score = window.PianoPractice?.score, id = score?.id;
    const piece = id && catalog().has(id) ? id : null;
    const title = cleanTitle(score?.title || r?.title || '');
    compose({ piece, title, stats: { accuracy: r?.accuracy, bpm: r?.bpm, hands: r?.hands, correct: r?.correct, wrong: r?.wrong, mode: r?.kind === 'play' ? 'play' : 'wait', bars: r?.range?.title } });
  }

  // ---------- routing ----------
  function route() {
    const [view, sub, arg] = location.hash.slice(1).split('/');
    if (view === 'feed') showFeed(sub);
    if (view === 'post') showPost(sub);
    if (view === 'profile') showProfile(sub || null);
    else { profileEpoch++; const h = $('#profile-social'); if (h) h.replaceChildren(); }
    if (view === 'library' && sub === 'piece') showPiece(decodeURIComponent(arg || ''));
  }
  let pollTimer;
  async function onAuth() {
    flushWaiters();
    if (!auth()?.ready()) return;
    await refreshMe();
    feed.scope = null; feed.items = [];
    if (feedRoot) { renderComposerSlot(); }
    route();
    clearInterval(pollTimer); badge(0);
    if (signed() && joined()) { pollActivity(); pollTimer = setInterval(pollActivity, 120000); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('hashchange', () => setTimeout(route, 0));
    window.addEventListener('piano-community-auth', onAuth);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollActivity(); });
    // Nav badge
    const tab = document.querySelector('.tabs a[data-tab=feed]');
    if (tab && !tab.querySelector('.sp-badge')) { const b = el('span', '', 'sp-badge'); b.hidden = true; tab.append(b); }
    if (auth()?.ready()) onAuth(); else route();
  });

  window.PianoSocial = {
    rpc, whenReady, refreshMe, me: () => me, joined, active, signed, media, icon, el, button, busy, toast, when, armed,
    youtube, ytThumb, ytEmbed, comingSoon, pieceInfo, pieceChip, avatar, authorLink, followButton, comments, menu, reportForm, block, share, compose, shareResult, postCard,
    _state: { feed },
  };
})();
