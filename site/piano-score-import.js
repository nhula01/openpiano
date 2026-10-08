'use strict';
// Turns a MusicXML (.musicxml/.xml/.mxl) or MIDI file that a person adds to their own
// library into practice data for the player. Runs entirely in the browser.
// MusicXML follows the same rules as scripts/build-musicxml-library.py: timing from the
// MusicXML durations, every attack tied to its printed notehead through its note id,
// hidden playback-only notes left out, tied notes sounding once, hands from the staff.
// Repeats and numbered endings are written out first with PianoImportEngine (piano-import-engine.js)
// so practice follows the performed order; scores it can't unfold are kept as written.
(() => {
const VEROVIO = 'https://cdn.jsdelivr.net/npm/verovio@6.3.0/dist/verovio-toolkit-wasm.js';
const OPTIONS = { pageHeight: 2970, pageWidth: 2100, pageMarginLeft: 100, pageMarginRight: 100, adjustPageHeight: false,
  svgHtml5: true, footer: 'none', header: 'auto', breaks: 'auto', scale: 100, spacingSystem: 14 };
const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SVGNS = 'http://www.w3.org/2000/svg';

let toolkitReady = null;
function loadVerovio() {
  if (toolkitReady) return toolkitReady;
  toolkitReady = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = VEROVIO; s.async = true;
    s.onload = () => { const m = window.verovio.module; if (m.calledRun) resolve(); else m.onRuntimeInitialized = () => resolve(); };
    s.onerror = () => { toolkitReady = null; reject(new Error('The music engraver could not be downloaded. Check your connection and try again.')); };
    document.head.append(s);
  });
  return toolkitReady;
}

// ---- Minimal zip reader for .mxl (stored or deflated entries) ----
const MAX_XML = 8_000_000;
async function inflate(raw, limit) {
  const reader = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(), chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > limit) { reader.cancel(); throw new Error('This .mxl file is too large once unpacked (8 MB limit).'); }
    chunks.push(value);
  }
  const out = new Uint8Array(size); let at = 0; for (const c of chunks) { out.set(c, at); at += c.length; } return out;
}
async function unzip(buffer) {
  const view = new DataView(buffer), files = {};
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('This .mxl file is not a valid compressed MusicXML file.');
  let p = view.getUint32(eocd + 16, true); const count = view.getUint16(eocd + 10, true);
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(p + 10, true), size = view.getUint32(p + 20, true), full = view.getUint32(p + 24, true), nameLen = view.getUint16(p + 28, true),
      extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true), local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, p + 46, nameLen));
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = new Uint8Array(buffer, dataStart, size);
    files[name] = async () => {
      if (full > MAX_XML || (method === 0 && size > MAX_XML)) throw new Error('This .mxl file is too large once unpacked (8 MB limit).');
      if (method === 0) return raw;
      if (method !== 8) throw new Error('Unsupported compression in this .mxl file.');
      return inflate(raw, MAX_XML);
    };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function readMusicXML(file) {
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer, 0, 2);
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const files = await unzip(buffer);
    const container = files['META-INF/container.xml'];
    let path = null;
    if (container) {
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(await container()), 'application/xml');
      path = doc.querySelector('rootfile')?.getAttribute('full-path');
    }
    path = path || Object.keys(files).find(n => /\.(xml|musicxml)$/i.test(n) && !n.startsWith('META-INF'));
    if (!path || !files[path]) throw new Error('No MusicXML score was found inside this .mxl file.');
    return new TextDecoder().decode(await files[path]());
  }
  return new TextDecoder().decode(buffer);
}

const kids = (el, tag) => [...el.children].filter(c => c.tagName === tag);
const kid = (el, tag) => kids(el, tag)[0] || null;
const text = (el, tag) => kid(el, tag)?.textContent ?? null;

function clean(doc, title) {
  const root = doc.documentElement; let hidden = 0, metronomes = 0;
  if (root.tagName !== 'score-partwise') throw new Error('Only part-wise MusicXML is supported. Export from MuseScore with File → Export → MusicXML.');
  if (kids(root, 'part').length === 2) mergeParts(doc);
  const parts = kids(root, 'part');
  if (parts.length !== 1) throw new Error('Choose a piano score with one part (two staves) or two single-staff parts.');
  for (const c of [...root.children]) if (['credit', 'movement-title', 'movement-number', 'work'].includes(c.tagName)) c.remove();
  const work = doc.createElement('work'), wt = doc.createElement('work-title'); wt.textContent = title; work.append(wt); root.prepend(work);
  for (const el of root.querySelectorAll('part-name, part-abbreviation')) el.textContent = '';
  for (const measure of root.querySelectorAll('measure')) {
    for (const d of kids(measure, 'direction')) {
      const types = kids(d, 'direction-type'), inner = types.flatMap(t => [...t.children]);
      if (d.getAttribute('print-object') === 'no' || (inner.length && inner.every(c => c.getAttribute('print-object') === 'no'))) { d.remove(); continue; }
      if (inner.some(c => c.tagName === 'metronome') && ++metronomes > 1) {
        for (const t of types) if (kid(t, 'metronome')) t.remove();
        if (!kid(d, 'direction-type')) d.remove();
      }
    }
    for (const note of kids(measure, 'note')) {
      if (note.getAttribute('print-object') !== 'no') continue;
      if (!kid(note, 'rest')) hidden++;
      if (kid(note, 'chord') || kid(note, 'grace')) { note.remove(); continue; }
      const fwd = doc.createElement('forward');
      for (const tag of ['duration', 'voice', 'staff']) if (kid(note, tag)) fwd.append(kid(note, tag).cloneNode(true));
      note.replaceWith(fwd);
    }
    const els = [...measure.children];
    els.forEach((el, k) => {
      if (el.tagName === 'forward' && !kid(el, 'voice')) {
        const next = els.slice(k + 1).find(e => e.tagName === 'note');
        if (next && kid(next, 'voice')) { el.append(kid(next, 'voice').cloneNode(true)); if (kid(next, 'staff') && !kid(el, 'staff')) el.append(kid(next, 'staff').cloneNode(true)); }
      }
    });
    let prev = null;
    for (const el of [...measure.children]) {
      if (el.tagName === 'note' && kid(el, 'chord') && (!prev || prev.tagName !== 'note')) kid(el, 'chord').remove();
      prev = el;
    }
  }
  return hidden;
}

// Two single-staff parts (right hand, left hand) become one part with two staves.
function mergeParts(doc) {
  const root = doc.documentElement, [upper, lower] = kids(root, 'part'), m1 = kids(upper, 'measure'), m2 = kids(lower, 'measure');
  const div = m => kids(m, 'attributes').map(a => text(a, 'divisions')).filter(Boolean);
  if (m1.length !== m2.length) throw new Error('The two parts have different measure counts. Export the score as one piano part.');
  const staves = parts => { for (const a of parts) if (Number(text(a, 'staves') || 1) > 1) throw new Error('Use one piano part with two staves, or two single-staff parts.'); };
  let d1 = null, d2 = null;
  m1.forEach((a, i) => {
    const b = m2[i]; staves(kids(a, 'attributes')); staves(kids(b, 'attributes'));
    d1 = div(a).at(-1) ?? d1; d2 = div(b).at(-1) ?? d2;
    if (d1 !== d2) throw new Error('The two parts use different rhythmic divisions. Export the score as one piano part.');
    let pos = 0, end = 0;
    for (const c of [...a.children]) {
      if (c.tagName === 'backup') pos -= Number(text(c, 'duration'));
      else if (c.tagName === 'forward') pos += Number(text(c, 'duration'));
      else if (c.tagName === 'note' && !kid(c, 'chord') && !kid(c, 'grace')) { pos += Number(text(c, 'duration') || 0); }
      end = Math.max(end, pos);
    }
    if (end > 0) { const back = doc.createElement('backup'), dur = doc.createElement('duration'); dur.textContent = end; back.append(dur); a.append(back); }
    for (const c of [...b.children]) {
      if (['barline', 'print'].includes(c.tagName)) continue;
      const n = c.cloneNode(true);
      if (['note', 'direction', 'forward'].includes(n.tagName)) {
        kid(n, 'staff')?.remove(); const st = doc.createElement('staff'); st.textContent = '2'; n.append(st);
        const v = kid(n, 'voice'); if (v) v.textContent = String(Number(v.textContent || 1) + 4);
      }
      if (n.tagName === 'attributes') {
        for (const x of [...n.children]) if (x.tagName !== 'clef') x.remove();
        if (!kid(n, 'clef')) continue;
        for (const clef of kids(n, 'clef')) clef.setAttribute('number', '2');
      }
      a.append(n);
    }
  });
  const first = kids(m1[0], 'attributes')[0] || m1[0].insertBefore(doc.createElement('attributes'), m1[0].firstChild);
  const st = doc.createElement('staves'); st.textContent = '2';
  const before = kids(first, 'clef')[0] || kids(first, 'staff-details')[0] || null; first.insertBefore(st, before);
  for (const clef of kids(first, 'clef')) if (!clef.getAttribute('number')) clef.setAttribute('number', '1');
  const id = lower.getAttribute('id'); lower.remove();
  root.querySelector(`part-list > score-part[id="${id}"]`)?.remove();
}

// Repeats, endings and multi-pass sections written out in performed order (see header).
function prepare(xml) {
  const E = window.PianoImportEngine; let parsed = null, problem = null;
  if (E) try { parsed = E.parse(xml); } catch (e) { problem = e.message; }
  const navigation = /<repeat\b|<ending\b|\b(?:dacapo|dalsegno|tocoda)=/.test(xml);
  return { xml: parsed ? parsed.xml.replace(/ data-import-id="\d+"/g, '') : xml, parsed, problem,
    unfolded: !!parsed && parsed.performedMeasures !== parsed.writtenMeasures, repeatsAsWritten: !parsed && navigation };
}

function timeline(doc) {
  const notes = new Map(); let start = 0, div = 1, k = 0; const open = new Map();
  for (const measure of doc.querySelectorAll('measure')) {
    const attr = kid(measure, 'attributes');
    if (attr && kid(attr, 'divisions')) div = Number(text(attr, 'divisions'));
    let pos = 0, longest = 0, lastOnset = 0, graces = [];
    for (const el of [...measure.children]) {
      if (el.tagName === 'backup') { pos -= Number(text(el, 'duration')); continue; }
      if (el.tagName === 'forward') { pos += Number(text(el, 'duration')); longest = Math.max(longest, pos); continue; }
      if (el.tagName !== 'note') continue;
      el.setAttribute('id', 'xn' + k++);
      const chord = !!kid(el, 'chord'), grace = !!kid(el, 'grace'), dur = grace ? 0 : Number(text(el, 'duration') || 0);
      const onset = chord ? lastOnset : pos;
      if (!chord && !grace) { pos += dur; longest = Math.max(longest, pos); }
      const p = kid(el, 'pitch');
      if (kid(el, 'rest') || !p) { if (!chord && !grace) lastOnset = onset; continue; }
      const midi = 12 * (Number(text(p, 'octave')) + 1) + STEP[text(p, 'step')] + Math.round(Number(text(p, 'alter') || 0));
      const n = { id: el.getAttribute('id'), midi, beat: start + onset / div, duration: dur / div, hand: (text(el, 'staff') || '1') === '1' ? 'right' : 'left',
        voice: text(el, 'voice'), grace, chord, attack: true };
      if (grace) graces.push(n);
      else {
        if (!chord) lastOnset = onset;
        const group = graces.filter(g => g.voice === n.voice), slots = [];
        for (const g of group) { if (!g.chord || !slots.length) slots.push([]); slots.at(-1).push(g); }
        slots.forEach((slot, s) => slot.forEach(g => { g.main = n.beat; g.rank = slots.length - s; }));
        graces = graces.filter(g => g.voice !== n.voice);
      }
      const ties = kids(el, 'tie').map(t => t.getAttribute('type')), key = n.voice + ':' + midi;
      if (ties.includes('stop') && open.has(key)) {
        const head = open.get(key); head.duration = n.beat + n.duration - head.beat; n.attack = false;
        if (!ties.includes('start')) open.delete(key);
      } else if (ties.includes('start')) open.set(key, n);
      notes.set(n.id, n);
    }
    for (const g of graces) { g.main = start + longest / div; g.rank = 1; }
    start += longest / div;
  }
  const onsets = [...new Set([...notes.values()].filter(n => !n.grace).map(n => n.beat))].sort((a, b) => a - b);
  for (const n of notes.values()) if (n.grace) {
    let i = onsets.findIndex(b => b >= n.main); if (i < 0) i = onsets.length;
    const prev = i > 0 ? onsets[i - 1] : n.main - 1, step = Math.min(0.0625, (n.main - prev) / (n.rank + 2));
    n.beat = n.main - step * n.rank; n.duration = step;
  }
  const lead = -Math.min(0, ...[...notes.values()].map(n => n.beat));
  for (const n of notes.values()) n.beat += lead;
  return { notes, total: start + lead };
}

const numbers = s => (s.match(/[-\d.]+/g) || []).map(Number);
const compact = s => s.replace(/ data-(?:id|class)="[^"]*"/g, '').replace(/>\n\s*</g, '><');

async function fromMusicXML(file, meta) {
  return fromXML(await readMusicXML(file), { ...meta, fileName: meta.fileName || file.name });
}

async function fromXML(source, meta = {}) {
  if (source.length > MAX_XML) throw new Error('Choose a MusicXML score smaller than 8 MB.');
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source)) throw new Error('XML entity declarations are not supported.');
  const prep = prepare(source), xml = prep.xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This file is not readable MusicXML.');
  const title = meta.title || doc.querySelector('work-title, movement-title')?.textContent?.trim() || (meta.fileName || 'Your score').replace(/\.[^.]+$/, '');
  const hidden = clean(doc, title);
  const time = doc.querySelector('time'), meter = time ? Number(text(time, 'beats')) * 4 / Number(text(time, 'beat-type')) : 4;
  const { notes: timed, total } = timeline(doc);
  await loadVerovio();
  const tk = new window.verovio.toolkit(); tk.setOptions(OPTIONS);
  if (!tk.loadData(new XMLSerializer().serializeToString(doc))) throw new Error('The engraver could not read this MusicXML file.');
  const pages = [], systems = [], drawn = new Set();
  for (let p = 1; p <= tk.getPageCount(); p++) {
    const outer = new DOMParser().parseFromString(tk.renderToSVG(p), 'image/svg+xml').documentElement;
    for (const st of [...outer.querySelectorAll(':scope > style')]) if (st.textContent.includes('@font-face')) st.remove();
    const inner = outer.querySelector('svg.definition-scale');
    for (const f of inner.querySelectorAll('g.fing')) f.setAttribute('class', 'fing source-fingering');
    const keep = [...outer.children].filter(e => e.tagName === 'style' || e.tagName === 'defs');
    const [mx, my] = numbers(inner.querySelector('g.page-margin').getAttribute('transform'));
    const geo = [...inner.querySelectorAll('g.system')].map(g => {
      const staves = [...g.querySelectorAll('g.staff')].map(st => {
        const lines = [...st.children].filter(e => e.tagName === 'path' && (e.getAttribute('d') || '').startsWith('M')).map(e => numbers(e.getAttribute('d')));
        return lines.length === 5 ? { el: st, top: Math.min(...lines.map(l => l[1])), bottom: Math.max(...lines.map(l => l[1])), left: Math.min(...lines.map(l => l[0])), right: Math.max(...lines.map(l => l[2])) } : null;
      }).filter(Boolean);
      return { g, staves, upper: Math.min(...staves.map(s => s.top)), bottom: Math.max(...staves.map(s => s.bottom)) };
    }).filter(s => s.staves.length);
    const pageNotes = [];
    geo.forEach((s, k) => {
      const y0 = k ? (geo[k - 1].bottom + s.upper) / 2 : s.upper - 1100, y1 = k + 1 < geo.length ? (s.bottom + geo[k + 1].upper) / 2 : s.bottom + 1100;
      const left = Math.min(...s.staves.map(x => x.left)), right = Math.max(...s.staves.map(x => x.right)), positions = new Map();
      for (const st of s.staves) for (const note of st.el.querySelectorAll('g.note')) {
        const id = note.getAttribute('data-id'), head = note.querySelector(':scope > g.notehead > use'), t = timed.get(id);
        if (!t || !head) continue;
        const [x, y] = numbers(head.getAttribute('transform')), beat = Math.round(t.beat * 1e6) / 1e6;
        note.setAttribute('class', 'score-note'); note.setAttribute('data-midi', t.midi); note.setAttribute('data-beat', beat); note.setAttribute('data-hand', t.hand);
        drawn.add(id); pageNotes.push({ beat, midi: t.midi, x: (x + mx) / 100, y: (y + my) / 100, hand: t.hand });
        positions.set(beat, Math.min(positions.get(beat) ?? 1e9, x - left));
      }
      const crop = inner.cloneNode(true);
      for (const other of [...crop.querySelectorAll('g.system, g.pgHead')]) if (other.getAttribute('data-id') !== s.g.getAttribute('data-id')) other.remove();
      for (const a of ['width', 'height', 'x', 'y']) crop.removeAttribute(a);
      crop.setAttribute('viewBox', `${left + mx} ${y0 + my} ${right - left} ${y1 - y0}`); crop.setAttribute('id', outer.getAttribute('id'));
      keep.slice().reverse().forEach(e => crop.prepend(e.cloneNode(true)));
      const css = document.createElementNS(SVGNS, 'style'); css.textContent = 'g.score-note, g.score-note * { fill: currentColor; }'; crop.prepend(css);
      if (positions.size) {
        const u = 0.01, sorted = [...positions].sort((a, b) => a[0] - b[0]);
        systems.push({ svg: compact(new XMLSerializer().serializeToString(crop)), page: p - 1, y: (y0 + my) * u, height: (y1 - y0) * u, staffTop: (s.upper - y0) * u,
          staffGap: (s.bottom - s.upper) * u, start: sorted[0][0], positions: sorted.map(([b, x]) => [b, x * u]), width: (right - left) * u });
      }
    });
    const css = document.createElementNS(SVGNS, 'style'); css.textContent = 'g.score-note, g.score-note * { fill: currentColor; }'; outer.append(css);
    if (pageNotes.length) pages.push({ svg: compact(new XMLSerializer().serializeToString(outer)), start: Math.min(...pageNotes.map(n => n.beat)), end: Math.max(...pageNotes.map(n => n.beat)), notes: pageNotes });
  }
  let notes = [...timed.values()].filter(n => n.attack && drawn.has(n.id)).map(n => ({ midi: n.midi, beat: Math.round(n.beat * 1e6) / 1e6, duration: Math.round(n.duration * 1e6) / 1e6, hand: n.hand }));
  const skipped = [...timed.values()].filter(n => n.attack && !drawn.has(n.id)).length;
  notes = dedupe(notes);
  if (!notes.length) throw new Error('No playable notes were found in this score.');
  const end = Math.max(total, ...notes.map(n => n.beat + n.duration));
  systems.forEach((s, i) => { s.end = i + 1 < systems.length ? systems[i + 1].start : end; });
  const entry = finish(meta, title, notes, end, meter, { pages, systems, version: 2, source: 'private upload' },
    `Your private MusicXML${prep.unfolded ? ' · repeats written out' : ''}${prep.repeatsAsWritten ? ' · repeats played once, as printed' : ''}${hidden ? ` · ${hidden} hidden playback notes left out` : ''}${skipped ? ` · ${skipped} notes the engraver could not place were left out` : ''}`);
  entry.review = { format: 'musicxml', xml: source, records: prep.parsed?.records || null, problem: prep.problem, unfolded: prep.unfolded, repeatsAsWritten: prep.repeatsAsWritten,
    writtenMeasures: prep.parsed?.writtenMeasures ?? doc.querySelectorAll('part > measure').length, performedMeasures: prep.parsed?.performedMeasures ?? null, skipped, hidden };
  return entry;
}

function dedupe(notes) {
  notes.sort((a, b) => a.beat - b.beat || a.midi - b.midi || b.duration - a.duration);
  const seen = new Set(), out = [], last = new Map();
  for (const n of notes) {
    const key = `${n.beat}:${n.midi}:${n.hand}`; if (seen.has(key)) continue; seen.add(key);
    const prev = last.get(n.hand + n.midi);
    if (prev && prev.beat + prev.duration > n.beat) prev.duration = Math.round((n.beat - prev.beat) * 1e6) / 1e6;
    last.set(n.hand + n.midi, n); out.push(n);
  }
  return out.filter(n => n.duration > 0);
}

async function fromMIDI(file, meta) {
  const buffer = await file.arrayBuffer(), parsed = window.PianoEngine.parseMidi(buffer);
  if (!parsed.length) throw new Error('No notes were found in this MIDI file.');
  if (parsed.some(n => n.midi < 21 || n.midi > 108)) throw new Error('This MIDI file has notes outside the 88-key piano range.');
  const tracks = [...new Set(parsed.map(n => n.track))];
  const avg = t => { const xs = parsed.filter(n => n.track === t).map(n => n.midi); return xs.reduce((a, b) => a + b, 0) / xs.length; };
  const low = tracks.length > 1 ? tracks.reduce((a, b) => avg(a) < avg(b) ? a : b) : null;
  // One track: split at middle C. Several: the lowest-sounding track is the left hand, unless the person chose otherwise.
  const chosen = meta.hands || {}, hand = n => chosen[n.track] || (low === null ? (n.midi < 60 ? 'left' : 'right') : (n.track === low ? 'left' : 'right'));
  const notes = dedupe(parsed.map(n => ({ midi: n.midi, beat: Math.round(n.beat * 1e6) / 1e6, duration: Math.round(n.duration * 1e6) / 1e6, hand: hand(n) })));
  const title = meta.title || file.name.replace(/\.[^.]+$/, '');
  const entry = finish(meta, title, notes, Math.max(parsed.endBeat || 0, ...notes.map(n => n.beat + n.duration)), 4, null, 'Your private MIDI · pitches and durations, no sheet music');
  entry.review = { format: 'midi', tracks: tracks.length > 1 ? tracks.map(t => ({ track: t, notes: parsed.filter(n => n.track === t).length, hand: chosen[t] || (t === low ? 'left' : 'right') })) : [] };
  return entry;
}

function finish(meta, title, notes, end, meter, engraving, caption) {
  const sections = [];
  for (let start = 0; start < end; start += meter * 8) if (notes.some(n => n.beat >= start && n.beat < start + meter * 8))
    sections.push({ id: 'block-' + start, title: 'Practice block ' + (sections.length + 1), start, end: Math.min(end, start + meter * 8) });
  return { id: meta.id, title, composer: meta.composer || '', caption, notes, totalBeats: end, beatsPerMeasure: meter, movements: [{ title: 'Movement 1', start: 0, end }],
    sections, engraving, sourceFingering: !!engraving?.pages.some(p => p.svg.includes('source-fingering')), originalPages: 0, private: true };
}

async function fromFile(file, meta = {}) {
  if (/\.midi?$/i.test(file.name)) { if (file.size > 2_000_000) throw new Error('Choose a MIDI file smaller than 2 MB.'); return fromMIDI(file, meta); }
  if (!/\.(mxl|musicxml|xml)$/i.test(file.name)) throw new Error('Choose a MusicXML (.mxl, .musicxml) or MIDI (.mid) file.');
  if (file.size > MAX_XML) throw new Error('Choose a file smaller than 8 MB.');
  return fromMusicXML(file, meta);
}
window.PianoScoreImport = { fromFile, fromXML, readMusicXML, prepare, mergeParts };
})();
