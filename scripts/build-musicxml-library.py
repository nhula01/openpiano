"""Build complete practice scores from CC0 / public-domain MusicXML (PDMX / MuseScore).

Usage: python3 scripts/build-musicxml-library.py SOURCES_JSON OUTPUT_JS [id ...]

SOURCES_JSON maps an id to {"title", "composer", "transcriber", "url", "license"};
the source file is site/scores/<id>/original.mxl, bundled unchanged.

Verovio engraves the MusicXML (pip install verovio). Timing comes from the
MusicXML durations (the transcription's own playback timeline); every note keeps
its MusicXML id through Verovio, so each attack is tied to its printed notehead. The output has the same shape as
build-piano-library.py (tagged pages and continuous systems for the moving
score), and the same checks: every attack has a notehead on a page and in the
moving notation, both hands are present and the timeline is complete.

Source clean-up, applied only to the practice copy:
- Notes the transcriber hid (print-object="no") are MuseScore playback helpers.
  They are never printed, so they become silent <forward> skips.
- A tie continues a note: tied continuations add length, not a new attack.
- Hands come from the staff a note is printed on (upper staff = right hand).
Requires poppler (pdftoppm) and Chromium via Playwright for the reference PDF.
"""
import copy, hashlib, json, pathlib, re, subprocess, sys, zipfile
import xml.etree.ElementTree as ET
import verovio

SVG = 'http://www.w3.org/2000/svg'; ns = '{%s}' % SVG
ET.register_namespace('', SVG); ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
sources = json.loads(pathlib.Path(sys.argv[1]).read_text()); output = pathlib.Path(sys.argv[2]); only = set(sys.argv[3:])
OPTIONS = {"pageHeight": 2970, "pageWidth": 2100, "pageMarginLeft": 100, "pageMarginRight": 100, "adjustPageHeight": False,
           "svgHtml5": True, "footer": "none", "header": "auto", "breaks": "auto", "scale": 100, "spacingSystem": 14}


def read_mxl(path):
    with zipfile.ZipFile(path) as z:
        container = ET.fromstring(z.read('META-INF/container.xml'))
        name = next(e.get('full-path') for e in container.iter() if e.get('full-path'))
        return z.read(name)


def clean_xml(data, meta):
    root = ET.fromstring(data); hidden = 0
    # Title block from our metadata; the transcription's page credits are layout text.
    for parent in [root]:
        for c in list(parent):
            if c.tag in ('credit', 'movement-title', 'movement-number', 'work'):
                parent.remove(c)
    work = ET.Element('work'); ET.SubElement(work, 'work-title').text = meta['title']; root.insert(0, work)
    ident = root.find('identification')
    if ident is not None:
        for c in ident.findall('creator'):
            ident.remove(c)
        ET.SubElement(ident, 'creator', type='composer').text = meta['composer']
    metronomes = 0
    # Directions hidden in the transcription (playback tempo changes and the like) stay hidden.
    for measure in root.iter('measure'):
        for d in list(measure.findall('direction')):
            kinds = [c for t in d.findall('direction-type') for c in t]
            if d.get('print-object') == 'no' or (kinds and all(c.get('print-object') == 'no' for c in kinds)):
                measure.remove(d)
            elif any(c.tag == 'metronome' for c in kinds):
                # Metronome marks after the first are the transcriber's playback tempo changes; words stay.
                metronomes += 1
                if metronomes > 1:
                    for t in list(d.findall('direction-type')):
                        if t.find('metronome') is not None:
                            d.remove(t)
                    if d.find('direction-type') is None:
                        measure.remove(d)
    for el in root.iter():
        if el.tag in ('part-name', 'part-abbreviation'):
            el.text = ''
    for measure in root.iter('measure'):
        for note in list(measure):
            if note.tag != 'note' or note.get('print-object') != 'no':
                continue
            hidden += note.find('rest') is None
            pos = list(measure).index(note); measure.remove(note)
            if note.find('chord') is not None or note.find('grace') is not None:
                continue
            fwd = ET.Element('forward')
            for tag in ('duration', 'voice', 'staff'):
                if note.find(tag) is not None:
                    fwd.append(copy.deepcopy(note.find(tag)))
            measure.insert(pos, fwd)
        prev = None
        for el in list(measure):
            # A chord member whose leading note was hidden now leads the chord.
            if el.tag == 'note' and el.find('chord') is not None and (prev is None or prev.tag != 'note'):
                el.remove(el.find('chord'))
            prev = el
    return ET.tostring(root, encoding='unicode'), hidden


def first_meter(root):
    t = root.find('.//time')
    return int(t.findtext('beats')) * 4 / int(t.findtext('beat-type')) if t is not None else 4


STEP = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def timeline(root):
    """Give every printed note an id and its onset/length in quarter notes.

    Timing follows the MusicXML <duration> values (the transcription's own
    playback timeline), including irregular cadenza measures. Grace notes are
    placed just before their main note. Returns {id: note} with tie chains merged.
    """
    notes = {}; start = 0.0; div = 1; k = 0; open_ties = {}
    for measure in root.iter('measure'):
        attr = measure.find('attributes')
        if attr is not None and attr.find('divisions') is not None:
            div = int(attr.findtext('divisions'))
        pos = 0; longest = 0; last_onset = 0; graces = []
        for el in measure:
            if el.tag == 'backup':
                pos -= int(el.findtext('duration')); continue
            if el.tag == 'forward':
                pos += int(el.findtext('duration')); longest = max(longest, pos); continue
            if el.tag != 'note':
                continue
            el.set('id', f'xn{k}'); k += 1
            chord = el.find('chord') is not None; grace = el.find('grace') is not None
            dur = 0 if grace else int(el.findtext('duration') or 0)
            onset = last_onset if chord else pos
            if not chord and not grace:
                pos += dur; longest = max(longest, pos)
            if el.find('rest') is not None or el.find('pitch') is None:
                if not chord and not grace: last_onset = onset
                continue
            p = el.find('pitch')
            midi = 12 * (int(p.findtext('octave')) + 1) + STEP[p.findtext('step')] + round(float(p.findtext('alter') or 0))
            hand = 'right' if (el.findtext('staff') or '1') == '1' else 'left'
            n = {'id': el.get('id'), 'midi': midi, 'beat': start + onset / div, 'duration': dur / div, 'hand': hand, 'voice': el.findtext('voice'), 'grace': grace, 'chord': chord, 'attack': True}
            if grace:
                graces.append(n)
            else:
                if not chord:
                    last_onset = onset
                # Grace notes lead into this note; they are spaced just before it in a later pass.
                group = [g for g in graces if g['voice'] == n['voice']]
                slots = []
                for g in group:  # a grace chord shares one slot
                    if not g['chord'] or not slots: slots.append([])
                    slots[-1].append(g)
                for k2, slot in enumerate(slots):
                    for g in slot:
                        g['main'] = n['beat']; g['rank'] = len(slots) - k2
                graces = [g for g in graces if g['voice'] != n['voice']]
            ties = [t.get('type') for t in el.findall('tie')]
            key = (n['voice'], midi)
            if 'stop' in ties and key in open_ties:
                head = open_ties[key]; head['duration'] = n['beat'] + n['duration'] - head['beat']; n['attack'] = False
                if 'start' not in ties:
                    del open_ties[key]
            elif 'start' in ties:
                open_ties[key] = n
            notes[n['id']] = n
        for g in graces:  # graces with no following note in their voice lead into the next beat
            g['main'] = start + longest / div; g['rank'] = 1
        start += longest / div
    # Space grace notes evenly between the previous attack and their main note (at most 1/16 beat apart),
    # so attacks stay in order across all voices.
    onsets = sorted({n['beat'] for n in notes.values() if not n['grace']})
    import bisect
    for n in notes.values():
        if n['grace']:
            main = n.pop('main'); rank = n.pop('rank')
            prev = onsets[bisect.bisect_left(onsets, main) - 1] if bisect.bisect_left(onsets, main) else main - 1
            step = min(0.0625, (main - prev) / (rank + 2))
            n['beat'] = main - step * rank; n['duration'] = step
    # Opening grace notes come before beat 0; shift the timeline so it starts at zero.
    lead = -min(0, min(n['beat'] for n in notes.values()))
    for n in notes.values():
        n['beat'] += lead
    return notes, start + lead



def merge_fingering(root, timed, source, meta):
    """Copy printed fingerings from another public-domain transcription of the same piece.

    A fingering is copied only onto a note with the same onset, pitch and hand;
    notes that already carry the transcriber's own fingering keep it.
    Returns (copied, offered)."""
    alt = ET.fromstring(clean_xml(read_mxl(source), meta)[0]); alt_timed, _ = timeline(alt)
    offered = {}
    for el in alt.iter('note'):
        n = alt_timed.get(el.get('id'))
        f = [x.text.strip().replace('\n', '-') for x in el.iter('fingering') if x.text and x.text.strip()]
        if n and f:
            offered[(round(n['beat'], 3), n['midi'], n['hand'])] = f
    copied = 0; used = set()
    for el in root.iter('note'):
        n = timed.get(el.get('id'))
        key = n and (round(n['beat'], 3), n['midi'], n['hand'])
        if not n or key not in offered or el.find('.//fingering') is not None:
            continue
        notations = el.find('notations')
        if notations is None:
            notations = ET.SubElement(el, 'notations')
        technical = notations.find('technical')
        if technical is None:
            technical = ET.SubElement(notations, 'technical')
        for f in offered[key]:
            ET.SubElement(technical, 'fingering').text = f
        copied += 1; used.add(key)
    return len(used), len(offered)


def compact(svg):
    """Drop Verovio's editing ids and indentation; the drawing is unchanged."""
    svg = re.sub(r' data-(?:id|class)="[^"]*"', '', svg)
    return re.sub(r'>\n\s*<', '><', svg)


FONT_CSS = set(); PITCH_DIFF = []
manifest = {}
for id, meta in sources.items():
    if only and id not in only:
        continue
    dest = pathlib.Path('site/scores') / id
    xml, hidden = clean_xml(read_mxl(dest / 'original.mxl'), meta)
    root = ET.fromstring(xml); meter = first_meter(root)
    timed, total = timeline(root)
    fingering_note = ''
    if meta.get('fingeringFrom'):
        src = meta['fingeringFrom']; copied, offered = merge_fingering(root, timed, dest / 'fingering-source.mxl', meta)
        assert offered and copied / offered >= 0.85, (id, 'fingering source does not line up', copied, offered)
        fingering_note = f"Fingerings ({copied} of {offered} offered) come from {src['credit']} ({src['url']}, {src['license']}), copied only onto notes with the same onset, pitch and hand; `fingering-source.mxl` is that transcription."
        print(id, 'fingering copied', copied, 'of', offered)
    xml = ET.tostring(root, encoding='unicode')
    tk = verovio.toolkit(); tk.setOptions(OPTIONS)
    assert tk.loadData(xml), id
    pages_svg = [tk.renderToSVG(p) for p in range(1, tk.getPageCount() + 1)]
    tk.renderToTimemap()  # enables the pitch cross-check below

    # Parse pages: staff membership, notehead positions and systems.
    pages, systems, heads = [], [], {}
    for p, raw in enumerate(pages_svg):
        outer = ET.fromstring(raw); inner = next(e for e in outer.iter(ns + 'svg') if e.get('class') == 'definition-scale')
        # The embedded text font is shared site-wide (verovio-text.css); keep only the small per-page rules.
        for st in list(outer.findall(ns + 'style')):
            if '@font-face' in (st.text or ''):
                FONT_CSS.add(st.text.strip()); outer.remove(st)
        keep = [copy.deepcopy(e) for e in outer if e.tag in (ns + 'style', ns + 'defs')]
        margin = next(e for e in inner.iter(ns + 'g') if e.get('class') == 'page-margin')
        mx, my = map(float, re.findall(r'[-\d.]+', margin.get('transform'))[:2])
        # Printed fingerings can be hidden by the player's "Show score fingering" switch.
        for f in inner.iter(ns + 'g'):
            if f.get('class') == 'fing':
                f.set('class', 'fing source-fingering')
        sys_groups = [g for g in inner.iter(ns + 'g') if g.get('class') == 'system']
        page_notes = []
        geo = []
        for g in sys_groups:
            staves = []
            for st in (s for s in g.iter(ns + 'g') if s.get('class') == 'staff'):
                ys = [float(re.findall(r'[-\d.]+', l.get('d'))[1]) for l in st.findall(ns + 'path') if l.get('d', '').startswith('M')]
                xs = [list(map(float, re.findall(r'[-\d.]+', l.get('d')))) for l in st.findall(ns + 'path') if l.get('d', '').startswith('M')]
                if len(ys) == 5:
                    staves.append((st, min(ys), max(ys), min(x[0] for x in xs), max(x[2] for x in xs)))
            tops = sorted({round(s[1]) for s in staves})
            geo.append((g, tops, staves))
        for k, (g, tops, staves) in enumerate(geo):
            upper, lower = tops[0], tops[-1]
            bottom = max(s[2] for s in staves)
            y0 = (geo[k - 1][2] and (max(s[2] for s in geo[k - 1][2]) + upper) / 2) if k else upper - 1100
            y1 = (bottom + geo[k + 1][1][0]) / 2 if k + 1 < len(geo) else bottom + 1100
            left = min(s[3] for s in staves); right = max(s[4] for s in staves)
            positions = {}
            for st in staves:
                staff_n = '1' if round(st[1]) == upper else '2'
                for note in (e for e in st[0].iter(ns + 'g') if e.get('class') == 'note'):
                    nid = note.get('data-id'); head = note.find(f'{ns}g[@class="notehead"]/{ns}use')
                    if nid not in timed or head is None:
                        continue
                    x, y = map(float, re.findall(r'[-\d.]+', head.get('transform'))[:2])
                    t = timed[nid]; pitch = t['midi']; hand = t['hand']; beat = round(t['beat'], 6)
                    vp = tk.getMIDIValuesForElement(nid).get('pitch')
                    if vp is not None and vp != pitch: PITCH_DIFF.append((id, nid, vp, pitch))
                    note.set('class', 'score-note'); note.set('data-midi', str(pitch)); note.set('data-beat', repr(beat)); note.set('data-hand', hand)
                    heads[nid] = True
                    page_notes.append({'beat': beat, 'midi': pitch, 'x': (x + mx) / 100, 'y': (y + my) / 100, 'hand': hand})
                    positions[beat] = min(positions.get(beat, 1e9), x - left)
            # Continuous-score crop: this system only, without the page title.
            crop = copy.deepcopy(inner)
            for parent in crop.iter():
                for child in list(parent):
                    if child.tag == ns + 'g' and child.get('class') in ('system', 'pgHead') and child.get('data-id') != g.get('data-id'):
                        parent.remove(child)
            crop.set('viewBox', f'{left + mx} {y0 + my} {right - left} {y1 - y0}'); crop.set('id', outer.get('id'))
            for k2, e in enumerate(keep):
                crop.insert(k2, copy.deepcopy(e))
            css = ET.Element(ns + 'style'); css.text = 'g.score-note, g.score-note * { fill: currentColor; }'; crop.insert(0, css)
            for a in ('width', 'height', 'x', 'y'):
                crop.attrib.pop(a, None)
            if positions:
                # Geometry is stored in hundredths of Verovio units (close to staff spaces, like the
                # LilyPond library); the SVG viewBox keeps Verovio's own units.
                u = 0.01
                systems.append({'svg': compact(ET.tostring(crop, encoding='unicode')), 'page': p, 'y': (y0 + my) * u, 'height': (y1 - y0) * u,
                                'staffTop': (upper - y0) * u, 'staffGap': (bottom - upper) * u, 'start': min(positions),
                                'positions': sorted([[b, x * u] for b, x in positions.items()]), 'width': (right - left) * u})
        style = ET.SubElement(outer, ns + 'style'); style.text = 'g.score-note, g.score-note * { fill: currentColor; }'
        pages.append({'svg': compact(ET.tostring(outer, encoding='unicode')), 'start': min(n['beat'] for n in page_notes), 'end': max(n['beat'] for n in page_notes), 'notes': page_notes})

    missing = [n for n in timed.values() if n['attack'] and n['id'] not in heads]
    assert not missing, (id, len(missing), 'printed notes Verovio did not draw', missing[:3])
    notes = [{'midi': n['midi'], 'beat': round(n['beat'], 6), 'duration': round(n['duration'], 6), 'hand': n['hand']} for n in timed.values() if n['attack']]
    # One attack per hand, pitch and moment; overlapping repeats of a key end at the next attack.
    notes.sort(key=lambda n: (n['beat'], n['midi'], -n['duration']))
    unique = {}
    for n in notes:
        unique.setdefault((n['beat'], n['midi'], n['hand']), n)
    notes = sorted(unique.values(), key=lambda n: (n['beat'], n['midi']))
    last = {}
    for n in notes:
        key = (n['hand'], n['midi'])
        if key in last and last[key]['beat'] + last[key]['duration'] > n['beat']:
            last[key]['duration'] = round(n['beat'] - last[key]['beat'], 6)
        last[key] = n
    notes = [n for n in notes if n['duration'] > 0]
    end = max(max(n['beat'] + n['duration'] for n in notes), total)
    for i, s in enumerate(systems):
        s['end'] = systems[i + 1]['start'] if i + 1 < len(systems) else end
    bad=[(i,s['page'],s['start'],s['end'],s['positions'][:2],s['positions'][-1]) for i,s in enumerate(systems) if not s['start']<s['end']]
    assert not bad, (id, 'system order', bad[:3])
    head_keys = {(round(n['beat'], 5), n['midi']) for pg in pages for n in pg['notes']}
    assert all((round(n['beat'], 5), n['midi']) in head_keys for n in notes), f'{id}: an attack is missing from the engraving'
    scroll_keys = set()
    for s in systems:
        for g in ET.fromstring(s['svg']).iter(ns + 'g'):
            if g.get('class') == 'score-note':
                scroll_keys.add((round(float(g.get('data-beat')), 5), int(g.get('data-midi'))))
    assert all((round(n['beat'], 5), n['midi']) in scroll_keys for n in notes), f'{id}: moving notation cuts a notehead'
    assert {n['hand'] for n in notes} == {'left', 'right'}, f'{id}: both hands are required'

    # Reference sheet: the same Verovio pages without practice tags, as PDF and page images.
    ref = verovio.toolkit(); ref.setOptions(OPTIONS); ref.loadData(xml)
    html = '<html><head><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0}div{width:210mm;height:297mm;page-break-after:always}svg{width:210mm;height:297mm}</style></head><body>' + ''.join(f'<div>{ref.renderToSVG(p)}</div>' for p in range(1, ref.getPageCount() + 1)) + '</body></html>'
    (dest / 'original.html').write_text(html)
    subprocess.run(['node', '-e', "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('file://'+process.argv[1]);await p.pdf({path:process.argv[2],format:'A4',printBackground:true});await b.close();})()", str((dest / 'original.html').resolve()), str(dest / 'original.pdf')], check=True)
    (dest / 'original.html').unlink()
    original = dest / 'original'; original.mkdir(exist_ok=True)
    for f in original.glob('page-*.jpg'): f.unlink()
    subprocess.run(['pdftoppm', '-scale-to', '1400', '-jpeg', str(dest / 'original.pdf'), str(original / 'page')], check=True)
    for f in original.glob('page-*.jpg'):
        f.rename(original / f'page-{int(f.stem.split("-")[-1])}.jpg')
    count = len(list(original.glob('*.jpg')))

    # MIDI written from the practice notes: two tracks, right and left hand.
    ppqn = 9600
    def vlq(n):
        out = [n & 127]
        while n > 127:
            n >>= 7; out.insert(0, (n & 127) | 128)
        return out
    tracks = b''
    for ch, hand in enumerate(('right', 'left')):
        events = []
        for n in notes:
            if n['hand'] == hand:
                events += [(round(n['beat'] * ppqn), 1, n['midi']), (round((n['beat'] + n['duration']) * ppqn), 0, n['midi'])]
        events.sort(key=lambda e: (e[0], e[1]))
        data = []; prev = 0
        for tick, is_on, key in events:
            data += vlq(tick - prev) + [(0x90 if is_on else 0x80) + ch, key, 90 if is_on else 0]; prev = tick
        data += vlq(max(0, round(end * ppqn) - prev)) + [0xFF, 0x2F, 0]
        tracks += b'MTrk' + len(data).to_bytes(4, 'big') + bytes(data)
    (dest / 'practice.midi').write_bytes(b'MThd' + (6).to_bytes(4, 'big') + bytes([0, 1, 0, 2]) + ppqn.to_bytes(2, 'big') + tracks)

    sections = []
    for start in range(0, int(end) + 1, int(meter * 8)):
        if any(start <= n['beat'] < start + meter * 8 for n in notes):
            sections.append({'id': f'block-{start}', 'title': f'Practice block {len(sections) + 1}', 'start': start, 'end': min(end, start + meter * 8)})
    attribution = f"{meta['composer']} · transcription by {meta['transcriber']} (MuseScore) · {meta['license']}"
    info = {'id': id, 'title': meta['title'], 'composer': meta['composer'], 'caption': 'Complete practice score · engraved from a public-domain MusicXML transcription',
            'sourceURL': meta['url'], 'pdf': f'scores/{id}/original.pdf', 'midi': f'scores/{id}/practice.midi', 'originalPages': count, 'folder': f'scores/{id}',
            'sourceFingering': any('source-fingering' in pg['svg'] for pg in pages), 'attribution': attribution, 'beatsPerMeasure': meter}
    payload = {**info, 'notes': notes, 'totalBeats': end, 'movements': [{'title': 'Movement 1', 'start': 0, 'end': end}], 'sections': sections,
               'engraving': {'pages': pages, 'systems': systems, 'source': meta['url'], 'version': 2}}
    (dest / 'practice.json').write_text(json.dumps(payload, separators=(',', ':')))
    (dest / 'README.md').write_text(f"""# {meta['title']}

Composer: {meta['composer']}
Transcription: {meta['transcriber']} on MuseScore, released under {meta['license']}
Source: {meta['url']} (via the PDMX public-domain MusicXML dataset, https://zenodo.org/records/15571083)

`original.mxl` is the transcription, bundled unchanged. `original.pdf` and the page
images are engraved from it with Verovio; they are not a scan of a printed edition.
The practice data comes from the same Verovio engraving: hidden playback-only notes
({hidden} in this file) are left out, tied notes sound once, and hands follow the
staff each note is printed on. The transcriber's extra metronome marks (used to shape
MuseScore's playback) are not printed after the first. {fingering_note or ('Fingerings are printed exactly as the transcriber wrote them; none are generated.' if any('source-fingering' in pg['svg'] for pg in pages) else 'This transcription has no fingerings, and none are generated.')}
""")
    version = hashlib.sha256((dest / 'practice.json').read_bytes()).hexdigest()[:12]
    manifest[id] = {**info, 'dataURL': f'scores/{id}/practice.json?v={version}', 'multiMovement': False}
    print(id, 'pitch differences', [d for d in PITCH_DIFF if d[0] == id][:5], sum(d[0] == id for d in PITCH_DIFF))
    print(id, len(notes), 'notes', len(pages), 'pages', len(systems), 'systems', hidden, 'hidden helpers removed', flush=True)

if FONT_CSS:
    pathlib.Path('site/verovio-text.css').write_text('/* SMuFL text font used by Verovio engravings (Leipzig, SIL Open Font License). */\n' + sorted(FONT_CSS)[0] + '\n')
output.write_text('/* Complete scores from public-domain MusicXML transcriptions, fetched only when selected. */\nObject.assign(window.PianoRepertoire,' + json.dumps(manifest, separators=(',', ':')) + ');\n')
