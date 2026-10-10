# OpenPiano

A free piano studio in the browser: complete public-domain repertoire by composer,
skills by level, sight-reading, and practice with a MIDI keyboard or a microphone.
Anyone can import their own MusicXML, MIDI or PDF scores, or scans and photos of printed music, edit them in the built-in sheet editor (note input by keyboard, mouse, on-screen piano or MIDI keyboard, voices, copy/paste, palettes, playback), and keep them private.

OpenPiano is also an installable Progressive Web App. The public app shell and public
scores a learner opens can work offline; account traffic and private uploads are not
stored in the service-worker cache.

- **Library** — about 525 complete pieces: piano classics from Bach to Rachmaninoff, symphony and
  opera themes for piano, carols, hymns, folk and children’s songs, ragtime — each with source, transcriber and
  license on every score. Printed fingerings only; none are generated.
- **Practice** — Normal Sheet or Continuous Sheet. Practice waits for correct notes; Play follows the tempo; Listen previews from the yellow line. Move the position slider, click a note or drag the line to choose a start. Restart returns to the beginning. The input button on the practice bar switches between a MIDI keyboard, the microphone and tap/typing, and shows the connected keyboard or what the microphone hears. MIDI hears every connected keyboard, including one plugged in later (Web MIDI: Chrome, Edge, Firefox; not Safari or iPhone/iPad). The microphone (`site/piano-listen.js`) hears the whole piano, A0–C8, both hands and chords. It listens strike by strike: it detects each strike against the room's own noise, compares the sound just after the strike with the sound just before it (so notes still ringing or held with the pedal cancel out), and checks the notes the score wants in what is new. A note an octave or a twelfth off, a neighbouring key and an overtone do not count; a repeated strike does; other clear notes are reported as wrong. Each note carries the time it was struck, so timing is measured from the strike. A grace note may be passed over when the note after it is heard. Audio stays on the device. In time and Follow me accept a note within a timing window (half a beat, 0.2–0.35 s) and report two scores: accuracy (right notes) and timing (full marks within 50 ms of the beat).
- **Skills** — 35 short units, key and chord lab, first-reading miniatures.
- **My songs** — add MusicXML, MIDI or a PDF from notation software (read into sheet music in the browser), check it
  and fix wrong notes, then practice; private to your browser, or to your account when signed in.
- **Community** (built, hidden for now; see `docs/social.md`) — follow other pianists (people who follow each other are friends), post progress,
  practice results, photos and YouTube-linked performances, scroll performances in Reels, and show
  what you are working on. Extra protections for members aged 13–17. See `docs/social.md`.
- **Free** — donations are voluntary and never unlock features.

## Run locally

```
cd site && python3 -m http.server 8000
```
Open http://localhost:8000/. Tests: `npm ci && npm run test:piano`; database checks:
`tests/sql/run.sh` (needs a local PostgreSQL, see `docs/social.md`).

PWA installation and service workers require HTTP on localhost or HTTPS in production.

## Project documents

- `docs/launch-checklist.md` — what the maintainer must set up before inviting people.
- `docs/accounts-setup.md` — sign-in and private storage (Supabase).
- `docs/piano-study-pathway.md` — how the library and study levels are built.
- `docs/collection.md` — how the large public-domain collection was chosen and built.
- `docs/piano-self-service.md` — how My songs reads, checks and stores people's own scores.
- `docs/community.md` — note comments and fingering add-ons on library pieces.
- `docs/social.md` — the Community tab, Reels, costs, moderation and the 13–17 protections.
- `site/terms.html`, `site/privacy.html`, `site/copyright.html` — public policies.

## Licenses

Each score in `site/scores/` keeps its own source license (public domain, CC0, or
Creative Commons as stated in its README). The music engraver (Verovio, LGPL-3.0) and the
sign-in library (supabase-js, MIT) load from jsDelivr only on the My songs page. A license for OpenPiano's own code has not been chosen yet.
