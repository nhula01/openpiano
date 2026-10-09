# My songs: people's own scores

My songs is one page for bringing your own music: add a file, check it, practice it, and keep
it privately. There is no subscription and no account requirement. `piano-support.json` holds the
owner's `supportURL` (donations) and `scannerURL` (optional PDF/photo scanner); both are null until
real destinations exist.

## Adding a song

1. **Choose a file.** MusicXML (`.musicxml`, `.xml`, `.mxl`) keeps the sheet music and printed
   fingering. MIDI (`.mid`, `.midi`) keeps every note and rhythm and practices with the note display.
   A PDF exported from notation software is read into MusicXML in the browser (see "Reading PDFs" below)
   and attached for comparison. A scanned PDF or photo is attached for reference only: the page explains how
   to turn it into MusicXML with Audiveris (free) or a web scanner, and offers the owner's scanner when
   `scannerURL` is set.
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
3. **Fix it.** A single wrong pitch can be corrected in the browser (sheet and practice update
   together) and the corrected MusicXML downloaded. For MIDI with several tracks, the person picks
   which hand plays each track. Rhythm, hands and layout are fixed in a notation editor.
4. **Save it or practice it.** "Save to My songs and practice" stores the file (the corrected
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
(practice plays them once as printed). Scanned pages and photos hold only pictures and are reported as such.
PDFs whose music font is neither SMuFL nor carries glyph names (Sibelius's Opus, older Finale fonts), or whose
symbols were turned into outlines (some browser "print to PDF" output), are reported as having no notation.

Accuracy, measured on PDFs exported by MuseScore 4.6 from 78 library scores and compared note by note with their
MusicXML (measures aligned): about 87% of notes have the right pitch, onset and hand. Most beginner and
intermediate pieces come out exactly; errors concentrate in dense Romantic textures (cross-staff beams, many
voices, unmarked tuplets). LilyPond PDFs (the library's Mutopia scores, and library scores engraved by LilyPond
2.25) read the same way. `tests/piano-pdf-reader.test.cjs` reads one score engraved by both programs (key and
time changes, a triplet, two voices in a hand, a whole-bar rest, a grace note, a repeat with first and second
endings, a tie across the barline, clef changes, fingering) and requires exactly the source's notes.

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
