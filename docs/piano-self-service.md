# Free self-service piano studio

The public site has a Your scores area and a voluntary Support page. There is no subscription, account requirement or payment gate. `piano-support.json` is the owner's configuration for `supportURL` and `scannerURL`; both are null until real destinations are supplied. Nothing impersonates a donation account or a working hosted scanner.

## Browser workflow

1. Import MusicXML (`.musicxml`, `.xml`, `.mxl`) or MIDI (`.mid`, `.midi`). MusicXML preserves notation and source fingerings. MIDI retains its complete pitch/duration timeline, with reviewable hand assignment, but uses the existing note display rather than reconstructing original engraving.
2. Optionally attach the original PDF/photo for local comparison. Selecting a PDF/photo does not pretend to recognize notes: the app explains scanning and links a free desktop route (Audiveris) and an optional web scanner (Soundslice).
3. MusicXML is unfolded for repeats, rendered with locally served OpenSheetMusicDisplay, checked against every written note/attack, and offered for review. Both the waiting sheet and continuous horizontal practice consume the same data. Source fingering is retained; no fingering inference is performed.
4. Correct an individual pitch in the browser, download the corrected MusicXML, or correct rhythm/layout/navigation in a notation editor and re-import. The user checks the source before opening practice.
5. Save optionally in IndexedDB on the visitor's device. Imported files, attached sheets and scores never enter the repository or public catalog. Source files remain necessary backups. Saved copies can be removed without affecting the originals.

The supported MusicXML subset is partwise, 1 piano part with up to 2 staves or 2 single-staff parts, pitches A0–C8, ordinary notes/rests/chords/voices, numeric durations including tuplets, ties, pickups, ordinary repeated sections and numbered endings. Nested repeats, D.C./D.S./coda/fine, grace-note playback, transposition, microtones, tremolos and ornamental playback must be written out first. They fail explicitly rather than silently omitting music. Limits: 8 MB XML/MXL, 2 MB MIDI, 15 MB original image/PDF, 500 written/1500 unfolded measures, 10,000 playable attacks and 20 saved imports. These are resource limits, not paywalls.

## Automatic PDF/photo recognition

`services/score-scanner` prepares an isolated Audiveris HTTP bridge. GitHub Pages cannot execute it. An owner-provided HTTPS host, real engine/runtime installation, optical-recognition tests and public deployment safeguards are required before setting `scannerURL`. It is not deployed by this change. Once configured, the website explains where the sheet will be sent, offers an explicit Scan button, and feeds the returned MusicXML through the same review and validation flow. Neither recognition nor the user's musical mastery is guaranteed by an upload.

## Tests

Install test dependencies with `npm ci`, then run `npm run test:piano` and `python3 tests/test_score_scanner.py`. Parser tests cover complete repeats, two hands, chords, ties, first/second endings, successive repeat starts, rests, corrections, compressed exports and explicit unsupported cases. Scanner boundary tests use controlled exports and do not claim real OCR accuracy. Browser QA verifies actual rendering, correction, private storage, sheet/scroll playback and support routing. Real MIDI hardware and hosted OCR need their own deployment verification.
