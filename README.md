# OpenPiano

A free piano studio in the browser: complete public-domain repertoire by composer,
skills by level, sight-reading, and practice with a MIDI keyboard or a microphone.
Anyone can import their own MusicXML or MIDI scores and keep them private.

- **Library** — 50+ complete works (Bach to Rachmaninoff) with source, transcriber and
  license on every score. Printed fingerings only; none are generated.
- **Practice** — waiting sheet or moving score, both hands, MIDI or microphone input.
- **Skills** — 35 short units, key and chord lab, first-reading miniatures.
- **Your scores / My songs** — import MusicXML or MIDI; private to your browser, or to
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
- `docs/piano-self-service.md` — the score import workflow.
- `site/terms.html`, `site/privacy.html`, `site/copyright.html` — public policies.

## Licenses

Each score in `site/scores/` keeps its own source license (public domain, CC0, or
Creative Commons as stated in its README). Third-party code in `site/vendor/` keeps its
license. A license for OpenPiano's own code has not been chosen yet.
