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

## Removing a piece

Delete `site/scores/<id>/`, remove the id from `site/piano-collection.js` and its entry in
`site/piano-curriculum.js` (entries marked `"collection":true`), and from
`scripts/collection-sources.json`. Takedown requests follow `site/copyright.html`.
