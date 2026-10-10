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

## Difficulty and order inside a level

Evidence decides a piece's level; a difficulty score computed from the score data orders the pieces
inside each level and flags pieces that look misplaced.

- **`scripts/difficulty.py`** (pure Python) reads every piece's practice notes
  (`site/scores/<id>/practice.json(.gz)`) and its tempo: the tempo map of `practice.midi` when it has
  one, otherwise every tempo marking in `original.mxl` (placed by position, because the practice notes
  have their repeats written out), otherwise the study's own tempo, otherwise ♩=100 (about 95
  collection pieces have no marked tempo). It computes, at the marked tempo: notes per second in the
  busy bars for each hand, the busiest 4 seconds, the shortest note, chord sizes, notes sounding at once
  in one hand (voices), the widest stretch, leaps and fast leaps, hand position shifts per minute,
  range, key signature, chromatic notes and black keys, tuplets, dotted notes, syncopation, hand
  independence and length. All of them are kept in `scripts/difficulty.json`.
- **The model** is a ridge regression of the level on nine of them (speed of both hands, range,
  position shifts, stretch, largest chord, usual chord size, voices, key and length), with cut points
  between levels. It is fitted on the pieces whose level is known: those with RCM or Henle evidence in
  their `levelReason`, the hand-levelled library pieces, and First keys (Level 0). Reading and key
  studies are left out (a reading level is not a repertoire level; the key studies are one template in
  24 keys). The weights are printed by the script. Usual chord size has a negative weight next to the
  largest chord: for the same largest chord, block-chord writing (hymns, chorales) is easier than
  occasional big chords inside running textures.
- **Accuracy** (leave-one-out, each piece predicted by a model fitted without it, on the 135 levelled
  pieces): 61% exact, 93% within one level, rank correlation with the level 0.85. The old collection
  model scores 22% exact on the same pieces as shipped (its 48% was measured before the levels were
  anchored to RCM), and 56% exact, 90% within one, with its cut points re-fitted. The inputs were
  chosen with the same runs, so expect a few points less on new pieces. The current numbers are at the
  top of `scripts/difficulty-suspects.md`.
- **Blind spots**: counterpoint (inventions, fugues), voicing and rubato (Träumerei), rolled chords
  written as chords, scores on three staves (the middle staff is counted in one hand), multi-tempo
  works whose tempo markings are missing, and short pieces (length pulls the score down).

`scripts/apply-learning-path.py` then gives every curriculum piece `difficulty` (0–100, rounded) and an
explicit `order` inside its level, and writes the curriculum sorted by level, then order:

1. original pieces (`original: true`, First keys) in their authored order;
2. every other piece by difficulty, easiest first;
3. pieces of a teaching collection (Czerny, Burgmüller Op. 100, Schumann Op. 68, Lemoine Op. 37,
   Duvernoy Op. 176, Clementi Op. 36, Kuhlau, Gurlitt, Bach's Inventions and Sinfonias; the list is
   `PROGRESSIVE_SETS` in `difficulty.py`) keep their printed sequence: they take the places their
   difficulties give them, in number order. Concert sets (Chopin's études and preludes) are ordered by
   difficulty.

`site/piano-path.js` (`levelPieces`) and the Library's level pages sort by `order`, so they follow it
with no code change; the Library home shelf keeps library pieces before the collection, each in this
order.

**Suspects.** `scripts/difficulty-suspects.md` lists the pieces whose level is two or more away from
the predicted one. `tests/piano-difficulty.test.cjs` fails when such a piece has no `levelReason`
(a reason starting "difficulty model" does not count), and when a curriculum piece is missing from
`difficulty.json`, so a new import has to be scored. To clear a suspect, either move it in
`scripts/level-overrides.json` one level towards the prediction, with the reason
`difficulty model (predicts N): <measurements>`, or give the evidence (RCM grade, Henle level) or the
musical reason the model cannot see. Never move a piece that has RCM or Henle evidence.

After an import, or after changing `scripts/level-overrides.json`:

```
python3 scripts/apply-learning-path.py   # levels from the overrides (only when they changed)
python3 scripts/difficulty.py && python3 scripts/apply-learning-path.py
npm run test:piano
```

`difficulty.py` takes about half a minute and is deterministic; both scripts are idempotent.

## Original pieces

First keys pieces and the first-reading pieces are built with LilyPond by
`scripts/build-piano-studies.py` (see `docs/piano-study-pathway.md`). They are original works
dedicated to the public domain (CC0). Following AGENTS.md, they carry no fingering numbers.
