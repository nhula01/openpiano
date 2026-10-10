# My songs: people's own scores

My songs is one page for bringing your own music: add a file, check it, practice it, and keep
it privately. There is no subscription and no account requirement. `piano-support.json` holds the
owner's `supportURL` (donations) and `scannerURL` (optional PDF/photo scanner); both are null until
real destinations exist.

## Adding a song

1. **Choose a file.** MusicXML (`.musicxml`, `.xml`, `.mxl`) keeps the sheet music and printed
   fingering. MIDI (`.mid`, `.midi`) keeps every note and rhythm and practices with the note display.
   A PDF exported from notation software is read into MusicXML in the browser (see "Reading PDFs" below)
   and attached for comparison. A scanned PDF or photos of a printed score (one per page, chosen together) are
   read in the browser too (see "Reading scans and photos" below); for hard pages the page still explains how to
   use Audiveris (free) or a web scanner, and offers the owner's scanner when `scannerURL` is set.
2. **Check it.** MusicXML goes through `piano-import-engine.js`, which validates the score and writes
   out repeats, numbered endings and multi-pass sections in performed order, then through
   `piano-score-import.js`, which engraves it with Verovio (the same engraver as the library) and ties
   every playable attack to its printed notehead. Two single-staff parts are combined into one
   right-hand/left-hand part. Scores the engine cannot unfold (D.C./D.S./coda, nested repeats,
   ornaments to be written out, overfull bars) are kept exactly as printed and the page says that
   repeats will be played once. The page shows the opening lines, note and measure counts, and
   whether printed fingering is present. Grace notes keep their small printed notes and sound just
   before their main note (a short fixed lead-in, as in the library), not with expressive timing.
   Anything else the checker flags, such as an overfull bar (often a misread tuplet), is shown with
   its measure number so the person can fix it before practicing.
3. **Fix it.** "Edit the sheet" opens the full-window sheet editor (`piano-sheet-editor.js`, with
   the edit operations in `piano-sheet-model.js`), designed after MuseScore, Flat and Noteflight.
   - *Select mode:* click a note, rest or empty part of a bar (Shift+click or Shift+arrows for a
     range, Ctrl+A for everything) and change it with the toolbar, a palette, the keyboard, or by
     dragging a note up or down. ↑ ↓ change a semitone (spelled for the key), Alt+Shift+↑ ↓ a step,
     Ctrl+↑ ↓ an octave; A–G rename a note (Shift adds it to the chord, Alt+1–9 adds an interval);
     2–7 and . set the length (a longer note takes the room of what follows, never past the
     barline; a shorter one leaves rests on the beat); 0 makes a rest; Delete removes.
   - *Write mode (N or ✎):* choose a length, then type A–G, click the staff where the note goes (a
     shadow note shows the pitch), press a key of the on-screen piano (P) or play a MIDI keyboard
     (notes played together become a chord). Notes are written at the blue cursor over what was
     there, tied across barlines when they are too long for the bar, and the cursor moves on; bars
     are added at the end as needed. Shift adds to the chord, 0 writes a rest, T a tied note, Ctrl+3
     a triplet, Backspace undoes the last note, Alt+↑ ↓ moves to the other hand's staff.
   - Voices 1–4 per staff (colored as in MuseScore), copy/cut/paste and R (repeat) of notes or
     ranges over both hands, transposing a range, ties, slurs, triplets and 5-/6-tuplets, flipping
     stems, respelling, moving a note to the other hand.
   - Palettes: articulations, dynamics, fingering (printed fingering is shown in practice), clefs,
     key signatures (pitches stay, accidentals follow), time signatures (the music is re-barred,
     notes split with ties), bar lines, repeats and 1st/2nd endings, grace notes, tuplets, tempo,
     and inserting, adding and deleting bars; the title and composer are edited at the top.
   - Playback with the site's sampled piano from the selection (Space), with the notes lit as they
     sound; notes sound as they are written or changed (can be turned off). Undo/redo for
     everything; refused changes say why and leave the score as it was. The sheet is engraved in
     sections of about eight bars and only the sections that changed are engraved again, so long
     scores stay quick to edit. A practice check runs after each change and shows any problem
     (such as a tie that no longer joins after a repeat was added) without blocking the edit.
   "Use these changes" checks and engraves the score again; the edited MusicXML can be downloaded.
   When what a PDF or picture reader produced fails the checks, the page offers to fix it in the
   editor. Saved MusicXML songs have an "Edit" button in My songs; saving replaces the song's file
   and keeps its settings and attached sheet (a title changed in the editor becomes the song's
   title); if saving fails, the editor opens again with the edits. Leaving with unsaved edits asks
   first. For MIDI with several tracks, the person picks which hand plays each track.
4. **Save it or practice it.** "Save to My songs and practice" stores the file (the edited
   MusicXML when edited), the MIDI hand choices and any attached PDF/photo. "Practice without saving"
   opens it once. Both require confirming the music may be used for the person's own practice.

Signed out, songs live in this browser (IndexedDB). Signed in (see `docs/accounts-setup.md`), they
live in the person's account, protected by row-level security, and songs already in the browser can
be moved into the account. Scores saved by the earlier "Your scores" page are moved into My songs
automatically the first time the page opens. Nothing a person adds is ever committed to this
repository or published.

Limits (resource limits, not paywalls): 8 MB MusicXML/MXL (also once unpacked), 2 MB MIDI, 15 MB
attached sheet, 500 written / 1,500 performed measures and 10,000 notes for unfolding, 100 songs.

## Reading PDFs

`piano-pdf-reader.js` turns a PDF made by notation software into MusicXML, entirely in the browser. Such PDFs
keep the music as drawing instructions: staff lines, stems, barlines and beams are vector lines, and noteheads,
clefs, accidentals, rests, flags and dots are characters of a music font. The reader does not look at pixels; it
reads those instructions with pdf.js (`pdfjs-dist` 6.4.299, legacy build, loaded from jsDelivr on first use, as
the engraver is) and rebuilds the score from their positions:

- **Symbols** are named by SMuFL codepoint (MuseScore, Dorico, Finale 27+, Verovio, Sibelius with a SMuFL font)
  or by glyph name inside the embedded font (LilyPond's Emmentaler). pdf.js re-maps subset fonts, so names are
  recovered from its converted font (cmap → glyph id → CFF charset or TrueType `post` names).
- **Layout**: five equally spaced long lines make a staff; staves joined by a line or brace make a system (in a
  score for several instruments the braced pair is the piano); vertical lines from a staff's top line to its
  bottom line that touch no notehead are barlines, with dots beside them for repeats; a number under a hooked
  bracket over the top staff is a first or second ending, and a bracket running off a system continues on the next.
- **Pitch** from the staff position, the clef in force, the key signature (a run of accidentals after a clef or
  barline spelling the order of sharps or flats and standing clear of the first note), accidentals that carry
  through the bar (grace notes included) and over ties, and 8va/8vb lines.
- **Rhythm** from the notehead, the beams and flags on its stem, dots and tuplet numbers (with their beam,
  bracket or nearest notes). Onsets come from the columns: engravers align everything sounding together at one x,
  and each voice runs on without gaps, so each column sounds when some voice ends — of those times, the one the
  column's notes continue. Voices of a staff come out of the same pass. Triplets printed without their number
  ("simile") are recognised when a voice would otherwise run past the bar; small notes are grace notes unless the
  bar needs them (an arranger's small notes take time).
- **Ties**, **grace notes**, **printed fingering** (a lone digit 1–5 centred over or under a chord; a stack goes
  to the chord's notes in order and anything ambiguous is left out — fingering is never guessed), **title** and
  **composer** are read too. Without a printed time signature each measure lasts as long as its notes.

The result goes through the same checks, engraving and pitch correction as an imported MusicXML file. The page
lists what the reader was unsure of — measures whose voices disagree, that run past the time signature, or where
a note fell off the keyboard — so the person knows where to compare with the PDF, and notes D.C./D.S. jumps
(practice plays them once as printed). Scanned pages and photos hold only pictures; they go to the picture reader below.
PDFs whose music font is neither SMuFL nor carries glyph names (Sibelius's Opus, older Finale fonts), or whose
symbols were turned into outlines (some browser "print to PDF" output), are reported as having no notation.

Accuracy, measured on PDFs exported by MuseScore 4.6 from 78 library scores and compared note by note with their
MusicXML (measures aligned): about 87% of notes have the right pitch, onset and hand. Most beginner and
intermediate pieces come out exactly; errors concentrate in dense Romantic textures (cross-staff beams, many
voices, unmarked tuplets). LilyPond PDFs (the library's Mutopia scores, and library scores engraved by LilyPond
2.25) read the same way. `tests/piano-pdf-reader.test.cjs` reads one score engraved by both programs (key and
time changes, a triplet, two voices in a hand, a whole-bar rest, a grace note, a repeat with first and second
endings, a tie across the barline, clef changes, fingering) and requires exactly the source's notes.

## Reading scans and photos

`piano-scan-reader.js` reads printed piano music from pictures — PNG, JPEG or WebP photos (several at once, one
per page, in file-name order) or a PDF of scanned pages (rendered at about 300 dpi with pdf.js) — entirely in the
browser: nothing is uploaded and no model is downloaded. It finds the music in the pixels and hands it to the PDF
reader as the drawing primitives notation software would have produced, so both readers share the same
recognition of pitch, rhythm, voices, ties, repeats and the same checks afterwards.

1. **Pixels.** Each picture is drawn at most 20 MP and turned to grey. Paper brightness is measured block by
   block so uneven light and shadows do not matter; darkness is the ratio of a pixel to its paper.
2. **Size and tilt.** The staff space is the commonest distance between thin dark lines down the columns; the
   picture is scaled so it is about 18 pixels, then straightened by the angle that best lines the ink up with the
   pixel rows.
3. **Staves.** Vertical strips show staff lines as five evenly spaced peaks of "line-ness" (darker than the pixels
   a little above and below, so beams and noteheads do not count). Staves are followed from strip to strip and
   each line is traced column by column, so a slightly bent page is followed. Lines are then erased where nothing
   crosses them.
4. **Symbols.** Stems and barlines are tall thin strokes (barlines run from a staff's top line to a bottom line);
   beams are straight bands of steady thickness touching stems; black noteheads are filled ovals centred on a line
   or space; open heads are rings around a hole (half notes have a stem, whole notes are wide); flags are counted
   beside a stem's free end; ledger lines must carry a notehead. Every other piece of ink — clefs, accidentals,
   rests, time-signature and tuplet numbers, dots, ties — is classified by a small neural network (one hidden
   layer of 96 units, 8-bit weights stored in the script) from its size in staff spaces, its holes, its place on
   the staff and a 12 × 12 picture of it. Touching symbols are cut apart when every part is then a confident
   symbol; a dark key signature is taken apart by its upright strokes; key signatures are made to agree across
   the page.
5. **Straightened coordinates.** Everything is mapped onto level staves (a staff space = 7 units, like points in a
   PDF) and passed to `PianoPdfReader.recognize`. In pictures a run of accidentals after a barline is treated as
   ordinary accidentals, not a new key.

The network is trained by `scripts/scan-reader/` on pages Verovio engraves in five music fonts (Leipzig, Bravura,
Leland, Petaluma, Gootville) from library scores and synthetic scores that use every symbol, lightly blurred,
noised and lit unevenly; see its README to rebuild the weights.

Accuracy, measured on 40 library pages engraved in those fonts and compared note by note with their MusicXML
(pitch and onset, measures aligned): about 75% on clean renders, 53% on simulated scans (tilt, blur, noise, JPEG)
and 47% on simulated phone photos (perspective, bending, uneven light). Simple and moderately difficult pieces do
far better (often above 80% even as photos); dense Romantic textures, small grace notes, volta numbers and text
are not read. Handwritten music is not supported. `tests/piano-scan-reader.test.cjs` reads a tilted, noisy scan
and a photo-like page and requires a floor on that accuracy, the key and time, and plain refusals.

## Automatic recognition of scans and photos

`services/score-scanner` prepares an isolated Audiveris HTTP bridge. GitHub Pages cannot run it. An
owner-provided HTTPS host, a real engine installation, recognition tests and public safeguards are
needed before setting `scannerURL`. Once set, the page says where the sheet will be sent, offers an
explicit Scan button, and feeds the returned MusicXML through the same checks.

## Tests

`npm ci && npm run test:piano` covers the engine (repeats, endings, ties, grace notes, rests,
corrections, unsupported cases), the importer (compressed files and their unpacked-size limit,
repeat unfolding with the as-printed fallback, combining two parts) and the PDF reader (MuseScore and
LilyPond PDFs read back to their source; scans and PDFs without notation are refused). `python3 tests/test_score_scanner.py`
covers the scanner boundary. Engraving, saving, accounts and practice are checked in a real browser.
