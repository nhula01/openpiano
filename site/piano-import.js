'use strict';
// "Add a song" on the My songs page: choose a MusicXML, MIDI or PDF file (or photos of a printed
// score), check it, fix its notes in the sheet editor (piano-sheet-editor.js) or set the hands of a
// MIDI file if needed, then save it to My songs
// (piano-account.js) or practice it right away. A PDF exported from notation software is read into
// MusicXML here (piano-pdf-reader.js); scans and photos are read by piano-scan-reader.js.
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
const pick = el('label', '1 · Choose a MusicXML, MIDI or PDF file, or photos of a printed score', 'step-label'), input = el('input');
input.type = 'file'; input.id = 'self-service-file'; input.multiple = true; input.accept = '.musicxml,.xml,.mxl,.mid,.midi,.pdf,.png,.jpg,.jpeg,.webp'; pick.append(input);
const formats = el('p', 'MusicXML (from MuseScore: File → Export → MusicXML) keeps the sheet music and printed fingering. A PDF saved from notation software (MuseScore, LilyPond, Dorico, Finale…) is read into sheet music right here in your browser; check it against the PDF. A scanned PDF or photos of a printed score (choose several photos for several pages, in order) are read here too, less reliably: check every line. MIDI keeps the notes and rhythm and shows them without sheet music.', 'muted');
const demo = el('button', 'Try an example score', 'secondary'); demo.type = 'button';
demo.onclick = async () => {
  const token = ++revision;
  try { const r = await fetch('scores/import-example/example.musicxml'); if (!r.ok) throw Error('The example is unavailable.'); await loadXML(await r.text(), 'Example score.musicxml', token, null); }
  catch (e) { if (token === revision) say(e.message, true); }
};

const scan = el('details', undefined, 'fold'); scan.id = 'scan-help';
scan.append(el('summary', 'Reading a scan or photo'));
scan.append(el('p', 'Scans and photos are read right here, without uploading them. For the best result, photograph each page straight on, flat, in even light, with the whole page sharp and filling the picture; a scan at 300 dpi is better still. Printed music only: handwriting is not read. The reader marks the measures it is unsure of; compare every line with your sheet.'));
const scanIntro = el('p', 'If the result needs a lot of fixing, a dedicated music scanner can do better on hard pages: turn the scan into MusicXML there, then choose the exported .musicxml or .mxl file here.');
const steps = el('ol');
for (const t of ['Open the PDF or photo in Audiveris, a free open-source scanner for your computer, and export MusicXML. A web scanner such as Soundslice also works; its own limits and pricing apply.',
  'Check the export in a notation editor such as MuseScore: both staves, every page, repeats, rests, ties and the last bar. Fix recognition mistakes there.',
  'Choose the MusicXML here, check the sheet, and fix any remaining notes in the sheet editor.']) steps.append(el('li', t));
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
  const same = current?.name === name;
  current = { format: 'musicxml', name, file, xml, corrected: false, entry, title: same ? current.title : null, composer: same ? current.composer : null, fromPdf: same ? current.fromPdf : null };
  draw();
}
// A PDF from notation software: read its notes here, then check them like any MusicXML.
async function loadPDF(file, token) {
  attach(file);
  say('Reading the music in your PDF… (the first time, the PDF reader takes a moment to download)');
  let result;
  try {
    result = await window.PianoPdfReader.convert(await file.arrayBuffer(), { onProgress: (page, pages) => { if (token === revision && pages > 1) say(`Reading the music in your PDF… page ${page} of ${pages}`); } });
  } catch (e) {
    // a scanned PDF holds pictures of the music: the picture reader takes it from here
    if (e.code === 'scan') { await loadScan({ pdf: await file.arrayBuffer() }, baseName(file.name), token); return; }
    if (e.code === 'none') scan.open = true; throw e;
  }
  if (token !== revision) return;
  await useRead(result, baseName(file.name), token);
}
// Scans and photos: read the music in the pictures here, then check it like any MusicXML.
async function loadScan(input, title, token) {
  const what = input.pdf ? 'scanned PDF' : input.files.length > 1 ? 'photos' : 'photo';
  say(`Reading the music in your ${what}… This takes a few seconds a page.`);
  let result;
  try {
    result = await window.PianoScanReader.convert(input, { title, onProgress: (page, pages) => { if (token === revision) say(`Reading the music in your ${what}… ${pages > 1 ? `page ${page} of ${pages}` : 'finding staves, notes and rhythms'}`); } });
  } catch (e) { scan.open = true; throw e; }
  if (token !== revision) return;
  await useRead(result, title, token);
}
async function useRead(result, title, token) {
  const name = title + '.musicxml';
  current = { name, fromPdf: result, title: result.title, composer: result.composer };
  try { await loadXML(result.xml, name, token, null); }
  catch (e) {
    if (token !== revision) return;
    current = null;
    const src = result.scanned ? 'pictures' : 'PDF';
    const dl = el('a', 'Download what was read (MusicXML)', 'secondary'); dl.href = blobURL(new Blob([result.xml], { type: XML_TYPE })); dl.download = name;
    const fix = el('button', 'Fix it in the sheet editor'); fix.type = 'button';
    const problem = `The notes read from these ${src} did not pass the checks: ` + (e.message || e);
    // the editor opens what was read as it is, so the measure named can be put right here
    const repair = (xml, notice) => editSheet(xml, { notice, onCancel: () => useRead(result, title, ++revision), onDone: async fixed => {
      const t = ++revision; current = { name, fromPdf: result, title: result.title, composer: result.composer };
      try { await loadXML(fixed, name, t, null); if (current && t === revision) { current.corrected = true; draw(); say('Fixed. Check the sheet again, then save.'); } }
      catch (err) { if (t === revision) { current = null; const msg = 'Not yet: ' + (err.message || err); say(msg, true); repair(fixed, msg); } }
    } });
    fix.onclick = () => repair(result.xml, problem.replace('these PDF', 'this PDF'));
    review.replaceChildren(el('p', problem.replace('these PDF', 'this PDF'), 'note warn'),
      el('p', result.scanned ? 'Fix the measure it names in the sheet editor, or download what was read and fix it in a notation editor such as MuseScore. A sharper, straighter photo or a 300 dpi scan reads better.' : 'Fix the measure it names in the sheet editor, or download what was read and fix it in a notation editor such as MuseScore. Exporting MusicXML from the program that made the PDF gives the best result.', 'muted'), el('div', undefined, 'actions'));
    review.lastChild.append(fix, dl);
    say(`The ${src} were read, but the result needs fixing before practice.`.replace('PDF were', 'PDF was'), true);
  }
}
async function loadMIDI(file, token, hands) {
  say('Reading the MIDI file…');
  const entry = await window.PianoScoreImport.fromFile(file, { id: 'mine-draft', hands });
  if (token !== revision) return;
  current = { format: 'midi', name: file.name, file, entry, hands: hands || null, title: current?.name === file.name ? current.title : null };
  draw();
}
const PICTURE = /\.(png|jpe?g|webp)$/i;
input.onchange = async () => {
  const files = [...input.files], file = files[0]; if (!file) return; input.value = '';
  const token = ++revision; current = null; review.replaceChildren();
  try {
    if (files.length > 1 && !files.every(f => PICTURE.test(f.name))) throw Error('Choose one file, or several photos (one for each page).');
    if (/\.pdf$/i.test(file.name)) { await loadPDF(file, token); return; }
    if (PICTURE.test(file.name)) {
      // pages in the order of their names (photos are usually numbered in the order taken)
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      if (files.length === 1 && file.size <= MAX_ORIGINAL && /\.(png|jpe?g)$/i.test(file.name)) attach(file);
      await loadScan({ files }, niceTitle(file.name), token); return;
    }
    if (/\.midi?$/i.test(file.name)) await loadMIDI(file, token);
    else if (/\.(musicxml|xml|mxl)$/i.test(file.name)) {
      if (file.size > 8_000_000) throw Error('Choose a file smaller than 8 MB.');
      await loadXML(await window.PianoScoreImport.readMusicXML(file), file.name, token, file);
    } else throw Error('Choose a MusicXML (.mxl, .musicxml), MIDI (.mid) or PDF file, or photos (PNG, JPEG).');
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
  if (c.fromPdf) review.append(pdfNotes(c.fromPdf));
  if (c.format === 'musicxml') {
    if (r.repeatsAsWritten) review.append(el('p', `Repeats are played once, as printed, because they couldn’t be written out automatically (${r.problem}) Write them out in your notation editor if practice should follow them.`, 'note warn'));
    else if (r.problem) review.append(el('p', 'Check this before practicing: ' + r.problem, 'note warn'));
    if (r.skipped) review.append(el('p', `${r.skipped} notes couldn’t be placed on the sheet and were left out of practice.`, 'note warn'));
    // Preview the opening lines (cropped systems, so short pieces don't show a mostly empty page).
    const systems = e.engraving.systems, shown = systems.slice(0, 4), sheet = el('div', undefined, 'import-sheet-preview');
    sheet.innerHTML = shown.map(x => x.svg).join('');
    review.append(sheet, el('p', systems.length > shown.length ? `The first ${shown.length} of ${systems.length} lines. The whole score appears in Practice.` : 'The whole score is shown above.', 'muted'));
    const edit = el('button', c.corrected ? 'Edit the sheet again' : 'Edit the sheet'); edit.type = 'button'; edit.id = 'import-edit';
    edit.onclick = () => editSheet(c.xml, { onCancel: () => { draw(); say('No changes made.'); }, onDone: (xml, { changed }) => changed ? useEdit(xml, c) : (draw(), say('No changes made.')) });
    const fixRow = el('div', undefined, 'actions import-edit'); fixRow.append(edit);
    review.append(el('p', 'A wrong note, rhythm or hand? Edit the sheet: click a note and change it, add notes and chords, or move them.', 'muted'), fixRow);
    const dl = el('a', c.corrected ? 'Download the edited MusicXML' : 'Download this MusicXML', 'secondary'); dl.href = blobURL(new Blob([c.xml], { type: XML_TYPE })); dl.download = baseName(c.name).replace(/ \(edited\)$/, '') + (c.corrected ? ' (edited)' : '') + '.musicxml';
    fixRow.append(dl);
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

// What the PDF or picture reader was unsure of, so the person knows where to look.
function pdfNotes(p) {
  const box = el('div', undefined, 'import-pdf-notes');
  const src = p.scanned ? (p.pages === 1 ? 'picture' : 'pictures') : 'PDF';
  box.append(el('p', `Read from your ${src}: ${p.measures} measures on ${p.pages} ${p.pages === 1 ? 'page' : 'pages'}. Play it through or compare the sheet with your ${src} before practicing; a misread note can be fixed in the sheet editor below.`, 'note'));
  for (const w of p.warnings) box.append(el('p', w, 'note warn'));
  if (p.flagged.length) {
    const list = el('details', undefined, 'fold'); list.open = p.flagged.length <= 5;
    list.append(el('summary', p.flagged.length === 1 ? 'One measure to check' : `${p.flagged.length} measures to check`));
    const ul = el('ul');
    for (const f of p.flagged.slice(0, 40)) ul.append(el('li', `${f.measure ? 'Measure ' + f.measure : 'The opening pickup'}: ${f.why.join('; ')}.`));
    if (p.flagged.length > 40) ul.append(el('li', `…and ${p.flagged.length - 40} more.`));
    list.append(ul); box.append(list);
  }
  return box;
}

// ---- Edit the sheet (piano-sheet-editor.js) ----
async function editSheet(xml, opts) {
  revision++;
  say('Opening the sheet editor… (the first time, the engraver takes a moment to download)');
  try {
    await window.PianoSheetEditor.open(review, xml, { doneLabel: 'Use these changes', ...opts });
    say('Editing the sheet…');
  } catch (e) { say(e.message || String(e), true); if (current?.entry) draw(); }
}
// the edited score is checked and engraved again like a newly chosen file
async function useEdit(xml, c) {
  const token = ++revision;
  try {
    await loadXML(xml, c.name, token, null);
    if (current && token === revision) { current.corrected = true; draw(); say('Changes applied. Check the sheet again, then save.'); }
  } catch (e) {
    if (token !== revision) return;
    current = c; const msg = 'These changes don’t pass the checks yet: ' + (e.message || e);
    editSheet(xml, { notice: msg, onCancel: () => { draw(); say('Your changes were not used.'); }, onDone: (x, { changed }) => useEdit(changed ? x : xml, c) });
    say(msg, true);
  }
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
      const file = c.format === 'midi' ? c.file : (!c.corrected && c.file ? c.file : new File([c.xml], baseName(c.name).replace(/ \((corrected|edited)\)$/, '') + '.musicxml', { type: XML_TYPE }));
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
