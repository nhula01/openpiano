'use strict';

const CACHE_PREFIX = 'openpiano-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v2`;

// Public application files only. Supabase requests and private user data use a
// different origin and are never handled by this service worker.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/openpiano-180.png',
  './icons/openpiano-192.png',
  './icons/openpiano-512.png',
  './verovio-text.css',
  './piano-practice-kit.css',
  './piano.css',
  './piano-stage.css',
  './piano-listen.js',
  './piano-engine.js',
  './piano-repertoire.js',
  './piano-library.js',
  './piano-additions.js',
  './piano-famous.js',
  './piano-pdmx.js',
  './piano-method.js',
  './piano-collection.js',
  './piano-studies.js',
  './piano-skills.js',
  './piano-curriculum.js',
  './piano-engraving.js',
  './piano-score-view.js',
  './piano-grand.js',
  './piano-fingering.js',
  './piano-import-engine.js',
  './piano-pdf-reader.js',
  './piano-scan-reader.js',
  './piano-click.js',
  './piano-tempos.js',
  './piano-progress.js',
  './piano-reading-gen.js',
  './piano-player.js',
  './piano-practice-kit.js',
  './piano-course.js',
  './piano-skill-studio.js',
  './piano-import.js',
  './piano-support.js',
  './piano-sightread.js',
  './piano-path.js',
  './piano-chords.js',
  './piano-leadsheets.js',
  './piano-chords-trainer.js',
  './piano-app.js',
  './piano-placement.js',
  './piano-stage.js',
  './piano-cloud-config.js',
  './piano-score-import.js',
  './piano-sheet-model.js',
  './piano-sheet-editor.js',
  './piano-account.js',
  './piano-profile.js',
  './piano-community.js',
  './piano-addons.js',
  './piano-social-video.js',
  './piano-social.js',
  './piano-social-reels.js',
  './piano-social.css',
  './piano-pwa.js',
  './legal.js',
  './privacy.html',
  './terms.html',
  './copyright.html',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function navigationResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('./index.html')) || (await cache.match('./'));
  }
}

async function publicAssetResponse(request) {
  const cache = await caches.open(CACHE_NAME);
  const exact = await cache.match(request);
  if (exact) return exact;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return cache.match(request, { ignoreSearch: true });
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }
  event.respondWith(publicAssetResponse(request));
});
