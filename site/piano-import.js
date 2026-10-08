'use strict';
// "Add a song" on the My songs page: choose a MusicXML or MIDI file, check it, correct a pitch or
// the hands if needed, then save it to My songs (piano-account.js) or practice it right away.
// Everything runs in this browser; a file only leaves it when the person saves to their account
// or chooses the optional scanner.
(() => {
const host = document.querySelector('#score-import'); if (!host) return;
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const MAX_ORIGINAL = 15_000_000, XML_TYPE = 'application/vnd.recordare.musicxml+xml';
let revision = 0, current = null, original = null, scannerURL = null; const urls = [];
const blobURL = blob => { const url = URL.createObjectURL(blob); urls.push(url); return url; };
const baseName = name => (name || 'score').replace(/\.[^.]+$/, '');
const niceTitle = name => baseName(name).replace(/[_-]+/g, ' ').trim();

// ---- 1 · Choose ----
const pick = el('label', '1 · Choose a MusicXML or MIDI file', 'step-label'), input = el('input');
input.type = 'file'; input.id = 'self-service-file'; input.accept = '.musicxml,.xml,.mxl,.mid,.midi,.pdf,.png,.jpg,.jpeg'; pick.append(input);
const formats = el('p', 'MusicXML (from MuseScore: File → Export → MusicXML) keeps the sheet music and printed fingering. MIDI keeps the notes and rhythm and shows them without sheet music.', 'muted');
const demo = el('button', 'Try an example score', 'secondary'); demo.type = 'button';
demo.onclick = async () => {
  const token = ++revision;
  try { const r = await fetch('scores/import-example/example.musicxml'); if (!r.ok) throw Error('The example is unavailable.'); await loadXML(await r.text(), 'Example score.musicxml', token, null); }
  catch (e) { if (token === revision) say(e.message, true); }
};

const scan = el('details', undefined, 'fold'); scan.id = 'scan-help';
scan.append(el('summary', 'Only have a PDF or photo?'));
const scanIntro = el('p', 'Turn the printed sheet into MusicXML with a music scanner, then come back and choose the exported .musicxml or .mxl file. Compare the result with the original before practicing.');
const steps = el('ol');
for (const t of ['Open the PDF or photo in Audiveris, a free open-source scanner for your computer, and export MusicXML. A web scanner such as Soundslice also works; its own limits and pricing apply.',
  'Check the export in a notation editor such as MuseScore: both staves, every page, repeats, rests, ties and the last bar. Fix recognition mistakes there.',
  'Choose the MusicXML here, check the sheet, and correct single pitches below if needed.']) steps.append(el('li', t));
scan.append(scanIntro, steps);
for (const [title, url] of [['Audiveris (free)', 'https://audiveris.github.io/audiveris/_pages/tutorials/quick/'], ['Soundslice scanner', 'https://www.soundslice.com/sheet-music-scanner/']]) {
  const a = el('a', title, 'secondary'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; scan.append(a, ' ');
}
scan.append(el('p', 'Opening a scanner does not send your file. Uploading it there is your choice.', 'muted'));

const attachLabel = el('label', 'Optional · Attach the printed sheet (PDF or photo) to view beside practice'), attachInput = el('input');
attachInput.type = 'file'; attachInput.id = 'import-original'; attachInput.accept = '.pdf,.png,.jpg,.jpeg'; attachLabel.append(attachInput);
const originalBox = el('div', undefined, 'import-original-preview');
const status = el('p', 'Choose a file to begin. Nothing is uploaded until you save to your account.', 'muted import-status'); status.id = 'import-status';
status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
const review = el('div', undefined, 'import-review'); review.id = 'import-review';
host.append(formats, pick, demo, scan, attachLabel, originalBox, status, review);
function say(text, bad) { status.textContent = text; status.classList.toggle('bad', !!bad); }

// ---- Original sheet (PDF/photo) ----
function attach(file) {
  if (file.size > MAX_ORIGINAL) throw Error('Choose a PDF or photo smaller than 15 MB.');
  const type = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[file.name.split('.').pop().toLowerCase()];
  if (!type) throw Error('Attach a PDF, PNG or JPEG.');
  original = { name: file.name, type, blob: new Blob([file], { type }) }; showOriginal();
}
function showOriginal() {
  originalBox.replaceChildren(); if (!original) return;
  const url = blobURL(original.blob), a = el('a', 'Open the attached sheet'); a.href = url; a.target = '_blank'; a.rel = 'noopener';
  originalBox.append(el('p', 'Attached: ' + original.name), a);
  if (original.type.startsWith('image/')) { const img = el('img'); img.src = url; img.alt = 'Your attached printed sheet'; originalBox.append(img); }
  const remove = el('button', 'Remove attached sheet', 'secondary'); remove.type = 'button'; remove.onclick = () => { original = null; attachInput.value = ''; showOriginal(); };
  originalBox.append(remove);
  if (scannerURL) {
    const b = el('button', 'Scan this sheet automatically', 'secondary'); b.type = 'button';
    originalBox.append(el('p', `Scanning sends this sheet to ${new URL(scannerURL).hostname} for recognition; the service deletes it after processing. Check the result before practice.`, 'muted'), b);
    b.onclick = async () => {
      b.disabled = true; const token = ++revision, controller = new AbortController(), timer = setTimeout(() => controller.abort(), 190000);
      try {
        say('Scanning the whole sheet. This can take a few minutes…');
        const r = await fetch(scannerURL + '/scan', { method: 'POST', headers: { 'Content-Type': original.type }, body: original.blob, credentials: 'omit', signal: controller.signal });
        const data = await r.json(); if (!r.ok) throw Error(data.error || 'Recognition failed.');
        if (typeof data.xml !== 'string') throw Error('The scanner returned no score.');
        if (token === revision) await loadXML(data.xml, baseName(original.name) + ' (scanned).musicxml', token, null);
      } catch (e) { if (token === revision) say(e.name === 'AbortError' ? 'Scanning timed out. Try the free desktop scanner.' : e.message, true); }
      finally { clearTimeout(timer); b.disabled = false; }
    };
  }
}
attachInput.onchange = () => { try { if (attachInput.files[0]) attach(attachInput.files[0]); } catch (e) { say(e.message, true); } };

// ---- 2 · Check ----
async function loadXML(xml, name, token, file) {
  say('Reading every measure and engraving the sheet… (the first time, the engraver takes a moment to download)');
  const entry = await window.PianoScoreImport.fromXML(xml, { id: 'mine-draft', fileName: name });
  if (token !== revision) return;
  current = { format: 'musicxml', name, file, xml, corrected: false, entry, title: current?.name === name ? current.title : null };
  draw();
}
async function loadMIDI(file, token, hands) {
  say('Reading the MIDI file…');
  const entry = await window.PianoScoreImport.fromFile(file, { id: 'mine-draft', hands });
  if (token !== revision) return;
  current = { format: 'midi', name: file.name, file, entry, hands: hands || null, title: current?.name === file.name ? current.title : null };
  draw();
}
input.onchange = async () => {
  const file = input.files[0]; if (!file) return; input.value = '';
  const token = ++revision; current = null; review.replaceChildren();
  try {
    if (/\.(pdf|png|jpe?g)$/i.test(file.name)) { attach(file); scan.open = true; say('Sheet attached. Scan it to MusicXML first (see “Only have a PDF or photo?”), then choose the MusicXML here.'); return; }
    if (/\.midi?$/i.test(file.name)) await loadMIDI(file, token);
    else if (/\.(musicxml|xml|mxl)$/i.test(file.name)) {
      if (file.size > 8_000_000) throw Error('Choose a file smaller than 8 MB.');
      await loadXML(await window.PianoScoreImport.readMusicXML(file), file.name, token, file);
    } else throw Error('Choose a MusicXML (.mxl, .musicxml) or MIDI (.mid) file.');
  } catch (e) { if (token === revision) { current = null; say(e.message || String(e), true); } }
};

function draw() {
  const c = current, e = c.entry, r = e.review; review.replaceChildren();
  const facts = [`${e.notes.length} notes`, `${Math.round(e.totalBeats)} beats`];
  if (c.format === 'musicxml') {
    facts.push(r.performedMeasures && r.performedMeasures !== r.writtenMeasures ? `${r.writtenMeasures} written / ${r.performedMeasures} played measures (repeats written out)` : `${r.writtenMeasures} measures`);
    facts.push(e.sourceFingering ? 'printed fingering kept' : 'no printed fingering in this file');
  }
  review.append(el('h3', '2 · Check it', 'step-label'), el('p', facts.join(' · '), 'import-facts'));
  if (c.format === 'musicxml') {
    if (r.repeatsAsWritten) review.append(el('p', `Repeats are played once, as printed, because they couldn’t be written out automatically (${r.problem}) Write them out in your notation editor if practice should follow them.`, 'note warn'));
    else if (r.problem) review.append(el('p', 'Check this before practicing: ' + r.problem, 'note warn'));
    if (r.skipped) review.append(el('p', `${r.skipped} notes couldn’t be placed on the sheet and were left out of practice.`, 'note warn'));
    // Preview the opening lines (cropped systems, so short pieces don't show a mostly empty page).
    const systems = e.engraving.systems, shown = systems.slice(0, 4), sheet = el('div', undefined, 'import-sheet-preview');
    sheet.innerHTML = shown.map(x => x.svg).join('');
    review.append(sheet, el('p', systems.length > shown.length ? `The first ${shown.length} of ${systems.length} lines. The whole score appears in Practice.` : 'The whole score is shown above.', 'muted'));
    if (r.records?.length) review.append(corrections(r.records));
    const dl = el('a', c.corrected ? 'Download the corrected MusicXML' : 'Download this MusicXML', 'secondary'); dl.href = blobURL(new Blob([c.xml], { type: XML_TYPE })); dl.download = baseName(c.name) + (c.corrected ? ' (corrected)' : '') + '.musicxml';
    review.append(dl);
  } else {
    review.append(el('p', 'MIDI has no sheet music or fingering. Practice uses the falling-note display with every note and rhythm in the file.', 'muted'));
    if (r.tracks.length) {
      const box = el('div', undefined, 'trainer-controls import-hands');
      for (const t of r.tracks) {
        const l = el('label', `Track ${t.track} · ${t.notes} notes`), s = el('select');
        for (const h of ['right', 'left']) { const o = el('option', h + ' hand'); o.value = h; s.append(o); }
        s.value = t.hand; s.onchange = async () => { const token = ++revision; try { await loadMIDI(c.file, token, Object.fromEntries(r.tracks.map(x => [x.track, x === t ? s.value : x.hand]))); } catch (err) { say(err.message, true); } };
        l.append(s); box.append(l);
      }
      review.append(el('p', 'Which hand plays each track?', 'mine-h'), box);
    }
  }
  review.append(saveForm());
  say('Check the sheet and the ending against your source, then save it or practice it.');
}

function corrections(records) {
  const box = el('details', undefined, 'fold');
  box.append(el('summary', 'Correct a wrong note'), el('p', 'Pick the note and type the right pitch; the sheet and practice update together. For rhythm, hands or repeats, fix the file in your notation editor and choose it again.', 'muted'));
  const row = el('div', undefined, 'trainer-controls'), nl = el('label', 'Note'), select = el('select'); select.id = 'import-note';
  const name = n => window.PianoEngine.noteName(n.midi).replace('♯', '#');
  records.forEach((n, i) => { const o = el('option', `Measure ${n.measure} · ${n.hand} hand · ${name(n)}${n.grace ? ' (grace)' : ''}`); o.value = i; select.append(o); });
  nl.append(select);
  const pl = el('label', 'Correct pitch'), pitch = el('input'); pitch.id = 'import-pitch'; pitch.placeholder = 'C4, F#4 or Bb3'; pitch.value = name(records[0]); pl.append(pitch);
  select.onchange = () => { pitch.value = name(records[Number(select.value)]); };
  const apply = el('button', 'Apply correction'); apply.type = 'button';
  apply.onclick = async () => {
    apply.disabled = true; const c = current, token = ++revision;
    try {
      const fixed = window.PianoImportEngine.editPitch(c.xml, records[Number(select.value)].id, pitch.value);
      const title = c.title; await loadXML(fixed, c.name, token, null);
      if (current && token === revision) { current.corrected = true; current.title = title; draw(); say('Corrected. Check the sheet again, then save.'); }
    } catch (err) { say(err.message, true); }
    finally { apply.disabled = false; }
  };
  row.append(nl, pl, apply); box.append(row);
  return box;
}

// ---- 3 · Save ----
function saveForm() {
  const c = current, form = el('form', undefined, 'add-song');
  const tl = el('label', 'Title'), title = el('input'); title.maxLength = 200; title.required = true;
  title.value = c.title || (c.entry.title && c.entry.title !== 'Your score' ? c.entry.title : niceTitle(c.name)); title.oninput = () => { c.title = title.value; }; tl.append(title);
  const cl = el('label', 'Composer or artist'), composer = el('input'); composer.maxLength = 200; composer.value = c.composer || ''; composer.oninput = () => { c.composer = composer.value; }; cl.append(composer);
  const rights = el('label', undefined, 'check'), ok = el('input'); ok.type = 'checkbox'; ok.required = true; ok.id = 'import-rights';
  rights.append(ok, el('span', 'This is music I’m allowed to use for my own practice, and I’ve checked it against my source. It stays private.'));
  const where = el('p', window.PianoSongs?.where() || '', 'muted import-where');
  const save = el('button', 'Save to My songs and practice'); save.type = 'submit'; save.id = 'import-save';
  const now = el('button', 'Practice without saving', 'secondary'); now.type = 'button'; now.id = 'import-practice';
  const sync = () => { save.disabled = now.disabled = !ok.checked; }; ok.onchange = sync; sync();
  const meta = () => ({ title: title.value.trim() || niceTitle(c.name), composer: composer.value.trim() });
  now.onclick = () => { if (!ok.checked) return; const m = meta(), entry = { ...c.entry, id: 'mine-draft', title: m.title, composer: m.composer }; window.PianoSongs.present(entry, original, 'not saved'); };
  form.onsubmit = async ev => {
    ev.preventDefault(); if (!ok.checked) return; save.disabled = true;
    try {
      const m = meta();
      const file = c.format === 'midi' ? c.file : (!c.corrected && c.file ? c.file : new File([c.xml], baseName(c.name).replace(/ \(corrected\)$/, '') + '.musicxml', { type: XML_TYPE }));
      const rec = await window.PianoSongs.save(file, { ...m, format: c.format, settings: c.hands ? { hands: c.hands } : {}, original });
      reset(); say(`Saved “${rec.title}” to My songs.`);
      await window.PianoSongs.open(rec);
    } catch (err) { say(err.message || String(err), true); save.disabled = false; }
  };
  form.append(el('h3', '3 · Save it', 'step-label'), tl, cl, rights, where, el('div', undefined, 'actions'));
  form.lastChild.append(save, now);
  return form;
}
function reset() { revision++; current = null; original = null; attachInput.value = ''; showOriginal(); review.replaceChildren(); }
window.addEventListener('piano-songs-where', () => { const w = review.querySelector('.import-where'); if (w) w.textContent = window.PianoSongs.where(); });

// Optional community scanner, configured by the site owner in piano-support.json.
fetch('piano-support.json').then(r => r.json()).then(config => {
  try {
    const url = new URL(config.scannerURL), local = ['127.0.0.1', 'localhost'].includes(location.hostname) && ['127.0.0.1', 'localhost'].includes(url.hostname);
    if (url.protocol === 'https:' || (local && url.protocol === 'http:')) {
      scannerURL = url.href.replace(/\/$/, ''); showOriginal();
      scanIntro.textContent = 'A scanner is connected: attach your PDF or photo below and choose Scan, then check the result. You can also use a desktop scanner and choose its MusicXML export.';
    }
  } catch {}
}).catch(() => {});
window.addEventListener('pagehide', () => { for (const url of urls) URL.revokeObjectURL(url); });
})();
