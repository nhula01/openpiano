"""Repair the staff-system crops of already built practice scores (no LilyPond or Verovio needed).

Two build bugs cut the moving score (and the sheet view's playhead and auto-scroll) in the wrong
place, most visibly near the end of a page:

* LilyPond pieces (build-piano-library.py) took hairpins, dashed 8va lines and brackets for staff
  lines and always paired staves two by two, so a stray line, a one-staff line or a four-staff
  passage shifted every later system (for example the last page of Für Elise). Their systems are
  re-cut from the stored pages with engraving_staves.py.
* Verovio pieces (build-musicxml-library.py, build-collection.py) cut each system halfway to the
  next one, which sliced off notes written on many ledger lines. Their crops are widened to hold
  every notehead of the system.

Changed files get a new ?v= hash wherever site/*.js links them, so browsers fetch the fix.

    python3 scripts/repair-engraving-systems.py [site] [id ...]
"""
import gzip, hashlib, json, pathlib, re, sys, xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from engraving_staves import NS, head_position, note_key, split_page

ET.register_namespace('', NS[1:-1])
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
site = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'site')
only = set(sys.argv[2:])


def recut_lilypond(id, data):
    e = data['engraving']
    systems = []
    for page, p in enumerate(e['pages']):
        tree = ET.fromstring(p['svg'])
        heads = [(float(g.get('data-beat')), *pos, note_key(g)) for g in tree if g.get('class') == 'score-note' and (pos := head_position(g))]
        if heads:
            systems += split_page(tree, heads, page)
    end = data.get('totalBeats') or e['systems'][-1]['end']
    for i, s in enumerate(systems):
        s['end'] = systems[i + 1]['start'] if i + 1 < len(systems) else end
    shown = set()
    for s in systems:
        for g in ET.fromstring(s['svg']).iter(NS + 'g'):
            if g.get('class') == 'score-note' and g.find(NS + 'g') is not None:
                shown.add((round(float(g.get('data-beat')), 5), int(g.get('data-midi'))))
    missing = [n for n in data['notes'] if (round(n['beat'], 5), n['midi']) not in shown]
    assert not missing, f'{id}: moving notation would cut {len(missing)} noteheads'
    return systems


def widen_verovio(id, data):
    e = data['engraving']
    where = {}
    for pi, p in enumerate(e['pages']):
        for n in p['notes']:
            where.setdefault((pi, round(n['beat'], 5), n['midi']), []).append(n['y'])
    systems = []
    for s in e['systems']:
        s = dict(s)
        ys = []
        for midi, beat in re.findall(r'class="score-note"[^>]*?data-midi="(\d+)"[^>]*?data-beat="([^"]+)"', s['svg']):
            ys += where.get((s['page'], round(float(beat), 5), int(midi)), [])
        lines = sorted({float(m) for m in re.findall(r'<path d="M[-\d.]+ ([-\d.]+) L', s['svg'])})
        space = (lines[4] - lines[0]) / 4 / 100 if len(lines) >= 5 else 1.8
        if ys:
            y0, y1 = min(s['y'], min(ys) - 3 * space), max(s['y'] + s['height'], max(ys) + 3 * space)
            if y0 < s['y'] - 1e-6 or y1 > s['y'] + s['height'] + 1e-6:
                y0, y1 = round(y0, 2), round(y1, 2)
                vb = re.search(r'viewBox="([^"]+)"', s['svg'])
                x, _, w, _ = vb[1].split()
                s['svg'] = s['svg'][:vb.start()] + f'viewBox="{x} {y0 * 100:.1f} {w} {(y1 - y0) * 100:.1f}"' + s['svg'][vb.end():]
                s['staffTop'] += s['y'] - y0
                s['y'], s['height'] = y0, round(y1 - y0, 2)
        systems.append(s)
    return systems


scripts = {f: f.read_text() for f in site.glob('*.js')}
changed = []
for folder in sorted((site / 'scores').iterdir()):
    id = folder.name
    if only and id not in only:
        continue
    path = next((folder / n for n in ('practice.json', 'practice.json.gz') if (folder / n).exists()), None)
    if not path:
        continue
    raw = path.read_bytes()
    data = json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)
    e = data.get('engraving')
    if not e or not e.get('pages') or id == 'entertainer':
        continue
    verovio = 'Verovio' in e['pages'][0]['svg']
    systems = widen_verovio(id, data) if verovio else recut_lilypond(id, data)
    bad = [i for i, s in enumerate(systems) if not (s['start'] < s['end'] and 0 <= s['staffTop'] and s['staffTop'] + s['staffGap'] <= s['height'] + 1e-6)]
    assert not bad, f'{id}: systems {bad} still cut in the wrong place'
    if systems == e['systems']:
        continue
    e['systems'] = systems
    blob = json.dumps(data, separators=(',', ':')).encode()
    out = gzip.compress(blob, 9, mtime=0) if path.suffix == '.gz' else blob
    path.write_bytes(out)
    old, new = hashlib.sha256(raw).hexdigest()[:12], hashlib.sha256(out).hexdigest()[:12]
    for f, text in scripts.items():
        scripts[f] = text.replace(f'scores/{id}/{path.name}?v={old}', f'scores/{id}/{path.name}?v={new}')
    changed.append(id)
for f, text in scripts.items():
    if text != f.read_text():
        f.write_text(text)
print(f'repaired {len(changed)} scores:', ', '.join(changed) if changed else 'none')
