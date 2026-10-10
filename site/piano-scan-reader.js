'use strict';
// Reads printed piano music from a scan or a photo (PNG, JPEG, WebP, or a PDF of scanned pages) and
// writes it as MusicXML, entirely in this browser: no file leaves the device and nothing is sent to a
// service. It finds the staves in the picture (straightening a tilted or slightly curved page),
// recognises noteheads, stems, beams, flags, rests, clefs, accidentals, dots, ties and time
// signatures, and hands them to the PDF reader (piano-pdf-reader.js) as if they had been drawn by
// notation software, so both readers share one way of turning symbols into music.
// Handwritten music is not supported. Bars the reader is unsure of are flagged for review.
(() => {
const SP = 7; // staff space of the coordinates handed to the PDF reader (like a PDF in points)
const MAX_PIXELS = 24e6, MAX_PAGES = 30;
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// ---------------------------------------------------------------------------------------------
// 1 · Pixels: grey levels (0 black … 255 white), resizing and rotation.
// ---------------------------------------------------------------------------------------------
function toGray(rgba, w, h) {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    const a = rgba[j + 3] / 255; // transparent pixels are paper
    g[i] = Math.round((0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) * a + 255 * (1 - a));
  }
  return g;
}

function resize(src, w, h, nw, nh) {
  const out = new Uint8Array(nw * nh), fx = w / nw, fy = h / nh;
  if (fx >= 1 && fy >= 1) {
    // shrinking: average every source pixel that falls in the target pixel
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor(y * fy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor(x * fx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
        let s = 0;
        for (let yy = y0; yy < y1; yy++) { const r = yy * w; for (let xx = x0; xx < x1; xx++) s += src[r + xx]; }
        out[y * nw + x] = s / ((y1 - y0) * (x1 - x0));
      }
    }
    return out;
  }
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(h - 1.001, Math.max(0, (y + 0.5) * fy - 0.5)), y0 = Math.floor(sy), ty = sy - y0;
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1.001, Math.max(0, (x + 0.5) * fx - 0.5)), x0 = Math.floor(sx), tx = sx - x0, i = y0 * w + x0;
      out[y * nw + x] = (src[i] * (1 - tx) + src[i + 1] * tx) * (1 - ty) + (src[i + w] * (1 - tx) + src[i + w + 1] * tx) * ty;
    }
  }
  return out;
}

// Rotate by `angle` radians about the centre (positive turns the picture clockwise on screen).
function rotate(src, w, h, angle) {
  const out = new Uint8Array(w * h), c = Math.cos(angle), s = Math.sin(angle), cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx, sx = c * dx - s * dy + cx, sy = s * dx + c * dy + cy;
      if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) { out[y * w + x] = 255; continue; }
      const x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0, i = y0 * w + x0;
      out[y * w + x] = (src[i] * (1 - tx) + src[i + 1] * tx) * (1 - ty) + (src[i + w] * (1 - tx) + src[i + w + 1] * tx) * ty;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 2 · Ink and paper. Photos are lit unevenly, so the paper's brightness is measured block by block
// and a pixel is ink when it is clearly darker than the paper around it.
// ---------------------------------------------------------------------------------------------
function paperMap(g, w, h) {
  const B = 32, bw = Math.ceil(w / B), bh = Math.ceil(h / B), paper = new Float32Array(bw * bh), hist = new Uint32Array(256);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    hist.fill(0); let n = 0;
    const x0 = bx * B, y0 = by * B, x1 = Math.min(w, x0 + B), y1 = Math.min(h, y0 + B);
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) { hist[g[y * w + x]]++; n++; }
    let k = 0, c = 0; const want = n * 0.85; while (k < 255 && c + hist[k] < want) c += hist[k++];
    paper[by * bw + bx] = k;
  }
  // blocks covered by ink (a beam, a clef) borrow the paper of their neighbours
  const grow = new Float32Array(paper.length), smooth = new Float32Array(paper.length);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let m = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = by + dy, xx = bx + dx; if (yy >= 0 && xx >= 0 && yy < bh && xx < bw) m = Math.max(m, paper[yy * bw + xx]); }
    grow[by * bw + bx] = m;
  }
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = by + dy, xx = bx + dx; if (yy >= 0 && xx >= 0 && yy < bh && xx < bw) { s += grow[yy * bw + xx]; n++; } }
    smooth[by * bw + bx] = Math.max(1, s / n);
  }
  return { B, bw, bh, smooth };
}

// How dark each pixel is against the paper around it: 0 paper … 255 the page's darkest ink. Uneven
// light scales paper and ink alike, so darkness is measured as a ratio to the local paper.
function darkness(g, w, h) {
  const { B, bw, bh, smooth } = paperMap(g, w, h), out = new Uint8Array(w * h), hist = new Uint32Array(1001);
  const ratio = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(bh - 1, Math.max(0, (y - B / 2) / B)), y0 = Math.floor(fy), y1 = Math.min(bh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bw - 1, Math.max(0, (x - B / 2) / B)), x0 = Math.floor(fx), x1 = Math.min(bw - 1, x0 + 1), tx = fx - x0;
      const p = (smooth[y0 * bw + x0] * (1 - tx) + smooth[y0 * bw + x1] * tx) * (1 - ty) + (smooth[y1 * bw + x0] * (1 - tx) + smooth[y1 * bw + x1] * tx) * ty;
      const r = Math.max(0, 1 - g[y * w + x] / p); ratio[y * w + x] = r; hist[Math.min(1000, Math.round(r * 1000))]++;
    }
  }
  // the ink: the darkest percent of the page
  let k = 1000, c = 0; const want = w * h * 0.01; while (k > 0 && c + hist[k] < want) c += hist[k--];
  const ink = Math.max(0.15, k / 1000);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.round(255 * ratio[i] / ink));
  return out;
}

function binarize(dark, level = 0.35) {
  const bin = new Uint8Array(dark.length), t = Math.round(255 * level);
  for (let i = 0; i < dark.length; i++) bin[i] = dark[i] > t ? 1 : 0;
  return bin;
}

// Line thickness and staff-line distance: the commonest black run, and the commonest distance from
// one black run to the next, in columns across the page.
function runLengths(bin, w, h) {
  const black = new Float64Array(64), dist = new Float64Array(200), step = Math.max(1, Math.floor(w / 500));
  for (let x = 0; x < w; x += step) {
    let y = 0, prevStart = -1, prevLen = 0;
    while (y < h) {
      while (y < h && !bin[y * w + x]) y++;
      if (y >= h) break;
      const s = y; while (y < h && bin[y * w + x]) y++;
      const len = y - s;
      if (len < 64) black[len]++;
      if (prevStart >= 0 && len < 12 && prevLen < 12 && s - prevStart < 200) dist[s - prevStart] += 1;
      prevStart = s; prevLen = len;
    }
  }
  let t = 1; for (let i = 1; i < 64; i++) if (black[i] > black[t]) t = i;
  // smooth the distance histogram a little and take its peak above the line thickness
  let d = 0, best = 0;
  for (let i = t + 3; i < 199; i++) { const v = dist[i - 1] + 2 * dist[i] + dist[i + 1]; if (v > best) { best = v; d = i; } }
  // refine to a fractional distance
  const a = dist[d - 1], b = dist[d], c = dist[d + 1], den = a - 2 * b + c;
  const frac = den < 0 ? 0.5 * (a - c) / den : 0;
  return { t, d: d + Math.max(-0.5, Math.min(0.5, frac)), strength: best };
}

// Staff-line distance from the darkness of the page: down each sampled column, thin dark lines
// (darker than the pixels a few rows above and below, at one of three widths) are found, and the
// commonest distance from one to the next is the staff space. Unlike the ink image, this keeps
// faint, thin or blurred lines.
function lineSpacing(D, w, h) {
  const hist = new Float64Array(260), step = Math.max(1, Math.floor(w / 400)), ks = [2, 4, 7];
  for (let x = step >> 1; x < w; x += step) {
    let prev = -1;
    for (let y = 8; y < h - 8; y++) {
      const v = D[y * w + x]; if (v < 50 || v < D[(y - 1) * w + x] || v < D[(y + 1) * w + x]) continue;
      let thin = false;
      for (const k of ks) if (v - Math.max(D[(y - k) * w + x], D[(y + k) * w + x]) > 35) { thin = true; break; }
      if (!thin) continue;
      if (prev >= 0 && y - prev < 260) hist[y - prev] += 1;
      prev = y; y += 2;
    }
  }
  let best = 0, bv = 0;
  for (let i = 5; i < 258; i++) { const v = hist[i - 1] + 2 * hist[i] + hist[i + 1]; if (v > bv) { bv = v; best = i; } }
  if (!best || bv < 40) return 0;
  const a = hist[best - 1], b = hist[best], c = hist[best + 1], den = a - 2 * b + c;
  return best + (den < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0);
}

// ---------------------------------------------------------------------------------------------
// 3 · Straightening: the tilt that lines the staff lines up with the rows of pixels.
// ---------------------------------------------------------------------------------------------
function skewAngle(bin, w, h, d) {
  const xs = [], ys = [];
  // every row is sampled: skipping rows would favour the angle that keeps the skipped rows empty
  for (let y = 0; y < h; y++) { const r = y * w; for (let x = (y * 7) % 5; x < w; x += 5) if (bin[r + x]) { xs.push(x); ys.push(y); } }
  if (xs.length < 1000) return 0;
  const n = xs.length, bins = new Float64Array(h + 2 * w + 8);
  const energy = a => {
    const t = Math.tan(a), off = w + 4; bins.fill(0);
    for (let i = 0; i < n; i++) bins[(ys[i] - xs[i] * t + off) | 0]++;
    let e = 0; for (let i = 0; i < bins.length; i++) e += bins[i] * bins[i];
    return e;
  };
  let best = 0, be = -1;
  for (let deg = -8; deg <= 8.001; deg += 0.4) { const e = energy(deg * Math.PI / 180); if (e > be) { be = e; best = deg; } }
  let center = best;
  for (const step of [0.08, 0.02]) {
    let b2 = center;
    for (let k = -5; k <= 5; k++) { const deg = center + k * step, e = energy(deg * Math.PI / 180); if (e > be) { be = e; b2 = deg; } }
    center = b2;
  }
  return center * Math.PI / 180;
}

// ---------------------------------------------------------------------------------------------
// 4 · Staves. The page is cut into vertical strips; in each strip the darkness of every pixel row
// shows staff lines as five evenly spaced peaks. Staves are followed from strip to strip (a photo's
// page may bend a little), then each of the five lines is traced column by column.
// ---------------------------------------------------------------------------------------------
function stripPeaks(D, w, h, x0, x1, d, t) {
  // A staff line is dark with paper just above and below it; beams and noteheads are dark there too,
  // so each pixel counts only by how much darker it is than both of its neighbours k rows away.
  const n = x1 - x0, P = new Float32Array(h), k = Math.max(2, Math.round(0.2 * d));
  for (let y = k; y < h - k; y++) {
    let s = 0; const r = y * w, up = r - k * w, dn = r + k * w;
    for (let x = x0; x < x1; x++) { const v = D[r + x] - Math.max(D[up + x], D[dn + x]); if (v > 0) s += v; }
    P[y] = s / n;
  }
  const half = Math.max(2, Math.round(d / 2)), peaks = [];
  for (let y = 1; y < h - 1; y++) {
    const v = P[y]; if (v < 12 || v < P[y - 1] || v < P[y + 1]) continue;
    let lo = 255; for (let k = Math.max(0, y - half); k <= Math.min(h - 1, y + half); k++) if (P[k] < lo) lo = P[k];
    if (v - lo < 9) continue;
    // centre of the peak, weighted by darkness
    let sw = 0, sy = 0; for (let k = Math.max(0, y - t); k <= Math.min(h - 1, y + t); k++) { const q = Math.max(0, P[k] - lo); sw += q; sy += q * k; }
    const c = sw ? sy / sw : y, last = peaks[peaks.length - 1];
    if (last && c - last.y < t + 1) { if (v > last.v) { last.y = c; last.v = v; } continue; }
    peaks.push({ y: c, v });
  }
  // five peaks with one spacing, close to the page's staff-line distance; one faint line may be
  // missing (it is placed by the spacing). Ledger lines repeat the spacing too, so every candidate
  // is scored and the strongest are kept first (ledger lines are short, so their peaks are weak).
  const cands = [];
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < peaks.length && peaks[j].y - peaks[i].y < 2.6 * d; j++) {
      const g0 = peaks[j].y - peaks[i].y;
      for (const span of [1, 2]) {
        const g = g0 / span; if (g < 0.75 * d || g > 1.3 * d) continue;
        const ys = [peaks[i].y], pick = [i]; let missing = span - 1, last = j;
        if (span === 2) ys.push(peaks[i].y + g);
        ys.push(peaks[j].y); pick.push(j);
        while (ys.length < 5) {
          const want = ys[ys.length - 1] + g, tol = Math.max(1.6, 0.14 * d);
          let m = -1, md = tol;
          for (let q = last + 1; q < peaks.length && peaks[q].y < want + tol; q++) if (Math.abs(peaks[q].y - want) <= md) { md = Math.abs(peaks[q].y - want); m = q; }
          if (m >= 0) { ys.push(peaks[m].y); pick.push(m); last = m; }
          else if (missing < 1 && ys.length < 4) { ys.push(want); missing++; }
          else break;
        }
        if (ys.length < 5) continue;
        const vs = pick.map(q => peaks[q].v);
        if (Math.min(...vs) < 0.25 * Math.max(...vs)) continue;
        cands.push({ pick, ys, score: vs.reduce((a, b) => a + b, 0) * (missing ? 0.8 : 1) });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const staves = [], used = new Set();
  for (const c of cands) {
    if (c.pick.some(q => used.has(q))) continue;
    if (staves.some(ys => Math.min(ys[4], c.ys[4]) - Math.max(ys[0], c.ys[0]) > -0.5 * d)) continue;
    c.pick.forEach(q => used.add(q)); staves.push(c.ys);
  }
  return staves.sort((a, b) => a[0] - b[0]);
}

function findStaffLines(D, w, h, d, t) {
  const S = Math.max(40, Math.round(8 * d)), step = Math.round(S / 2), items = [];
  for (let x0 = 0, k = 0; x0 + S / 2 < w; x0 += step, k++) {
    const x1 = Math.min(w, x0 + S);
    for (const ys of stripPeaks(D, w, h, x0, x1, d, t)) items.push({ k, x: (x0 + x1) / 2, ys, c: (ys[0] + ys[4]) / 2, sp: (ys[4] - ys[0]) / 4 });
  }
  // follow each staff from strip to strip
  const chains = [];
  for (const it of items.sort((a, b) => a.k - b.k || a.c - b.c)) {
    let best = null, bd = 0.5 * d;
    for (const ch of chains) {
      const last = ch[ch.length - 1]; if (last.k >= it.k || it.k - last.k > 4) continue;
      const dist = Math.abs(last.c - it.c); if (dist < bd) { bd = dist; best = ch; }
    }
    if (best) best.push(it); else chains.push([it]);
  }
  // a staff matched one line off in some strips forms a second chain over the same staff: chains
  // closer than a staff's height are one staff (kept from the chain seen in more strips)
  chains.sort((a, b) => b.length - a.length);
  const kept = [];
  for (const ch of chains) {
    const k0 = ch[0].k, k1 = ch[ch.length - 1].k, c = median(ch.map(it => it.c));
    const other = kept.find(o => Math.min(o.k1, k1) >= Math.max(o.k0, k0) - 2 && Math.abs(o.c - c) < 5 * d);
    if (!other) { kept.push({ ch, k0, k1, c }); continue; }
    if (Math.abs(other.c - c) < 0.5 * d) { other.ch.push(...ch.filter(it => !other.ch.some(o => o.k === it.k))); other.ch.sort((a, b) => a.k - b.k); other.k0 = Math.min(other.k0, k0); other.k1 = Math.max(other.k1, k1); }
  }
  const staves = [];
  for (const { ch } of kept) {
    if (ch.length < 3) continue;
    const st = traceStaff(D, w, h, ch, d);
    if (st && st.x1 - st.x0 > 10 * d) staves.push(st);
  }
  // Pieces of one staff (broken where its lines fade) are traced again as one; pieces one line off,
  // or found twice, clash with a better staff and are dropped.
  const atGap = (a, b) => { const x = a.x1 < b.x0 ? (a.x1 + b.x0) / 2 : b.x1 < a.x0 ? (b.x1 + a.x0) / 2 : (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2; return Math.abs(a.lineAt(0, x) - b.lineAt(0, x)); };
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < staves.length && !again; i++) for (let j = i + 1; j < staves.length && !again; j++) {
      const a = staves[i], b = staves[j];
      if (Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) - 2 * d || Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) > 40 * d || atGap(a, b) > 0.4 * d) continue;
      const st = traceStaff(D, w, h, [...a.chain, ...b.chain].sort((p, q) => p.x - q.x), d);
      if (st) { staves.splice(j, 1); staves[i] = st; again = true; }
    }
  }
  staves.sort((a, b) => b.score - a.score);
  const out = [];
  for (const st of staves) {
    const clash = out.some(o => Math.min(o.x1, st.x1) > Math.max(o.x0, st.x0) - 30 * d && atGap(o, st) < 4.5 * d);
    if (!clash) out.push(st);
  }
  // staves of music run most of the page's width; a short stray pattern is no staff
  const longest = Math.max(0, ...out.map(st => st.x1 - st.x0));
  return out.filter(st => st.x1 - st.x0 > Math.max(16 * d, 0.15 * longest)).sort((a, b) => a.top - b.top);
}

// Trace the five lines of one staff column by column, from the strip estimates outwards. A pixel
// is on a line when it is darker than the pixels a little above and below it (beams, noteheads and
// stems are dark there too, so they do not pull the trace).
function traceStaff(D, w, h, chain, d) {
  const anchors = chain.map(it => ({ x: it.x, ys: it.ys }));
  const kk = Math.max(2, Math.round(0.2 * d)), r = Math.max(2, Math.round(0.25 * d));
  const lr = (x, y) => y < kk || y + kk >= h ? 0 : D[y * w + x] - Math.max(D[(y - kk) * w + x], D[(y + kk) * w + x]);
  const hit = (x, py) => {
    py = Math.round(py); let best = -1, bv = 25;
    for (let y = Math.max(0, py - r); y <= Math.min(h - 1, py + r); y++) { const v = lr(x, y); if (v > bv) { bv = v; best = y; } }
    return best;
  };
  const predict = (k, x) => {
    let i = 0; while (i + 1 < anchors.length && anchors[i + 1].x < x) i++;
    const a = anchors[i], b = anchors[Math.min(anchors.length - 1, i + 1)];
    if (x <= anchors[0].x) return anchors[0].ys[k];
    if (x >= anchors[anchors.length - 1].x) return anchors[anchors.length - 1].ys[k];
    return b.x === a.x ? a.ys[k] : a.ys[k] + (b.ys[k] - a.ys[k]) * (x - a.x) / (b.x - a.x);
  };
  // the five lines move together: a top line and a spacing, refitted from the lines seen
  const fit = pts => {
    const sl = [];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) sl.push((pts[j][1] - pts[i][1]) / (pts[j][0] - pts[i][0]));
    const s = median(sl); return { c: median(pts.map(([k, y]) => y - k * s)), s };
  };
  const walk = (x, dir) => {
    const a = fit([0, 1, 2, 3, 4].map(k => [k, predict(k, x)])), s0 = a.s, found = [];
    let { c, s } = a, last = x, gap = 0, since = 0;
    for (let xx = x; xx >= 0 && xx < w; xx += dir) {
      const pts = [];
      for (let k = 0; k < 5; k++) { const y = hit(xx, c + k * s); if (y >= 0) pts.push([k, y]); }
      if (pts.length >= 3) {
        const f = fit(pts); c += 0.25 * (f.c - c); s += 0.1 * (Math.min(1.12 * s0, Math.max(0.88 * s0, f.s)) - s);
      }
      // beams and chords hide some lines; the staff goes on while three are seen
      if (pts.length >= 3) { last = xx; gap = 0; if (++since >= d) { since = 0; found.push({ x: xx, ys: [0, 1, 2, 3, 4].map(k => c + k * s) }); } }
      else if (++gap > Math.max(4, 6 * d)) break; // a clef and a time signature can hide the lines for a while
    }
    return { last, found };
  };
  // the outermost strips may hang over the staff's ends, so the walks start one strip inside
  const n0 = anchors.length, left = walk(Math.round(anchors[Math.min(1, n0 - 1)].x), -1), right = walk(Math.round(anchors[Math.max(0, n0 - 2)].x), 1);
  anchors.splice(0, anchors.findIndex(a => a.x >= left.last), ...left.found.reverse().filter(a => a.x >= left.last));
  const cut = anchors.findIndex(a => a.x > right.last); if (cut >= 0) anchors.splice(cut); anchors.push(...right.found.filter(a => a.x <= right.last));
  anchors.sort((a, b) => a.x - b.x);
  const x0 = left.last, x1 = right.last, n = x1 - x0 + 1;
  if (n < 10) return null;
  const lines = [];
  for (let k = 0; k < 5; k++) {
    // measured offsets from the prediction, smoothed by a running median
    const off = new Float32Array(n), ok = new Uint8Array(n);
    for (let x = x0; x <= x1; x++) {
      const py = predict(k, x), y = hit(x, py); if (y < 0) continue;
      // sub-pixel centre from the neighbouring rows
      const a = Math.max(0, lr(x, y - 1)), b = lr(x, y), c = Math.max(0, lr(x, y + 1));
      off[x - x0] = y + (c - a) / (2 * Math.max(1, b)) - py; ok[x - x0] = 1;
    }
    const win = Math.max(4, Math.round(d)), ys = new Float32Array(n), buf = [];
    for (let i = 0; i < n; i++) {
      buf.length = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) if (ok[j]) buf.push(off[j]);
      buf.sort((p, q) => p - q);
      ys[i] = predict(k, x0 + i) + (buf.length ? buf[buf.length >> 1] : 0);
    }
    lines.push(ys);
  }
  const lineAt = (k, x) => lines[k][Math.min(n - 1, Math.max(0, Math.round(x) - x0))];
  let seen = 0; for (let x = x0; x <= x1; x += 2) for (let k = 0; k < 5; k++) if (hit(x, lineAt(k, x)) >= 0) seen++;
  const mid = Math.round((x0 + x1) / 2);
  const st = { x0, x1, lines, lineAt, top: lineAt(0, mid), bottom: lineAt(4, mid), score: seen / 5 * 2, chain };
  st.sp = (st.bottom - st.top) / 4;
  return st;
}

// Erase the staff lines where nothing crosses them, so the symbols on the staff stand apart. Each
// line is measured first: where it runs thicker than usual, something sits on it.
function removeStaffLines(bin, w, h, staves, t) {
  const out = bin.slice();
  const runAt = (x, y) => {
    let c = -1; for (const dy of [0, -1, 1, -2, 2]) { const yy = y + dy; if (yy >= 0 && yy < h && bin[yy * w + x]) { c = yy; break; } }
    if (c < 0) return null;
    let a = c, b = c; while (a > 0 && bin[(a - 1) * w + x]) a--; while (b < h - 1 && bin[(b + 1) * w + x]) b++;
    return [a, b];
  };
  for (const st of staves) for (let k = 0; k < 5; k++) {
    const lens = [];
    for (let x = st.x0; x <= st.x1; x += 2) { const r = runAt(x, Math.round(st.lineAt(k, x))); if (r && r[1] - r[0] < 0.4 * st.sp) lens.push(r[1] - r[0] + 1); }
    const maxRun = Math.max(t + 1, median(lens) + 1);
    // a stroke crossing the line (a flat's stem, a sharp) may be cut by a hairline of paper on either
    // side of the line in a blurred picture: ink just above and just below means keep it
    const inkAt = (x, y) => y >= 0 && y < h && bin[y * w + x];
    for (let x = st.x0; x <= st.x1; x++) {
      const r = runAt(x, Math.round(st.lineAt(k, x)));
      if (!r || r[1] - r[0] + 1 > maxRun) continue;
      // (only an upright stroke counts: ink running on for a good part of a space above and below)
      const run = (y0, dir) => { let y = y0; while (y - y0 < 3 * dir && !inkAt(x, y)) y += dir; let n = 0; while (inkAt(x, y) && n < st.sp) { y += dir; n++; } return n; };
      if (run(r[0] - 1, -1) >= 0.35 * st.sp && run(r[1] + 1, 1) >= 0.35 * st.sp) continue;
      for (let yy = r[0]; yy <= r[1]; yy++) out[yy * w + x] = 0;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 5 · One page: scale it so a staff space is about 18 pixels, straighten it, find its staves.
// ---------------------------------------------------------------------------------------------
function preparePage(gray, w, h) {
  let g = gray, D = darkness(g, w, h), d = lineSpacing(D, w, h), scale = 1;
  if (d < 5) return null;
  if (d > 26 || d < 13) {
    scale = Math.min(18 / d, Math.sqrt(MAX_PIXELS / (w * h)));
    const nw = Math.round(w * scale), nh = Math.round(h * scale);
    g = resize(g, w, h, nw, nh); w = nw; h = nh; D = darkness(g, w, h); d = lineSpacing(D, w, h);
  }
  let bin = binarize(D);
  const angle = skewAngle(binarize(D, 0.2), w, h, d);
  if (Math.abs(angle) > 0.0005) { g = rotate(g, w, h, angle); D = darkness(g, w, h); bin = binarize(D); d = lineSpacing(D, w, h) || d; }
  const staves = findStaffLines(D, w, h, d, Math.max(1, Math.round(0.12 * d)));
  // line thickness as drawn in the ink image, measured on the traced lines
  const runs = [];
  for (const st of staves) for (let k = 0; k < 5; k++) for (let x = st.x0; x <= st.x1; x += 3) {
    const y = Math.round(st.lineAt(k, x)); let c = -1;
    for (const dy of [0, -1, 1]) if (bin[(y + dy) * w + x]) { c = y + dy; break; }
    if (c < 0) continue;
    let a = c, b = c; while (a > 0 && bin[(a - 1) * w + x]) a--; while (b < h - 1 && bin[(b + 1) * w + x]) b++;
    if (b - a < d / 2) runs.push(b - a + 1);
  }
  runs.sort((p, q) => p - q);
  const t = runs.length ? runs[runs.length >> 1] : Math.max(1, Math.round(0.1 * d));
  return { g, D, bin, w, h, scale, angle, d, t, staves };
}

// ---------------------------------------------------------------------------------------------
// 6 · Connected pieces of ink (8-connected), labelled run by run.
// ---------------------------------------------------------------------------------------------
function components(bin, w, h) {
  const label = new Int32Array(w * h), parent = [0];
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  let prev = [];
  for (let y = 0; y < h; y++) {
    const runs = [], r = y * w;
    for (let x = 0; x < w;) {
      if (!bin[r + x]) { x++; continue; }
      const s = x; while (x < w && bin[r + x]) x++;
      let id = 0;
      for (const p of prev) {
        if (p.e < s - 1 || p.s > x) continue; // 8-connected: touching diagonally counts
        const a = find(p.id);
        if (!id) id = a; else if (a !== id) { const lo = Math.min(a, id), hi = Math.max(a, id); parent[hi] = lo; id = lo; }
      }
      if (!id) { id = parent.length; parent.push(id); }
      runs.push({ s, e: x - 1, id });
    }
    for (const run of runs) for (let x = run.s; x <= run.e; x++) label[r + x] = run.id;
    prev = runs;
  }
  const comps = new Map();
  for (let y = 0; y < h; y++) for (let x = 0, r = y * w; x < w; x++) {
    let id = label[r + x]; if (!id) continue;
    id = find(id); label[r + x] = id;
    let c = comps.get(id);
    if (!c) { c = { id, x0: x, x1: x, y0: y, y1: y, n: 0 }; comps.set(id, c); }
    if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y > c.y1) c.y1 = y; c.n++;
  }
  return { label, comps: [...comps.values()] };
}

// ---------------------------------------------------------------------------------------------
// 7 · Lines in the music: ledger lines, stems and barlines (vertical strokes), beams.
// ---------------------------------------------------------------------------------------------
// Short thin lines a whole number of staff spaces above or below a staff.
function findLedgers(img, w, h, staves, t) {
  const out = [], thin = Math.max(2, 2 * t + 1);
  for (const st of staves) {
    for (const side of [-1, 1]) for (let k = 1; k <= 7; k++) {
      let run = null;
      const flush = () => { if (run && run.n >= 0.9 * st.sp && run.n <= 4.5 * st.sp && run.thin >= 0.4 * st.sp) out.push({ st, x0: run.x0, x1: run.x1, y: run.ys / run.n, side, k }); run = null; };
      for (let x = st.x0; x <= st.x1; x++) {
        const base = side < 0 ? st.lineAt(0, x) : st.lineAt(4, x), sp = (st.lineAt(4, x) - st.lineAt(0, x)) / 4;
        const y0 = Math.round(base + side * k * sp);
        let c = -1; for (const dy of [0, -1, 1]) { const y = y0 + dy; if (y > 0 && y < h && img[y * w + x]) { c = y; break; } }
        if (c < 0) { flush(); continue; }
        let a = c, b = c; while (a > 0 && img[(a - 1) * w + x]) a--; while (b < h - 1 && img[(b + 1) * w + x]) b++;
        if (!run) run = { x0: x, x1: x, n: 0, ys: 0, thin: 0 };
        run.x1 = x; run.n++; run.ys += (a + b) / 2;
        if (b - a + 1 <= thin) run.thin++;
      }
      flush();
    }
  }
  return out;
}

// Vertical strokes: runs of ink down a column, at least about two staff spaces long, joined with
// the runs of neighbouring columns that start and end at about the same height, or that carry on a
// slightly slanted line (a barline in a photo).
function findVerticals(img, w, h, sp) {
  const minLen = Math.round(1.6 * sp), open = [], done = [], tol = 0.5 * sp;
  for (let x = 0; x < w; x++) {
    const runs = [];
    for (let y = 0; y < h;) {
      if (!img[y * w + x]) { y++; continue; }
      const s = y; while (y < h && img[y * w + x]) y++;
      if (y - s >= minLen) runs.push([s, y - 1]);
    }
    const next = [];
    for (const [a, b] of runs) {
      let g = open.find(g => g.x1 === x - 1 && !next.includes(g) && Math.abs(g.lastA - a) <= tol && Math.abs(g.lastB - b) <= tol);
      if (!g) g = open.find(g => g.x1 === x - 1 && !next.includes(g) && g.x1 - g.x0 < 0.4 * sp && Math.min(g.lastB, b) - Math.max(g.lastA, a) > 0.5 * Math.min(b - a, g.lastB - g.lastA) && (b - g.y1 > -tol) !== (a - g.y0 < tol) );
      if (g) { g.x1 = x; g.lastA = a; g.lastB = b; g.as.push(a); g.bs.push(b); g.y0 = Math.min(g.y0, a); g.y1 = Math.max(g.y1, b); g.n += b - a + 1; g.sx += x * (b - a + 1); next.push(g); }
      else next.push({ x0: x, x1: x, lastA: a, lastB: b, as: [a], bs: [b], y0: a, y1: b, n: b - a + 1, sx: x * (b - a + 1) });
    }
    for (const g of open) if (!next.includes(g)) done.push(g);
    open.length = 0; open.push(...next);
  }
  done.push(...open);
  return done.map(g => {
    const len = g.y1 - g.y0 + 1, thick = g.n / len;
    return { x0: g.x0, x1: g.x1, x: g.sx / g.n, w: Math.max(1, Math.round(thick)), y0: g.y0, y1: g.y1, ym0: median(g.as), ym1: median(g.bs), len };
  });
}

// Beams: bands about half a staff space thick running left to right (sloped or flat), found in the
// ink left when stems are taken out.
function findBeams(img, w, h, sp) {
  // a beam is cut where stems were taken out: pieces either side of a stem are one beam
  const lo = Math.max(2, Math.round(0.28 * sp)), hi = Math.round(0.9 * sp), gapMax = Math.max(3, Math.round(0.4 * sp)), open = [], done = [];
  for (let x = 0; x < w; x++) {
    const runs = [];
    for (let y = 0; y < h;) {
      if (!img[y * w + x]) { y++; continue; }
      const s = y; while (y < h && img[y * w + x]) y++;
      if (y - s >= lo && y - s <= hi) runs.push([s, y - 1]);
    }
    const next = [];
    for (const [a, b] of runs) {
      const c = (a + b) / 2;
      const g = open.find(g => g.x1 >= x - gapMax && !next.includes(g) && Math.abs(g.lastC + g.slope * (x - g.x1) - c) <= Math.max(2, 0.18 * sp) && Math.abs((b - a) - g.lastT) <= Math.max(2, 0.2 * sp));
      if (g) {
        if (g.cols.length >= 4) g.slope = 0.7 * g.slope + 0.3 * (c - g.lastC) / Math.max(1, x - g.x1);
        g.x1 = x; g.lastC = c; g.lastT = b - a; g.cols.push([x, a, b]); next.push(g);
      } else next.push({ x0: x, x1: x, lastC: c, lastT: b - a, slope: 0, cols: [[x, a, b]] });
    }
    for (const g of open) if (!next.includes(g)) { if (g.x1 >= x - gapMax) next.push(g); else done.push(g); }
    open.length = 0; open.push(...next);
  }
  done.push(...open);
  const out = [];
  for (const g of done) {
    const len = g.x1 - g.x0 + 1; if (len < 0.8 * sp) continue;
    // straight top and bottom edges by least squares
    const n = g.cols.length; let sx = 0, sxx = 0, sa = 0, sb = 0, sxa = 0, sxb = 0;
    for (const [x, a, b] of g.cols) { sx += x; sxx += x * x; sa += a; sb += b; sxa += x * a; sxb += x * b; }
    const den = n * sxx - sx * sx || 1, ka = (n * sxa - sx * sa) / den, kb = (n * sxb - sx * sb) / den, ca = (sa - ka * sx) / n, cb = (sb - kb * sx) / n;
    const thick = median(g.cols.map(([, a, b]) => b - a + 1));
    let off = 0; for (const [x, a, b] of g.cols) off += Math.abs(a - (ca + ka * x)) + Math.abs(b - (cb + kb * x));
    if (off / n > 0.15 * sp + 1) continue; // not a straight band (a notehead, a slur)
    // a beam keeps its thickness; a notehead (an oval) is thin at its ends and thick in the middle
    const ts = g.cols.slice(Math.floor(n * 0.1), Math.ceil(n * 0.9)).map(([, a, b]) => b - a + 1);
    if (ts.length && Math.max(...ts) - Math.min(...ts) > Math.max(2, 0.25 * sp)) continue;
    if (len < 1.1 * sp) continue;
    if (Math.abs(ka) > 1.2) continue;
    out.push({ x0: g.x0, x1: g.x1, top: x => ca + ka * x, bot: x => cb + kb * x + 1, thick, slope: ka });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 8 · Noteheads. Black heads are filled ovals centred on a line or a space of a staff (or of its
// ledger lines); open heads (half and whole notes) are rings around a small hole of paper.
// ---------------------------------------------------------------------------------------------
function integral(img, w, h) {
  const I = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; const r = y * w, o = (y + 1) * (w + 1); for (let x = 0; x < w; x++) { row += img[r + x]; I[o + x + 1] = I[o - (w + 1) + x + 1] + row; } }
  return (x0, y0, x1, y1) => { // inclusive box, clipped
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w - 1, x1); y1 = Math.min(h - 1, y1);
    if (x1 < x0 || y1 < y0) return 0;
    return I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0];
  };
}

// Positions where a notehead can sit: every line and space from 7 ledger lines above a staff to
// 7 below, as (step, y at x) with steps counted in half spaces from the bottom line.
const stepY = (st, step, x) => { const top = st.lineAt(0, x), bot = st.lineAt(4, x); return bot - step * (bot - top) / 8; };

function findBlackHeads(img, w, h, staves, sp) {
  const box = integral(img, w, h), hx = Math.max(2, Math.round(0.42 * sp)), hy = Math.max(1, Math.round(0.3 * sp));
  const vx = Math.max(1, Math.round(0.22 * sp)), vy = Math.max(2, Math.round(0.42 * sp));
  const area = (2 * hx + 1) * (2 * hy + 1) + (2 * vx + 1) * (2 * vy + 1) - (2 * vx + 1) * (2 * hy + 1);
  const fill = (x, y) => (box(x - hx, y - hy, x + hx, y + hy) + box(x - vx, y - vy, x + vx, y + vy) - box(x - vx, y - hy, x + vx, y + hy)) / area;
  const cands = [];
  for (const st of staves) for (let step = -16; step <= 24; step++) {
    let runStart = -1, best = 0, bx = 0, by = 0;
    for (let x = st.x0 - Math.round(sp); x <= st.x1 + Math.round(sp); x++) {
      const y = Math.round(stepY(st, step, Math.min(st.x1, Math.max(st.x0, x))));
      const f = y > 0 && y < h ? fill(x, y) : 0;
      if (f >= 0.82) { if (runStart < 0) { runStart = x; best = 0; } if (f > best) { best = f; bx = x; by = y; } }
      else if (runStart >= 0) {
        const len = x - runStart;
        if (len <= 1.4 * sp) cands.push({ st, step, x: (runStart + x - 1) / 2, y: by, f: best, len });
        runStart = -1;
      }
    }
  }
  // a head also fills the positions half a space above and below: keep the best of neighbours
  cands.sort((a, b) => b.f - a.f || a.len - b.len);
  const heads = [];
  for (const c of cands) {
    if (heads.some(o => Math.abs(o.x - c.x) < 0.75 * sp && Math.abs(o.y - c.y) < 0.75 * sp)) continue;
    heads.push(c);
  }
  return heads;
}

// Open heads: a hole of paper ringed by ink about a staff space across. A ledger or staff line
// left inside the hole cuts it in two halves, which are put back together; a neighbouring note may
// touch the ring on one side.
function findOpenHeads(img, w, h, staves, sp) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = img[i] ? 0 : 1;
  const { label, comps } = components(inv, w, h), out = [];
  const small = comps.filter(c => c.x0 > 0 && c.y0 > 0 && c.x1 < w - 1 && c.y1 < h - 1 && c.x1 - c.x0 + 1 <= 1.2 * sp && c.y1 - c.y0 + 1 <= 0.85 * sp && c.n >= 3);
  // halves of a hole split by a thin line
  small.sort((a, b) => a.y0 - b.y0);
  const holes = [];
  for (const c of small) {
    const o = holes.find(o => c.y0 - o.y1 <= Math.max(3, 0.2 * sp) && c.y0 > o.y0 && Math.min(o.x1, c.x1) - Math.max(o.x0, c.x0) > 0.4 * Math.min(o.x1 - o.x0, c.x1 - c.x0) && c.y1 - o.y0 + 1 <= 0.95 * sp);
    if (o) { o.x0 = Math.min(o.x0, c.x0); o.x1 = Math.max(o.x1, c.x1); o.y1 = c.y1; o.n += c.n; o.ids.push(c.id); }
    else holes.push({ ...c, ids: [c.id] });
  }
  const inHole = (o, i) => o.ids.includes(label[i]);
  for (const c of holes) {
    const hw = c.x1 - c.x0 + 1, hh = c.y1 - c.y0 + 1;
    if (hw < 0.25 * sp || hh < 0.12 * sp || c.n < 0.25 * hw * hh) continue;
    // centroid of the hole
    let sx = 0, sy = 0, n = 0;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (inHole(c, y * w + x)) { sx += x; sy += y; n++; }
    let cx = Math.round(sx / n), cy = Math.round(sy / n);
    if (!inHole(c, cy * w + cx)) { // a crescent or split hole: start from its pixel nearest the centroid
      let bd = Infinity, bx = cx, by = cy;
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (inHole(c, y * w + x)) { const d2 = (x - cx) ** 2 + (y - cy) ** 2; if (d2 < bd) { bd = d2; bx = x; by = y; } }
      cx = bx; cy = by;
    }
    // ring thickness along a ray: leave the hole, cross the ink, report its thickness (or -1)
    const ray = (dx, dy) => {
      let x = cx, y = cy, steps = 0;
      while (x >= 0 && y >= 0 && x < w && y < h && !img[y * w + x] && steps++ < sp) { x += dx; y += dy; }
      let t = 0; while (x >= 0 && y >= 0 && x < w && y < h && img[y * w + x] && t < 2 * sp) { x += dx; y += dy; t++; }
      return { t, edge: steps };
    };
    const L = ray(-1, 0), R = ray(1, 0), U = ray(0, -1), D = ray(0, 1);
    const thin = r => r.t >= 1 && r.t <= 0.55 * sp;
    if (!thin(U) && !thin(D) || U.t < 1 || D.t < 1) continue;
    if (!thin(L) && !thin(R)) continue;
    const side = thin(L) && thin(R) ? L.t + R.t : 2 * (thin(L) ? L.t : R.t);
    const ow = L.edge + R.edge + side, oh = U.edge + D.edge + Math.min(U.t, 0.4 * sp) + Math.min(D.t, 0.4 * sp);
    if (ow < 0.8 * sp || ow > 2.2 * sp || oh < 0.6 * sp || oh > 1.5 * sp || ow < 0.95 * oh) continue;
    // a head sits on a line or in a space of some staff
    let best = null, bd = Infinity;
    for (const st of staves) {
      if (cx < st.x0 - 2 * sp || cx > st.x1 + 2 * sp) continue;
      const x = Math.min(st.x1, Math.max(st.x0, cx)), bot = st.lineAt(4, x), top = st.lineAt(0, x), step = Math.round((bot - cy) / ((bot - top) / 8));
      if (step < -16 || step > 24) continue;
      const dist = Math.abs(stepY(st, step, x) - cy); if (dist < bd) { bd = dist; best = { st, step }; }
    }
    if (!best || bd > 0.3 * sp) continue;
    const x0 = cx - L.edge - (thin(L) ? L.t : (thin(R) ? R.t : 0)), x1 = cx + R.edge + (thin(R) ? R.t : (thin(L) ? L.t : 0));
    out.push({ st: best.st, step: best.step, x: (x0 + x1) / 2, y: cy, x0, x1, y0: cy - U.edge - U.t, y1: cy + D.edge + D.t, hole: c, wide: ow });
  }
  // one head per place: the one with the biggest hole
  out.sort((a, b) => b.hole.n - a.hole.n);
  return out.filter((o, i) => !out.some((p, j) => j < i && Math.abs(p.x - o.x) < 0.5 * sp && Math.abs(p.y - o.y) < 0.6 * sp)).sort((a, b) => a.x - b.x);
}

// ---------------------------------------------------------------------------------------------
// 9 · Symbols that stand apart (clefs, accidentals, rests, time signatures, dots…) are told apart
// by a small neural network from the shape of the piece of ink: its size in staff spaces, its
// holes, its place on the staff and a coarse 12 × 12 picture of it.
// ---------------------------------------------------------------------------------------------
const GRID = 12;
function shapeFeatures(label, c, w, sp, staves) {
  const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, f = [];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  f.push(clamp(Math.log2(bw / sp), -4, 4) / 4, clamp(Math.log2(bh / sp), -4, 4) / 4, clamp(Math.log2(bw / bh), -4, 4) / 4, c.n / (bw * bh));
  // holes: paper inside the bounding box not reachable from its border
  let holes = 0;
  if (bw * bh < 40000) {
    const m = new Uint8Array((bw + 2) * (bh + 2)), W2 = bw + 2; // 1 ink, 2 reached paper
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (label[(c.y0 + y) * w + c.x0 + x] === c.id) m[(y + 1) * W2 + x + 1] = 1;
    const flood = start => { const st = [start]; m[start] = 2; let n = 0; while (st.length) { const i = st.pop(); n++; for (const j of [i - 1, i + 1, i - W2, i + W2]) if (j >= 0 && j < m.length && m[j] === 0) { m[j] = 2; st.push(j); } } return n; };
    flood(0);
    for (let i = 0; i < m.length; i++) if (m[i] === 0) { const n = flood(i); if (n >= Math.max(2, 0.004 * sp * sp)) holes++; }
  }
  f.push(Math.min(holes, 3) / 3);
  // place on the nearest staff, in half spaces from its middle line
  const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
  let best = null, bd = Infinity;
  for (const st of staves) { const x = clamp(cx, st.x0, st.x1), t = st.lineAt(0, x), b = st.lineAt(4, x), d = cy < t ? t - cy : cy > b ? cy - b : 0; if (d < bd) { bd = d; best = { t, b }; } }
  if (best) {
    const half = (best.b - best.t) / 8, mid = (best.t + best.b) / 2;
    f.push(clamp((cy - mid) / half, -16, 16) / 16, clamp((c.y0 - mid) / half, -16, 16) / 16, clamp((c.y1 - mid) / half, -16, 16) / 16, bd === 0 ? 1 : 0);
  } else f.push(1, 1, 1, 0);
  // coarse picture
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    const xa = c.x0 + Math.floor(gx * bw / GRID), xb = Math.max(xa + 1, c.x0 + Math.floor((gx + 1) * bw / GRID));
    const ya = c.y0 + Math.floor(gy * bh / GRID), yb = Math.max(ya + 1, c.y0 + Math.floor((gy + 1) * bh / GRID));
    let k = 0, n = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { n++; if (label[y * w + x] === c.id) k++; }
    f.push(k / n);
  }
  return f;
}

// The network: one hidden layer of 96 units. Its weights are trained on pages engraved in five
// music fonts (see docs/piano-self-service.md) and stored below as 8-bit numbers.
let NET = null;
function net() {
  if (NET) return NET;
  const M = window.PianoScanModel; if (!M) throw new Error('The symbol model is missing.');
  const dec = (q, rows, cols) => {
    if (Array.isArray(q)) return Float32Array.from(q.flat());
    const bin = atob(q.data), out = new Float32Array(rows * cols);
    for (let i = 0; i < out.length; i++) { let b = bin.charCodeAt(i); if (b > 127) b -= 256; out[i] = b * q.scale; }
    return out;
  };
  const D = M.D || M.W1.length, H = M.H || M.b1.length, K = M.classes.length;
  NET = { classes: M.classes, D, H, K, W1: dec(M.W1, D, H), b1: Float32Array.from(M.b1), W2: dec(M.W2, H, K), b2: Float32Array.from(M.b2) };
  return NET;
}
function classify(f) {
  const N = net(), h = new Float32Array(N.H);
  for (let j = 0; j < N.H; j++) { let s = N.b1[j]; for (let i = 0; i < N.D; i++) s += f[i] * N.W1[i * N.H + j]; h[j] = s > 0 ? s : 0; }
  let best = 0, bv = -Infinity, sum = 0; const z = new Float32Array(N.K);
  for (let k = 0; k < N.K; k++) { let s = N.b2[k]; for (let j = 0; j < N.H; j++) s += h[j] * N.W2[j * N.K + k]; z[k] = s; if (s > bv) { bv = s; best = k; } }
  const probs = {};
  for (let k = 0; k < N.K; k++) sum += Math.exp(z[k] - bv);
  for (let k = 0; k < N.K; k++) probs[N.classes[k]] = Math.exp(z[k] - bv) / sum;
  return { cls: N.classes[best], p: 1 / sum, probs };
}
// Usual time signatures, for choosing between readings of two numbers that are hard to see.
const METERS = { '2/4': 3, '3/4': 4, '4/4': 4, '2/2': 2, '6/8': 3, '3/8': 2, '9/8': 1.5, '12/8': 1.5, '5/4': 1, '6/4': 1, '3/2': 1, '7/8': 0.7, '5/8': 0.7, '7/4': 0.5, '9/4': 0.3, '1/4': 0.2 };

// ---------------------------------------------------------------------------------------------
// 10 · One page read: symbols found in the picture, handed on as drawing primitives in the PDF
// reader's coordinates (straightened, a staff space = SP units).
// ---------------------------------------------------------------------------------------------
const FIXED = { clefG: { k: 'clef', v: 'G' }, clefF: { k: 'clef', v: 'F' }, clefC: { k: 'clef', v: 'C' }, sharp: { k: 'acc', v: 1 }, flat: { k: 'acc', v: -1 },
  natural: { k: 'acc', v: 0 }, dsharp: { k: 'acc', v: 2 }, dflat: { k: 'acc', v: -2 }, rest4: { k: 'rest', v: 2 }, rest8: { k: 'rest', v: 3 }, rest16: { k: 'rest', v: 4 },
  rest32: { k: 'rest', v: 5 }, tsC: { k: 'tsig', v: 'C' }, tsCut: { k: 'tsig', v: 'cut' }, dot: { k: 'dot' }, brace: { k: 'brace' } };
for (let n = 1; n <= 9; n++) { FIXED['ts' + n] = { k: 'tsig', v: n }; FIXED['tup' + n] = { k: 'tup', v: n }; }

// The pieces of ink the symbol network looks at: the page without staff lines and without barlines.
function inkPieces(P) {
  const { w, h, d: sp, t, staves } = P;
  const clean = removeStaffLines(P.bin, w, h, staves, t);
  // barlines (strokes as tall as a staff) are taken out before the pieces of ink are told apart, so
  // a clef or a note touching one stays a piece of its own
  const allVerts = findVerticals(clean, w, h, sp), pieces = clean.slice();
  // a barline starts on the top line of a staff and ends on the bottom line of that or a lower staff
  const onLine = (v, y, k) => staves.some(st => { const x = Math.min(st.x1, Math.max(st.x0, v.x)); return v.x >= st.x0 - sp && v.x <= st.x1 + sp && Math.abs(st.lineAt(k, x) - y) <= 0.3 * sp; });
  const spansStaff = v => onLine(v, v.y0, 0) && onLine(v, v.y1, 4);
  for (const v of allVerts) if (v.len >= 3.6 * sp && v.w <= 0.8 * sp && spansStaff(v)) for (let y = v.y0; y <= v.y1; y++) for (let x = v.x0; x <= v.x1; x++) pieces[y * w + x] = 0;
  return { clean, allVerts, pieces, ...components(pieces, w, h) };
}

function readPage(P) {
  const { w, h, d: sp, t, staves } = P;
  const { clean, allVerts, label, comps } = inkPieces(P), byId = new Map(comps.map(c => [c.id, c]));
  for (const c of comps) {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    if (c.n < Math.max(4, 0.02 * sp * sp)) c.cls = 'speck';
    else if (bw > 12 * sp || bh > 12 * sp) c.cls = 'big';
    else { const r = classify(shapeFeatures(label, c, w, sp, staves)); c.cls = r.cls; c.p = r.p; }
  }
  // Symbols that touch (the flats of a key signature in a dark photo) make one piece of ink that
  // looks like nothing in particular: try cutting it upright, anywhere, into two or three parts, and
  // keep the cut whose parts are all confident symbols.
  let nextId = comps.reduce((m, c) => Math.max(m, c.id), 0) + 1;
  const tryParts = (c, xs) => {
    const parts = [];
    for (let k = 0; k + 1 < xs.length; k++) {
      const part = { id: nextId + k, x0: xs[k], x1: xs[k + 1] - 1, y0: Infinity, y1: -Infinity, n: 0 };
      for (let y = c.y0; y <= c.y1; y++) for (let x = part.x0; x <= part.x1; x++) if (label[y * w + x] === c.id) { part.n++; if (y < part.y0) part.y0 = y; if (y > part.y1) part.y1 = y; }
      if (!part.n) return null;
      parts.push(part);
    }
    for (const part of parts) for (let y = part.y0; y <= part.y1; y++) for (let x = part.x0; x <= part.x1; x++) if (label[y * w + x] === c.id) label[y * w + x] = part.id;
    let score = 1;
    for (const part of parts) { const r = classify(shapeFeatures(label, part, w, sp, staves)); part.cls = r.cls; part.p = r.p; score = Math.min(score, FIXED[r.cls] && r.cls !== 'dot' && r.cls !== 'brace' ? r.p : 0); }
    for (const part of parts) for (let y = part.y0; y <= part.y1; y++) for (let x = part.x0; x <= part.x1; x++) if (label[y * w + x] === part.id) label[y * w + x] = c.id;
    return { parts, score };
  };
  for (const c of comps.slice()) {
    const bw = c.x1 - c.x0 + 1;
    if (!(c.cls === 'note' || c.cls === 'other') || bw < 1.1 * sp || bw > 3.6 * sp || c.y1 - c.y0 + 1 > 4.6 * sp || c.y1 - c.y0 + 1 < 1.5 * sp) continue;
    let best = null; const m = Math.round(0.4 * sp);
    for (let a = c.x0 + m; a <= c.x1 - m; a++) {
      const r = tryParts(c, [c.x0, a, c.x1 + 1]); if (r && (!best || r.score > best.score)) best = r;
      if (bw >= 2.2 * sp) for (let b = a + m; b <= c.x1 - m; b += 2) { const r3 = tryParts(c, [c.x0, a, b, c.x1 + 1]); if (r3 && (!best || r3.score > best.score + 0.05)) best = r3; }
    }
    if (!best || best.score < 0.85) continue;
    for (const part of best.parts) for (let y = part.y0; y <= part.y1; y++) for (let x = part.x0; x <= part.x1; x++) if (label[y * w + x] === c.id) label[y * w + x] = part.id;
    nextId += best.parts.length; comps.push(...best.parts); for (const part of best.parts) byId.set(part.id, part);
    c.cls = 'speck'; c.n = 0;
  }
  // A time signature whose two numbers touch through the middle staff line is one piece: split it
  // at that line and read each number.
  for (const c of comps.slice()) {
    if (!/^ts\d$/.test(c.cls) || c.y1 - c.y0 + 1 < 2.6 * sp) continue;
    const cx = (c.x0 + c.x1) / 2, st = staves.find(st => cx >= st.x0 - sp && cx <= st.x1 + sp && c.y0 < st.lineAt(2, cx) && c.y1 > st.lineAt(2, cx)); if (!st) continue;
    const mid = Math.round(st.lineAt(2, cx)), parts = [];
    const band = Math.max(2, Math.round(0.15 * sp)); // the line between the numbers is left out
    for (const [a, b] of [[c.y0, mid - band], [mid + band, c.y1]]) {
      const part = { id: nextId++, x0: Infinity, x1: -Infinity, y0: a, y1: b, n: 0 };
      for (let y = a; y <= b; y++) for (let x = c.x0; x <= c.x1; x++) if (label[y * w + x] === c.id) { label[y * w + x] = part.id; part.n++; part.x0 = Math.min(part.x0, x); part.x1 = Math.max(part.x1, x); }
      if (part.n) { const r = classify(shapeFeatures(label, part, w, sp, staves)); part.cls = r.cls; part.p = r.p; part.probs = r.probs; parts.push(part); }
    }
    // the likeliest usual time signature for the two numbers
    if (parts.length === 2) {
      let best = null;
      for (const [m, prior] of Object.entries(METERS)) {
        const [a, b] = m.split('/'); if (a.length > 1) continue;
        const sc = (parts[0].probs['ts' + a] || 0) * (parts[1].probs['ts' + b] || 0) * prior;
        if (!best || sc > best.sc) best = { sc, a, b };
      }
      if (best && best.sc > 0.02) { parts[0].cls = 'ts' + best.a; parts[1].cls = 'ts' + best.b; parts[0].p = parts[1].p = 1; }
    }
    if (parts.length === 2 && parts.every(p => /^ts\d$/.test(p.cls) && p.p >= 0.5)) { comps.push(...parts); for (const p of parts) byId.set(p.id, p); c.cls = 'speck'; c.n = 0; }
    else for (const p of parts) for (let y = p.y0; y <= p.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (label[y * w + x] === p.id) label[y * w + x] = c.id;
  }
  const compNear = (x0, x1, y) => { for (let x = Math.round(x0) - 1; x <= Math.round(x1) + 1; x++) { const id = label[Math.round(y) * w + x]; if (id) return byId.get(id); } return null; };
  const musical = c => c && (c.cls === 'note' || c.cls === 'big' || c.cls === 'other' || c.cls === 'bar' || c.cls === 'curve');
  const noteish = c => c && (c.cls === 'note' || c.cls === 'big');

  // stems and barlines
  // (a stroke as tall as a staff is a barline whatever its piece looks like)
  const verts = allVerts.filter(v => musical(v.comp = compNear(v.x0, v.x1, (v.ym0 + v.ym1) / 2)) || v.len >= 3.6 * sp);
  const thin = Math.max(3, 0.3 * sp + 1), stems = verts.filter(v => v.w <= thin);
  const noStems = clean.slice();
  for (const v of stems) for (let x = v.x0; x <= v.x1; x++) for (let y = v.y0; y <= v.y1; y++) noStems[y * w + x] = 0;
  // beams touch stems
  const beams = findBeams(noStems, w, h, sp).filter(b => {
    const c = compNear((b.x0 + b.x1) / 2, (b.x0 + b.x1) / 2, (b.top((b.x0 + b.x1) / 2) + b.bot((b.x0 + b.x1) / 2)) / 2);
    if (c && !noteish(c)) return false;
    return stems.some(v => v.x1 >= b.x0 - 0.4 * sp && v.x0 <= b.x1 + 0.4 * sp && v.y0 <= b.bot(v.x) + 0.3 * sp && v.y1 >= b.top(v.x) - 0.3 * sp);
  });
  const noBeams = clean.slice();
  for (const b of beams) for (let x = b.x0; x <= b.x1; x++) for (let y = Math.floor(b.top(x)); y <= Math.ceil(b.bot(x)); y++) if (y >= 0 && y < h) noBeams[y * w + x] = 0;

  // noteheads
  const heads = [];
  for (const hd of findBlackHeads(noBeams, w, h, staves, sp)) {
    const c = compNear(hd.x, hd.x, hd.y); if (!noteish(c)) continue;
    // its edges on the row through its centre (stems taken out, so a grace note's small head shows)
    const row = Math.round(hd.y) * w, ink = i => noStems[i] && noBeams[i]; let a = Math.round(hd.x), b = a;
    while (a > hd.x - 0.9 * sp && ink(row + a - 1)) a--; while (b < hd.x + 0.9 * sp && ink(row + b + 1)) b++;
    heads.push({ ...hd, x0: a, x1: b, v: 2 });
  }
  const headW = median(heads.map(hd => hd.x1 - hd.x0 + 1)) || 1.2 * sp;
  for (const hd of heads) hd.size = Math.min(1, (hd.x1 - hd.x0 + 1) / headW);
  // A flat's bowl, filled in by a dark print, looks like a black notehead, but its stroke rises from
  // the bowl's left side (no note has a stem going up on the left): it is read as a flat.
  const flatsFound = [];
  for (const hd of heads) {
    if (hd.x1 - hd.x0 + 1 > 0.95 * headW) continue;
    const rise = stems.find(v => Math.abs(v.x - hd.x0) <= 0.35 * sp && v.y0 < hd.y - 1.2 * sp && v.y1 <= hd.y + 0.7 * sp && v.y1 >= hd.y - 0.2 * sp);
    if (!rise || stems.some(v => v !== rise && Math.abs(v.x - hd.x1) <= 0.35 * sp && v.y0 <= hd.y + 0.5 * sp && v.y1 >= hd.y - 0.5 * sp)) continue;
    hd.flat = true; flatsFound.push({ x0: Math.min(rise.x0, hd.x0), x1: hd.x1, y: hd.y, st: hd.st, step: hd.step });
  }
  for (let i = heads.length - 1; i >= 0; i--) if (heads[i].flat) heads.splice(i, 1);
  for (const hd of findOpenHeads(clean, w, h, staves, sp)) {
    const c = compNear(hd.x0, hd.x0 + 0.3 * sp, hd.y); if (!noteish(c)) continue;
    if (heads.some(o => Math.abs(o.x - hd.x) < 0.6 * sp && Math.abs(o.y - hd.y) < 0.6 * sp)) continue;
    heads.push({ ...hd, v: 1, open: true });
  }
  const stemOf = hd => stems.find(v => (Math.abs(v.x0 - hd.x1) <= 0.35 * sp || Math.abs(v.x1 - hd.x0) <= 0.35 * sp) && v.y0 <= hd.y + 0.6 * sp && v.y1 >= hd.y - 0.6 * sp && v.len >= 2.2 * sp);
  // a black head without a stem is rare; a blob far wider or narrower than a head is something else
  // (an ornament's squiggle, a dynamic letter)
  for (const hd of heads) if (!hd.open && !hd.flat) {
    const wd = hd.x1 - hd.x0 + 1;
    if ((wd > 1.4 * headW || wd < 0.6 * headW) && !stemOf(hd)) hd.drop = true;
  }
  for (const hd of heads) if (hd.open) {
    if (stemOf(hd)) continue;
    if (hd.wide >= 1.25 * sp) hd.v = 0; else hd.drop = true; // a small ring without a stem is a letter or digit
  }
  const noteHeads = heads.filter(hd => !hd.drop);

  // Key signatures printed so dark that their accidentals touch: in the stretch after a clef, a
  // piece of ink with no notehead is taken apart by its upright strokes (a flat is a stroke with a
  // bowl at its foot; a sharp is two strokes close together).
  const keyAcc = [];
  for (const cl of comps.filter(c => c.cls === 'clefG' || c.cls === 'clefF' || c.cls === 'clefC')) {
    const zone0 = cl.x1, zone1 = cl.x1 + 8 * sp;
    for (const c of comps) {
      if (!(c.cls === 'note' || c.cls === 'other') || c.x0 < zone0 || c.x0 > zone1 || c.y1 - c.y0 + 1 < 1.8 * sp || c.y1 - c.y0 + 1 > 5 * sp || c.x1 - c.x0 + 1 > 4 * sp) continue;
      if (Math.abs((c.y0 + c.y1) / 2 - (cl.y0 + cl.y1) / 2) > 4 * sp) continue;
      const vs = allVerts.filter(v => v.x >= c.x0 - 1 && v.x <= c.x1 + 1 && v.y0 >= c.y0 - 1 && v.y1 <= c.y1 + 1 && v.len >= 1.5 * sp && v.len <= 3.6 * sp && v.w <= 0.4 * sp).sort((a, b) => a.x - b.x);
      if (!vs.length) continue;
      const inkIn = (x0, x1, y0, y1) => { let n = 0, t = 0; for (let y = Math.round(y0); y <= y1; y++) for (let x = Math.round(x0); x <= x1; x++) { t++; if (label[y * w + x] === c.id) n++; } return t ? n / t : 0; };
      const pairs = [];
      for (let i = 0; i + 1 < vs.length; i++) { const a = vs[i], b = vs[i + 1], dx = b.x - a.x; if (dx >= 0.25 * sp && dx <= 0.75 * sp && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1.2 * sp) { pairs.push([a, b]); i++; } }
      if (pairs.length && pairs.length * 2 === vs.length) for (const [a, b] of pairs) keyAcc.push({ x0: a.x0 - 0.15 * sp, x1: b.x1 + 0.15 * sp, y: (a.y0 + a.y1 + b.y0 + b.y1) / 4, v: 1 });
      else if (!pairs.length && vs.every(v => inkIn(v.x1 + 0.15 * sp, v.x1 + 0.7 * sp, v.y1 - 0.8 * sp, v.y1 - 0.1 * sp) > 0.25)) for (const v of vs) {
        // the flat's pitch is the middle of its bowl, half a space above the bowl's foot
        let foot = v.y1;
        for (let y = v.y1; y <= Math.min(h - 1, v.y1 + sp); y++) for (let x = Math.round(v.x1 + 1); x <= v.x1 + 0.6 * sp; x++) if (label[y * w + x] === c.id) foot = y;
        keyAcc.push({ x0: v.x0, x1: v.x1 + 0.75 * sp, y: foot - 0.45 * sp, v: -1 });
      }
      else continue;
      c.cls = 'speck';
      // the bowls of those flats are no noteheads
      for (let i = noteHeads.length - 1; i >= 0; i--) { const hd = noteHeads[i]; if (hd.x >= c.x0 && hd.x <= c.x1 && hd.y >= c.y0 && hd.y <= c.y1) noteHeads.splice(i, 1); }
    }
  }

  // ledger lines that carry a notehead (or lie between one and its staff)
  const ledgers = findLedgers(clean, w, h, staves, t).filter(l => noteHeads.some(hd => hd.st === l.st && hd.x >= l.x0 - 0.2 * sp && hd.x <= l.x1 + 0.2 * sp &&
    (l.side < 0 ? hd.step >= 8 + 2 * l.k - 1 : hd.step <= -2 * l.k + 1)));

  // flags at the free end of stems without beams
  const flags = [];
  for (const v of stems) {
    const on = noteHeads.filter(hd => (Math.abs(v.x0 - hd.x1) <= 0.35 * sp || Math.abs(v.x1 - hd.x0) <= 0.35 * sp) && hd.y >= v.y0 - 0.6 * sp && hd.y <= v.y1 + 0.6 * sp);
    if (!on.length || on.some(hd => hd.v < 2)) continue;
    const up = Math.abs(v.y0 - Math.min(...on.map(hd => hd.y))) > Math.abs(v.y1 - Math.max(...on.map(hd => hd.y)));
    const free = up ? v.y0 : v.y1;
    if (beams.some(b => v.x1 >= b.x0 - 0.3 * sp && v.x0 <= b.x1 + 0.3 * sp && Math.abs((b.top(v.x) + b.bot(v.x)) / 2 - free) < 1.5 * sp)) continue;
    // count the hooks crossed by short vertical scans just right of the stem, near its free end
    // (stacked flags are under a staff space apart; a single flag's tail curls further down)
    const counts = [], near = Math.min(2.3 * sp, Math.max(1.2 * sp, (v.y1 - v.y0) - 1.2 * sp));
    for (const dx of [0.25, 0.4, 0.55]) {
      const x = Math.round(v.x1 + dx * sp); let n = 0, inside = false;
      const ya = Math.round(up ? free : free - near), yb = Math.round(up ? free + near : free);
      for (let y = Math.max(0, ya); y <= Math.min(h - 1, yb); y++) {
        const ink = noStems[y * w + x] && byId.get(label[y * w + x]) === v.comp && !on.some(hd => Math.abs(hd.y - y) < 0.65 * sp && x >= hd.x0 - 2 && x <= hd.x1 + 2);
        if (ink && !inside) n++; inside = ink;
      }
      counts.push(n);
    }
    counts.sort((a, b) => a - b);
    const best = counts[1];
    if (best) flags.push({ x: v.x, y: free, n: Math.min(best, 4), up });
  }

  // ---- straighten into the reader's coordinates
  const k = SP / sp;
  for (const st of staves) {
    const tops = [], sps = [];
    for (let x = st.x0; x <= st.x1; x += Math.max(1, (st.x1 - st.x0) >> 6)) { const a = st.lineAt(0, x), b = st.lineAt(4, x); tops.push(a); sps.push((b - a) / 4); }
    st.mTop = median(tops); st.mSp = median(sps);
  }
  const staffAt = (x, y) => {
    let best = null, bd = Infinity;
    for (const st of staves) {
      const cx = Math.min(st.x1, Math.max(st.x0, x)), top = st.lineAt(0, cx), bot = st.lineAt(4, cx);
      const dist = (y < top ? top - y : y > bot ? y - bot : 0) + (x < st.x0 - 3 * sp || x > st.x1 + 3 * sp ? 1e6 : 0);
      if (dist < bd) { bd = dist; best = st; }
    }
    return best;
  };
  const Y = (x, y, st = staffAt(x, y)) => {
    if (!st) return y * k;
    const cx = Math.min(st.x1, Math.max(st.x0, x)), top = st.lineAt(0, cx), s = (st.lineAt(4, cx) - top) / 4;
    return (st.mTop + (y - top) / s * st.mSp) * k;
  };
  const X = x => x * k;
  const stepPos = (st, step) => (st.mTop + (8 - step) * st.mSp / 2) * k;
  const snap = (x, y) => { const st = staffAt(x, y); if (!st) return y * k; const yy = Y(x, y, st), step = Math.round((stepPos(st, 0) - yy) / (st.mSp * k / 2)); return stepPos(st, step); };

  const glyphs = [], segs = [], polys = [], curves = [];
  for (const st of staves) for (let i = 0; i < 5; i++) segs.push({ x1: X(st.x0), y1: (st.mTop + i * st.mSp) * k, x2: X(st.x1), y2: (st.mTop + i * st.mSp) * k, w: Math.max(0.3, t * k) });
  for (const l of ledgers) { const y = stepPos(l.st, l.side < 0 ? 8 + 2 * l.k : -2 * l.k); segs.push({ x1: X(l.x0), y1: y, x2: X(l.x1), y2: y, w: Math.max(0.3, t * k) }); }
  for (const v of verts) {
    segs.push({ x1: X(v.x), y1: Y(v.x, v.y0), x2: X(v.x), y2: Y(v.x, v.y1), w: v.w * k });
    // a barline that runs on into a stem or a slur beyond its staves is also given cut at them
    if (v.len < 3.6 * sp) continue;
    const covered = staves.filter(st => { const x = Math.min(st.x1, Math.max(st.x0, v.x)); return v.x >= st.x0 - sp && v.x <= st.x1 + sp && st.lineAt(0, x) >= v.y0 - 0.3 * sp && st.lineAt(4, x) <= v.y1 + 0.3 * sp; });
    if (!covered.length) continue;
    const a = covered[0], b = covered[covered.length - 1], ya = a.lineAt(0, Math.min(a.x1, Math.max(a.x0, v.x))), yb = b.lineAt(4, Math.min(b.x1, Math.max(b.x0, v.x)));
    if (v.y0 < ya - 0.3 * sp || v.y1 > yb + 0.3 * sp) segs.push({ x1: X(v.x), y1: Y(v.x, ya, a), x2: X(v.x), y2: Y(v.x, yb, b), w: v.w * k });
  }
  for (const b of beams) polys.push({ x0: X(b.x0), x1: X(b.x1 + 1), y0: Math.min(Y(b.x0, b.top(b.x0)), Y(b.x1, b.top(b.x1))), y1: Math.max(Y(b.x0, b.bot(b.x0)), Y(b.x1, b.bot(b.x1))),
    pts: [[X(b.x0), Y(b.x0, b.top(b.x0))], [X(b.x1 + 1), Y(b.x1, b.top(b.x1))], [X(b.x1 + 1), Y(b.x1, b.bot(b.x1))], [X(b.x0), Y(b.x0, b.bot(b.x0))]] }), polys[polys.length - 1].y0 = Math.min(...polys[polys.length - 1].pts.map(p => p[1])), polys[polys.length - 1].y1 = Math.max(...polys[polys.length - 1].pts.map(p => p[1]));
  for (const hd of noteHeads) glyphs.push({ x: X(hd.x0), y: stepPos(hd.st, hd.step), w: (hd.x1 - hd.x0 + 1) * k, size: 4 * SP * (hd.size || 1), sym: { k: 'head', v: hd.v } });
  for (const a of keyAcc) glyphs.push({ x: X(a.x0), y: snap((a.x0 + a.x1) / 2, a.y), w: (a.x1 - a.x0) * k, size: 4 * SP, sym: { k: 'acc', v: a.v } });
  for (const f of flatsFound) glyphs.push({ x: X(f.x0), y: stepPos(f.st, f.step), w: (f.x1 - f.x0 + 1) * k, size: 4 * SP, sym: { k: 'acc', v: -1 } });
  for (const f of flags) glyphs.push({ x: X(f.x), y: Y(f.x, f.y), w: 0.8 * SP, size: 4 * SP, sym: { k: 'flag', v: 2 + f.n, up: f.up } });
  for (const c of comps) {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
    if (c.cls === 'curve') {
      // ends of a tie or slur: its leftmost and rightmost ink, and the bow between
      const ends = [[c.x0, 0, 0], [c.x1, 0, 0]];
      for (const e of ends) { for (let y = c.y0; y <= c.y1; y++) if (label[y * w + e[0]] === c.id) { e[1] += y; e[2]++; } e[1] /= Math.max(1, e[2]); }
      const mx = Math.round(cx); let top = Infinity, bot = -Infinity; for (let y = c.y0; y <= c.y1; y++) if (label[y * w + mx] === c.id) { top = Math.min(top, y); bot = Math.max(bot, y); }
      const pts = [[X(ends[0][0]), Y(ends[0][0], ends[0][1])], [X(mx), Y(mx, Number.isFinite(top) ? (top + bot) / 2 : cy)], [X(ends[1][0]), Y(ends[1][0], ends[1][1])]];
      curves.push({ x0: X(c.x0), x1: X(c.x1 + 1), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])), pts, fill: true, width: 0 });
      continue;
    }
    if (c.cls === 'other' && bh <= 0.4 * sp && bw >= 2 * sp) { segs.push({ x1: X(c.x0), y1: Y(cx, cy), x2: X(c.x1 + 1), y2: Y(cx, cy), w: bh * k }); continue; } // brackets and lines
    if (c.cls === 'hbar') {
      // whole rests hang from a line, half rests sit on one
      const st = staffAt(cx, cy); if (!st) continue;
      const lx = Math.min(st.x1, Math.max(st.x0, cx));
      let hang = 0, sit = 0;
      for (let i = 0; i < 5; i++) { const ly = st.lineAt(i, lx); hang = Math.max(hang, Math.abs(ly - c.y0) < 0.3 * sp ? 1 : 0); sit = Math.max(sit, Math.abs(ly - c.y1) < 0.3 * sp ? 1 : 0); }
      // (a bar that touches no line is a piece of something else, such as the cross-bar of a 4)
      if (!hang && !sit || bw < 0.7 * sp || bw > 1.8 * sp || bh > 0.75 * sp) continue;
      glyphs.push({ x: X(c.x0), y: Y(cx, cy), w: bw * k, size: 4 * SP, sym: { k: 'rest', v: sit && !hang ? 1 : 0 } });
      continue;
    }
    const sym = FIXED[c.cls]; if (!sym) continue;
    // a tuplet number sits over or under its notes (a measure number at the start of a line does not)
    if (sym.k === 'tup' && !noteHeads.some(hd => Math.abs(hd.x - cx) < 2.5 * sp && Math.abs(hd.y - cy) < 6 * sp && hd.x < cx + 2.5 * sp && noteHeads.some(o => o.st === hd.st && o.x < cx - 0.5 * sp))) continue;
    let y;
    if (sym.k === 'clef') {
      // the line the clef names: G clef curls round its line a third of the way up, F clef's dots
      // straddle its line, C clef is centred on it
      const anchor = sym.v === 'G' ? c.y1 - 0.375 * bh : sym.v === 'F' ? c.y0 + 0.3 * bh : cy;
      const st = staffAt(cx, anchor); if (!st) continue;
      const step = 2 * Math.round(Math.round((stepPos(st, 0) - Y(cx, anchor, st)) / (st.mSp * k / 2)) / 2);
      y = stepPos(st, step);
    } else if (sym.k === 'acc') y = snap(cx, sym.v === -1 || sym.v === -2 ? c.y1 - 0.62 * sp : cy);
    else if (sym.k === 'brace') { glyphs.push({ x: X(c.x0), y: Y(cx, c.y1), w: bw * k, size: bh * k, sym }); continue; }
    else y = Y(cx, cy);
    glyphs.push({ x: X(c.x0), y, w: bw * k, size: 4 * SP, sym });
  }
  keySignatures(glyphs, staves.map(st => ({ top: st.mTop * k, sp: st.mSp * k, x0: X(st.x0) })));
  return { width: w * k, height: h * k, glyphs, segs, polys, curves, texts: [], images: 0, scan: true, debug: { clean, heads: noteHeads, stems, beams, flags, comps, label } };
}

// Key signatures, staff by staff, should agree: an accidental of the signature lost on one staff (or
// read twice) is put right from the signature most staves of the same clef show.
function keySignatures(glyphs, staves) {
  const runs = [];
  for (const cl of glyphs.filter(g => g.sym.k === 'clef')) {
    const st = staves.find(s => cl.y >= s.top - 0.5 * s.sp && cl.y <= s.top + 4.5 * s.sp); if (!st || cl.x > st.x0 + 6 * st.sp) continue;
    const firstHead = Math.min(Infinity, ...glyphs.filter(g => g.sym.k === 'head' && g.x > cl.x && g.y > st.top - 3 * st.sp && g.y < st.top + 7 * st.sp).map(g => g.x));
    let acc = glyphs.filter(g => g.sym.k === 'acc' && g.x > cl.x + 0.5 * cl.w && g.x < Math.min(firstHead, cl.x + cl.w + 9 * st.sp) && g.y > st.top - 2 * st.sp && g.y < st.top + 6 * st.sp).sort((a, b) => a.x - b.x);
    // the same accidental read twice
    // (two signs of a signature never share a column)
    acc = acc.filter((a, i) => { const dup = acc.findIndex(b => Math.abs(b.x - a.x) < 0.4 * st.sp && Math.abs(b.y - a.y) < 1.2 * st.sp); if (dup !== i) { glyphs.splice(glyphs.indexOf(a), 1); return false; } return true; });
    // stop at a gap (the run ends where the signature ends)
    const run = []; for (const a of acc) { if (run.length && a.x - run[run.length - 1].x > 2 * st.sp) break; run.push(a); }
    // a run mixing signs is a misreading: it takes part only as a staff to be put right
    const mixed = run.some(a => Math.sign(a.sym.v) !== Math.sign(run[0].sym.v) || Math.abs(a.sym.v) !== 1);
    runs.push({ cl, st, run, n: mixed ? NaN : run.length * Math.sign(run[0]?.sym.v || 0), steps: run.map(a => Math.round((st.top + 4 * st.sp - a.y) / (st.sp / 2))) });
  }
  // the page's key: the signature most staves show (staves of both clefs vote)
  const count = new Map(); for (const r of runs) if (!Number.isNaN(r.n) && r.cl.sym.v !== 'C') count.set(r.n, (count.get(r.n) || 0) + 1);
  const ranked = [...count].sort((a, b) => b[1] - a[1] || Math.abs(b[0]) - Math.abs(a[0]));
  if (!ranked.length || ranked[0][1] < 2 || (ranked[1] && ranked[1][1] === ranked[0][1])) return;
  const key = ranked[0][0], sym = { k: 'acc', v: Math.sign(key) };
  // where each sign of a signature is printed, in half spaces above the bottom line
  const STEPS = { G: { '1': [8, 5, 9, 6, 3, 7, 4], '-1': [4, 7, 3, 6, 2, 5, 1] }, F: { '1': [6, 3, 7, 4, 1, 5, 2], '-1': [2, 5, 1, 4, 0, 3, -1] } };
  for (const r of runs) {
    if (r.cl.sym.v === 'C') continue;
    const want = key ? STEPS[r.cl.sym.v][String(Math.sign(key))].slice(0, Math.abs(key)) : [];
    if (r.n === key && r.steps.every((s, i) => s === want[i])) continue;
    for (const a of r.run) glyphs.splice(glyphs.indexOf(a), 1);
    const step = r.run.length > 1 ? (r.run[r.run.length - 1].x - r.run[0].x) / (r.run.length - 1) : 1.1 * r.st.sp;
    const x0 = r.run.length ? r.run[0].x : r.cl.x + r.cl.w + 0.5 * r.st.sp, wd = r.run[0]?.w || r.st.sp;
    want.forEach((s, i) => glyphs.push({ x: x0 + i * step, y: r.st.top + 4 * r.st.sp - s * r.st.sp / 2, w: wd, size: 4 * SP, sym }));
  }
}

// ---------------------------------------------------------------------------------------------
// 11 · Entry point: pictures (PNG, JPEG, WebP, one per page) or a PDF of scanned pages.
// ---------------------------------------------------------------------------------------------
const MAX_FILE = 25_000_000, DECODE_PIXELS = 20e6;
const pause = () => new Promise(r => setTimeout(r, 0)); // let the page repaint between steps

// Grey levels of a picture file, drawn no larger than DECODE_PIXELS (phone photos are 12–50 MP).
async function picturePixels(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    try { await img.decode(); } catch { throw Object.assign(new Error(`“${file.name}” could not be opened as a picture. Choose a PNG or JPEG (on an iPhone, share the photo as JPEG).`), { known: true }); }
    const f = Math.min(1, Math.sqrt(DECODE_PIXELS / (img.naturalWidth * img.naturalHeight))), w = Math.max(1, Math.round(img.naturalWidth * f)), h = Math.max(1, Math.round(img.naturalHeight * f));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    const g = toGray(ctx.getImageData(0, 0, w, h).data, w, h); canvas.width = canvas.height = 0;
    return { g, w, h };
  } finally { URL.revokeObjectURL(url); }
}

// Grey levels of each page of a scanned PDF, rendered at about 300 dots per inch.
async function* pdfPixels(data, pdfjs, onPage) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, verbosity: 0 }).promise;
  try {
    if (doc.numPages > MAX_PAGES) throw Object.assign(new Error(`This PDF has ${doc.numPages} pages; the reader takes up to ${MAX_PAGES} pictures of music at a time.`), { known: true });
    for (let i = 1; i <= doc.numPages; i++) {
      onPage(i, doc.numPages);
      const page = await doc.getPage(i), base = page.getViewport({ scale: 1 });
      const scale = Math.min(300 / 72, Math.sqrt(DECODE_PIXELS / (base.width * base.height))), vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas'); canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const g = toGray(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      const out = { g, w: canvas.width, h: canvas.height }; canvas.width = canvas.height = 0; page.cleanup();
      yield out;
    }
  } finally { doc.destroy?.(); }
}

// Read one page of pixels into drawing primitives (null if no staves are found on it).
function readPixels({ g, w, h }) {
  const P = preparePage(g, w, h);
  if (!P || !P.staves.length) return null;
  const page = readPage(P); delete page.debug;
  return page;
}

// input: { files: [File…] } pictures in page order, or { pdf: ArrayBuffer } a scanned PDF;
// or { pixels: [{g, w, h}…] } grey levels already decoded (tests).
async function convert(input, options = {}) {
  const R = window.PianoPdfReader, progress = options.onProgress || (() => {});
  if (!R) throw new Error('The music reader is missing.');
  const pages = []; let seen = 0;
  const take = async px => { seen++; await pause(); const p = readPixels(px); if (p) pages.push(p); await pause(); };
  if (input.pixels) for (const px of input.pixels) { progress(seen + 1, input.pixels.length); await take(px); }
  else if (input.pdf) {
    const pdfjs = options.pdfjs || await R.loadPdfjs();
    for await (const px of pdfPixels(input.pdf, pdfjs, (i, n) => progress(i, n))) await take(px);
  } else {
    const files = input.files || [];
    if (files.length > MAX_PAGES) throw new Error(`Choose up to ${MAX_PAGES} pictures at a time.`);
    for (const [i, f] of files.entries()) {
      if (f.size > MAX_FILE) throw new Error(`“${f.name}” is larger than 25 MB. Choose a smaller picture.`);
      progress(i + 1, files.length); await take(await picturePixels(f));
    }
  }
  if (!pages.length) {
    const e = new Error(seen > 1 ? 'No staves of music were found in these pictures. Take each photo straight on, in good light, with the whole page sharp and filling the frame.' :
      'No staves of music were found in this picture. Take the photo straight on, in good light, with the whole page sharp and filling the frame.');
    e.code = 'none'; throw e;
  }
  const score = R.recognize(pages);
  if (!score || !score.measures.length) { const e = new Error('Staves were found, but no notes could be read from them. Try a sharper, straighter picture.'); e.code = 'none'; throw e; }
  score.report.warn(null, 'Read from a picture: compare every line with your sheet. Notes, rhythms and accidentals can be misread; fix them here or in a notation editor.');
  const xml = R.toMusicXML(score, { title: options.title || null, warn: t => score.report.warn(null, t) });
  const notes = score.measures.reduce((n, m) => n + m.voices.reduce((k, v) => k + v.evs.filter(e => e.kind === 'chord').reduce((s, e) => s + e.heads.length, 0), 0), 0);
  const result = score.report.result(), shift = score.measures[0]?.pickup ? 1 : 0;
  result.flagged = result.flagged.map(f => ({ ...f, measure: f.measure - shift }));
  return { xml, title: options.title || null, composer: null, pages: seen, systems: score.systems, measures: score.measures.length, staves: score.staves, notes, scanned: true, ...result };
}

window.PianoScanReader = { toGray, resize, rotate, darkness, binarize, runLengths, lineSpacing, skewAngle, findStaffLines, removeStaffLines, preparePage, components, findLedgers, findVerticals, findBeams, findBlackHeads, findOpenHeads, stepY, integral, shapeFeatures, classify, inkPieces, readPage, readPixels, convert };
})();
// @@model (written by scripts/scan-reader/train.py; do not edit by hand)
window.PianoScanModel = {"classes":["other","note","dot","curve","brace","clefG","clefF","clefC","sharp","flat","natural","dsharp","dflat","hbar","rest4","rest8","rest16","rest32","ts1","ts2","ts3","ts4","ts5","ts6","ts7","ts8","ts9","tsC","tsCut","tup3","tup5","tup6"],"D":153,"H":96,"W1":{"scale":0.0201685,"data":"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"},"b1":[-0.4847,-0.3343,-0.8306,-0.1315,0.6985,-0.1118,0.0467,0.2193,0.4845,-0.4144,1.2238,-0.6293,0.2701,0.0659,0.2307,-0.0079,-0.1193,0.4038,1.0585,0.6755,0.0677,0.2545,0.0585,-0.2312,-0.3473,-0.3611,0.3058,0.1685,-0.8392,-0.1076,-0.4863,-0.3042,-0.1661,0.7313,0.9574,-0.0646,-0.038,0.5633,0.6806,0.0285,-0.085,0.2732,0.2628,0.1651,-0.0972,-0.2651,0.4409,0.3235,-0.1705,0.5937,-0.3017,0.6947,0.9409,0.0887,-0.372,-0.1564,-0.2835,-0.1174,-0.6534,2.0079,0.102,0.0999,0.858,0.2689,-0.2212,-0.0666,-0.0182,-0.5054,-0.1348,-0.8051,0.13,0.323,-0.2553,-0.1386,0.7467,-0.685,0.5666,0.5485,-0.5235,-0.1839,0.7046,0.719,-0.2299,-0.1464,0.3256,0.1183,0.0294,0.0472,0.7923,-0.0476,0.1219,-0.6796,-0.2249,-0.0449,-0.0675,0.3104],"W2":{"scale":0.0183748,"data":"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"},"b2":[0.2286,-0.7427,-0.072,0.4359,-0.7616,0.3917,-0.4557,0.2735,0.4992,-0.3426,0.0929,-0.5572,1.2645,-0.0606,-0.5001,-0.2819,0.6243,-0.052,-1.1016,0.411,-0.1627,0.2647,-0.1032,0.0629,-0.3315,0.1284,-0.2459,-0.2716,0.1819,0.4074,-0.4961,-0.702]};
