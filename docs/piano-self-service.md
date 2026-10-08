# My songs: people's own scores

My songs is one page for bringing your own music: add a file, check it, practice it, and keep
it privately. There is no subscription and no account requirement. `piano-support.json` holds the
owner's `supportURL` (donations) and `scannerURL` (optional PDF/photo scanner); both are null until
real destinations exist.

## Adding a song

1. **Choose a file.** MusicXML (`.musicxml`, `.xml`, `.mxl`) keeps the sheet music and printed
   fingering. MIDI (`.mid`, `.midi`) keeps every note and rhythm and practices with the note display.
   A PDF or photo is attached for reference only: the page explains how to turn it into MusicXML with
   Audiveris (free) or a web scanner, and offers the owner's scanner when `scannerURL` is set.
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

## Automatic PDF/photo recognition

`services/score-scanner` prepares an isolated Audiveris HTTP bridge. GitHub Pages cannot run it. An
owner-provided HTTPS host, a real engine installation, recognition tests and public safeguards are
needed before setting `scannerURL`. Once set, the page says where the sheet will be sent, offers an
explicit Scan button, and feeds the returned MusicXML through the same checks.

## Tests

`npm ci && npm run test:piano` covers the engine (repeats, endings, ties, grace notes, rests,
corrections, unsupported cases) and the importer (compressed files and their unpacked-size limit,
repeat unfolding with the as-printed fallback, combining two parts). `python3 tests/test_score_scanner.py`
covers the scanner boundary. Engraving, saving, accounts and practice are checked in a real browser.
