# OpenPiano: working rules

OpenPiano is a public, free piano practice site. Personal data never goes in this
repository; the maintainer's personal journal lives in a separate project.

## Repertoire
- Add complete named works or complete named movements only; never silently truncate
  sections, repeats, endings, pickups, held notes or rests. Label arrangements.
- Sources must be public domain, CC0/Public Domain Mark, or openly licensed without a
  NonCommercial clause (donations are accepted). Re-check a MuseScore transcription's
  license on its page. Keep the source file, attribution and license with the score.
- Every attack must match an engraved notehead (build checks). Verify the ending.
- The music must be public domain worldwide: composer (and arranger) died in 1955 or
  earlier and the work was published in 1930 or earlier, or it is traditional. See
  `docs/collection.md`.
- Songs whose lyricist died after 1955 (e.g. Gershwin's "Swanee", "I Got Rhythm") stay in the
  library as instrumental piano scores: never add or show their lyrics.
- Copyrighted songs (e.g. current pop songs) are never added to the public library;
  people may import their own files privately.

## Fingering
Use, in order: fingerings printed in the chosen source; otherwise printed fingerings
from another public-domain/CC0 edition of the same piece, copied only onto notes with
the same onset, pitch and hand, with credit (`fingeringFrom`). Do not copy fingerings
from video tutorials. If no source exists, show the score as written; never generate
numbers.

## Accounts and privacy
User uploads of scores and songs stay private (row-level security). Never add public
sharing of uploaded scores. Accounts require age 13+. Keep the Terms, Privacy and
Copyright pages accurate when data handling changes.

## Community
Currently hidden (`community: false` in `site/piano-cloud-config.js`). The community (`docs/social.md`) is the only place people share with others: posts,
photos (re-encoded in the browser, private bucket, signed links) and YouTube links to
their own performances. Direct video uploads stay off (`social_config.video_uploads`)
until support pays for storage. Keep the 13–17 protections (approved followers,
media to friends only, friends-only comments, not suggested to adults) and do not add
private messaging. Run `tests/sql/run.sh` after changing any `scripts/supabase-*.sql`.
