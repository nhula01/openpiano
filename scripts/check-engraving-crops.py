"""Find staff-system crops that cut off part of what is drawn for the system.

A crop must hold the system's staves and noteheads (tests/piano-score-crops.test.cjs) and also its
stems, beams, slurs, octave lines, pedal marks and tempo or expression text. This measures what is
drawn in every crop (engraving_extent.py) and lists the systems where it reaches past the crop by
more than half a staff space, with the kind of mark that does.

    python3 scripts/check-engraving-crops.py [site] [id ...]

scripts/repair-engraving-systems.py widens crops to hold their marks, up to 14 staff spaces from the
staves or 6 from the highest and lowest notes (6 past the cut between systems for LilyPond); what remains listed is beyond that.
"""
import gzip, json, pathlib, re, sys, xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from engraving_extent import ID, _mul, defs_of, extent, furniture, transform_of, verovio_space

CONTAINERS = {'page-margin', 'system', 'section', 'measure', 'staff', 'layer', 'mdiv', 'score', 'ending', 'beam', 'chord'}

site = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'site')
only = set(sys.argv[2:])
rows = []
for folder in sorted((site / 'scores').iterdir()):
    if only and folder.name not in only:
        continue
    path = next((folder / n for n in ('practice.json', 'practice.json.gz') if (folder / n).exists()), None)
    if not path:
        continue
    raw = path.read_bytes()
    e = json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw).get('engraving')
    if not e or not e.get('systems'):
        continue
    verovio = 'Verovio' in e['pages'][0]['svg']
    cut = []
    for i, s in enumerate(e['systems']):
        root = ET.fromstring(s['svg'])
        x, y, w, h = map(float, root.get('viewBox').split())
        space = verovio_space(s['svg']) if verovio else 1
        defs, found = defs_of(root), []

        def walk(el, m):
            # Verovio: measure each mark (class tempo, dir, pedal, slur, beam, ...) inside its containers.
            cls = (el.get('class') or '').split(' ')[0]
            if el is root or (verovio and cls in CONTAINERS):
                m = _mul(transform_of(el.get('transform')), m) if el is not root else m
                for c in el:
                    walk(c, m)
                return
            r = extent(el, defs, m, skip=furniture if verovio else None)
            if r:
                found.append((max(y - r[0], r[1] - (y + h)) / space, cls or next((g.tag.split('}')[-1] for g in el.iter() if g is not el), el.tag.split('}')[-1])))

        walk(root, ID)
        worst, what = max(found, default=(0, ''))
        if worst > .5:
            cut.append((i, worst, what))
    if cut:
        rows.append((folder.name, len(e['systems']), cut))
rows.sort(key=lambda r: -len(r[2]))
for id, n, cut in rows:
    kinds = sorted({w for _, _, w in cut})
    print(f'{id[:44]:45} systems cut {len(cut):3} / {n:<4} worst {max(c[1] for c in cut):.1f} spaces · {", ".join(kinds)[:80]}')
print('scores with cut marks:', len(rows))
