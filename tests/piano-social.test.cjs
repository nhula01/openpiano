const { test } = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const { JSDOM, VirtualConsole } = require('jsdom');
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
const HTML = '<nav class="tabs"><a data-tab="feed" href="#feed">Community</a></nav><div id="social-feed"></div><div id="social-post"></div><div id="profile-social"></div><div class="lib-piece"><div class="piece-layout"></div></div>';
async function setup({ hash = '#feed', signed = true, me = null, handlers = {}, community = true } = {}) {
  const dom = new JSDOM(HTML, { url: 'https://example.test/' + hash, runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window, calls = [];
  w.matchMedia = () => ({ matches: false });
  w.PianoCloudConfig = { community };
  w.IntersectionObserver = class { observe() {} unobserve() {} };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.PianoProfiles = { avatar: (name) => { const s = w.document.createElement('span'); s.className = 'profile-avatar'; s.textContent = (name || '?')[0]; return s; } };
  w.PianoRepertoire = { fur: { id: 'fur', title: 'Für Elise · complete', composer: 'Ludwig van Beethoven' } };
  w.PianoCurriculum = { pieces: [{ id: 'fur' }] };
  w.PianoCommunityAuth = {
    ready: () => true, signedIn: () => signed, mediaUrls: async () => new Map(), removeMedia: async () => {},
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (handlers[name]) return handlers[name](args);
      if (name === 'social_me') return { data: me, error: null };
      if (name === 'social_feed' || name === 'social_suggest') return { data: [], error: null };
      if (name === 'social_activity') return { data: { unread: 0, items: [] }, error: null };
      return { data: null, error: null };
    },
  };
  w.eval(fs.readFileSync('site/piano-social.js', 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await wait(); await wait();
  return { dom, w, d: w.document, calls };
}
const member = (extra = {}) => ({ profile: { id: '11111111-1111-4111-8111-111111111111', name: 'Me' }, member: { age_band: 'adult', approve_follows: false, default_visibility: 'public' }, active: true, followers: 0, following: 0, requests: 0, working_on: [], video_uploads: false, ...extra });

test('YouTube links: watch, short, shorts, live and start times; others rejected', async () => {
  const { w, dom } = await setup({ signed: false });
  const yt = w.PianoSocial.youtube;
  assert.equal(JSON.stringify(yt('https://www.youtube.com/watch?v=AbCdEfGhIj0&t=90')), '{"id":"AbCdEfGhIj0","start":90}');
  assert.equal(JSON.stringify(yt('https://youtu.be/AbCdEfGhIj0?t=1m5s')), '{"id":"AbCdEfGhIj0","start":65}');
  assert.equal(yt('https://youtube.com/shorts/AbCdEfGhIj0').id, 'AbCdEfGhIj0');
  assert.equal(yt('https://m.youtube.com/live/AbCdEfGhIj0?feature=share').id, 'AbCdEfGhIj0');
  assert.equal(yt('https://evil.example/watch?v=AbCdEfGhIj0'), null);
  assert.equal(yt('https://youtube.com/watch?v=short'), null);
  assert.equal(yt('javascript:alert(1)'), null);
  dom.window.close();
});

test('post text, names and piece titles are shown as text, never as HTML', async () => {
  const evil = '<img src=x onerror="window.hacked=1"><script>window.hacked=1</script>';
  const post = { type: 'post', id: '22222222-2222-4222-8222-222222222222', kind: 'post', body: evil, piece: null, piece_title: evil, visibility: 'public', created_at: new Date().toISOString(), author: { id: '33333333-3333-4333-8333-333333333333', name: evil }, likes: 0, comments: 0, can_comment: false };
  const { d, w, dom } = await setup({ signed: false, handlers: { social_feed: () => ({ data: [post], error: null }) } });
  await wait(50);
  const card = d.querySelector('.sp-card');
  assert.ok(card, 'card rendered');
  assert.equal(card.querySelectorAll('img,script').length, 0);
  assert.ok(card.textContent.includes('<script>'));
  assert.equal(w.hacked, undefined);
  dom.window.close();
});

test('signed-in non-member gets the join card; joining sends the chosen age group', async () => {
  const { d, calls, dom, w } = await setup({ me: { profile: { id: '11111111-1111-4111-8111-111111111111', name: 'Me' }, member: null, active: false }, handlers: { social_join: () => ({ data: member(), error: null }) } });
  const f = d.querySelector('.sp-join'); assert.ok(f, 'join card');
  const teen = f.querySelector('input[value=teen]'); teen.checked = true; teen.dispatchEvent(new w.Event('change'));
  assert.equal(f.querySelector('.sp-note').hidden, false, 'teen protections explained');
  f.querySelector('input[type=checkbox]').checked = true;
  f.dispatchEvent(new w.Event('submit', { cancelable: true })); await wait(60);
  assert.equal(JSON.stringify(calls.find(c => c.name === 'social_join').args), '{"p_age_band":"teen"}');
  dom.window.close();
});

test('the database not being set up shows a clear message instead of errors', async () => {
  const { d, dom } = await setup({ handlers: { social_me: () => ({ data: null, error: { message: 'Could not find the function public.social_me without parameters in the schema cache' } }), social_feed: () => ({ data: null, error: { message: 'Could not find the function public.social_feed' } }) } });
  await wait(60);
  assert.match(d.querySelector('#social-feed').textContent, /not switched on yet/);
  dom.window.close();
});

test('video uploads off: composer offers Photo and YouTube, Clips is marked soon', async () => {
  const off = await setup({ me: member() });
  const tools = [...off.d.querySelectorAll('.sp-composer .sp-tool')].map(b => b.textContent);
  assert.deepEqual(tools, ['Piece', 'Photo', 'YouTube', 'Clipssoon']);
  assert.equal(off.d.querySelector('.sp-composer input[accept^="video"]'), null);
  assert.ok(off.d.querySelector('.sp-soon a[href="#support"]'), 'side panel explains support');
  off.dom.window.close();
  const on = await setup({ me: member({ video_uploads: true }) });
  assert.ok(on.d.querySelector('.sp-composer input[accept^="video"]'));
  on.dom.window.close();
});

test('follow button reflects one-way, mutual, pending and approval states', async () => {
  const { w, dom } = await setup({ me: member() });
  const label = r => w.PianoSocial.followButton({ id: 'x', name: 'X', relation: r })?.textContent;
  assert.equal(label({ following: null, follows_me: null, approval: false }), 'Follow');
  assert.equal(label({ following: null, follows_me: null, approval: true }), 'Ask to follow');
  assert.equal(label({ following: null, follows_me: 'active' }), 'Follow back');
  assert.equal(label({ following: 'pending' }), 'Requested');
  assert.equal(label({ following: 'active', follows_me: null }), 'Following');
  assert.equal(label({ following: 'active', follows_me: 'active' }), 'Friends');
  assert.equal(w.PianoSocial.followButton({ id: 'x', relation: { mine: true } }), null);
  dom.window.close();
});

test('a text post sends the chosen piece and visibility', async () => {
  const saved = { type: 'post', id: '44444444-4444-4444-8444-444444444444', kind: 'post', body: 'Hello', piece: 'fur', visibility: 'friends', created_at: new Date().toISOString(), author: { id: '1', name: 'Me' }, likes: 0, comments: 0, mine: true };
  const { d, w, calls, dom } = await setup({ me: member(), handlers: { social_post_save: () => ({ data: saved, error: null }) } });
  const c = d.querySelector('.sp-composer');
  c.querySelector('textarea').value = 'Hello';
  c.querySelector('.sp-vis-select').value = 'friends';
  c.dispatchEvent(new w.Event('submit', { cancelable: true })); await wait(60);
  const args = calls.find(x => x.name === 'social_post_save').args;
  assert.equal(args.p_kind, 'post'); assert.equal(args.p_body, 'Hello'); assert.equal(args.p_visibility, 'friends');
  assert.equal(d.querySelector('.sp-list .sp-card .sp-body').textContent, 'Hello');
  dom.window.close();
});

test('community switched off: no requests, tabs stay hidden and old links go home', async () => {
  const dom = new JSDOM('<nav class="tabs"><a data-tab="feed" data-community hidden href="#feed">Community</a></nav><div id="social-feed"></div>', { url: 'https://example.test/#reels/abc', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window; let calls = 0;
  w.PianoCloudConfig = { community: false };
  w.PianoCommunityAuth = { ready: () => true, signedIn: () => true, rpc: async () => { calls++; return { data: null, error: null }; } };
  w.eval(fs.readFileSync('site/piano-social.js', 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded')); await wait();
  assert.equal(w.location.hash, '#home');
  assert.equal(w.PianoSocial, undefined);
  assert.equal(w.document.querySelector('[data-tab=feed]').hidden, true);
  assert.equal(calls, 0);
  dom.window.close();
});
