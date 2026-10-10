'use strict';
// Reads a PDF exported from notation software (MuseScore, LilyPond, Dorico, Finale, Sibelius with a
// SMuFL font, …) and writes the piano music in it as MusicXML, entirely in this browser.
// It does not look at pixels: such PDFs keep every staff line, stem and beam as a vector line and
// every notehead, clef, accidental and rest as a character of the music font, so the reader reads
// those symbols directly and rebuilds the score from their positions (pdf.js does the PDF parsing).
// Scanned pages and photos contain only pictures; piano-scan-reader.js reads those and hands its
// findings to the same recognition below.
// The MusicXML then goes through the same checks, engraving and correction as an imported file.
(() => {
const PDFJS_VERSION = '6.4.299';
const PDFJS = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.min.mjs`; // legacy build: Safari and older browsers
const PDFJS_WORKER = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/legacy/build/pdf.worker.min.mjs`;
const MAX_PAGES = 40, MAX_BYTES = 15_000_000;

// ---------------------------------------------------------------------------------------------
// 1 · Music symbols. Glyphs are named by SMuFL codepoint (MuseScore, Dorico, Finale 27+, Verovio,
// Sibelius with Bravura/Petaluma…) or by the glyph names in the embedded font (LilyPond's
// Emmentaler, SMuFL fonts subset with their own names).
// ---------------------------------------------------------------------------------------------
const SYM = {};
const def = (cp, k, v, extra) => { SYM[cp] = Object.assign({ k, v }, extra); };
def(0xE0A0, 'head', -1); def(0xE0A1, 'head', -1); def(0xE0A2, 'head', 0); def(0xE0A3, 'head', 1); def(0xE0A4, 'head', 2);
def(0xE050, 'clef', 'G'); def(0xE07A, 'clef', 'G', { change: true }); def(0xE052, 'clef', 'G', { octave: -1 }); def(0xE053, 'clef', 'G', { octave: 1 });
def(0xE051, 'clef', 'G', { octave: -2 }); def(0xE054, 'clef', 'G', { octave: 2 }); def(0xE055, 'clef', 'G', { octave: -1 }); def(0xE057, 'clef', 'G', { octave: -1 });
def(0xE062, 'clef', 'F'); def(0xE07C, 'clef', 'F', { change: true }); def(0xE064, 'clef', 'F', { octave: -1 }); def(0xE065, 'clef', 'F', { octave: 1 });
def(0xE063, 'clef', 'F', { octave: -2 }); def(0xE066, 'clef', 'F', { octave: 2 });
def(0xE05C, 'clef', 'C'); def(0xE07B, 'clef', 'C', { change: true }); def(0xE05D, 'clef', 'C', { octave: -1 });
def(0xE262, 'acc', 1); def(0xE260, 'acc', -1); def(0xE261, 'acc', 0); def(0xE263, 'acc', 2); def(0xE264, 'acc', -2);
def(0xE1E7, 'dot');
def(0xE4E2, 'rest', -1); def(0xE4E3, 'rest', 0); def(0xE4E4, 'rest', 1); def(0xE4E5, 'rest', 2);
for (let n = 0; n < 7; n++) def(0xE4E6 + n, 'rest', 3 + n);
def(0xE4F4, 'rest', 0); def(0xE4F5, 'rest', 1); def(0xE4F3, 'rest', -1);
def(0xE4EE, 'hbar'); def(0xE4EF, 'hbar'); def(0xE4F0, 'hbar'); def(0xE4F1, 'hbar');
for (let n = 0; n < 8; n++) { def(0xE240 + 2 * n, 'flag', 3 + n, { up: true }); def(0xE241 + 2 * n, 'flag', 3 + n, { up: false }); }
def(0xE560, 'graceSlash', 0, { up: true }); def(0xE561, 'graceSlash', 0, { up: false }); def(0xE564, 'graceSlash', 0, { up: true }); def(0xE565, 'graceSlash', 0, { up: false });
for (let n = 0; n < 10; n++) { def(0xE080 + n, 'tsig', n); def(0xE880 + n, 'tup', n); }
def(0xE08A, 'tsig', 'C'); def(0xE08B, 'tsig', 'cut');
for (let n = 0; n < 6; n++) def(0xED10 + n, 'finger', n);
def(0xE043, 'rdots'); def(0xE044, 'rdot');
def(0xE510, 'ottava', 8, { plain: true }); def(0xE511, 'ottava', 8); def(0xE512, 'ottava', -8); def(0xE513, 'ottava', -8); def(0xE51C, 'ottava', -8); def(0xE51F, 'ottava', -8);
def(0xE514, 'ottava', 15, { plain: true }); def(0xE515, 'ottava', 15); def(0xE516, 'ottava', -15); def(0xE51D, 'ottava', -15);
def(0xE000, 'brace'); def(0xE047, 'segno'); def(0xE048, 'coda');
for (const cp of [0xE566, 0xE567, 0xE568, 0xE56C, 0xE56D, 0xE56E, 0xE56F, 0xE5BB, 0xE5BD, 0xE220, 0xE221, 0xE222, 0xE223, 0xE224]) def(cp, 'ornament');

// LilyPond (Emmentaler/feta) glyph names.
const LILY = {
  'noteheads.sM1': ['head', -1], 'noteheads.sM1double': ['head', -1], 'noteheads.s0': ['head', 0], 'noteheads.s1': ['head', 1], 'noteheads.s2': ['head', 2],
  'clefs.G': ['clef', 'G'], 'clefs.G_change': ['clef', 'G', { change: true }], 'clefs.F': ['clef', 'F'], 'clefs.F_change': ['clef', 'F', { change: true }],
  'clefs.C': ['clef', 'C'], 'clefs.C_change': ['clef', 'C', { change: true }],
  'accidentals.sharp': ['acc', 1], 'accidentals.flat': ['acc', -1], 'accidentals.natural': ['acc', 0], 'accidentals.doublesharp': ['acc', 2], 'accidentals.flatflat': ['acc', -2],
  'dots.dot': ['dot'], 'timesig.C44': ['tsig', 'C'], 'timesig.C22': ['tsig', 'cut'], 'flags.ugrace': ['graceSlash', 0, { up: true }], 'flags.dgrace': ['graceSlash', 0, { up: false }],
  'rests.M1': ['rest', -1], 'rests.M1o': ['rest', -1], 'rests.0': ['rest', 0], 'rests.0o': ['rest', 0], 'rests.1': ['rest', 1], 'rests.1o': ['rest', 1], 'rests.2': ['rest', 2], 'rests.2classical': ['rest', 2],
};
for (const o of ['trill', 'mordent', 'prall', 'prallprall', 'prallmordent', 'upprall', 'downprall', 'turn', 'reverseturn']) LILY['scripts.' + o] = ['ornament'];
for (let n = 3; n <= 9; n++) { LILY['rests.' + n] = ['rest', n]; LILY['flags.u' + n] = ['flag', n, { up: true }]; LILY['flags.d' + n] = ['flag', n, { up: false }]; }
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
// A few SMuFL fonts are subset with SMuFL glyph names instead of codepoints.
const SMUFL_NAMES = { noteheadBlack: 0xE0A4, noteheadHalf: 0xE0A3, noteheadWhole: 0xE0A2, noteheadDoubleWhole: 0xE0A0, gClef: 0xE050, fClef: 0xE062, cClef: 0xE05C,
  gClefChange: 0xE07A, fClefChange: 0xE07C, cClefChange: 0xE07B, gClef8vb: 0xE052, accidentalSharp: 0xE262, accidentalFlat: 0xE260, accidentalNatural: 0xE261,
  accidentalDoubleSharp: 0xE263, accidentalDoubleFlat: 0xE264, augmentationDot: 0xE1E7, restWhole: 0xE4E3, restHalf: 0xE4E4, restQuarter: 0xE4E5, rest8th: 0xE4E6,
  rest16th: 0xE4E7, rest32nd: 0xE4E8, rest64th: 0xE4E9, flag8thUp: 0xE240, flag8thDown: 0xE241, flag16thUp: 0xE242, flag16thDown: 0xE243, flag32ndUp: 0xE244,
  flag32ndDown: 0xE245, flag64thUp: 0xE246, flag64thDown: 0xE247, timeSigCommon: 0xE08A, timeSigCutCommon: 0xE08B, repeatDots: 0xE043, ottavaAlta: 0xE511, ottava: 0xE510 };
for (let n = 0; n < 10; n++) { SMUFL_NAMES['timeSig' + n] = 0xE080 + n; SMUFL_NAMES['tuplet' + n] = 0xE880 + n; }

function symbolFromName(name, fontName) {
  if (!name) return null;
  if (LILY[name]) { const [k, v, extra] = LILY[name]; return Object.assign({ k, v }, extra); }
  const uni = /^uni([0-9A-Fa-f]{4,5})$/.exec(name) || /^u([0-9A-Fa-f]{5})$/.exec(name);
  if (uni && SYM[parseInt(uni[1], 16)]) return SYM[parseInt(uni[1], 16)];
  if (SMUFL_NAMES[name]) return SYM[SMUFL_NAMES[name]];
  const d = DIGITS.indexOf(name.replace(/^fattened\./, ''));
  // Digits drawn with the music font itself (LilyPond's time signatures, tuplets and fingering).
  if (d >= 0 && /emmentaler|feta|lilyjazz|gonville/i.test(fontName || '')) return { k: 'digit', v: d };
  return null;
}
function symbolFromUnicode(text) {
  if (!text) return null;
  const cp = text.codePointAt(0);
  return text.length <= 2 && SYM[cp] ? SYM[cp] : null;
}

// ---------------------------------------------------------------------------------------------
// 2 · Glyph names from the embedded font. pdf.js re-maps characters of subset fonts to private
// codepoints; its converted font keeps the cmap and the CFF charset (or TrueType post names), so
// fontChar → glyph id → glyph name recovers the engraver's own glyph names.
// ---------------------------------------------------------------------------------------------
function sfntGlyphNames(bytes) {
  if (!bytes || bytes.length < 12) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u16 = o => v.getUint16(o), u32 = o => v.getUint32(o);
  const tables = {}, count = u16(4);
  for (let i = 0; i < count; i++) { const o = 12 + 16 * i; if (o + 16 > bytes.length) return null; tables[String.fromCharCode(...bytes.subarray(o, o + 4))] = { off: u32(o + 8), len: u32(o + 12) }; }
  const cmap = new Map();
  if (tables.cmap) {
    const base = tables.cmap.off, n = u16(base + 2);
    for (let i = 0; i < n; i++) {
      const sub = base + u32(base + 8 * i + 8), fmt = u16(sub);
      if (fmt === 4) {
        const segs = u16(sub + 6) / 2, ends = sub + 14, starts = ends + 2 * segs + 2, deltas = starts + 2 * segs, ranges = deltas + 2 * segs;
        for (let s = 0; s < segs; s++) {
          const end = u16(ends + 2 * s), start = u16(starts + 2 * s), delta = v.getInt16(deltas + 2 * s), ro = u16(ranges + 2 * s);
          if (start === 0xFFFF) continue;
          for (let c = start; c <= end && c - start < 4096; c++) {
            let g;
            if (!ro) g = (c + delta) & 0xFFFF; else { const at = ranges + 2 * s + ro + 2 * (c - start); g = at + 1 < bytes.length ? u16(at) : 0; if (g) g = (g + delta) & 0xFFFF; }
            if (g && !cmap.has(c)) cmap.set(c, g);
          }
        }
      } else if (fmt === 12) {
        const groups = u32(sub + 12);
        for (let gi = 0; gi < groups && gi < 4096; gi++) { const o = sub + 16 + 12 * gi, a = u32(o), b = u32(o + 4), g = u32(o + 8); for (let c = a; c <= b && c - a < 4096; c++) if (!cmap.has(c)) cmap.set(c, g + c - a); }
      } else if (fmt === 0) { for (let c = 0; c < 256; c++) { const g = bytes[sub + 6 + c]; if (g && !cmap.has(c)) cmap.set(c, g); } }
    }
  }
  let names = null;
  if (tables['CFF ']) names = cffCharset(bytes, tables['CFF '].off);
  else if (tables.post && u32(tables.post.off) === 0x00020000) {
    const p = tables.post.off, n = u16(p + 32), idx = []; let o = p + 34;
    for (let i = 0; i < n; i++, o += 2) idx.push(u16(o));
    const extra = []; while (o < p + tables.post.len) { const l = bytes[o]; extra.push(String.fromCharCode(...bytes.subarray(o + 1, o + 1 + l))); o += 1 + l; }
    names = idx.map(i => i >= 258 ? extra[i - 258] : (i >= 17 && i <= 26 ? DIGITS[i - 17] : null));
  }
  return names ? { cmap, names } : null;
}
function cffIndex(b, o) {
  const count = (b[o] << 8) | b[o + 1]; if (!count) return { items: [], end: o + 2 };
  const size = b[o + 2], offs = [], at = o + 3;
  for (let i = 0; i <= count; i++) { let x = 0; for (let k = 0; k < size; k++) x = x * 256 + b[at + i * size + k]; offs.push(x); }
  const data = at + (count + 1) * size - 1;
  return { items: offs.slice(0, -1).map((s, i) => [data + s, data + offs[i + 1]]), end: data + offs[count] };
}
function cffDict(b, start, end) {
  const out = {}; let ops = [], i = start;
  while (i < end) {
    const c = b[i];
    if (c <= 21) { let op = c; i++; if (c === 12) op = 1200 + b[i++]; out[op] = ops; ops = []; }
    else if (c === 28) { ops.push((b[i + 1] << 8 | b[i + 2]) << 16 >> 16); i += 3; }
    else if (c === 29) { ops.push((b[i + 1] << 24) | (b[i + 2] << 16) | (b[i + 3] << 8) | b[i + 4]); i += 5; }
    else if (c === 30) { i++; while (i < end) { const x = b[i++]; if ((x & 15) === 15 || (x >> 4) === 15) break; } ops.push(0); }
    else if (c >= 32 && c <= 246) { ops.push(c - 139); i++; }
    else if (c >= 247 && c <= 250) { ops.push((c - 247) * 256 + b[i + 1] + 108); i += 2; }
    else if (c >= 251 && c <= 254) { ops.push(-(c - 251) * 256 - b[i + 1] - 108); i += 2; }
    else i++;
  }
  return out;
}
function cffCharset(b, base) {
  try {
    const nameIdx = cffIndex(b, base + b[base + 2]), top = cffIndex(b, nameIdx.end), strings = cffIndex(b, top.end);
    if (!top.items.length) return null;
    const dict = cffDict(b, top.items[0][0], top.items[0][1]);
    if (dict[1230]) return null; // CID-keyed: no glyph names
    const charStrings = dict[17] && cffIndex(b, base + dict[17][0]), n = charStrings ? charStrings.items.length : 0, cs = dict[15] ? dict[15][0] : 0;
    if (!n || cs <= 2) return null;
    const sid = s => s >= 391 ? (strings.items[s - 391] ? String.fromCharCode(...b.subarray(strings.items[s - 391][0], strings.items[s - 391][1])) : null) : (s >= 17 && s <= 26 ? DIGITS[s - 17] : null);
    const sids = [0]; let o = base + cs; const fmt = b[o++];
    while (sids.length < n) {
      if (fmt === 0) { sids.push((b[o] << 8) | b[o + 1]); o += 2; }
      else { const first = (b[o] << 8) | b[o + 1], left = fmt === 1 ? b[o + 2] : (b[o + 2] << 8) | b[o + 3]; o += fmt === 1 ? 3 : 4; for (let k = 0; k <= left && sids.length < n; k++) sids.push(first + k); }
    }
    // pdf.js prepends its own .notdef glyph to some converted fonts but keeps the original charset
    // after a second .notdef entry, so names then belong one glyph earlier.
    if (sids[1] === 0) sids.splice(1, 1);
    return sids.map(sid);
  } catch { return null; }
}

// ---------------------------------------------------------------------------------------------
// 3 · Drawing primitives of one page, in points with y growing downwards: glyphs of music fonts,
// straight line segments (stroked lines or thin filled rectangles), filled polygons (beams) and
// curves (ties and slurs).
// ---------------------------------------------------------------------------------------------
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

async function extractPage(page, OPS, fontCache) {
  const viewport = page.getViewport({ scale: 1 }), ops = await page.getOperatorList();
  const glyphs = [], segs = [], polys = [], curves = [], texts = [];
  let ctm = viewport.transform.slice(), lw = 1, stack = [];
  let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0], font = null, fontSize = 0, cs = 0, ws = 0, th = 1, rise = 0, leading = 0;
  const fontInfo = name => {
    if (fontCache.has(name)) return fontCache.get(name);
    let fo = null; try { fo = page.commonObjs.get(name); } catch {}
    const info = { name: (fo?.name || '').replace(/^[A-Z]{6}\+/, ''), matrix: fo?.fontMatrix || [0.001, 0, 0, 0.001, 0, 0], names: null, type3: !!fo?.isType3Font };
    try { info.names = fo?.data ? sfntGlyphNames(fo.data) : null; } catch {}
    info.music = /bravura|leland|petaluma|emmentaler|feta|gonville|musejazz|finale ?maestro|finale ?jazz|finale ?broadway|sebastian|leipzig|november|ekmelos|lilyjazz|opus|maestro|academico|bravura|smufl|lassus/i.test(info.name);
    fontCache.set(name, info); return info;
  };
  const showText = items => {
    const f = font && fontInfo(font); if (!f) return;
    for (const g of items) {
      if (typeof g === 'number') { tm = mul([1, 0, 0, 1, -g / 1000 * fontSize * th, 0], tm); continue; }
      if (!g) continue;
      const trm = mul(mul([fontSize * th, 0, 0, fontSize, 0, rise], tm), ctm);
      const [x, y] = apply(trm, 0, 0), size = Math.hypot(trm[2], trm[3]);
      const adv = g.width * (f.type3 ? f.matrix[0] : 0.001) * fontSize, wPage = Math.abs(adv * th * Math.hypot(...mul(tm, ctm).slice(0, 2)));
      let sym = symbolFromUnicode(g.unicode);
      if (!sym && f.names && g.fontChar) { const gid = f.names.cmap.get(g.fontChar.codePointAt(0)); sym = symbolFromName(gid != null ? f.names.names[gid] : null, f.name); }
      if (!sym && f.names && g.originalCharCode != null && !f.names.cmap.size) sym = null;
      if (!sym && /brace/i.test(f.name)) sym = { k: 'brace' };
      if (sym) glyphs.push({ x, y, size, w: wPage, sym, font: f.name });
      else if (g.unicode && g.unicode.trim() && !/[\u0000-\u001f\u007f-\u009f\ue000-\uf8ff\ufffd]/.test(g.unicode)) texts.push({ x, y, size, w: wPage, ch: g.unicode, font: f.name, music: f.music });
      tm = mul([1, 0, 0, 1, (adv + cs + (g.isSpace ? ws : 0)) * th, 0], tm);
    }
  };
  const path = (paint, data) => {
    const stroke = [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint);
    const fill = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint);
    if (!stroke && !fill) return;
    const width = lw * Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])) || 0.1;
    const subs = []; let cur = null;
    for (let i = 0; i < data.length;) {
      const op = data[i];
      if (op === 0) { cur = { pts: [apply(ctm, data[i + 1], data[i + 2])], curved: false, closed: false }; subs.push(cur); i += 3; }
      else if (op === 1) { cur?.pts.push(apply(ctm, data[i + 1], data[i + 2])); i += 3; }
      else if (op === 2) { if (cur) { cur.curved = true; cur.pts.push(apply(ctm, data[i + 1], data[i + 2]), apply(ctm, data[i + 3], data[i + 4]), apply(ctm, data[i + 5], data[i + 6])); } i += 7; }
      else if (op === 3) { if (cur) { cur.curved = true; cur.pts.push(apply(ctm, data[i + 1], data[i + 2]), apply(ctm, data[i + 3], data[i + 4])); } i += 5; }
      else if (op === 4) { if (cur) cur.closed = true; i += 1; }
      else break;
    }
    const curvedFill = fill && subs.some(s => s.curved);
    for (const s of subs) {
      if (s.pts.length < 2) continue;
      const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      for (const [px, py] of s.pts) { if (px < box.x0) box.x0 = px; if (px > box.x1) box.x1 = px; if (py < box.y0) box.y0 = py; if (py > box.y1) box.y1 = py; }
      if (s.curved || curvedFill) { curves.push({ ...box, pts: s.pts, fill, width }); continue; }
      if (fill) {
        // Thin filled rectangles are lines; other filled polygons (beams) are kept as polygons.
        const w = box.x1 - box.x0, h = box.y1 - box.y0, axis = s.pts.length <= 5 && s.pts.every(p => (Math.abs(p[0] - box.x0) < 0.01 || Math.abs(p[0] - box.x1) < 0.01) && (Math.abs(p[1] - box.y0) < 0.01 || Math.abs(p[1] - box.y1) < 0.01));
        if (axis && h <= w && h < 3.2) segs.push({ x1: box.x0, y1: (box.y0 + box.y1) / 2, x2: box.x1, y2: (box.y0 + box.y1) / 2, w: h, rect: true });
        else if (axis && w < h && w < 3.2) segs.push({ x1: (box.x0 + box.x1) / 2, y1: box.y0, x2: (box.x0 + box.x1) / 2, y2: box.y1, w, rect: true });
        else polys.push({ ...box, pts: s.pts });
      }
      if (stroke) {
        const pts = s.closed ? [...s.pts, s.pts[0]] : s.pts;
        if (pts.length === 5 && s.closed && fill) continue;
        for (let k = 1; k < pts.length; k++) segs.push({ x1: pts[k - 1][0], y1: pts[k - 1][1], x2: pts[k][0], y2: pts[k][1], w: width });
      }
    }
  };
  const { fnArray, argsArray } = ops;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], a = argsArray[i];
    switch (fn) {
      case OPS.save: stack.push([ctm, lw]); break;
      case OPS.restore: if (stack.length) [ctm, lw] = stack.pop(); break;
      case OPS.transform: ctm = mul(a, ctm); break;
      case OPS.paintFormXObjectBegin: stack.push([ctm, lw]); if (a?.[0]) ctm = mul(a[0], ctm); break;
      case OPS.paintFormXObjectEnd: if (stack.length) [ctm, lw] = stack.pop(); break;
      case OPS.setLineWidth: lw = a[0]; break;
      case OPS.constructPath: { const data = Array.isArray(a[1]) ? a[1][0] : a[1]; if (data && data.length) path(a[0], data); break; }
      case OPS.beginText: tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case OPS.setFont: font = a[0]; fontSize = a[1]; break;
      case OPS.setTextMatrix: tm = (Array.isArray(a[0]) || ArrayBuffer.isView(a[0])) ? Array.from(a[0]) : Array.from(a); tlm = tm; break;
      case OPS.moveText: tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
      case OPS.setLeadingMoveText: leading = -a[1]; tlm = mul([1, 0, 0, 1, a[0], a[1]], tlm); tm = tlm; break;
      case OPS.nextLine: tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case OPS.setLeading: leading = a[0]; break;
      case OPS.setCharSpacing: cs = a[0]; break;
      case OPS.setWordSpacing: ws = a[0]; break;
      case OPS.setHScale: th = a[0] / 100; break;
      case OPS.setTextRise: rise = a[0]; break;
      case OPS.showText: case OPS.showSpacedText: showText(a[0]); break;
      case OPS.nextLineShowText: tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; showText(a[0]); break;
      case OPS.nextLineSetSpacingShowText: ws = a[0]; cs = a[1]; tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; showText(a[2]); break;
      default: break;
    }
  }
  const images = fnArray.filter(f => f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject).length;
  return { width: viewport.width, height: viewport.height, glyphs, segs, polys, curves, texts, images };
}

// ---------------------------------------------------------------------------------------------
// 4 · Layout: staves (five equally spaced long lines), systems (staves joined by a line or brace),
// barlines (vertical lines from a staff's top line to its bottom line).
// ---------------------------------------------------------------------------------------------
const TICKS = 40320; // per quarter note: exact for 128ths and tuplets of 3, 5, 7 and 9
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const isH = s => Math.abs(s.y1 - s.y2) < 0.05, isV = s => Math.abs(s.x1 - s.x2) < 0.05;

function findStaves(page) {
  const hs = page.segs.filter(s => isH(s) && s.w < 2.2).map(s => ({ x0: Math.min(s.x1, s.x2), x1: Math.max(s.x1, s.x2), y: (s.y1 + s.y2) / 2, w: s.w }));
  hs.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const rows = [];
  for (const s of hs) { const r = rows[rows.length - 1]; if (r && Math.abs(r.y - s.y) < 0.12) r.items.push(s); else rows.push({ y: s.y, items: [s] }); }
  const lines = [];
  for (const r of rows) {
    // pieces of one line share its thickness; a beam lying on a staff line stays separate
    const cur = new Map();
    for (const s of r.items.sort((a, b) => a.x0 - b.x0)) {
      const k = Math.round(Math.log(Math.max(s.w, 0.05)) * 3), c = cur.get(k);
      if (c && s.x0 <= c.x1 + 1.5) c.x1 = Math.max(c.x1, s.x1);
      else { const n = { x0: s.x0, x1: s.x1, y: r.y, w: s.w }; cur.set(k, n); lines.push(n); }
    }
  }
  page.lines = lines;
  const cand = lines.filter(l => l.x1 - l.x0 > 40 && l.w < 2.5).sort((a, b) => a.y - b.y), used = new Set(), staves = [];
  const overlap = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  for (let i = 0; i < cand.length; i++) {
    if (used.has(i)) continue; const a = cand[i];
    for (let j = i + 1; j < cand.length; j++) {
      if (used.has(j)) continue;
      const b = cand[j], d = b.y - a.y; if (d < 1.5) continue; if (d > 20) break;
      const like = (p, q) => overlap(p, q) > 0.85 * Math.max(p.x1 - p.x0, q.x1 - q.x0) && p.w < 0.3 * d && q.w < 0.3 * d;
      if (!like(a, b)) continue;
      const pick = [i, j];
      for (let k = 2; k < 5; k++) {
        // engravers round line positions, so the spacing is re-estimated line by line
        const step = (cand[pick[k - 1]].y - a.y) / (k - 1), want = cand[pick[k - 1]].y + step;
        const m = cand.findIndex((c, ci) => ci > j && !used.has(ci) && Math.abs(c.y - want) < Math.max(0.25, step * 0.12) && like(c, a));
        if (m < 0) break; pick.push(m);
      }
      if (pick.length < 5) continue;
      pick.forEach(p => used.add(p));
      const ls = pick.map(p => cand[p]);
      staves.push({ top: ls[0].y, bottom: ls[4].y, sp: (ls[4].y - ls[0].y) / 4, x0: Math.max(...ls.map(l => l.x0)), x1: Math.min(...ls.map(l => l.x1)), lines: ls.map(l => l.y) });
      break;
    }
  }
  // Five parallel beams can pass for a tiny staff: keep staves of the page's main size, long
  // enough to hold music.
  const main = median(staves.filter(st => st.x1 - st.x0 > 0.4 * (page.width || 600)).map(st => st.sp)) || median(staves.map(st => st.sp));
  return staves.filter(st => st.sp > 0.7 * main && st.sp < 1.4 * main && st.x1 - st.x0 > 12 * st.sp).sort((a, b) => a.top - b.top || a.x0 - b.x0);
}

function groupSystems(page, staves) {
  const vs = page.segs.filter(isV).map(s => ({ x: s.x1, y0: Math.min(s.y1, s.y2), y1: Math.max(s.y1, s.y2), w: s.w }));
  for (const p of page.polys) if (p.x1 - p.x0 < 4 && p.y1 - p.y0 > 10) vs.push({ x: (p.x0 + p.x1) / 2, y0: p.y0, y1: p.y1, w: p.x1 - p.x0 });
  page.vsegs = vs;
  const braces = page.glyphs.filter(g => g.sym.k === 'brace').concat(page.texts.filter(t => /brace/i.test(t.font)));
  const systems = []; let cur = null;
  for (const st of staves) {
    const prev = cur && cur.staves[cur.staves.length - 1];
    const joined = prev && Math.abs(prev.x0 - st.x0) < 3 * st.sp && (
      vs.some(v => v.y0 <= prev.bottom + 0.3 * st.sp && v.y1 >= st.top - 0.3 * st.sp && v.x >= Math.min(prev.x0, st.x0) - 2 * st.sp && v.x <= Math.max(prev.x1, st.x1) + st.sp) ||
      braces.some(b => b.x < st.x0 && b.x > st.x0 - 6 * st.sp && b.y >= st.top - st.sp && b.y - (b.size || 0) <= prev.bottom + st.sp));
    if (joined) cur.staves.push(st); else { cur = { staves: [st] }; systems.push(cur); }
  }
  for (const sys of systems) {
    sys.x0 = Math.min(...sys.staves.map(s => s.x0)); sys.x1 = Math.max(...sys.staves.map(s => s.x1));
    sys.braced = braces.filter(b => b.x < sys.x0 && b.x > sys.x0 - 6 * sys.staves[0].sp);
  }
  return systems;
}

// Barlines: vertical lines from a staff's top line to its bottom line. Close lines merge into one
// barline (double, final, repeat) whose kind records thin/thick parts.
function findBarlines(page, sys, st, heads) {
  const tol = 0.25 * st.sp, out = [];
  for (const v of page.vsegs) {
    if (v.y0 > st.top + tol || v.y1 < st.bottom - tol || v.x < st.x0 - st.sp || v.x > st.x1 + st.sp) continue;
    // a stem that happens to run from the top line to the bottom line touches its notehead
    if (heads.some(h => (Math.abs(h.x - v.x) < 0.35 * st.sp || Math.abs(h.x + h.w - v.x) < 0.35 * st.sp) && h.y > v.y0 - 0.7 * st.sp && h.y < v.y1 + 0.7 * st.sp)) continue;
    // must end on staff lines of this system (not a stem crossing the staff)
    const ends = sys.staves.flatMap(s => [s.top, s.bottom]);
    if (!ends.some(e => Math.abs(e - v.y0) < tol) || !ends.some(e => Math.abs(e - v.y1) < tol)) continue;
    out.push({ x: v.x, thick: v.w > 0.3 * st.sp, w: v.w });
  }
  out.sort((a, b) => a.x - b.x);
  const bars = [];
  for (const b of out) {
    const last = bars[bars.length - 1];
    if (last && b.x - last.x1 < 1.2 * st.sp) { last.x1 = b.x; last.parts.push(b); }
    else bars.push({ x0: b.x, x1: b.x, parts: [b] });
  }
  for (const b of bars) { b.x = (b.x0 + b.x1) / 2; b.thick = b.parts.some(p => p.thick); b.double = b.parts.length > 1; }
  return bars;
}

// ---------------------------------------------------------------------------------------------
// 5 · Symbols on a staff: noteheads with their stems, beams, flags and dots become chords; rests;
// clefs, key and time signatures. Positions are counted in staff steps from the bottom line.
// ---------------------------------------------------------------------------------------------
const stepOf = (st, y) => Math.round((st.bottom - y) / (st.sp / 2));
const bandDist = (st, y) => y < st.top ? st.top - y : y > st.bottom ? y - st.bottom : 0;

function nearestStaff(staves, y) {
  let best = null, bd = Infinity;
  for (const st of staves) { const d = bandDist(st, y); if (d < bd) { bd = d; best = st; } }
  return best;
}
// A notehead between two staves belongs to the staff its ledger lines lead to.
function staffForHead(page, staves, h) {
  const inside = staves.find(st => h.y >= st.top - 0.6 * st.sp && h.y <= st.bottom + 0.6 * st.sp);
  if (inside) return inside;
  const cx = h.x + h.w / 2;
  let best = null, bestScore = -1, bestNeed = Infinity;
  for (const st of staves) {
    if (bandDist(st, h.y) > 9 * st.sp) continue;
    const need = [];
    if (h.y < st.top) for (let y = st.top - st.sp; y >= h.y - 0.3 * st.sp; y -= st.sp) need.push(y);
    else for (let y = st.bottom + st.sp; y <= h.y + 0.3 * st.sp; y += st.sp) need.push(y);
    const found = need.filter(y => page.lines.some(l => Math.abs(l.y - y) < 0.2 * st.sp && l.x0 < cx && l.x1 > cx && l.x1 - l.x0 < 5 * st.sp)).length;
    const score = need.length ? found / need.length : 1;
    if (score > bestScore + 0.01 || (Math.abs(score - bestScore) <= 0.01 && need.length < bestNeed)) { best = st; bestScore = score; bestNeed = need.length; }
  }
  return best;
}

// The vertical extent of a polygon at x (for beams).
function polyYAt(p, x) {
  const ys = [], pts = p.pts;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if ((a[0] <= x && b[0] >= x) || (b[0] <= x && a[0] >= x)) {
      if (Math.abs(b[0] - a[0]) < 1e-6) ys.push(a[1], b[1]); else ys.push(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
    }
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}

function buildSystem(page, sys, pianoStaves) {
  const sp = median(pianoStaves.map(s => s.sp)), all = page.staves;
  const y0 = Math.min(...sys.staves.map(s => s.top)) - 10 * sp, y1 = Math.max(...sys.staves.map(s => s.bottom)) + 10 * sp;
  const inSys = g => g.y >= y0 && g.y <= y1 && g.x >= sys.x0 - 8 * sp && g.x <= sys.x1 + 2 * sp;
  const glyphs = page.glyphs.filter(inSys);
  // Every staff of the system takes part in assignment so symbols of other instruments are not
  // given to the piano.
  const owner = new Map();
  for (const g of glyphs) owner.set(g, g.sym.k === 'head' ? staffForHead(page, all, g) : nearestStaff(all, g.y));
  const mine = st => glyphs.filter(g => owner.get(g) === st);
  const headSize = median(glyphs.filter(g => g.sym.k === 'head').map(g => g.size)) || 4 * sp;

  // Barlines common to the piano staves.
  const allHeads = glyphs.filter(g => g.sym.k === 'head');
  const barsBy = pianoStaves.map(st => findBarlines(page, sys, st, allHeads));
  let bars = barsBy[0].filter(b => b.x > sys.x0 + 1.5 * sp);
  if (barsBy.length > 1) bars = bars.filter(b => barsBy.slice(1).every(o => o.some(c => Math.abs(c.x - b.x) < sp)));
  // Repeat dots beside barlines.
  const dotsAt = (b, side) => {
    const near = st => glyphs.filter(g => owner.get(g) === st && (g.sym.k === 'dot' || g.sym.k === 'rdot' || g.sym.k === 'rdots') &&
      (side < 0 ? g.x + g.w <= b.x0 + 0.2 * sp && g.x + g.w > b.x0 - 1.6 * sp : g.x >= b.x1 - 0.2 * sp && g.x < b.x1 + 1.6 * sp) &&
      g.y > st.top && g.y < st.bottom);
    return pianoStaves.every(st => { const d = near(st); return d.some(g => g.sym.k === 'rdots') || d.length >= 2; });
  };
  for (const b of bars) {
    b.backward = dotsAt(b, -1); b.forward = dotsAt(b, 1);
    if (b.backward || b.forward) b.repeatDots = glyphs.filter(g => (g.sym.k === 'dot' || g.sym.k === 'rdot' || g.sym.k === 'rdots') && Math.abs(g.x - b.x) < 2 * sp);
  }
  const repeatDots = new Set(bars.flatMap(b => b.repeatDots || []));

  // Vertical lines that are not barlines are stems.
  const barX = bars.map(b => [b.x0 - 0.3 * sp, b.x1 + 0.3 * sp]);
  const stems = page.vsegs.filter(v => v.y1 - v.y0 > 1.2 * sp && v.y1 - v.y0 < 14 * sp && v.w < 0.35 * sp && v.y0 >= y0 && v.y1 <= y1 &&
    v.x > sys.x0 && v.x < sys.x1 + sp && !barX.some(([a, b]) => v.x >= a && v.x <= b && v.y1 - v.y0 > 3.8 * sp));
  // Beams: filled polygons and thick horizontal bars.
  const beams = page.polys.filter(p => p.y0 >= y0 && p.y1 <= y1 && p.x1 - p.x0 > 0.6 * sp && p.y1 - p.y0 < 6 * sp && !(p.x1 - p.x0 < 1.0 * sp && p.y1 - p.y0 > 3 * sp))
    .concat(page.segs.filter(s => isH(s) && s.w > 0.3 * sp && s.w < 1.2 * sp && Math.abs(s.x2 - s.x1) > 0.6 * sp && s.y1 >= y0 && s.y1 <= y1)
      .map(s => { const x0 = Math.min(s.x1, s.x2), x1 = Math.max(s.x1, s.x2), a = s.y1 - s.w / 2, b = s.y1 + s.w / 2; return { x0, x1, y0: a, y1: b, pts: [[x0, a], [x1, a], [x1, b], [x0, b]] }; }));

  const staffData = pianoStaves.map(st => ({ st, glyphs: mine(st) }));
  const heads = glyphs.filter(g => g.sym.k === 'head' && pianoStaves.includes(owner.get(g)));
  // Stems to noteheads.
  const stemOf = new Map();
  const stemFor = (h, skip) => {
    let best = null, bd = Infinity; const tol = 0.3 * sp;
    for (const s of stems) {
      if (s === skip || h.y < s.y0 - 0.7 * sp || h.y > s.y1 + 0.7 * sp) continue;
      const d = Math.min(Math.abs(s.x - (h.x + h.w)), Math.abs(s.x - h.x));
      if (d < tol + s.w && d < bd) { bd = d; best = s; }
    }
    return best;
  };
  for (const h of heads) { const s = stemFor(h); if (s && h.sym.v >= 1) stemOf.set(h, s); }
  // One stem carries one kind of notehead: a half note sharing a column with black notes of
  // another voice has its own stem.
  const onStem = new Map();
  for (const [h, s] of stemOf) { if (!onStem.has(s)) onStem.set(s, []); onStem.get(s).push(h); }
  for (const [s, hs] of onStem) {
    const kinds = new Set(hs.map(h => h.sym.v)); if (kinds.size < 2) continue;
    const beamed = page.polys.some(b => s.x >= b.x0 - 0.2 * sp && s.x <= b.x1 + 0.2 * sp && b.y1 >= s.y0 - 0.5 * sp && b.y0 <= s.y1 + 0.5 * sp) || glyphs.some(g => g.sym.k === 'flag' && Math.abs(g.x - s.x) < 0.6 * sp && g.y >= s.y0 - 2.5 * sp && g.y <= s.y1 + 2.5 * sp);
    const keep = beamed ? 2 : [...kinds].sort((a, b) => hs.filter(h => h.sym.v === b).length - hs.filter(h => h.sym.v === a).length)[0];
    for (const h of hs) if (h.sym.v !== keep) { const o = stemFor(h, s); if (o) stemOf.set(h, o); else stemOf.delete(h); }
  }
  // Chords: noteheads sharing a stem; stemless (whole) notes grouped by position.
  const chords = [], byStem = new Map();
  for (const h of heads) {
    const s = stemOf.get(h);
    if (s) { if (!byStem.has(s)) byStem.set(s, []); byStem.get(s).push(h); }
  }
  for (const [s, hs] of byStem) {
    const top = Math.min(...hs.map(h => h.y)), bottom = Math.max(...hs.map(h => h.y));
    const up = Math.abs(s.y1 - bottom) < Math.abs(s.y0 - top);
    const w = median(hs.map(h => h.w));
    chords.push({ kind: 'chord', heads: hs, stem: s, up, free: up ? s.y0 : s.y1, x: up ? s.x - w : s.x, x1: Math.max(...hs.map(h => h.x + h.w)), w });
  }
  const loose = heads.filter(h => !stemOf.has(h)).sort((a, b) => a.x - b.x);
  for (const h of loose) {
    const c = chords.find(c => !c.stem && owner.get(c.heads[0]) === owner.get(h) && (Math.abs(c.x - h.x) < 0.35 * sp || (Math.abs(h.x - c.x1) < 0.4 * sp && c.heads.some(o => Math.abs(o.y - h.y) < 0.6 * sp))));
    if (c) { c.heads.push(h); c.x1 = Math.max(c.x1, h.x + h.w); }
    else chords.push({ kind: 'chord', heads: [h], stem: null, up: null, x: h.x, x1: h.x + h.w, w: h.w });
  }
  for (const c of chords) {
    c.staff = owner.get(c.heads[0]);
    c.grace = median(c.heads.map(h => h.size)) < 0.8 * headSize;
    c.v = Math.min(...c.heads.map(h => h.sym.v));
    // Flags at the free end of the stem.
    let n = 0;
    if (c.stem) {
      const flags = glyphs.filter(g => g.sym.k === 'flag' && Math.abs(g.x - c.stem.x) < 0.6 * sp && Math.abs(g.y - c.free) < 2.2 * sp);
      if (flags.length) n = Math.max(...flags.map(f => f.sym.v - 2));
      // Beams crossing the stem.
      const nb = new Set();
      for (const b of beams) {
        if (c.stem.x < b.x0 - 0.15 * sp || c.stem.x > b.x1 + 0.15 * sp) continue;
        const r = polyYAt(b, Math.min(Math.max(c.stem.x, b.x0 + 0.01), b.x1 - 0.01)); if (!r) continue;
        const mid = (r[0] + r[1]) / 2;
        if (mid < c.stem.y0 - 0.4 * sp || mid > c.stem.y1 + 0.4 * sp) continue;
        if (Math.abs(mid - c.free) > 4.2 * sp) continue;
        nb.add(b);
      }
      c.beams = [...nb];
      n = Math.max(n, nb.size);
      c.slash = glyphs.some(g => g.sym.k === 'graceSlash' && Math.abs(g.x - c.stem.x) < 1.2 * sp && Math.abs(g.y - c.free) < 2.5 * sp);
    }
    c.flags = n;
  }
  // Rests.
  const rests = glyphs.filter(g => g.sym.k === 'rest' && pianoStaves.includes(owner.get(g))).map(g => ({ kind: 'rest', g, staff: owner.get(g), x: g.x, x1: g.x + g.w, v: g.sym.v, y: g.y }));
  // Augmentation dots: to the right of the nearest chord or rest on the same staff, with no barline between.
  const items = [...chords, ...rests];
  for (const d of glyphs.filter(g => g.sym.k === 'dot' && !repeatDots.has(g))) {
    const st = owner.get(d); let best = null, bd = Infinity;
    for (const it of items) {
      if (it.staff !== st) continue;
      const right = it.x1, gap = d.x - right;
      if (gap < -0.25 * sp || gap > 2.6 * sp) continue;
      const ys = it.kind === 'chord' ? it.heads.map(h => h.y) : [it.y - sp, it.y + sp];
      if (d.y < Math.min(...ys) - 0.8 * sp || d.y > Math.max(...ys) + 0.8 * sp) continue;
      if (bars.some(b => b.x > right && b.x < d.x)) continue;
      if (gap < bd) { bd = gap; best = it; }
    }
    if (best) (best.dotGlyphs ||= []).push(d);
  }
  for (const it of items) {
    if (!it.dotGlyphs) { it.dots = 0; continue; }
    const rows = new Map();
    for (const d of it.dotGlyphs) { const k = Math.round(d.y / (0.25 * sp)); rows.set(k, (rows.get(k) || 0) + 1); }
    it.dots = Math.min(3, Math.max(...rows.values()));
  }
  return { sys, sp, glyphs, owner, bars, chords, rests, staffData, beams, headSize, pianoStaves };
}

// ---------------------------------------------------------------------------------------------
// 6 · Signatures, pitches and rhythm of one system.
// ---------------------------------------------------------------------------------------------
const LETTERS = 'CDEFGAB', SHARP_ORDER = 'FCGDAEB', FLAT_ORDER = 'BEADGCF', SEMI = [0, 2, 4, 5, 7, 9, 11];
const CLEF_REF = { G: 32, F: 24, C: 28 }; // diatonic index of the clef's line: G4, F3, C4
const diatonic = (clef, step) => CLEF_REF[clef.sign] + (step - clef.step) + 7 * (clef.octave || 0);
const keyAlter = (fifths, letter, extra) => extra && extra[letter] ? extra[letter] : fifths > 0 ? (SHARP_ORDER.slice(0, fifths).includes(letter) ? 1 : 0) : fifths < 0 ? (FLAT_ORDER.slice(0, -fifths).includes(letter) ? -1 : 0) : 0;
const TYPES = [[8, 'breve'], [4, 'whole'], [2, 'half'], [1, 'quarter'], [1 / 2, 'eighth'], [1 / 4, '16th'], [1 / 8, '32nd'], [1 / 16, '64th'], [1 / 32, '128th']];
const typeName = q => (TYPES.find(([v]) => Math.abs(v - q) < 1e-9) || [0, 'quarter'])[1];
const ITALIC = /italic|ital\b|-it$|oblique|bolditalic|-bi$/i;

function analyseSystem(page, B, state, report) {
  const { sys, sp, glyphs, owner, bars, chords, rests, beams, headSize, pianoStaves } = B;
  const events = [...chords.filter(c => !c.grace), ...rests];
  const graces = chords.filter(c => c.grace);
  const headsOf = st => chords.filter(c => c.staff === st).flatMap(c => c.heads.map(h => ({ h, c })));
  const sigs = new Map(), keyAcc = new Set(); // staff → [{x, kind, …}] in x order
  for (const st of pianoStaves) {
    const mine = glyphs.filter(g => owner.get(g) === st).sort((a, b) => a.x - b.x), list = [], hs = headsOf(st);
    for (const g of mine) if (g.sym.k === 'clef' && stepOf(st, g.y) >= 0 && stepOf(st, g.y) <= 8 && stepOf(st, g.y) % 2 === 0) list.push({ x: g.x, x1: g.x + g.w, kind: 'clef', clef: { sign: g.sym.v, step: stepOf(st, g.y), octave: g.sym.octave || 0 } });
    // Key signatures: runs of accidentals right after a clef or barline that spell the order of
    // sharps or flats (after any cancelling naturals) and stand clear of the first note.
    const runs = [];
    for (const a of mine.filter(g => g.sym.k === 'acc')) { const r = runs[runs.length - 1]; if (r && a.x - (r[r.length - 1].x + r[r.length - 1].w) < 1.6 * sp) r.push(a); else runs.push([a]); }
    for (const run of runs) {
      const x = run[0].x;
      const afterClef = list.some(c => c.kind === 'clef' && c.x1 <= x + 0.2 * sp && x - c.x1 < 3.5 * sp);
      const afterBar = bars.some(b => b.x1 <= x + 0.2 * sp && x - b.x1 < 3 * sp) || bars.some(b => b.x0 > x && b.x0 - (run[run.length - 1].x + run[run.length - 1].w) < 1.5 * sp && !hs.some(({ h }) => h.x > b.x0 && h.x - b.x0 < 0.5 * sp));
      // (in a picture, accidentals after a barline are far more often a misread note than a new key)
      if (!afterClef && (!afterBar || page.scan)) continue;
      const clef = [...list].reverse().find(c => c.kind === 'clef' && c.x < x)?.clef || state.clefs.get(pianoStaves.indexOf(st)) || { sign: pianoStaves.indexOf(st) ? 'F' : 'G', step: pianoStaves.indexOf(st) ? 6 : 2 };
      const letter = a => LETTERS[((diatonic(clef, stepOf(st, a.y)) % 7) + 7) % 7];
      let nat = 0; while (nat < run.length && run[nat].sym.v === 0) nat++;
      const body = run.slice(nat), sign = body.length ? Math.sign(body[0].sym.v) : 0;
      const clear = a => !hs.some(({ h }) => Math.abs(a.y - h.y) < 0.3 * sp && h.x - (a.x + a.w) > -0.4 * sp && h.x - (a.x + a.w) < 0.8 * sp);
      let k = 0;
      if (sign && body.every(a => Math.sign(a.sym.v) === sign)) {
        k = body.length; while (k > 0 && !clear(body[k - 1])) k--;
        // the letters must be the first sharps (or flats) of the circle, in whatever order printed
        const order = sign > 0 ? SHARP_ORDER : FLAT_ORDER;
        while (k > 0) { const ls = new Set(body.slice(0, k).map(letter)); if (ls.size === k && [...ls].every(l => order.slice(0, k).includes(l))) break; k--; }
      }
      if (!k && !(nat && !body.length && afterBar && clear(run[nat - 1]))) continue;
      const extra = {}; for (const a of body.slice(0, k)) if (Math.abs(a.sym.v) === 2) extra[letter(a)] = a.sym.v;
      run.slice(0, nat + k).forEach(a => keyAcc.add(a));
      const last = run[nat + k - 1];
      list.push({ x, x1: last.x + last.w, kind: 'key', fifths: sign * k, extra: Object.keys(extra).length ? extra : null });
    }
    sigs.set(st, list);
  }
  // Accidentals attached to noteheads (same height, just left of the head).
  const accOf = new Map();
  for (const st of pianoStaves) {
    const hs = headsOf(st);
    for (const a of glyphs.filter(g => g.sym.k === 'acc' && owner.get(g) === st && !keyAcc.has(g)).sort((p, q) => q.x - p.x)) {
      let best = null, bd = Infinity;
      for (const { h } of hs) {
        if (Math.abs(a.y - h.y) > 0.3 * sp) continue;
        const gap = h.x - (a.x + a.w);
        if (gap < -0.4 * sp || gap > 4.5 * sp) continue;
        if (bars.some(b => b.x > a.x && b.x < h.x)) continue;
        if (gap < bd) { bd = gap; best = h; }
      }
      if (best && (!accOf.has(best) || accOf.get(best).x < a.x)) accOf.set(best, a);
    }
  }
  for (const st of pianoStaves) {
    const mine = glyphs.filter(g => owner.get(g) === st).sort((a, b) => a.x - b.x), list = sigs.get(st);
    // Time signatures: digit glyphs inside the staff, numerator over denominator.
    const digits = mine.filter(g => (g.sym.k === 'tsig' || (g.sym.k === 'digit' && g.size > 0.75 * headSize)) && g.y > st.top - 0.6 * sp && g.y < st.bottom + 2.6 * sp);
    const groups = [];
    for (const d of digits) { const gr = groups.find(g => d.x < g.x1 + 0.6 * sp && d.x + d.w > g.x0 - 0.6 * sp); if (gr) { gr.items.push(d); gr.x0 = Math.min(gr.x0, d.x); gr.x1 = Math.max(gr.x1, d.x + d.w); } else groups.push({ x0: d.x, x1: d.x + d.w, items: [d] }); }
    for (const gr of groups) {
      const sym = gr.items.find(d => d.sym.v === 'C' || d.sym.v === 'cut');
      if (sym) { list.push({ x: gr.x0, x1: gr.x1, kind: 'time', beats: sym.sym.v === 'C' ? 4 : 2, beatType: sym.sym.v === 'C' ? 4 : 2, symbol: sym.sym.v === 'C' ? 'common' : 'cut' }); continue; }
      const ys = gr.items.map(d => d.y).sort((a, b) => a - b), split = ys.findIndex((y, i) => i && y - ys[i - 1] > 0.9 * sp);
      if (split < 0) continue;
      const cut = (ys[split - 1] + ys[split]) / 2, num = gr.items.filter(d => d.y < cut).sort((a, b) => a.x - b.x), den = gr.items.filter(d => d.y > cut).sort((a, b) => a.x - b.x);
      const beats = Number(num.map(d => d.sym.v).join('')), beatType = Number(den.map(d => d.sym.v).join(''));
      if (beats > 0 && [1, 2, 4, 8, 16, 32].includes(beatType)) list.push({ x: gr.x0, x1: gr.x1, kind: 'time', beats, beatType });
    }
    list.sort((a, b) => a.x - b.x);
    sigs.set(st, list);
  }

  // Measures between barlines.
  const edges = [sys.x0, ...bars.map(b => b.x)];
  if (sys.x1 - edges[edges.length - 1] > 2 * sp) edges.push(sys.x1);
  const measures = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const x0 = edges[i], x1 = edges[i + 1];
    const evs = events.filter(e => e.x > x0 && e.x < x1);
    const right = bars.find(b => Math.abs(b.x - x1) < 0.5), left = i ? bars.find(b => Math.abs(b.x - x0) < 0.5) : null;
    measures.push({ x0, x1, evs, right, left });
  }
  // A leading strip holding only clef/key/time (e.g. before a start-repeat barline) is no measure.
  while (measures.length && !measures[0].evs.length && measures.length > 1 && measures[0].x1 - sys.x0 < 14 * sp) {
    const m = measures.shift(); if (m.right?.forward && measures[0]) measures[0].left = m.right;
  }
  // After the last barline only courtesy signatures may follow: no measure.
  while (measures.length > 1 && !measures[measures.length - 1].evs.length && (!measures[measures.length - 1].right || measures[measures.length - 1].x1 - measures[measures.length - 1].x0 < 8 * sp)) measures.pop();
  // Signatures after the last note of the system are courtesy signatures for the next system.
  const lastEv = Math.max(-Infinity, ...events.map(e => e.x));
  for (const [st, list] of sigs) sigs.set(st, list.filter(s => !(s.kind !== 'clef' && s.x > lastEv && measures.length && s.x > measures[measures.length - 1].x0)));

  // Pitches, in x order per staff, with measure-scope accidentals.
  for (const [si, st] of pianoStaves.entries()) {
    const list = sigs.get(st);
    let clef = state.clefs.get(si) || { sign: si ? 'F' : 'G', step: si ? 6 : 2, octave: 0 }, fifths = state.fifths, extra = state.keyExtra;
    const stChords = chords.filter(c => c.staff === st).sort((a, b) => a.x - b.x);
    let li = 0, mi = 0, alters = new Map();
    for (const c of stChords) {
      while (li < list.length && list[li].x < c.x) { const s = list[li++]; if (s.kind === 'clef') clef = s.clef; if (s.kind === 'key') { fifths = s.fifths; extra = s.extra; } }
      while (mi < measures.length && c.x > measures[mi].x1) { mi++; alters = new Map(); }
      for (const h of c.heads) {
        const D = diatonic(clef, stepOf(st, h.y)), letter = LETTERS[((D % 7) + 7) % 7], octave = Math.floor(D / 7);
        const a = accOf.get(h);
        let alter;
        if (a) { alter = a.sym.v; alters.set(D, alter); }
        else alter = alters.has(D) ? alters.get(D) : keyAlter(fifths, letter, extra);
        h.pitch = { step: letter, octave, alter, D, shown: a ? a.sym.v : null };
        h.midi = 12 * (octave + 1) + SEMI[LETTERS.indexOf(letter)] + alter;
      }
      c.clef = clef;
    }
  }
  // Ottava lines: "8va"/"8vb" with a dashed line; notes under them sound an octave away.
  const ottavas = [];
  for (const g of glyphs.filter(g => g.sym.k === 'ottava')) {
    const st = owner.get(g); if (!pianoStaves.includes(st)) continue;
    const dashes = page.segs.filter(s => isH(s) && Math.abs(s.y1 - (g.y - 0.5 * sp)) < 1.5 * sp && Math.min(s.x1, s.x2) > g.x).sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2));
    let end = g.x + g.w + sp;
    for (const s of dashes) { const a = Math.min(s.x1, s.x2), b = Math.max(s.x1, s.x2); if (a - end > 2 * sp) break; end = Math.max(end, b); }
    const v = g.sym.plain && g.y > st.bottom ? -g.sym.v : g.sym.v; // the same plain digit marks 8vb when it is below the staff
    ottavas.push({ st, x0: g.x - 0.5 * sp, x1: end + 0.5 * sp, shift: v === 8 ? 12 : v === -8 ? -12 : v === 15 ? 24 : -24 });
  }
  for (const c of chords) {
    const o = ottavas.find(o => o.st === c.staff && c.x >= o.x0 && c.x <= o.x1);
    if (o) for (const h of c.heads) { h.pitch.octave += o.shift / 12; h.midi += o.shift; h.pitch.D += 7 * o.shift / 12; }
  }
  // A pitch off the keyboard means a misread clef or staff; such noteheads are left out.
  for (const c of chords) {
    const off = c.heads.filter(h => !h.pitch || h.midi < 21 || h.midi > 108);
    if (off.length) { c.heads = c.heads.filter(h => !off.includes(h)); c.offKeyboard = true; }
  }
  for (const m of measures) { m.offKeyboard = m.evs.some(e => e.offKeyboard); m.evs = m.evs.filter(e => e.kind !== 'chord' || e.heads.length); }
  for (let i = graces.length - 1; i >= 0; i--) if (!graces[i].heads.length) graces.splice(i, 1);
  for (let i = chords.length - 1; i >= 0; i--) if (!chords[i].heads.length) chords.splice(i, 1);
  // Ties: a curve from a notehead to the next notehead at the same position (or to the system's end).
  for (const cv of page.curves) {
    if (cv.x1 - cv.x0 < 0.8 * sp || cv.y1 - cv.y0 > 3 * sp || cv.x0 < sys.x0 - sp || cv.x1 > sys.x1 + 3 * sp) continue;
    const pts = cv.pts, L = pts.reduce((a, p) => p[0] < a[0] ? p : a), R = pts.reduce((a, p) => p[0] > a[0] ? p : a);
    if (cv.y0 < Math.min(...sys.staves.map(s => s.top)) - 8 * sp || cv.y1 > Math.max(...sys.staves.map(s => s.bottom)) + 8 * sp) continue;
    const near = (x, y, side) => {
      let best = null, bd = Infinity;
      for (const c of chords) for (const h of c.heads) {
        const dx = side < 0 ? x - (h.x + h.w) : h.x - x;
        if (dx < -0.7 * sp || dx > 1.3 * sp || Math.abs(h.y - y) > 1.2 * sp) continue;
        const d = Math.abs(dx) + Math.abs(h.y - y); if (d < bd) { bd = d; best = { h, c }; }
      }
      return best;
    };
    const a = near(L[0], L[1], -1); if (!a || a.c.grace) continue;
    const b = near(R[0], R[1], 1);
    if (b && b.h !== a.h && b.c.staff === a.c.staff && b.h.pitch.D === a.h.pitch.D && b.c.x > a.c.x) {
      a.h.tieStart = true; b.h.tieStop = true;
      if (!accOf.has(b.h) && b.h.pitch.alter !== a.h.pitch.alter) { b.h.midi += a.h.pitch.alter - b.h.pitch.alter; b.h.pitch.alter = a.h.pitch.alter; }
    }
    else if (!b && R[0] > Math.max(...chords.filter(c => c.staff === a.c.staff).map(c => c.x1)) - 0.2 * sp) a.h.tieStart = true;
  }
  // A tie continuing from the previous system: the first note keeps the tied note's spelling.
  for (const c of chords) for (const h of c.heads) {
    const prev = state.openTies.find(t => t.staff === pianoStaves.indexOf(c.staff) && t.D === h.pitch.D);
    if (prev && c.x === Math.min(...chords.filter(o => o.staff === c.staff && !o.grace).map(o => o.x))) { h.tieStop = true; if (!accOf.has(h)) { h.midi += prev.alter - h.pitch.alter; h.pitch.alter = prev.alter; } }
  }

  // Tuplet numbers: SMuFL tuplet digits or italic digits, with their beam or bracket.
  const tuplets = [];
  const numerals = glyphs.filter(g => g.sym.k === 'tup').map(g => ({ x: g.x, x1: g.x + g.w, y: g.y, v: g.sym.v }))
    .concat(page.texts.filter(t => /^[0-9]$/.test(t.ch) && ITALIC.test(t.font) && t.y > sys.staves[0].top - 10 * sp && t.y < sys.staves[sys.staves.length - 1].bottom + 10 * sp && t.x > sys.x0 && t.x < sys.x1).map(t => ({ x: t.x, x1: t.x + t.w, y: t.y - 0.35 * t.size, v: Number(t.ch), text: true })));
  // Italic digits at the start of a system or over a barline are measure numbers.
  const firstChord = Math.min(Infinity, ...chords.map(c => c.x));
  for (let i = numerals.length - 1; i >= 0; i--) { const n = numerals[i]; if (n.text && (n.x < firstChord - 0.5 * sp || bars.some(b => Math.abs(b.x - n.x) < 1.5 * sp || Math.abs(b.x - n.x1) < 1.5 * sp))) numerals.splice(i, 1); }
  numerals.sort((a, b) => a.x - b.x);
  const merged = [];
  for (const n of numerals) { const m = merged[merged.length - 1]; if (m && n.x - m.x1 < 0.3 * sp && Math.abs(n.y - m.y) < 0.5 * sp) { m.v = m.v * 10 + n.v; m.x1 = n.x1; } else merged.push({ ...n }); }
  for (const n of merged) {
    if (n.v < 2) continue;
    const cx = (n.x + n.x1) / 2, playing = chords.filter(c => !c.grace);
    // a bracket: horizontal lines at the numeral's height on both sides
    const hs = page.segs.filter(s => isH(s) && s.w < 0.3 * sp && Math.abs(s.y1 - n.y) < 1.2 * sp && Math.max(s.x1, s.x2) - Math.min(s.x1, s.x2) < 30 * sp);
    const leftSeg = hs.filter(s => Math.max(s.x1, s.x2) <= cx && Math.max(s.x1, s.x2) > n.x - 2 * sp), rightSeg = hs.filter(s => Math.min(s.x1, s.x2) >= cx && Math.min(s.x1, s.x2) < n.x1 + 2 * sp);
    // the beam it labels
    const bm = beams.filter(b => b.x0 <= cx + 0.5 * sp && b.x1 >= cx - 0.5 * sp).map(b => ({ b, r: polyYAt(b, Math.min(Math.max(cx, b.x0 + 0.01), b.x1 - 0.01)) }))
      .filter(o => o.r && Math.min(Math.abs(o.r[0] - n.y), Math.abs(o.r[1] - n.y)) < 4.5 * sp).sort((p, q) => Math.min(Math.abs(p.r[0] - n.y), Math.abs(p.r[1] - n.y)) - Math.min(Math.abs(q.r[0] - n.y), Math.abs(q.r[1] - n.y)));
    let members = null, x0 = null, x1 = null;
    if (bm.length) members = playing.filter(c => c.beams?.includes(bm[0].b));
    if (members && !members.length) members = null;
    if (!members && leftSeg.length && rightSeg.length) { x0 = Math.min(...leftSeg.map(s => Math.min(s.x1, s.x2))) - 1.6 * sp; x1 = Math.max(...rightSeg.map(s => Math.max(s.x1, s.x2))) + 0.3 * sp; }
    const near = playing.slice().sort((p, q) => Math.hypot(p.x + p.w / 2 - cx, (p.heads[0].y - n.y) / 2) - Math.hypot(q.x + q.w / 2 - cx, (q.heads[0].y - n.y) / 2))[0];
    if (!near) continue;
    const reach = c => { const ys = c.heads.map(h => h.y).concat(c.stem ? [c.stem.y0, c.stem.y1] : []); return Math.max(0, Math.min(...ys) - n.y, n.y - Math.max(...ys)); };
    if (!members && x0 == null && (reach(near) > 3.5 * sp || Math.abs(near.x + near.w / 2 - cx) > 3 * sp)) continue;
    // a beam group longer than the tuplet: the n notes under the numeral
    if (members && members.length > n.v && members.length % n.v) members = members.sort((p, q) => Math.abs(p.x + p.w / 2 - cx) - Math.abs(q.x + q.w / 2 - cx)).slice(0, n.v);
    const st = members ? members[0].staff : x0 != null ? nearestStaff(pianoStaves, n.y) : near.staff;
    tuplets.push({ st, n: n.v, members, x0, x1, cx, y: n.y, near });
  }
  return { measures, sigs, graces, tuplets, numerals: merged };
}

// First and second endings: a number ("1.", "2", "1, 2.") over the top staff under a bracket line.
// A bracket that runs to the end of the system continues on the next one.
function findVoltas(page, B, state) {
  const { sys, sp } = B, topLine = sys.staves[0].top;
  const hsegs = page.segs.filter(s => isH(s) && s.w < 0.3 * sp && s.y1 < topLine - 0.5 * sp && s.y1 > topLine - 10 * sp && Math.abs(s.x2 - s.x1) > 2.5 * sp && Math.max(s.x1, s.x2) > sys.x0 && Math.min(s.x1, s.x2) < sys.x1 &&
    !(page.staves || []).some(st => s.y1 > st.top - 0.2 * sp && s.y1 < st.bottom + 0.2 * sp));
  const musicDigits = page.glyphs.filter(g => g.sym.k === 'digit').map(g => ({ x: g.x, y: g.y, w: g.w, size: g.size, ch: String(g.sym.v) }));
  const lines = textLines(page.texts.filter(t => !t.music || /^[.,]$/.test(t.ch)).concat(musicDigits).filter(t => t.y < topLine && t.y > topLine - 10 * sp && t.x > sys.x0 - sp && t.x < sys.x1))
    .filter(l => /^\d{1,2}(?:[\s.,\-–]+\d{1,2})*[\s.]*$/.test(l.text));
  const voltas = [];
  const hook = (x, y) => page.vsegs.some(v => Math.abs(v.x - x) < 0.5 * sp && Math.abs(v.y0 - y) < 0.5 * sp && v.y1 - v.y0 > 0.8 * sp);
  for (const l of lines) {
    const seg = hsegs.filter(s => Math.min(s.x1, s.x2) <= l.x0 + 0.5 * sp && Math.min(s.x1, s.x2) >= l.x0 - 3 * sp && s.y1 < l.y && s.y1 > l.y - 2.5 * l.size)
      .sort((a, b) => Math.abs(b.x2 - b.x1) - Math.abs(a.x2 - a.x1))[0];
    if (!seg) continue;
    const numbers = (l.text.match(/\d+/g) || []), ranged = /\d\s*\.?\s*[-–]/.test(l.text) && numbers.length === 2;
    const x0 = Math.min(seg.x1, seg.x2), x1 = Math.max(seg.x1, seg.x2);
    if (!hook(x0, seg.y1)) continue; // an ending bracket starts with a hook down
    voltas.push({ number: ranged ? numbers.join('-') : numbers.join(', '), x0, x1, closed: hook(x1, seg.y1), open: x1 > sys.x1 - 1.5 * sp && !hook(x1, seg.y1), label: { x0: l.x0, x1: l.x1, y: l.y - 0.35 * l.size } });
  }
  // continuation of an ending begun on the previous system
  if (state.openVolta) {
    const seg = hsegs.filter(s => Math.abs(s.x2 - s.x1) > 4 * sp && Math.min(s.x1, s.x2) < sys.x0 + 14 * sp && !voltas.some(v => Math.abs(v.x0 - Math.min(s.x1, s.x2)) < sp)).sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2))[0];
    if (seg) { const x1 = Math.max(seg.x1, seg.x2); voltas.unshift({ number: state.openVolta, x0: sys.x0, x1, closed: hook(x1, seg.y1), open: x1 > sys.x1 - 1.5 * sp && !hook(x1, seg.y1), continued: true }); }
  }
  return voltas;
}

// Printed fingering: a lone digit 1–5 in an upright face (or the music font's own small digits),
// centred over or under a chord. A stack of digits goes to the chord's notes in order; anything
// that cannot be matched one to one is left out rather than guessed.
function readFingering(page, B, numerals, voltas) {
  const { sys, sp, glyphs, chords, headSize, pianoStaves } = B;
  const top = Math.min(...sys.staves.map(s => s.top)) - 9 * sp, bottom = Math.max(...sys.staves.map(s => s.bottom)) + 9 * sp;
  const inside = d => d.y > top && d.y < bottom && d.x > sys.x0 && d.x < sys.x1 + sp;
  const chars = page.texts.filter(t => t.y > top - 2 * sp && t.y < bottom + 2 * sp);
  const digits = glyphs.filter(g => (g.sym.k === 'finger' || g.sym.k === 'digit') && g.sym.v >= 1 && g.sym.v <= 5 && g.size < 0.75 * headSize)
    .map(g => ({ x: g.x, x1: g.x + g.w, y: g.y - 0.35 * g.size, v: g.sym.v, size: g.size }))
    .concat(chars.filter(t => /^[1-5]$/.test(t.ch) && !t.music && !ITALIC.test(t.font) && !/bold|black|heavy/i.test(t.font) && t.size < 0.75 * headSize && t.size > 0.2 * headSize)
      .filter(t => !chars.some(o => o !== t && Math.abs(o.y - t.y) < 0.3 * t.size && o.x < t.x + t.w + 0.4 * t.size && o.x + o.w > t.x - 0.4 * t.size))
      .map(t => ({ x: t.x, x1: t.x + t.w, y: t.y - 0.35 * t.size, v: Number(t.ch), size: t.size })))
    .filter(d => inside(d) && !numerals.some(n => Math.abs(n.x - d.x) < 0.3 * sp && Math.abs(n.y - d.y) < sp) && !voltas.some(v => v.label && d.x >= v.label.x0 - 0.3 * sp && d.x <= v.label.x1 + 0.3 * sp && Math.abs(d.y - v.label.y) < 1.5 * sp));
  const playing = chords.filter(c => !c.grace && pianoStaves.includes(c.staff)), byChord = new Map();
  for (const d of digits) {
    const cx = (d.x + d.x1) / 2;
    let best = null, bd = Infinity;
    for (const c of playing) {
      if (Math.abs(cx - (c.x + c.w / 2)) > 0.9 * sp) continue;
      const ys = c.heads.map(h => h.y), hi = Math.min(...ys), lo = Math.max(...ys);
      if (d.y > hi - 0.4 * sp && d.y < lo + 0.4 * sp) continue;
      const dist = d.y < hi ? hi - d.y : d.y - lo;
      if (dist < bd && dist < 7 * sp) { bd = dist; best = c; }
    }
    if (best) { if (!byChord.has(best)) byChord.set(best, []); byChord.get(best).push(d); }
  }
  for (const [c, ds] of byChord) {
    const heads = c.heads.slice().sort((a, b) => a.y - b.y), hi = heads[0].y;
    const above = ds.filter(d => d.y < hi).sort((a, b) => a.y - b.y), below = ds.filter(d => d.y >= hi).sort((a, b) => a.y - b.y);
    for (const [side, list] of [['above', above], ['below', below]]) {
      if (!list.length) continue;
      if (list.length === heads.length) list.forEach((d, i) => { heads[i].finger = d.v; });
      else if (list.length === 1) (side === 'above' ? heads[0] : heads[heads.length - 1]).finger = list[0].v;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 7 · Rhythm of one measure. Each chord or rest gets its written value; voices are separated by
// stem direction where two events share a column; onsets come from the columns: engravers align
// everything sounding together at the same x, so each voice's running total fixes the time of
// the columns it passes through, and the voices check one another.
// ---------------------------------------------------------------------------------------------
function written(e) {
  let q;
  if (e.kind === 'rest') q = e.v <= 2 ? 2 ** (2 - e.v) : 1 / 2 ** (e.v - 2);
  else q = e.v === -1 ? 8 : e.v === 0 ? 4 : e.v === 1 ? 2 : 1 / 2 ** e.flags;
  e.q = q; e.type = typeName(q);
  return Math.round(TICKS * q * (2 - 1 / 2 ** (e.dots || 0)));
}
const tupletNormal = (n, compound) => n === 2 ? 3 : n === 4 && compound ? 3 : 2 ** Math.floor(Math.log2(n - 0.5));

function timeMeasure(m, B, A, time, number, report) {
  const sp = B.sp, L = Math.round(TICKS * 4 * time.beats / time.beatType), compound = time.beatType >= 8 && time.beats % 3 === 0 && time.beats > 3;
  const evs = m.evs.slice().sort((a, b) => a.x - b.x);
  const meanY = e => e.kind === 'rest' ? e.y : e.heads.reduce((s, h) => s + h.y, 0) / e.heads.length;
  for (const e of evs) { e.dur = written(e); e.tuplet = null; e.measureRest = false; }
  // A whole (or breve) rest standing alone on its staff, or centred in the bar, fills the measure;
  // it is centred rather than aligned, so it takes no part in the columns.
  for (const e of evs) if (e.kind === 'rest' && e.v <= 0) {
    const alone = !evs.some(o => o !== e && o.staff === e.staff && Math.abs(meanY(o) - e.y) < 3 * sp);
    const centred = Math.abs(e.x + (e.x1 - e.x) / 2 - (m.x0 + m.x1) / 2) < 0.2 * (m.x1 - m.x0);
    if (alone || centred) { e.dur = L; e.measureRest = true; e.t = 0; }
  }
  // Columns of simultaneous events.
  const cols = [];
  for (const e of evs) { if (e.measureRest) continue; const c = cols[cols.length - 1]; if (c && e.x - c.x < 0.55 * sp) { c.items.push(e); e.col = cols.length - 1; } else { cols.push({ x: e.x, items: [e] }); e.col = cols.length - 1; } }
  // Tuplets: scale the notes under each numeral.
  const sameSide = (e, t) => e.kind !== 'chord' || e.up === null || e.up === (t.y < meanY(e));
  for (const t of A.tuplets) {
    let group;
    if (t.members) {
      const xs = t.members.filter(c => evs.includes(c)).map(c => c.x);
      if (!xs.length) continue;
      const up = t.members[0].up;
      const staves = new Set(t.members.map(c => c.staff));
      group = evs.filter(e => staves.has(e.staff) && e.x >= Math.min(...xs) - 0.1 && e.x <= Math.max(...xs) + 0.1 && (t.members.includes(e) || (e.staff === t.st && (e.kind === 'rest' || e.up === up))));
      // a rest beside the beam can belong to the tuplet (a triplet starting with a rest)
      while (group.length < t.n) {
        const side = evs.filter(e => e.staff === t.st && !group.includes(e) && !e.measureRest && (e.kind === 'rest' || !e.beams?.length)).sort((a, b) => Math.abs(a.x - t.cx) - Math.abs(b.x - t.cx))[0];
        const lo = Math.min(...group.map(e => e.x)), hi = Math.max(...group.map(e => e.x)), gap = 4 * sp;
        if (!side || side.x < lo - gap || side.x > hi + gap || evs.some(e => e.staff === t.st && !group.includes(e) && e !== side && e.x > Math.min(side.x, lo) && e.x < Math.max(side.x, hi) && e.up === up)) break;
        group.push(side); group.sort((a, b) => a.x - b.x);
      }
    } else if (t.x0 != null) {
      group = evs.filter(e => e.staff === t.st && e.x >= t.x0 && e.x <= t.x1);
      if (group.some(e => sameSide(e, t)) && group.some(e => !sameSide(e, t))) group = group.filter(e => sameSide(e, t));
    } else {
      if (!evs.includes(t.near)) continue;
      group = evs.filter(e => e.staff === t.st && (e.kind === 'rest' || e.up === t.near.up)).sort((a, b) => Math.abs(a.x - t.cx) - Math.abs(b.x - t.cx)).slice(0, t.n).sort((a, b) => a.x - b.x);
    }
    group = group.filter(e => !e.tuplet && !e.measureRest);
    if (!group.length) continue;
    const normal = tupletNormal(t.n, compound);
    for (const e of group) { e.dur = Math.round(e.dur * normal / t.n); e.tuplet = { actual: t.n, normal }; }
    group[0].tuplet.start = true; group[group.length - 1].tuplet.stop = true;
  }
  // Onsets. Engravers align everything sounding together at one x, and each voice runs on without
  // gaps, so the next column sounds when some voice on the page ends: of the times at which voices
  // end, the one that the column's events continue is its time.
  const solve = () => {
    const T = new Array(cols.length).fill(null), voices = [];
    let guessed = false;
    for (let k = 0; k < cols.length; k++) {
      if (k === 0) T[0] = 0;
      else {
        // (a voice pushed slightly right by a collision can start a column at the previous time)
        const prev = T[k - 1], ends = [...new Set(voices.map(v => v.end).filter(t => t >= prev))].sort((a, b) => a - b);
        let best = null, score = 0;
        for (const t of ends) {
          if (t === prev && cols[k].x - cols[k - 1].x > 1.8 * sp) continue;
          const s = cols[k].items.filter(e => voices.some(v => v.st === e.staff && v.end === t && !(t === prev && v.evs[v.evs.length - 1].col === k - 1))).length;
          if (s > score) { best = t; score = s; }
        }
        if (best === null && ends.some(t => t > prev)) best = ends.find(t => t > prev);
        if (best === null) {
          // nothing ends after the previous column: place it by its distance along the bar
          const x0 = cols[k - 1].x, rest = Math.max(1, L - prev);
          best = prev + Math.max(TICKS / 4, Math.round(rest * (cols[k].x - x0) / Math.max(1e-6, m.x1 - x0) / (TICKS / 4)) * (TICKS / 4));
          guessed = true;
        }
        T[k] = best;
      }
      const used = new Set();
      for (const e of cols[k].items.slice().sort((a, b) => meanY(a) - meanY(b))) {
        const cands = voices.filter(v => v.st === e.staff && v.end === T[k] && !used.has(v));
        let v = null, bd = Infinity;
        for (const c of cands) {
          const d = Math.abs(c.y - meanY(e)) + (e.kind === 'chord' && c.up !== null && e.up !== null && c.up !== e.up ? 6 * sp : 0);
          if (d < bd) { bd = d; v = c; }
        }
        if (!v) { v = { st: e.staff, start: T[k], end: T[k], evs: [] }; voices.push(v); }
        used.add(v); v.evs.push(e); e.t = T[k]; v.end = T[k] + e.dur; v.y = meanY(e); if (e.kind === 'chord' && e.up !== null) v.up = e.up; else if (v.up === undefined) v.up = null;
      }
    }
    for (const e of evs) if (e.measureRest) voices.push({ st: e.staff, start: 0, end: L, evs: [e], y: e.y, up: null });
    const end = Math.max(0, ...voices.map(v => v.end));
    return { T, voices, end, guessed };
  };
  let res = solve();
  // Triplets printed without their number ("simile"): a voice that runs past the bar.
  if (res.end > L) {
    let changed = false;
    const saved = evs.map(e => [e, e.dur, e.tuplet]);
    for (const v of res.voices) {
      const total = v.evs.reduce((s, e) => s + e.dur, 0);
      if (v.end <= L) continue;
      if (!v.evs.some(e => e.tuplet) && v.evs.length >= 3 && total * 2 === L * 3) {
        for (const e of v.evs) { e.dur = Math.round(e.dur * 2 / 3); e.tuplet = { actual: 3, normal: 2, implied: true }; }
        changed = true; continue;
      }
      const groups = new Map();
      for (const e of v.evs) if (e.kind === 'chord' && !e.tuplet && e.beams?.length) { const key = e.beams.reduce((a, b) => (b.x1 - b.x0) > (a.x1 - a.x0) ? b : a); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e); }
      for (const g of groups.values()) {
        const n = g.length;
        if ((n === 3 || n === 6) && g.every(e => e.dur === g[0].dur)) {
          for (const e of g) { e.dur = Math.round(e.dur * 2 / 3); e.tuplet = { actual: 3, normal: 2, implied: true }; }
          changed = true;
        }
      }
    }
    const again = changed && solve();
    if (again && (again.end <= L || again.end < res.end)) res = again;
    else if (again) { for (const [e, d, t] of saved) { e.dur = d; e.tuplet = t; } res = solve(); }
  }
  const { voices } = res;
  if (res.guessed) report.flag(number, 'some notes could not be placed in time exactly');
  // Voices of one staff that never overlap share a lane (a voice that pauses and resumes).
  const lanes = [];
  for (const st of B.pianoStaves) {
    const mine = voices.filter(v => v.st === st).sort((a, b) => a.start - b.start || a.y - b.y), ls = [];
    for (const v of mine) {
      let lane = ls.filter(l => l.end <= v.start).sort((a, b) => Math.abs(a.y - v.y) - Math.abs(b.y - v.y))[0];
      if (!lane) { lane = { st, evs: [], end: 0, y: v.y }; ls.push(lane); }
      lane.evs.push(...v.evs); lane.end = v.end; lane.y = v.y;
    }
    ls.sort((a, b) => a.evs.reduce((s, e) => s + meanY(e), 0) / a.evs.length - b.evs.reduce((s, e) => s + meanY(e), 0) / b.evs.length);
    if (ls.length > 2) report.flag(number, 'the voices of one staff could not be told apart with certainty');
    lanes.push(...ls.slice(0, 4));
  }
  // Clip anything that runs past the bar.
  let end = 0, gaps = 0, clipped = false;
  for (const v of lanes) {
    v.evs = v.evs.filter(e => e.t < L);
    for (const e of v.evs) if (e.t + e.dur > L) { report.flag(number, 'the rhythm adds up to more than the time signature, so the end was shortened'); e.dur = L - e.t; clipped = true; }
    let at = 0; for (const e of v.evs) { if (e.t > at) gaps += e.t - at; at = e.t + e.dur; }
    const last = v.evs[v.evs.length - 1]; if (last) end = Math.max(end, last.t + last.dur);
  }
  const staffEnd = new Map();
  for (const v of lanes) { const last = v.evs[v.evs.length - 1]; if (last) staffEnd.set(v.st, Math.max(staffEnd.get(v.st) || 0, last.t + last.dur)); }
  for (const [, e] of staffEnd) if (e < L) gaps += L - e;
  return { voices: lanes.filter(v => v.evs.length), L, length: end, staffEnd, gaps, clipped };
}

// ---------------------------------------------------------------------------------------------
// 8 · The whole score: systems in reading order, signatures carried from system to system.
// ---------------------------------------------------------------------------------------------
function makeReport() {
  const flagged = new Map(), warnings = new Set();
  return {
    flag(measure, why) { if (measure == null) return; if (!flagged.has(measure)) flagged.set(measure, new Set()); flagged.get(measure).add(why); },
    warn(_, text) { warnings.add(text); },
    result() { return { flagged: [...flagged].map(([measure, why]) => ({ measure, why: [...why] })).sort((a, b) => a.measure - b.measure), warnings: [...warnings] }; },
  };
}

function textLines(texts) {
  const rows = [];
  for (const t of [...texts].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const r = rows.find(r => Math.abs(r.y - t.y) < 0.3 * t.size && Math.abs(r.size - t.size) < 0.25 * t.size && t.x - r.x1 < 2 * t.size && t.x >= r.x0 - 0.5);
    if (r) { r.text += (t.x - r.x1 > 0.2 * t.size ? ' ' : '') + t.ch; r.x1 = t.x + t.w; }
    else rows.push({ y: t.y, x0: t.x, x1: t.x + t.w, size: t.size, text: t.ch });
  }
  return rows.map(r => ({ ...r, text: r.text.replace(/\s+/g, ' ').trim() })).filter(r => r.text);
}

function pianoStavesOf(sys, page) {
  const n = sys.staves.length;
  if (n <= 2) return sys.staves;
  // Barlines drawn through every staff mean one instrument on three or more staves.
  const first = sys.staves[0], last = sys.staves[n - 1], sp = first.sp;
  // (some engravers draw a barline in pieces, staff by staff, so collinear pieces are joined first)
  const pieces = page.vsegs.filter(v => v.x > sys.x0 + 3 * sp && v.x < sys.x1 + sp && v.y1 > first.top - sp && v.y0 < last.bottom + sp).sort((a, b) => a.x - b.x || a.y0 - b.y0);
  for (let i = 0; i < pieces.length; i++) {
    let y0 = pieces[i].y0, y1 = pieces[i].y1;
    for (const q of pieces.filter(q => Math.abs(q.x - pieces[i].x) < 0.3 * sp).sort((a, b) => a.y0 - b.y0)) if (q.y0 <= y1 + 0.5 * sp) { y0 = Math.min(y0, q.y0); y1 = Math.max(y1, q.y1); }
    if (y0 < first.top + 0.3 * sp && y1 > last.bottom - 0.3 * sp) { sys.manyStaves = true; return sys.staves.slice(-2); }
  }
  // Several instruments: the piano is the pair joined by a brace (or the lowest two staves).
  for (const b of sys.braced) {
    const covered = sys.staves.filter(st => st.top >= b.y - (b.size || 0) - st.sp && st.bottom <= b.y + st.sp);
    if (covered.length === 2) return covered;
    if (covered.length > 2) { sys.manyStaves = true; return covered.slice(-2); }
  }
  return sys.staves.slice(-2);
}

function recognize(pages) {
  const report = makeReport();
  const state = { clefs: new Map(), fifths: 0, time: null, openTies: [] };
  const measures = []; let staffCount = 0, systemsRead = 0, anyTime = false, otherStaves = false, manyStaves = false;
  for (const page of pages) {
    const staves = findStaves(page);
    page.staves = staves;
    if (!staves.length) continue;
    for (const sys of groupSystems(page, staves)) {
      const piano = pianoStavesOf(sys, page);
      if (sys.manyStaves) manyStaves = true;
      else if (sys.staves.length > piano.length) otherStaves = true;
      staffCount = Math.max(staffCount, piano.length); systemsRead++;
      const B = buildSystem(page, sys, piano);
      const A = analyseSystem(page, B, state, report);
      // grace notes go before the next chord on their staff
      for (const g of A.graces.sort((a, b) => a.x - b.x)) {
        const next = B.chords.filter(c => !c.grace && c.staff === g.staff && c.x > g.x).sort((a, b) => a.x - b.x)[0];
        if (next) (next.graces ||= []).push(g);
      }
      const pendingVolta = state.openVolta;
      const voltas = findVoltas(page, B, state);
      readFingering(page, B, A.numerals, voltas);
      if (pendingVolta && !voltas.some(v => v.continued) && measures.length) { const prev = measures[measures.length - 1]; prev.endingStop = { number: pendingVolta, type: 'discontinue' }; }
      state.openVolta = null;
      for (const v of voltas) {
        const under = A.measures.filter(m => { const a = m.evs.length ? Math.max(m.x0, Math.min(...m.evs.map(e => e.x)) - B.sp) : m.x0; return Math.min(m.x1, v.x1) - Math.max(a, v.x0) > 0.5 * (m.x1 - a); });
        if (!under.length) continue;
        if (!v.continued) under[0].endingStart = v.number;
        if (v.open) state.openVolta = v.number;
        else under[under.length - 1].endingStop = { number: v.number, type: v.closed ? 'stop' : 'discontinue' };
      }
      if (!voltas.length && pendingVolta) state.openVolta = null;
      A.measures.forEach((m, mi) => {
        const number = measures.length + 1, attrs = {}, clefChanges = [];
        for (const [si, st] of piano.entries()) {
          const firstEv = Math.min(Infinity, ...m.evs.filter(e => e.staff === st).map(e => e.x));
          for (const s of A.sigs.get(st)) {
            const inside = s.x >= m.x0 - (mi ? 0 : 1e9) && s.x < m.x1;
            if (!inside) continue;
            const atStart = s.x < firstEv;
            if (s.kind === 'clef') {
              const prev = state.clefs.get(si);
              if (atStart) { if (!prev || prev.sign !== s.clef.sign || prev.step !== s.clef.step || prev.octave !== s.clef.octave) (attrs.clefs ||= []).push([si + 1, s.clef]); }
              else clefChanges.push({ staff: si + 1, x: s.x, clef: s.clef });
              state.clefs.set(si, s.clef);
            } else if (s.kind === 'key' && si === 0) { if (s.fifths !== state.fifths || !measures.length) attrs.fifths = s.fifths; state.fifths = s.fifths; state.keyExtra = s.extra; }
            else if (s.kind === 'time' && (si === 0 || !A.sigs.get(piano[0]).some(o => o.kind === 'time' && o.x >= m.x0 && o.x < m.x1))) {
              if (!state.time || state.time.beats !== s.beats || state.time.beatType !== s.beatType) attrs.time = { beats: s.beats, beatType: s.beatType, symbol: s.symbol };
              state.time = { beats: s.beats, beatType: s.beatType }; anyTime = true;
            }
          }
        }
        // Without a printed time signature each measure lasts as long as its notes (free time).
        const free = !state.time;
        if (!measures.length) {
          attrs.fifths = state.fifths; if (!free) attrs.time = attrs.time || { ...state.time };
          for (const [si] of piano.entries()) if (!(attrs.clefs || []).some(c => c[0] === si + 1)) (attrs.clefs ||= []).push([si + 1, state.clefs.get(si) || { sign: si ? 'F' : 'G', step: si ? 6 : 2, octave: 0 }]);
        }
        if (m.offKeyboard) report.flag(number, 'a note fell outside the piano keyboard and was left out');
        const time = state.time || { beats: 4096, beatType: 4 };
        let timing = timeMeasure(m, B, A, time, number, report);
        // Small notes are grace notes unless the bar needs them: an arranger's small notes
        // (a written-out ornament, an optional part) take time like any other.
        const smalls = A.graces.filter(g => !g.slash && g.x > m.x0 && g.x < m.x1);
        if (smalls.length && timing.gaps > 0) {
          const quiet = makeReport(), trial = timeMeasure({ ...m, evs: m.evs.concat(smalls) }, B, A, time, number, quiet);
          if (!trial.clipped && trial.gaps < timing.gaps) { for (const g of smalls) { g.grace = false; for (const c of B.chords) if (c.graces) c.graces = c.graces.filter(o => o !== g); } timing = trial; }
          else timing = timeMeasure(m, B, A, time, number, makeReport());
        }
        if (free) {
          let len = 0;
          for (const v of timing.voices) for (const e of v.evs) if (!e.measureRest) len = Math.max(len, e.t + e.dur);
          timing.L = timing.length = Math.max(len, TICKS);
          for (const v of timing.voices) for (const e of v.evs) if (e.measureRest) e.dur = timing.L;
        }
        measures.push({ number, attrs, clefChanges, ...timing, free, piano, left: m.left, right: m.right, endingStart: m.endingStart, endingStop: m.endingStop, time: state.time && { ...state.time } });
      });
      // ties left open at the end of the system continue on the next one
      state.openTies = [];
      for (const [si, st] of piano.entries()) {
        const last = B.chords.filter(c => c.staff === st && !c.grace).sort((a, b) => b.x - a.x)[0];
        if (last) for (const h of last.heads) if (h.tieStart && h.pitch) state.openTies.push({ staff: si, D: h.pitch.D, alter: h.pitch.alter });
      }
    }
  }
  if (!measures.length) return null;
  if (state.openVolta && !measures[measures.length - 1].endingStop) measures[measures.length - 1].endingStop = { number: state.openVolta, type: 'discontinue' };
  if (!anyTime) report.warn(null, 'No time signature is printed, so each measure lasts as long as its notes.');
  if (pages.some(p => textLines(p.texts.filter(t => !t.music)).some(l => /\b(D\.\s?[CS]\.|da capo|dal segno|to coda|al fine)\b/i.test(l.text)) || p.glyphs.some(g => g.sym.k === 'segno' || g.sym.k === 'coda')))
    report.warn(null, 'This score jumps back with D.C., D.S. or a coda. Practice plays it once as printed; write the jump out in a notation editor to practice it in order.');
  if (otherStaves) report.warn(null, 'This score has other instruments too; only the piano staves were read.');
  if (pages.some(p => p.glyphs.some(g => g.sym.k === 'ornament')))
    report.warn(null, 'This score has ornaments (trills, mordents, turns) or tremolos. They are read as the plain written notes; write them out in a notation editor if practice should include them.');
  if (manyStaves) report.warn(null, 'The piano part is written on three or more staves; only the lowest two were read, so the top staff is missing.');
  // the first measure is a pickup if it is short
  const first = measures[0];
  if (measures.length > 1 && first.length > 0 && first.length < first.L) first.pickup = true;
  return { measures, staves: staffCount, systems: systemsRead, report };
}

// ---------------------------------------------------------------------------------------------
// 9 · MusicXML
// ---------------------------------------------------------------------------------------------
const esc = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const ACC = { 2: 'double-sharp', 1: 'sharp', 0: 'natural', '-1': 'flat', '-2': 'flat-flat' };

function beamTags(prev, e, next) {
  if (!e.beams || !e.beams.length) return '';
  const shared = o => o && o.beams ? e.beams.filter(b => o.beams.includes(b)).length : 0, sp = shared(prev), sn = shared(next);
  let out = '';
  for (let k = 1; k <= Math.min(e.flags, 6); k++) {
    const p = sp >= k, n = sn >= k;
    const v = p && n ? 'continue' : p ? 'end' : n ? 'begin' : k === 1 ? null : (sn ? 'forward hook' : 'backward hook');
    if (v) out += `<beam number="${k}">${v}</beam>`;
  }
  return out;
}

function noteXML(e, h, first, voice, staff, div, chordTag, extra) {
  const p = h.pitch, ties = (h.tieStop ? '<tie type="stop"/>' : '') + (h.tieStart ? '<tie type="start"/>' : '');
  const tm = e.tuplet ? `<time-modification><actual-notes>${e.tuplet.actual}</actual-notes><normal-notes>${e.tuplet.normal}</normal-notes></time-modification>` : '';
  const notations = (h.tieStop ? '<tied type="stop"/>' : '') + (h.tieStart ? '<tied type="start"/>' : '') +
    (first && e.tuplet?.start ? `<tuplet type="start" bracket="${e.tuplet.implied ? 'no' : 'yes'}"${e.tuplet.implied ? ' show-number="none"' : ''}/>` : '') + (first && e.tuplet?.stop ? '<tuplet type="stop"/>' : '') +
    (h.finger ? `<technical><fingering>${h.finger}</fingering></technical>` : '');
  return `<note>${extra || ''}${chordTag ? '<chord/>' : ''}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch>` +
    (extra ? '' : `<duration>${e.dur / div}</duration>`) + ties + `<voice>${voice}</voice><type>${e.type}</type>` + '<dot/>'.repeat(e.dots || 0) +
    (p.shown != null ? `<accidental>${ACC[p.shown]}</accidental>` : '') + tm + (e.stem ? `<stem>${e.up ? 'up' : 'down'}</stem>` : '') + `<staff>${staff}</staff>` +
    (first ? (e.beamXML || '') : '') + (notations ? `<notations>${notations}</notations>` : '') + '</note>';
}

function toMusicXML(score, meta) {
  const ms = score.measures, warn = meta.warn || (() => {});
  // Voice numbers: staff 1 uses 1–4, staff 2 uses 5–8, upper voices first.
  for (const m of ms) {
    const counts = {};
    for (const v of m.voices.slice().sort((p, q) => m.piano.indexOf(p.st) - m.piano.indexOf(q.st))) {
      const staff = m.piano.indexOf(v.st) + 1; counts[staff] = (counts[staff] || 0) + 1; v.staffNo = staff; v.voiceNo = (staff - 1) * 4 + counts[staff];
    }
  }
  // A note tied over the barline keeps its voice number in the next measure (a tie joins one voice).
  for (let mi = 1; mi < ms.length; mi++) {
    const prev = ms[mi - 1], m = ms[mi], prevEnd = prev.pickup || prev.free ? prev.length : prev.L;
    for (const v of m.voices) {
      const first = v.evs[0];
      if (!first || first.t !== 0 || first.kind !== 'chord') continue;
      const stop = first.heads.find(h => h.tieStop); if (!stop) continue;
      const from = prev.voices.find(p => p.staffNo === v.staffNo && p.evs.some(e => e.kind === 'chord' && e.t + e.dur === prevEnd && e.heads.some(h => h.tieStart && h.midi === stop.midi)));
      if (!from || from.voiceNo === v.voiceNo) continue;
      const other = m.voices.find(o => o !== v && o.voiceNo === from.voiceNo);
      if (other) other.voiceNo = v.voiceNo;
      v.voiceNo = from.voiceNo;
    }
  }
  // A repeat with a third (or later) ending is played that many times.
  { const nums = t => String(t).split(',').flatMap(part => { const [a, b] = part.split('-').map(Number); return b ? Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k) : [a]; }).filter(Boolean);
    let group = [];
    const close = () => { const max = Math.max(0, ...group.flatMap(m => m.endingStart ? nums(m.endingStart) : [])); if (max > 2) for (const m of group) if (m.right?.backward) m.repeatTimes = max; group = []; };
    for (let mi = 0; mi < ms.length; mi++) {
      const m = ms[mi], inside = group.length && !group[group.length - 1].endingStop;
      if (m.endingStart || inside) group.push(m);
      else if (group.length && !(ms[mi - 1]?.endingStop && m.endingStart)) close();
      if (m.endingStop && !ms[mi + 1]?.endingStart) close();
    }
    close();
  }
  // A tie joins two notes of the same voice and pitch that follow without a gap; others are dropped,
  // as are ties across a repeat or into an ending (in playing order they would not meet every time).
  { const open = new Map(); let clock = 0;
    for (const [mi, m] of ms.entries()) {
      const prev = ms[mi - 1];
      if (prev && (prev.right?.backward || prev.endingStop || m.left?.forward || m.endingStart)) open.clear();
      const items = m.voices.flatMap(v => v.evs.filter(e => e.kind === 'chord').map(e => ({ e, v }))).sort((a, b) => a.e.t - b.e.t);
      for (const { e, v } of items) for (const h of e.heads) {
        const key = v.staffNo + ':' + v.voiceNo + ':' + h.midi, at = clock + e.t;
        h.tieOK = false;
        if (h.tieStop) { const o = open.get(key); if (o && o.end === at) o.h.tieOK = true; else h.tieStop = false; open.delete(key); }
        if (h.tieStart) open.set(key, { h, end: at + e.dur });
      }
      clock += m.pickup || m.free ? m.length : m.L;
    }
    for (const m of ms) for (const v of m.voices) for (const e of v.evs) if (e.kind === 'chord') for (const h of e.heads) if (h.tieStart && !h.tieOK) h.tieStart = false;
  }
  let g = TICKS;
  for (const m of ms) { g = gcd(g, m.L); for (const v of m.voices) for (const e of v.evs) { g = gcd(g, e.t); g = gcd(g, e.dur); } }
  const div = g || TICKS, divisions = TICKS / div;
  const clefXML = (n, c) => `<clef${score.staves > 1 ? ` number="${n}"` : ''}><sign>${c.sign}</sign><line>${c.step / 2 + 1}</line>${c.octave ? `<clef-octave-change>${c.octave}</clef-octave-change>` : ''}</clef>`;
  const parts = [];
  for (const [mi, m] of ms.entries()) {
    let x = `<measure number="${m.pickup ? 0 : m.number - (ms[0].pickup ? 1 : 0)}"${m.pickup || m.free ? ' implicit="yes"' : ''}>`;
    if (m.left?.forward || m.endingStart) x += '<barline location="left">' +
      (m.endingStart ? `<ending number="${esc(m.endingStart)}" type="start"/>` : '') + (m.left?.forward ? '<repeat direction="forward"/>' : '') + '</barline>';
    const a = m.attrs;
    if (Object.keys(a).length || !mi) {
      x += '<attributes>' + (!mi ? `<divisions>${divisions}</divisions>` : '') + (a.fifths != null ? `<key><fifths>${a.fifths}</fifths></key>` : '') +
        (a.time ? `<time${a.time.symbol ? ` symbol="${a.time.symbol}"` : ''}><beats>${a.time.beats}</beats><beat-type>${a.time.beatType}</beat-type></time>` : '') +
        (!mi && score.staves > 1 ? `<staves>${score.staves}</staves>` : '') + (a.clefs || []).sort((p, q) => p[0] - q[0]).map(([n, c]) => clefXML(n, c)).join('') + '</attributes>';
    }
    const voices = m.voices.map(v => ({ ...v, staff: v.staffNo })).sort((p, q) => p.voiceNo - q.voiceNo);
    let cursor = 0;
    voices.forEach((v, vi) => {
      const voice = v.voiceNo;
      if (vi) { if (cursor) x += `<backup><duration>${cursor / div}</duration></backup>`; cursor = 0; }
      const pending = voice % 4 === 1 ? m.clefChanges.filter(c => c.staff === v.staff) : [];
      v.evs.forEach((e, i) => {
        if (e.t > cursor) { x += `<forward><duration>${(e.t - cursor) / div}</duration><voice>${voice}</voice><staff>${v.staff}</staff></forward>`; cursor = e.t; }
        while (pending.length && pending[0].x < e.x) { const c = pending.shift(); x += `<attributes>${clefXML(c.staff, c.clef)}</attributes>`; }
        if (e.kind === 'rest') {
          const tm = e.tuplet ? `<time-modification><actual-notes>${e.tuplet.actual}</actual-notes><normal-notes>${e.tuplet.normal}</normal-notes></time-modification>` : '';
          x += `<note><rest${e.measureRest ? ' measure="yes"' : ''}/><duration>${e.dur / div}</duration><voice>${voice}</voice>${e.measureRest ? '' : `<type>${e.type}</type>${'<dot/>'.repeat(e.dots || 0)}`}${tm}<staff>${v.staff}</staff></note>`;
        } else {
          // Grace notes play as one quick note each before the main note (the practice engine takes
          // single grace notes, so a grace chord keeps its top note; none before a tied note).
          const graces = (e.graces || []).filter(g => g.grace !== false);
          if (graces.length && e.heads.some(h => h.tieStop)) warn('Grace notes before a tied note were left out.');
          else if (graces.length && e.dur <= TICKS * 0.04 * graces.length * 1.5) warn('Grace notes before very short notes were left out.');
          else for (const gc of graces) {
            gc.dur = 0; gc.type = typeName(gc.v === 2 ? 1 / 2 ** Math.max(1, gc.flags) : gc.v === 1 ? 2 : 4); gc.dots = 0; gc.tuplet = null;
            const top = gc.heads.slice().sort((p, q) => q.midi - p.midi)[0], hh = { ...top, tieStart: false, tieStop: false };
            if (gc.heads.length > 1) warn('Grace-note chords keep only their top note.');
            x += noteXML(gc, hh, true, voice, v.staff, div, false, `<grace${gc.slash ? ' slash="yes"' : ''}/>`);
          }
          e.beamXML = beamTags(v.evs[i - 1], e, v.evs[i + 1]);
          e.heads.slice().sort((p, q) => p.midi - q.midi).forEach((h, k) => { x += noteXML(e, h, k === 0, voice, v.staff, div, k > 0); });
        }
        cursor = e.t + e.dur;
      });
      // a clef change after the last note (before the barline) applies from here on
      for (const c of pending) x += `<attributes>${clefXML(c.staff, c.clef)}</attributes>`;
    });
    if (!voices.length) { x += `<note><rest measure="yes"/><duration>${m.L / div}</duration><voice>1</voice><staff>1</staff></note>`; }
    const last = mi === ms.length - 1;
    const style = m.right?.backward || last || (m.right?.thick && m.right?.double) ? 'light-heavy' : m.right?.double ? 'light-light' : null;
    if (style || m.endingStop) x += '<barline location="right">' + (style ? `<bar-style>${style}</bar-style>` : '') +
      (m.endingStop ? `<ending number="${esc(m.endingStop.number)}" type="${m.endingStop.type}"/>` : '') + (m.right?.backward ? `<repeat direction="backward"${m.repeatTimes ? ` times="${m.repeatTimes}"` : ''}/>` : '') + '</barline>';
    parts.push(x + '</measure>');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">' +
    (meta.title ? `<work><work-title>${esc(meta.title)}</work-title></work>` : '') +
    `<identification>${meta.composer ? `<creator type="composer">${esc(meta.composer)}</creator>` : ''}<encoding><software>OpenPiano PDF reader</software></encoding></identification>` +
    '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">' + parts.join('') + '</part></score-partwise>';
}

function titleOf(page) {
  if (!page) return {};
  const lines = textLines(page.texts.filter(t => t.y < page.height * 0.3 && !t.music)).filter(l => /\p{L}.*\p{L}/u.test(l.text));
  if (!lines.length) return {};
  const big = lines.slice().sort((a, b) => b.size - a.size)[0];
  const title = big.size >= 1.3 * median(lines.map(l => l.size)) || lines.length < 3 ? big.text : null;
  const composer = lines.filter(l => l !== big && l.x1 > page.width * 0.6 && l.x0 > page.width * 0.45 && !/^\d+$/.test(l.text) && l.y > big.y - big.size).sort((a, b) => a.y - b.y)[0]?.text;
  return { title, composer };
}

// ---------------------------------------------------------------------------------------------
// 10 · Entry point
// ---------------------------------------------------------------------------------------------
let pdfjsReady = null;
function loadPdfjs() {
  if (!pdfjsReady) pdfjsReady = import(PDFJS).then(m => { m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return m; })
    .catch(() => { pdfjsReady = null; throw new Error('The PDF reader could not be downloaded. Check your connection and try again.'); });
  return pdfjsReady;
}

async function convert(data, options = {}) {
  const pdfjs = options.pdfjs || await loadPdfjs(), progress = options.onProgress || (() => {});
  if (data.byteLength > MAX_BYTES) throw new Error('Choose a PDF smaller than 15 MB.');
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(data), fontExtraProperties: true, disableFontFace: true, isEvalSupported: false, verbosity: 0, ...(options.documentOptions || {}) }).promise; }
  catch (e) { throw new Error(e?.name === 'PasswordException' ? 'This PDF is password-protected. Save an unprotected copy and try again.' : 'This file could not be opened as a PDF.'); }
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`This PDF has ${doc.numPages} pages; the reader takes up to ${MAX_PAGES}.`);
    const pages = [], fonts = new Map();
    for (let i = 1; i <= doc.numPages; i++) {
      progress(i, doc.numPages);
      const page = await doc.getPage(i);
      pages.push(await extractPage(page, pdfjs.OPS, fonts));
      page.cleanup();
    }
    const music = pages.reduce((n, p) => n + p.glyphs.filter(g => g.sym.k === 'head').length, 0);
    if (!music) {
      const err = new Error(pages.some(p => p.images) ?
        'This PDF is a scan or photo of printed music, so it holds pictures rather than notes; the picture reader (piano-scan-reader.js) reads those.' :
        'No music notation was found in this PDF. The reader needs a PDF exported from notation software (MuseScore, LilyPond, Dorico, Finale, Sibelius).');
      err.code = pages.some(p => p.images) ? 'scan' : 'none'; throw err;
    }
    let score, xml, meta;
    try {
      score = recognize(pages);
      if (!score) throw Object.assign(new Error('Staff lines were not found in this PDF, so the notes could not be placed. Try exporting the PDF again from your notation program.'), { known: true });
      // the title is on the first page with text (a cover page may be blank)
      meta = pages.slice(0, 3).map(titleOf).find(m => m.title) || {};
      xml = toMusicXML(score, { ...meta, warn: t => score.report.warn(null, t) });
    } catch (e) {
      if (e.known) throw e;
      throw new Error('This PDF has a layout the reader could not follow. Export MusicXML from the program that made it, or try a scanner.');
    }
    const notes = score.measures.reduce((n, m) => n + m.voices.reduce((k, v) => k + v.evs.filter(e => e.kind === 'chord').reduce((s, e) => s + e.heads.length, 0), 0), 0);
    const result = score.report.result(), shift = score.measures[0]?.pickup ? 1 : 0;
    result.flagged = result.flagged.map(f => ({ ...f, measure: f.measure - shift }));
    return { xml, title: meta.title || null, composer: meta.composer || null, pages: pages.length, systems: score.systems, measures: score.measures.length, staves: score.staves, notes, ...result };
  } finally { doc.destroy?.(); }
}

window.PianoPdfReader = { symbolFromName, findVoltas, convert, extractPage, recognize, toMusicXML, sfntGlyphNames, findStaves, groupSystems, buildSystem, analyseSystem, loadPdfjs, TICKS };
})();
