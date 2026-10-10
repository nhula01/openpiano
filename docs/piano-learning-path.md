# The learning path

How OpenPiano decides where a learner is and what to practise today. The full proposal, research
and roadmap are in the pitch document "OpenPiano learning path: pitch"; this file covers what is
built and how to maintain it.

## Structure

- **Levels 0–7.** Level 0 "Start here · first keys" is new: 20 original CC0 pieces, `first-01` …
  `first-20`, each adding one thing (landmarks, bass clef, hands taking turns, hands together, G and
  F positions, 3/4, eighth notes). Levels 1–7 are anchored to RCM grades, with Henle levels as a
  second check:

  | Level | RCM | Level | RCM |
  |---|---|---|---|
  | 1 | Prep A–B | 5 | 7–8 |
  | 2 | 1–2 | 6 | 9–10 |
  | 3 | 3–4 | 7 | ARCT |
  | 4 | 5–6 | | |

- **Five strands in every level:** repertoire, studies and technique, reading, ear and rhythm,
  harmony and chords. The skill units (`site/piano-skills.js`, 40 units, 0.1–7.x) carry the theory
  and ear work; the key studies and first-reading pieces (`site/piano-studies.js`) carry technique
  and reading.
- **Nothing is locked.** A learner can choose any level ("Start the path at" on Home) or any piece.

## How progress is worked out (`site/piano-path.js`)

Everything is read from what the player already records in the browser; nothing is ticked by hand.

- **Learned piece:** a whole-piece, both-hands pass (`journey-note-passes-v1`, key
  `<id>:all:full`, Wait or In time) at 90% or better. The date of the latest such pass is kept.
- **Level finished:** `EXIT[level]` learned pieces (12 for Level 0, 4 for Levels 1–3, 3 from Level
  4). Level 0 also finishes when `first-20` is learned.
- **Learner level:** the chosen start level (`my-journey-piano-pathway-v2.startLevel`, default 0),
  moved past every finished level.
- **Up next:** the selected piece if it has been started and is not learned yet; otherwise the first
  unlearned piece of the learner's level (one already started first, in `order`), then the next
  level.
- **Today** (`PianoPath.today()`, shown on Home):
  1. Warm-up: a key study for the level, a different key each day (from Level 2).
  2. Up next: the piece, Wait mode first, then In time.
  3. Reading: a first-reading piece not opened yet, at `READING[level]` (reading runs a level
     behind repertoire). Opening a score marks it seen (`piano-score-viewed`).
  4. Review: the piece learned longest ago, once it is more than 3 days old, played cold.

Home re-renders when progress changes (`piano-progress-changed`).

## Levels of library pieces

The generated curriculum (`site/piano-curriculum.js`) is corrected by hand-reviewed decisions in
`scripts/level-overrides.json`:

- `levels`: `{ "<id>": [level, "evidence"] }`. The evidence (RCM syllabus grade, Henle level, or a
  measured comparison) is stored as `levelReason` on the piece. An id ending in `*` matches a single
  piece by prefix.
- `chorales`: four-voice hymn settings, moved to at least the given level.
- `remove`: entries that are incomplete or misidentified, with the reason. They are removed from
  the curriculum, `scripts/collection-sources.json` and `site/piano-collection.js`, and their score
  folder is deleted.
- `titles`: corrected titles, written into the library and collection manifests, the sources file,
  `scripts/build-piano-library.py` and the piece's `practice.json`.

After any script that rewrites the curriculum (`gen-collection-guidance.py`,
`add-famous-curriculum.py`, `add-pdmx-curriculum.py`), run:

```
python3 scripts/apply-learning-path.py
python3 scripts/stamp-assets.py
npm run test:piano
```

`apply-learning-path.py` is idempotent. It also inserts the Level 0 level object and the 20 First
keys curriculum entries (their prerequisites, exercise and check are written in the script), and
prints the number of pieces per level. It exits non-zero if an override id no longer matches.

## Original pieces

First keys pieces and the first-reading pieces are built with LilyPond by
`scripts/build-piano-studies.py` (see `docs/piano-study-pathway.md`). They are original works
dedicated to the public domain (CC0). Following AGENTS.md, they carry no fingering numbers.

## Play by chords (the second route)

Home asks once, in the Today panel, "What do you want to do first?": **Read and play pieces** (the
default) or **Play songs with chords**. The answer is `route: 'reading' | 'chords'` in
`my-journey-piano-pathway-v2` and only changes what Today suggests first; both routes stay open, and
the chords route still shows the reading item. On the chords route Today adds
`PianoChords.todayItem(level)`: the next chord lesson not yet passed, with its pass rule.

**Files.** `site/piano-chords.js` (`window.PianoChords`: checker, progressions, curriculum, progress),
`site/piano-chords-trainer.js` (the screen at `#chords`, `#chords/<lesson>`, `#chords/song/<id>`, the
Library shelf and the route question), `site/piano-leadsheets.js` (generated lead sheets).

**The checker.** Chord symbols use the same suffixes and MusicXML kinds as the sheet editor's
`parseChord` (`C`, `F#m7`, `Bbmaj7/D`, `G7`, `Am/E`, `Ddim`, `Gm6` …). What is held is reduced to
pitch classes:

- Stage A: any voicing or inversion of the right pitch classes; doublings are fine; the fifth may be
  left out of a seventh or sixth chord; no note from outside the chord.
- Stage B: as A, and the lowest note is the root (or the slash bass).
- Stage C: exactly the notes shown on the keyboard diagram (the shortcut shapes of lesson 1-2).
- Voice leading: total semitone movement between the learner's shapes against the least movement any
  shapes could manage from the same first chord ("you moved 21 semitones; the closest shapes move 9").
- Left-hand patterns (block, root only, root–fifth, broken 1–5–8, waltz, arpeggio, Alberti, ballad,
  stride, swung boogie) are slots of beat and role (root, third, fifth, sixth, seventh, ninth, or
  "chord" = two or more chord tones together); each slot is hit by a matching note inside a window
  of about a fifth of a beat (90–160 ms).
- Wait mode moves on when the chord is right (a note struck within 150 ms of a pass belongs to that
  chord). In time has one bar of count-in; a chord is on time when it is complete within the window
  after its beat; a chord held across an identical change counts.
- MIDI and tap keys are checked exactly. The microphone is checked leniently, from the pitch classes
  heard over the last 0.7 s (root and third, at most one stray note), so only stage A is possible
  and the screen says so. On-screen keys latch (tap to hold, tap to lift; they lift when the chord
  is right) so a mouse can build a chord; for patterns in time they are momentary.
- Input arrives through `PianoPractice.on('input', fn)`: the player emits `{midi, on, time, source}`
  for every note from MIDI, tap keys and the microphone, practising or not.

**Curriculum** (original, CC0; data, not engraved scores), 31 lessons in five levels:
1 three chords in C, G and F with the nearest-shape shortcut and the root in the bass; 2 minor chords
and the loops I–V–vi–IV, vi–IV–I–V, I–vi–IV–V, A minor i–iv–V; 3 the left-hand pattern ladder; 4 V7,
D major, the ragtime circle I–VI7–II7–V7 and I–IV–V7–I round all twelve keys; 5 12-bar blues,
boogie walking bass and stride. Each lesson has a goal, a progression in Roman numerals (spelled in
any of the 12 keys of its mode by `PianoChords.numeral`, so the learner can change key), a pattern,
a tempo and a pass rule, e.g. ch-1-7: in time, stage B, 80 BPM, 90% of chords on time. A pass
needs In time; Wait mode is for learning the shapes. Every level also asks for one reading piece at
the same level (`reading-<level>-*`, or `PianoReadingGen.next(level)` when that exists).

**Progress** is `openpiano-chords-v1`, synced with the account:
`{lessons: {<id>: {a: {<time>: {m, s, bpm, in, ot, ok, vl?, pt?, mel?, pass, key?}}}}, last}`.
Lead-sheet runs are stored under `song-<id>`. Per-viewer settings (stage, mode, tempo, key, input)
are in `openpiano-chords-ui-v1` and are not synced.

**Lead sheets.** `python3 scripts/build-chord-leadsheets.py` writes `site/piano-leadsheets.js` from
library songs that are public domain worldwide *and* whose transcription already carries `<harmony>`
chord symbols. The symbols are the transcriber's, unchanged (the transcriptions are CC0 or Public
Domain Mark); nothing is harmonised by us and no modern fake book is used. The melody is the top
right-hand note of the practice data. The script lines the chords up with the practice beats
(unfolding simple repeats where the practice score does) and refuses a song where fewer than 60% of
melody notes on the beat belong to the chord above them. Shipped: Amazing Grace, Skip to My Lou,
Scarborough Fair, Go Down Moses, The Holly and the Ivy, Home on the Range (Kelley d. 1905, Higley
d. 1911), By the Light of the Silvery Moon (Edwards d. 1945, Madden d. 1952), Sometimes I Feel Like
a Motherless Child (arr. Burleigh d. 1949). Skipped: O for a Thousand Tongues (stray labels) and Mary
Had a Little Lamb (a jazz reharmonisation). Never use `gershwin-swanee` or `gershwin-i-got-rhythm`
(lyricists died after 1955).
