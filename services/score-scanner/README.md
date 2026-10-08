# Optional community sheet scanner

The public GitHub Pages app runs MusicXML/MIDI import and practice locally in the browser. It cannot execute optical recognition. This separate Python bridge is prepared for a host with [Audiveris](https://github.com/Audiveris/audiveris) and Poppler installed. **No scanner host is connected by default. Actual recognition has not been verified on this machine; test it on the deployment host before enabling the public button.**

Install a current official Audiveris distribution and its documented Java/runtime requirements. Install Poppler (`pdfinfo`). Set `AUDIVERIS_BIN` to the trusted executable, then run:

```
AUDIVERIS_BIN=/absolute/path/to/Audiveris python3 services/score-scanner/server.py
```

The default binds only to loopback, allows requests from the local studio, accepts PDF/PNG/JPEG, processes one job at a time, has a total quota of 20 scans/hour, and deletes temporary files after each request. It refuses oversized files, images above 20 megapixels, PDFs above 12 pages, split/missing exports and unverifiable PDF page coverage. It does not silently scan only selected pages. Audiveris recognition may still be wrong, so the browser requires review before practice.

For a public deployment, use a dedicated unprivileged isolated container/VM, resource limits (CPU/memory/processes/temp storage), a TLS reverse proxy, request/body/time limits and network restrictions. Do not run it alongside personal journals or credentials. Set `SCANNER_ORIGINS=https://nhula01.github.io` and, only inside the isolated service, `SCANNER_BIND=0.0.0.0`. If using a proxy, add per-client rate limits there; the application's own quota is intentionally global to cap community costs. Confirm all runtime licenses, including Audiveris's AGPL license; the scanner source is available in this repository and the engine is distributed by its upstream project.

`GET /health` reports availability. `POST /scan` accepts the raw file with its content type and returns `xml`, page count and `reviewRequired`. No filename or filesystem path is accepted from the client. The app never submits to a scanner until the visitor explicitly clicks the scan button, which names the configured server. Set `scannerURL` in `site/piano-support.json` to the HTTPS service base URL only after a deployment and real multi-page recognition check. The browser then imports the response into the same validation and editable review flow. An original PDF/photo stays attached locally for comparison.
