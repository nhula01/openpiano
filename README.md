# OpenPiano

A free piano studio in the browser: complete public-domain repertoire by composer,
skills by level, sight-reading, and practice with a MIDI keyboard or a microphone.
Anyone can import their own MusicXML or MIDI scores and keep them private.

- **Library** — about 525 complete pieces: piano classics from Bach to Rachmaninoff, symphony and
  opera themes for piano, carols, hymns, folk and children’s songs, ragtime — each with source, transcriber and
  license on every score. Printed fingerings only; none are generated.
- **Practice** — a full-window practice room. See the music as one scrolling line, falling notes,
  both, or full pages. Wait for me, Play in time or Listen; loop any bars or tap a part of the piece
  (each part tracks right hand, left hand, both, and both in time); speed trainer; the other hand
  plays while you practise one; click with count-in; mistakes shown per bar on the timeline. Swipe the
  music or drag the playhead to move bar by bar. Microphone, MIDI, or tap / computer-key input.
- **Skills** — 35 short units, key and chord lab, first-reading miniatures.
- **My songs** — add MusicXML or MIDI, check it and fix wrong notes, then practice; private to your browser, or to
  your account when signed in.
- **Free** — donations are voluntary and never unlock features.

## Run locally

```
cd site && python3 -m http.server 8000
```
Open http://localhost:8000/. Tests: `npm ci && npm run test:piano`.

## Project documents

- `docs/launch-checklist.md` — what the maintainer must set up before inviting people.
- `docs/accounts-setup.md` — sign-in and private storage (Supabase).
- `docs/piano-study-pathway.md` — how the library and study levels are built.
- `docs/collection.md` — how the large public-domain collection was chosen and built.
- `docs/piano-self-service.md` — how My songs reads, checks and stores people's own scores.
- `site/terms.html`, `site/privacy.html`, `site/copyright.html` — public policies.

## Licenses

Each score in `site/scores/` keeps its own source license (public domain, CC0, or
Creative Commons as stated in its README). The music engraver (Verovio, LGPL-3.0) and the
sign-in library (supabase-js, MIT) load from jsDelivr only on the My songs page. A license for OpenPiano's own code has not been chosen yet.
