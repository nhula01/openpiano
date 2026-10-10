# The large collection (about 475 pieces)

Alongside the hand-built core library (51 pieces), OpenPiano has a large collection of
well-known music: piano classics, symphonies, opera and ballet themes arranged for piano,
Christmas carols, hymns and spirituals, folk songs, children’s songs, ragtime and popular
songs from before 1931. Every piece opens in Practice with the waiting sheet and the moving
score, like the rest of the library.

## What is allowed in

A piece is added only if both of these hold:

1. **The music itself is public domain worldwide.** The composer (and any arranger whose
   arrangement is used) died in 1955 or earlier, and the work was published in 1930 or
   earlier, or it is traditional. This keeps it free in the US and in countries that protect
   music for 70 years after the author’s death. Examples left out for this reason: modern pop,
   film, game and anime music; Gershwin’s *Summertime*; Rachmaninoff’s *Rhapsody on a Theme
   of Paganini*; Ravel’s Piano Concerto in G; Sibelius; anything by Irving Berlin.
2. **The score is free to share.** Each score is a MuseScore transcription released under
   CC0 1.0 or the Public Domain Mark, taken from the PDMX dataset
   (https://zenodo.org/records/15571083) with no licence conflict flagged.

Uploads that copy a well-known modern arrangement (for example a YouTube pianist’s version, a
film or musical arrangement, or a published method book) are excluded even when marked CC0.

## How pieces were chosen

`scripts/collection/` holds the selection tools:

- `catalog.py` lists the works we wanted (about 1,000 well-known titles) with a title pattern
  each; `composers.py` lists public-domain composers with their death years; `picks.py` adds
  pieces chosen by hand from the most-played public-domain scores.
- `match2.py` finds the best-played matching transcriptions for each work (up to eight per
  work), excluding arrangements of modern music and known bad matches (`fixes.py`).
- Every chosen match was reviewed by title, composer and transcriber; wrong tunes (for example
  a hymn text set to a different tune), partial excerpts and copies of modern arrangements were
  rejected (`review_fix.py`).
- `scripts/build-collection.py` engraves each work from the first candidate that passes every
  check: complete, both hands present, every attack tied to its printed notehead on the page
  and in the moving score, and MIDI matching the practice notes. Repeats and numbered endings
  are written out; scores with D.C./D.S. jumps are kept as printed. 475 works passed.
- `scripts/gen-collection-guidance.py` writes `site/piano-collection.js` and adds study guidance
  and a level to `site/piano-curriculum.js`.

`scripts/collection-sources.json` lists every piece with its MuseScore source and credit, so a
piece can be traced or removed quickly.

## Levels and guidance

Levels come from a small model fitted to the 52 hand-levelled pieces of the core library (note
density, length, share of black keys, octave stretches, chord size). It agrees within one level
for 96% of those pieces. The guidance text is built from measured facts about each score (key,
meter, chord sizes, stretches, length) and the kind of music it is. Printed fingerings are kept
exactly as the transcriber wrote them; none are generated.

## Storage

To keep the site well under GitHub Pages’ 1 GB limit, collection pieces store their practice
data gzip-compressed (`practice.json.gz`, decompressed in the browser) and do not include a PDF
or page images. Each folder keeps the original transcription (`original.mxl`), the practice
MIDI and a README with the credit.

## Method-book ladders (graded teaching pieces)

58 complete teaching pieces fill the early levels with the books teachers have used for 150 years.
They live in their own manifest, `site/piano-method.js` (sources `scripts/piano-method-sources.json`,
titles and study guidance `scripts/piano-method-pieces.json`, levels with evidence in
`scripts/level-overrides.json`). Each score folder keeps the source file, its PDF and a README with
the edition, the typesetter or scan and the licence.

From the Mutopia Project (LilyPond sources; licence checked on each piece page, none NonCommercial):

| Set | Numbers | Mutopia ids | Licence | Level |
|---|---|---|---|---|
| Burgmüller, 25 Études faciles, Op. 100 (Litolff) | 5, 6, 8–14 · 16–18 | 214–225, 228–230 | Public Domain | 3 · 4 |
| Notebook for Anna Magdalena Bach (Bach-Gesellschaft) | Anh. 116, 117a, 117b, 118–121, 128 · 127 · 131 | 77, 1013–1016, 1612–1615 · 767 | Public Domain (Anh. 131: CC BY-SA 2.5) | 3 · 4 · 2 |
| Bach, Applicatio BWV 994 (W. F. Bach notebook) | – | 66 | Public Domain | 3 |
| Bach, Little Preludes (Bach-Gesellschaft) | BWV 924, 926, 940, 941 · 928, 936–938, 942, 943 | 978, 69, 1594, 1595 · 63, 1576, 1591, 1592, 1599, 1533 | CC BY-SA 3.0 (926, 928: Public Domain) | 4 · 5 |
| Tchaikovsky, Children’s Album, Op. 39 (Schirmer 1904) | 1 | 2032 | Public Domain | 3 |
| Schumann, Album for the Young, Op. 68 (Peters) | 9 · 13 | 675, 662 | CC BY-SA 2.5 | 4 · 5 |
| Streabbog, Les étoiles d’or (1882) | 1 | 2092 | CC BY-SA 4.0 | 3 |
| Behr, In May (c. 1903) | – | 2155 | Public Domain | 1 |

Engraved in LilyPond for OpenPiano from public-domain IMSLP scans (sources in `scripts/engravings/`,
each note checked against the scan by eye; printed fingering copied, none added; the engraving is CC0):

| Set | Numbers | Edition (IMSLP file) | Level |
|---|---|---|---|
| Beyer, Vorschule im Klavierspiel, Op. 101 | 12–15, 24, 25, 38, 39 | Peters No. 2721, rev. Adolf Ruthardt (d. 1934), [1895] (#81208) | 1 |
| Köhler, Die allerleichtesten Übungsstücke, Op. 190 | 2–5 · 27 | Gutheil, Moscow, c. 1880 (#105780) | 1 · 2 |
| Köhler, Kinder-Übungen und Melodien, Op. 218 | 32, 36 | Peters, plate 7766, rev. Ruthardt (#527252) | 2 |
| Gurlitt, The First Lessons, Op. 117 | 1–4 | Schirmer’s Library No. 324, 1895 (#400775) | 1 |
| Czerny, 100 Progressive Studies, Op. 139 | 1 | Schirmer 1893, fingered by Max Vogrich (d. 1916) (#81113) | 2 |

Levels follow the RCM 2022 syllabus where it lists the piece (for example Beyer No. 39 at
Preparatory A, Köhler Op. 218 No. 36 at Level 1, Anh. 120 and 121 at Level 4), otherwise Henle
levels, or the position in a progressive set next to listed numbers; each piece’s evidence is stored
as `levelReason`. Within a level a set keeps its printed order (`order` in the curriculum).

Pipeline: `python3 scripts/prepare-mutopia-score.py WORK scripts/piano-method-sources.json` (paths
starting `Engraved/` are compiled from `scripts/engravings/`), `node scripts/read-piano-library-midi.cjs
WORK scripts/piano-method-sources.json`, `python3 scripts/build-piano-library.py WORK
scripts/piano-method-sources.json site/piano-method.js`, then `python3 scripts/apply-learning-path.py`.
D.C./D.S. returns (Burgmüller Nos. 6, 8, 14; Streabbog) are kept as printed, like the rest of the
library. Left out: Bach BWV 933 (LilyPond reports a layout error in the Mutopia source), André’s
Sonatina Op. 34 and A. E. Müller’s Siciliano (unknown source edition), Diabelli Op. 149 and
Op. 163 (four hands; they need a duet part the player does not have yet).

## Removing a piece

Delete `site/scores/<id>/`, remove the id from `site/piano-collection.js` and its entry in
`site/piano-curriculum.js` (entries marked `"collection":true`), and from
`scripts/collection-sources.json`. Takedown requests follow `site/copyright.html`.
