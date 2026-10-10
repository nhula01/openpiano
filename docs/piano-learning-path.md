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

## Reading: new pieces, the staircase and Find your level

- **Generated pieces** (`site/piano-reading-gen.js`, `window.PianoReadingGen`): `generate(level, seed)`
  writes an eight-bar first-reading piece in the browser, the same piece for the same seed: practice
  notes for the player plus MusicXML that Verovio engraves when the piece is opened. The rules are a
  port of the reading generator in `scripts/build-piano-studies.py` (keys, meters, rhythm cells and
  left-hand patterns per level, two four-bar phrases with a half cadence and an ending on the tonic,
  the melodic rules); run with the build script's search settings it reproduces every seeded
  `reading-L-3…10` piece note for note (tested). The browser keeps the best of three melodies instead
  of twelve: about 3 ms for a piece on a desktop (under 20 ms at worst). Level 0 is new: right hand
  alone in C position, quarters and halves, steps and skips. Never any fingering. Generated music is
  original and CC0.
- **Offering a piece:** `next(level)` registers `gen-reading-<level>-<seed>` in `PianoRepertoire`
  (kind `reading`, `studyLevel`) and returns it; the seed is the lowest one not opened yet, so the
  same piece is offered until it is opened. Opened ids are kept in `openpiano-reading-v1.seen` (and in
  `journey-piano-skills-v1.seen`). The music is written the first time it is needed. Any
  `gen-reading-*` id can be selected (`piano-select-score`) at any time, also after a reload. The
  player prepares an in-memory score before loading it (`entry.prepare()`, used for the engraving).
- **Read something new:** selecting a reading piece with `{ id, reading: true }` shows it as a whole
  page (one large line on a phone) at the level's reading tempo (`TEMPO`, 60 down to 46 BPM) with a
  30-second look-over; then In time starts. "Start now" skips the wait.
- **Reading staircase** (`openpiano-reading-v1`: `{ level, seen, history: { <time>: { id, level,
  accuracy, timing } } }`, synced with the account): the first complete In-time run of a reading
  piece (static `reading-*` or generated), both hands or the only hand written, is a success at 90%
  notes and 75% timing. A success moves the level up a whole step, a miss down half a step (two up,
  one down in half steps), between 0 and 7. Later runs of the same piece, Wait mode, loops and runs
  from the middle do not count. `PianoReadingGen.level()` gives the level; a new learner starts at 0
  (or at `READING[level]` once the path level is above 0).
- **Find your level** (`site/piano-placement.js`, `PianoPlacement.open()`, linked under "Start the
  path at" on Home): one question (never played / a little / for years) picks the first piece (Level
  0 suggested at once, Level 2, Level 4); then up to four generated pieces at sight, In time, with the
  person's MIDI keyboard, microphone or tap keys: up a level after a clean reading, down after a miss
  or "Too hard", stopping when one level is read cleanly and the next is not. It suggests that level
  in one sentence; "Start at Level N" sets the path's start level and the reading level, "Choose
  myself" goes back to the select. Without an input (or with "I can't play right now") it suggests
  from the answer alone, a step lower (1 or 3). Placement pieces do not move the staircase.

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
