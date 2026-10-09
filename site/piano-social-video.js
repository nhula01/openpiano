'use strict';
// Prepares a video for the community: reads its length, takes a cover frame, and (when the file is
// large, long, very high resolution or an iPhone .mov) re-records it in the browser at 720p and about
// 1.4 Mbit/s so a minute of playing is roughly 10 MB. Nothing is sent anywhere from this file; the
// prepared blobs are handed back to piano-social.js, which uploads them to the private bucket.
(() => {
  const MAX_SECONDS = 60, HARD_MAX_BYTES = 25 * 1024 * 1024, KEEP_BYTES = 12 * 1024 * 1024, LONG_SIDE = 1280, SHORT_SIDE = 720;
  const VIDEO_BITS = 1400000, AUDIO_BITS = 96000;
  const TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

  function typeOf(file) {
    const t = (file.type || '').split(';')[0].toLowerCase();
    if (TYPES[t]) return t;
    const ext = (file.name || '').toLowerCase().match(/\.(mp4|m4v|webm|mov)$/)?.[1];
    return ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : ext ? 'video/mp4' : '';
  }
  function loadVideo(url) {
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.preload = 'auto'; v.playsInline = true; v.muted = true; v.crossOrigin = 'anonymous';
      v.onloadedmetadata = () => resolve(v);
      v.onerror = () => reject(new Error('This browser cannot open that video. Try an MP4 file.'));
      v.src = url;
    });
  }
  const seek = (v, t) => new Promise(res => { if (Math.abs(v.currentTime - t) < 0.01) { res(); return; } v.onseeked = () => { v.onseeked = null; res(); }; v.currentTime = t; });
  function fit(w, h) {
    const long = Math.max(w, h), short = Math.min(w, h);
    const s = Math.min(1, LONG_SIDE / long, SHORT_SIDE / short);
    return [Math.max(2, Math.round(w * s / 2) * 2), Math.max(2, Math.round(h * s / 2) * 2)];
  }
  function recorderType() {
    if (typeof MediaRecorder === 'undefined') return '';
    // H.264 MP4 plays everywhere (iPhone included), so use it when the browser can record it
    // (Chrome 126+, Safari). Otherwise WebM. A bare 'video/mp4' is only trusted when WebM recording is
    // unavailable (Safari), because some Chromium builds put VP9 inside MP4, which iPhones cannot play.
    for (const t of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'])
      if (MediaRecorder.isTypeSupported?.(t)) return t;
    return '';
  }
  const canReencode = () => !!recorderType() && !!HTMLCanvasElement.prototype.captureStream && !!(window.AudioContext || window.webkitAudioContext);

  async function poster(v, at) {
    await seek(v, Math.min(Math.max(0, at), Math.max(0, v.duration - 0.05)));
    const [w, h] = fit(v.videoWidth || 640, v.videoHeight || 360), s = Math.min(1, 540 / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.8));
  }

  // Reads what the composer needs before posting: length, size, and whether it will be shortened.
  async function inspect(file) {
    if (!file) throw new Error('Choose a video.');
    const type = typeOf(file);
    if (!type) throw new Error('Choose a video file (MP4, MOV or WebM).');
    const url = URL.createObjectURL(file);
    try {
      const v = await loadVideo(url);
      const seconds = Number.isFinite(v.duration) ? v.duration : 0;
      if (!seconds) throw new Error('Could not read the length of that video.');
      return { type, seconds, width: v.videoWidth, height: v.videoHeight, size: file.size, url,
        needsTrim: seconds > MAX_SECONDS + 0.5, maxSeconds: MAX_SECONDS };
    } catch (e) { URL.revokeObjectURL(url); throw e; }
  }

  function needsReencode(info, start) {
    return info.type === 'video/quicktime' || info.size > KEEP_BYTES || info.needsTrim || start > 0 ||
      Math.max(info.width, info.height) > LONG_SIDE * 1.1 || Math.min(info.width, info.height) > SHORT_SIDE * 1.1;
  }

  // Re-record [start, start+60 s] through a canvas. Runs in real time; onProgress gets 0..1.
  async function reencode(file, start, onProgress, signal) {
    const url = URL.createObjectURL(file);
    let ctx, raf = 0, rec;
    try {
      const v = await loadVideo(url);
      const end = Math.min(v.duration, start + MAX_SECONDS);
      const [w, h] = fit(v.videoWidth || 1280, v.videoHeight || 720);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const g = canvas.getContext('2d');
      const stream = canvas.captureStream(30);
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      v.muted = false; v.volume = 1;
      try {
        const src = ctx.createMediaElementSource(v), dest = ctx.createMediaStreamDestination();
        src.connect(dest);                       // into the recording only, never to the speakers
        for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
      } catch { v.muted = true; }                // video without sound if audio capture is refused
      await ctx.resume().catch(() => {});
      const mime = recorderType();
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: VIDEO_BITS, audioBitsPerSecond: AUDIO_BITS });
      const chunks = []; rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      const done = new Promise((res, rej) => { rec.onstop = res; rec.onerror = e => rej(e.error || new Error('Recording failed.')); });
      await seek(v, start);
      const draw = () => {
        g.drawImage(v, 0, 0, w, h);
        onProgress?.(Math.min(1, (v.currentTime - start) / Math.max(0.1, end - start)));
        if (signal?.aborted || v.currentTime >= end - 0.02 || v.ended) { if (rec.state === 'recording') rec.stop(); v.pause(); return; }
        raf = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(draw) : requestAnimationFrame(draw);
      };
      g.drawImage(v, 0, 0, w, h);
      rec.start(1000);
      await v.play();
      draw();
      v.onended = () => { if (rec.state === 'recording') rec.stop(); };
      await done;
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const type = mime.split(';')[0];
      return { blob: new Blob(chunks, { type }), type, seconds: end - start };
    } finally {
      if (raf && !window.HTMLVideoElement.prototype.requestVideoFrameCallback) cancelAnimationFrame(raf);
      ctx?.close?.().catch(() => {});
      URL.revokeObjectURL(url);
    }
  }

  // Returns { blob, type, ext, seconds, poster } ready to upload.
  async function prepare(file, { start = 0, onProgress, signal } = {}) {
    const info = await inspect(file);
    URL.revokeObjectURL(info.url);
    start = Math.max(0, Math.min(Number(start) || 0, Math.max(0, info.seconds - 1)));
    let out;
    if (needsReencode(info, start) && canReencode()) {
      out = await reencode(file, start, onProgress, signal);
    } else {
      if (info.seconds > 90 || start > 0) throw new Error('This browser cannot shorten videos. Trim it to under a minute on your phone first.');
      out = { blob: file, type: info.type, seconds: info.seconds };
    }
    if (out.blob.size > HARD_MAX_BYTES) throw new Error('That video is still larger than 25 MB. Try a shorter clip.');
    if (out.blob.size < 1000) throw new Error('The video came out empty. Try another file or browser.');
    // Cover frame from the original, about a second in.
    const url = URL.createObjectURL(file);
    let cover = null;
    try { const v = await loadVideo(url); cover = await poster(v, start + Math.min(1, info.seconds / 3)); } catch {} finally { URL.revokeObjectURL(url); }
    return { blob: out.blob, type: out.type, ext: TYPES[out.type] || 'mp4', seconds: Math.max(0.5, Math.round(out.seconds * 10) / 10), poster: cover };
  }

  window.PianoSocialVideo = { inspect, prepare, canReencode, MAX_SECONDS, _fit: fit, _typeOf: typeOf, _needsReencode: needsReencode };
})();
