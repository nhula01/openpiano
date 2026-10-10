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

`apply-learning-path.py` also inserts the method-book ladder pieces (`site/piano-method.js`) with the
guidance written in `scripts/piano-method-pieces.json`; see `docs/collection.md`.

`apply-learning-path.py` is idempotent. It also inserts the Level 0 level object and the 20 First
keys curriculum entries (their prerequisites, exercise and check are written in the script), and
prints the number of pieces per level. It exits non-zero if an override id no longer matches.

## Original pieces

First keys pieces and the first-reading pieces are built with LilyPond by
`scripts/build-piano-studies.py` (see `docs/piano-study-pathway.md`). They are original works
dedicated to the public domain (CC0). Following AGENTS.md, they carry no fingering numbers.
