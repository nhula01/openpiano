'use strict';
// Reels: full-screen, vertically scrolling performances (#reels). Most are YouTube links (free to host):
// only the reel on screen gets a YouTube player, the others show a thumbnail. Uploaded clips (when the
// server has video uploads switched on) play the same way: one at a time, the next one prepared, and
// clips further away unloaded to save data. Routes:
//   #reels                         clips ranked by recent likes, people you follow and freshness
//   #reels/<postId>                start at one clip, then continue with the ranked list
//   #reels/piece/<pieceId>[/<id>]  clips of one library piece
//   #reels/profile/<profileId>[/<id>] one member's clips
// Data and actions come from piano-social.js (window.PianoSocial).
(() => {
  const S = () => window.PianoSocial;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const state = { key: '', items: [], offset: 0, done: false, loading: false, active: -1, muted: true, epoch: 0, filter: {}, startId: null };
  let host, shell, scroller, titleEl, observer, sheet;

  function build() {
    host = document.getElementById('social-reels'); if (!host || shell) return;
    shell = el('div', undefined, 'sr-shell');
    const top = el('header', undefined, 'sr-top');
    const back = el('a', undefined, 'sr-back'); back.href = '#feed'; back.setAttribute('aria-label', 'Back to Community'); back.append(S().icon('close', 'sp-ic'));
    titleEl = el('h1', 'Reels', 'sr-title');
    const post = el('button', undefined, 'sr-post'); post.type = 'button'; post.append(S().icon('plus', 'sp-ic'), el('span', 'Share a performance'));
    post.onclick = () => S().compose(state.filter.piece ? { piece: state.filter.piece, title: S().pieceInfo(state.filter.piece)?.title, video: true } : { video: true });
    top.append(back, titleEl, post);
    scroller = el('div', undefined, 'sr-scroller'); scroller.tabIndex = 0; scroller.setAttribute('aria-label', 'Clips. Use the up and down arrow keys to move between clips.');
    shell.append(top, scroller);
    host.append(shell);
    size(); window.addEventListener('resize', size);
    observer = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) activate(Number(e.target.dataset.i));
    }, { root: scroller, threshold: [0.6] });
    document.addEventListener('keydown', onKey);
  }

  // Fill the window below the site's top bar and above a bottom tab bar (phones).
  function size() {
    if (!shell || !document.body.matches('[data-view=reels]')) return;
    const top = Math.max(0, shell.getBoundingClientRect().top + window.scrollY);
    const rail = document.querySelector('.rail'), r = rail?.getBoundingClientRect();
    const bottom = r && getComputedStyle(rail).position === 'fixed' && r.top > window.innerHeight / 2 ? window.innerHeight - r.top : 0;
    shell.style.setProperty('--sr-h', Math.max(320, window.innerHeight - top - bottom) + 'px');
  }
  function parse() {
    const parts = location.hash.slice(1).split('/').map(decodeURIComponent);
    if (parts[1] === 'piece') return { piece: parts[2] || null, startId: parts[3] || null };
    if (parts[1] === 'profile') return { profile: parts[2] || null, startId: parts[3] || null };
    return { startId: parts[1] || null };
  }

  async function show() {
    build(); if (!shell) return;
    window.scrollTo(0, 0); size();
    const f = parse(), key = JSON.stringify({ piece: f.piece, profile: f.profile });
    const valid = id => /^[0-9a-f-]{36}$/i.test(id || '');
    if (key === state.key && state.items.length && (!f.startId || state.items.some(x => x.id === f.startId))) {
      if (f.startId) jump(state.items.findIndex(x => x.id === f.startId));
      resume(); return;
    }
    state.key = key; state.filter = { piece: f.piece || null, profile: valid(f.profile) ? f.profile : null };
    state.items = []; state.offset = 0; state.done = false; state.active = -1; state.epoch++;
    scroller.replaceChildren();
    titleEl.textContent = state.filter.piece ? (S().pieceInfo(state.filter.piece)?.title || 'Piece') + ' · performances' : state.filter.profile ? 'Performances' : 'Reels';
    const epoch = state.epoch;
    if (valid(f.startId)) {
      try { const p = await S().rpc('social_post', { p_id: f.startId }); if (epoch !== state.epoch) return; if (p?.kind === 'video' || p?.youtube_id) add([p]); } catch {}
    }
    await more();
    if (epoch !== state.epoch) return;
    if (!state.items.length) empty();
    scroller.scrollTop = 0; scroller.focus({ preventScroll: true });
  }

  async function more() {
    const epoch = state.epoch;
    if (state.loading === epoch || state.done) return;
    state.loading = epoch;
    try {
      const items = await S().rpc('social_feed', { p_scope: 'reels', p_piece: state.filter.piece, p_profile: state.filter.profile, p_offset: state.offset });
      if (epoch !== state.epoch) return;
      state.offset += items.length; state.done = items.length < 10;
      add(items);
    } catch (e) {
      if (epoch === state.epoch && !state.items.length) { scroller.replaceChildren(el('p', e.message, 'sr-empty')); }
      state.done = true;
    } finally { if (state.loading === epoch) state.loading = false; }
  }

  function add(items) {
    const seen = new Set(state.items.map(x => x.id));
    for (const p of items) {
      if (seen.has(p.id) || (p.kind !== 'video' && !p.youtube_id)) continue;
      seen.add(p.id);
      const i = state.items.push({ ...p }) - 1;
      const node = reel(state.items[i], i);
      scroller.append(node); observer.observe(node);
    }
  }

  function empty() {
    const box = el('div', undefined, 'sr-empty');
    box.append(el('h2', 'No performances here yet.'), el('p', 'Put a recording of your playing on YouTube (Unlisted is fine), then share the link.'));
    const b = el('button', 'Share a performance'); b.type = 'button'; b.onclick = () => S().compose({ piece: state.filter.piece || null, title: state.filter.piece ? S().pieceInfo(state.filter.piece)?.title : '', video: true });
    box.append(b);
    if (!S().me()?.video_uploads) box.append(S().comingSoon(true));
    scroller.replaceChildren(box);
  }

  function reel(post, i) {
    const s = S();
    const sec = el('section', undefined, 'sr-reel'); sec.dataset.i = i; sec.dataset.id = post.id;
    sec.setAttribute('aria-label', `Clip by ${post.author?.name || 'a musician'}`);
    const stage = el('div', undefined, 'sr-stage');
    const poster = el('img', undefined, 'sr-poster'); poster.alt = ''; poster.hidden = true;
    const yt = !!post.youtube_id;
    if (yt) sec.classList.add('is-yt');
    const video = yt ? el('div', undefined, 'sr-video sr-yt') : el('video', undefined, 'sr-video');
    if (!yt) { video.playsInline = true; video.loop = true; video.muted = state.muted; video.preload = 'none'; video.setAttribute('playsinline', ''); video.disablePictureInPicture = true; }
    const tap = el('button', undefined, 'sr-tap'); tap.type = 'button'; tap.setAttribute('aria-label', 'Play or pause');
    const paused = s.icon('play', 'sp-ic sr-paused'); tap.append(paused);
    const burst = s.icon('heart', 'sp-ic sr-burst');
    const bar = el('div', undefined, 'sr-progress'); const fill = el('span'); bar.append(fill);
    stage.append(poster, video, tap, burst, bar);
    if (yt) { poster.src = `https://i.ytimg.com/vi/${post.youtube_id}/hqdefault.jpg`; poster.referrerPolicy = 'no-referrer'; poster.hidden = false; }
    else if (post.poster_path) s.media([post.poster_path]).then(m => { const u = m.get(post.poster_path); if (u) { poster.src = u; poster.hidden = false; video.poster = u; } });
    video.addEventListener('timeupdate', () => { const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : post.video_seconds; if (d) fill.style.width = Math.min(100, video.currentTime / d * 100) + '%'; });
    video.addEventListener('playing', () => { sec.classList.remove('is-paused'); poster.hidden = true; });
    video.addEventListener('pause', () => sec.classList.add('is-paused'));
    let lastTap = 0, tapTimer;
    tap.onclick = () => {
      const now = Date.now();
      if (now - lastTap < 300) { clearTimeout(tapTimer); lastTap = 0; doubleTap(); return; }
      lastTap = now;
      tapTimer = setTimeout(() => { if (yt) { sec.classList.toggle('is-paused'); ytCommand(sec, sec.classList.contains('is-paused') ? 'pauseVideo' : 'playVideo'); } else if (video.paused) play(video); else video.pause(); }, 260);
    };
    function doubleTap() {
      burst.classList.remove('go'); void burst.getBoundingClientRect(); burst.classList.add('go');
      if (!post.liked) like();
    }

    // Info overlay
    const info = el('div', undefined, 'sr-info');
    const who = el('div', undefined, 'sr-who');
    who.append(s.avatar(post.author), s.authorLink(post.author, 'sr-name'));
    if (!post.mine && !post.following && s.signed()) { const f = s.followButton({ ...post.author, relation: post.relation || { following: null, follows_me: null } }); if (f) { f.classList.add('sr-follow'); who.append(f); } }
    info.append(who);
    if (post.body) { const b = el('p', post.body, 'sr-body'); b.onclick = () => b.classList.toggle('open'); info.append(b); }
    const chip = s.pieceChip(post.piece, post.piece_title);
    if (chip) {
      const row = el('div', undefined, 'sr-piece-row'); row.append(chip);
      if (post.piece) { const go = el('a', 'Practice it', 'sr-practice'); go.href = '#library/piece/' + encodeURIComponent(post.piece); row.append(go); }
      info.append(row);
    }
    if (post.stats?.accuracy != null) info.append(el('p', `${post.stats.accuracy}% accuracy${post.stats.bpm ? ' · ' + post.stats.bpm + ' BPM' : ''}`, 'sr-stats'));
    info.append(el('time', s.when(post.created_at), 'sr-time'));

    // Action rail
    const rail = el('div', undefined, 'sr-rail');
    const likeBtn = railButton('heart', String(post.likes || 0), post.liked ? 'Unlike' : 'Like');
    likeBtn.classList.toggle('is-on', !!post.liked);
    likeBtn.onclick = () => like();
    async function like() {
      if (!s.signed()) { location.hash = '#mine'; s.toast('Sign in to like clips.'); return; }
      if (!s.active()) { location.hash = '#feed'; s.toast('Join the community first.'); return; }
      likeBtn.disabled = true;
      try {
        const r = await s.rpc('social_like', { p_post: post.id, p_on: !post.liked });
        post.liked = r.liked; post.likes = r.likes;
        likeBtn.classList.toggle('is-on', post.liked); likeBtn.querySelector('span').textContent = String(post.likes);
        likeBtn.setAttribute('aria-label', (post.liked ? 'Unlike' : 'Like') + ' · ' + post.likes);
      } catch (e) { s.toast(e.message, true); } finally { likeBtn.disabled = false; }
    }
    const talk = railButton('comment', String(post.comments || 0), 'Comments');
    talk.onclick = () => openComments(post, n => { talk.querySelector('span').textContent = String(n); });
    const share = railButton('share', 'Share', 'Share'); share.onclick = () => s.share(post);
    const sound = railButton(state.muted ? 'mute' : 'sound', '', state.muted ? 'Turn sound on' : 'Mute'); sound.classList.add('sr-sound');
    sound.onclick = () => setMuted(!state.muted);
    const items = post.mine ? [
      ['Open post', () => { location.hash = '#post/' + post.id; }],
      ['Delete clip', b => { if (s.armed(b, 'Delete for good?')) s.busy(null, async () => { const r = await s.rpc('social_post_delete', { p_id: post.id }); await window.PianoCommunityAuth?.removeMedia?.(r?.media || []).catch(() => {}); removeReel(sec); s.toast('Clip deleted.'); }); }, true],
    ] : [
      ['Open post', () => { location.hash = '#post/' + post.id; }],
      s.signed() && ['Report clip', () => openReport(post)],
      s.signed() && ['Block ' + (post.author?.name || 'author'), b => s.busy(null, async () => { if (await s.block(post.author, b)) removeReel(sec, post.author?.id); }), true],
    ];
    const m = s.menu(items, 'sr-menu');
    rail.append(likeBtn, talk, share, sound, m);
    sec.append(stage, info, rail);
    if (i === 0 && state.muted && !yt) { const hint = el('button', 'Tap for sound', 'sr-unmute'); hint.type = 'button'; hint.onclick = () => { setMuted(false); }; sec.append(hint); }
    return sec;
  }
  function railButton(ic, text, label) {
    const b = el('button', undefined, 'sr-act'); b.type = 'button'; b.setAttribute('aria-label', label);
    const bub = el('i', undefined, 'sr-bubble'); bub.append(S().icon(ic, 'sp-ic')); b.append(bub, el('span', text)); return b;
  }
  function removeReel(sec, authorId) {
    const ids = authorId ? state.items.filter(x => x.author?.id === authorId).map(x => x.id) : [sec.dataset.id];
    for (const node of [...scroller.querySelectorAll('.sr-reel')]) if (ids.includes(node.dataset.id)) { node.querySelector('video')?.pause(); observer.unobserve(node); node.remove(); }
    state.items = state.items.filter(x => !ids.includes(x.id));
    [...scroller.querySelectorAll('.sr-reel')].forEach((n, i) => { n.dataset.i = i; });
    state.active = -1;
    if (!state.items.length) empty();
  }

  // YouTube players are controlled through the IFrame API's postMessage commands.
  function ytCommand(sec, func) {
    const f = sec?.querySelector('iframe'); if (!f) return;
    f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube-nocookie.com');
  }
  function ytLoad(sec, post) {
    const box = sec.querySelector('.sr-yt'); if (!box || box.querySelector('iframe')) return;
    const f = document.createElement('iframe');
    f.src = window.PianoSocial.ytEmbed(post.youtube_id, post.youtube_start, `&autoplay=1&mute=${state.muted ? 1 : 0}&loop=1&playlist=${post.youtube_id}&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`);
    f.title = 'Performance by ' + (post.author?.name || 'a musician'); f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.onload = () => setTimeout(() => sec.querySelector('.sr-poster').hidden = true, 400);
    box.append(f);
  }
  function ytUnload(sec) { sec.classList.remove('is-paused'); const box = sec.querySelector('.sr-yt'); if (box?.firstChild) { box.replaceChildren(); sec.querySelector('.sr-poster').hidden = false; } }
  function setMuted(m) {
    state.muted = m;
    for (const v of scroller.querySelectorAll('video')) v.muted = m;
    for (const sec of scroller.querySelectorAll('.sr-reel.is-yt')) ytCommand(sec, m ? 'mute' : 'unMute');
    for (const b of scroller.querySelectorAll('.sr-sound')) { b.querySelector('.sr-bubble').replaceChildren(S().icon(m ? 'mute' : 'sound', 'sp-ic')); b.setAttribute('aria-label', m ? 'Turn sound on' : 'Mute'); }
    if (!m) scroller.querySelectorAll('.sr-unmute').forEach(n => n.remove());
    const v = current()?.querySelector('video'); if (v && v.paused) play(v);
  }
  function play(v) {
    const p = v.play();
    if (p?.catch) p.catch(() => { if (!v.muted) { v.muted = true; state.muted = true; v.play().catch(() => {}); } });
  }
  const current = () => scroller?.querySelector(`.sr-reel[data-i="${state.active}"]`);

  async function activate(i) {
    if (i === state.active || !Number.isFinite(i)) return;
    state.active = i;
    const nodes = [...scroller.querySelectorAll('.sr-reel')];
    const need = [];
    nodes.forEach((n, j) => {
      if (n.classList.contains('is-yt')) { if (j !== i) ytUnload(n); return; }
      const v = n.querySelector('video');
      if (Math.abs(j - i) > 2 && v.getAttribute('src')) { v.pause(); v.removeAttribute('src'); v.load(); n.querySelector('.sr-poster').hidden = false; }
      if (j !== i) v.pause();
      if (Math.abs(j - i) <= 1 && !v.getAttribute('src')) need.push([v, state.items[j]?.video_path, j]);
    });
    if (need.length) {
      const urls = await S().media(need.map(x => x[1]));
      for (const [v, path, j] of need) { const u = urls.get(path); if (u && !v.getAttribute('src')) { v.preload = j === state.active ? 'auto' : 'metadata'; v.src = u; } }
    }
    if (state.active !== i || !document.body.matches('[data-view=reels]')) return;
    if (nodes[i]?.classList.contains('is-yt')) ytLoad(nodes[i], state.items[i]);
    const v = nodes[i]?.querySelector('video');
    if (v) { v.muted = state.muted; v.currentTime = 0; play(v); }
    if (i >= state.items.length - 3) more();
  }
  function jump(i) {
    if (i < 0) return;
    const node = scroller.querySelector(`.sr-reel[data-i="${i}"]`);
    if (node) scroller.scrollTo({ top: node.offsetTop, behavior: 'smooth' });
  }
  function pauseAll() { scroller?.querySelectorAll('video').forEach(v => v.pause()); scroller?.querySelectorAll('.sr-reel.is-yt').forEach(ytUnload); }
  function resume() {
    const c = current();
    if (c?.classList.contains('is-yt')) { ytLoad(c, state.items[state.active]); return; }
    const v = c?.querySelector('video'); if (v) play(v); else if (state.items.length) { state.active = -1; activate(0); }
  }

  function onKey(e) {
    if (!document.body.matches('[data-view=reels]') || e.target.closest?.('input,textarea,select,dialog')) return;
    if (['ArrowDown', 'j', 'PageDown'].includes(e.key)) { e.preventDefault(); jump(Math.min(state.active + 1, state.items.length - 1)); }
    else if (['ArrowUp', 'k', 'PageUp'].includes(e.key)) { e.preventDefault(); jump(Math.max(state.active - 1, 0)); }
    else if (e.key === ' ') { e.preventDefault(); const v = current()?.querySelector('video'); if (v) v.paused ? play(v) : v.pause(); else ytCommand(current(), 'pauseVideo'); }
    else if (e.key === 'm') setMuted(!state.muted);
  }

  function ensureSheet() {
    if (sheet) return sheet;
    sheet = el('dialog', undefined, 'sp-dialog sr-sheet');
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
    document.body.append(sheet);
    return sheet;
  }
  function openComments(post, onCount) {
    const d = ensureSheet(); const top = el('div', undefined, 'sp-dialog-top');
    top.append(el('h2', 'Comments'), S().button('', () => d.close(), 'sp-icon-btn', 'close'));
    d.replaceChildren(top, S().comments(post, onCount)); d.showModal();
  }
  function openReport(post) {
    const d = ensureSheet(); const top = el('div', undefined, 'sp-dialog-top');
    top.append(el('h2', 'Report clip'), S().button('', () => d.close(), 'sp-icon-btn', 'close'));
    d.replaceChildren(top, S().reportForm('post', post.id, () => setTimeout(() => d.close(), 1200))); d.showModal();
  }

  function route() {
    const view = location.hash.slice(1).split('/')[0];
    if (view === 'reels') { if (window.PianoSocial) show(); }
    else pauseAll();
  }
  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('hashchange', () => setTimeout(route, 0));
    window.addEventListener('piano-community-auth', () => { if (window.PianoCommunityAuth?.ready()) { state.key = ''; route(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseAll(); else if (document.body.matches('[data-view=reels]')) resume(); });
    route();
  });
  window.PianoSocialReels = { _state: state };
})();
