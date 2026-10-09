"""Build the large public-domain collection from PDMX MusicXML (CC0 / public domain).

Usage: python3 scripts/build-collection.py WORKS_JSON OUT_DIR [id ...]

WORKS_JSON is a list of works: {"id", "title", "composer", "shelf", "cands": [...]}, each
candidate {"mxl": local .mxl path, "url", "transcriber", "license"} in order of preference.
For each work the first candidate that passes every check is built into
OUT_DIR/scores/<id>/ and described in OUT_DIR/manifest/<id>.json; failures are logged
and the next candidate is tried.

Same engraving and checks as build-musicxml-library.py (Verovio, every attack tied to its
printed notehead on the page and in the moving score, both hands present), plus:
- Two single-staff parts (right hand, left hand) are combined into one piano part.
- Repeats and numbered endings are written out in performed order, as in the rest of the
  library. Scores with D.C./D.S./coda/fine jumps are kept as printed.
- Compact output for a large catalogue: practice data is gzip-compressed
  (practice.json.gz); no PDF or page images are rendered. original.mxl is the
  transcription, unchanged.
"""
import copy, gzip, hashlib, json, pathlib, re, sys, zipfile
import xml.etree.ElementTree as ET
import verovio

SVG = 'http://www.w3.org/2000/svg'; ns = '{%s}' % SVG
ET.register_namespace('', SVG); ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
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



def compact(svg):
    """Drop Verovio's editing ids and indentation; the drawing is unchanged."""
    svg = re.sub(r' data-(?:id|class)="[^"]*"', '', svg)
    return re.sub(r'>\n\s*<', '><', svg)


def merge_parts(root):
    """Two single-staff parts (upper = right hand, lower = left hand) become one part with two staves."""
    parts = root.findall('part')
    if len(parts) != 2:
        return
    upper, lower = parts; m1, m2 = upper.findall('measure'), lower.findall('measure')
    if len(m1) != len(m2):
        raise ValueError('parts have different measure counts')
    d1 = d2 = None
    for a, b in zip(m1, m2):
        for x in (a, b):
            for at in x.findall('attributes'):
                if int(at.findtext('staves') or 1) > 1:
                    raise ValueError('a part already has two staves')
        d1 = next((at.findtext('divisions') for at in a.findall('attributes') if at.findtext('divisions')), d1)
        d2 = next((at.findtext('divisions') for at in b.findall('attributes') if at.findtext('divisions')), d2)
        if d1 != d2:
            raise ValueError('parts use different divisions')
        pos = end = 0
        for c in list(a):
            if c.tag == 'backup': pos -= int(c.findtext('duration'))
            elif c.tag == 'forward': pos += int(c.findtext('duration'))
            elif c.tag == 'note' and c.find('chord') is None and c.find('grace') is None: pos += int(c.findtext('duration') or 0)
            end = max(end, pos)
        if end > 0:
            back = ET.SubElement(a, 'backup'); ET.SubElement(back, 'duration').text = str(end)
        for c in list(b):
            if c.tag in ('barline', 'print'):
                continue
            n = copy.deepcopy(c)
            if n.tag in ('note', 'direction', 'forward'):
                for s in n.findall('staff'): n.remove(s)
                ET.SubElement(n, 'staff').text = '2'
                v = n.find('voice')
                if v is not None: v.text = str(int(v.text or 1) + 4)
            if n.tag == 'attributes':
                for x in list(n):
                    if x.tag != 'clef': n.remove(x)
                if n.find('clef') is None: continue
                for clef in n.findall('clef'): clef.set('number', '2')
            a.append(n)
    first = m1[0].find('attributes')
    if first is None:
        first = ET.Element('attributes'); m1[0].insert(0, first)
    st = ET.Element('staves'); st.text = '2'
    kids = list(first); idx = next((i for i, x in enumerate(kids) if x.tag in ('clef', 'staff-details', 'transpose')), len(kids))
    first.insert(idx, st)
    for clef in first.findall('clef'):
        clef.set('number', clef.get('number') or '1')
    root.remove(lower)
    pl = root.find('part-list')
    for sp in list(pl.findall('score-part')) if pl is not None else []:
        if sp.get('id') == lower.get('id'): pl.remove(sp)


def ending_numbers(value):
    nums = []
    for seg in (value or '').replace(' ', '').split(','):
        m = re.match(r'(\d+)(?:-(\d+))?', seg)
        if m:
            a, b = int(m.group(1)), int(m.group(2) or m.group(1))
            nums += list(range(a, min(b, 8) + 1))
    return nums


def performed_order(measures):
    """Measure indices in playing order for ordinary repeats and numbered endings (as piano-import-engine.js)."""
    result, passes, ending, ending_at = [], {}, [], []
    for m in measures:
        for e in m.iter('ending'):
            if e.get('type') == 'start': ending = ending_numbers(e.get('number'))
        ending_at.append(list(ending))
        for e in m.iter('ending'):
            if e.get('type') in ('stop', 'discontinue'): ending = []
    start = i = 0; repeat_open = finished = False
    while i < len(measures):
        if len(result) > 3000:
            raise ValueError('repeat loop')
        if finished and not ending_at[i]:
            start = i; finished = False
        m = measures[i]
        forward = any(r.get('direction') == 'forward' for r in m.iter('repeat'))
        back = next((r for r in m.iter('repeat') if r.get('direction') == 'backward'), None)
        if forward:
            if repeat_open and i != start:
                raise ValueError('nested repeats')
            start = i; repeat_open = True
        p = passes.get(start, 1)
        if not ending_at[i] or p in ending_at[i]:
            result.append(i)
        if back is not None:
            times = int(back.get('times') or 2)
            if p < min(times, 8):
                passes[start] = p + 1; i = start; continue
            repeat_open = False; finished = True
        i += 1
    return result


ATTR_KEYS = ('divisions', 'key', 'time', 'staves', 'clef', 'transpose')


def unfold(root):
    """Write repeats out in performed order. Returns (written, performed) measure counts, or None if kept as printed."""
    part = root.find('part'); measures = part.findall('measure')
    if any(s.get(a) for s in root.iter('sound') for a in ('dacapo', 'dalsegno', 'tocoda', 'coda', 'segno', 'fine')):
        return None
    order = performed_order(measures)
    if order == list(range(len(measures))):
        return len(measures), len(measures)
    # Attribute state at the start of each written measure, so a jump can restore key/time/clef/divisions.
    def apply(state, m):
        state = dict(state)
        for at in m.findall('attributes'):
            for x in at:
                if x.tag in ATTR_KEYS:
                    state[(x.tag, x.get('number') or '')] = x
        return state
    start_state, state = [], {}
    for m in measures:
        start_state.append(state); state = apply(state, m)
    out, current = [], {}
    for n, i in enumerate(order):
        m = copy.deepcopy(measures[i]); m.set('number', str(n + 1))
        want = start_state[i]
        diff = [v for k, v in want.items() if k not in current or ET.tostring(current[k]) != ET.tostring(v)]
        if diff and n:
            at = ET.Element('attributes')
            for v in sorted(diff, key=lambda e: ATTR_KEYS.index(e.tag)):
                at.append(copy.deepcopy(v))
            m.insert(0, at)
        for bl in m.findall('barline'):
            had = False
            for r in list(bl):
                if r.tag in ('repeat', 'ending'): bl.remove(r); had = True
            if had:
                style = bl.find('bar-style')
                if style is not None and style.text in ('heavy-light', 'light-heavy') and not (n == len(order) - 1):
                    style.text = 'light-light'
                if len(bl) == 0: m.remove(bl)
        for pr in m.findall('print'):
            m.remove(pr)
        current = apply(current, measures[i]) if not diff else apply({**current, **{k: v for k, v in want.items()}}, measures[i])
        out.append(m)
    for m in measures: part.remove(m)
    for m in out: part.append(m)
    return len(measures), len(order)


def tempo_of(root):
    for s in root.iter('sound'):
        if s.get('tempo'):
            try: return float(s.get('tempo'))
            except ValueError: pass
    pm = root.find('.//metronome/per-minute')
    try: return float(pm.text) if pm is not None else 100.0
    except ValueError: return 100.0


def stats_of(notes, root, meter, end):
    """Numbers used to place the piece on the 7-level ladder."""
    tempo = max(40.0, min(200.0, tempo_of(root)))
    fifths = root.find('.//key/fifths'); fifths = int(fifths.text) if fifths is not None and fifths.text and fifths.text.strip().lstrip('-').isdigit() else 0
    by_beat = {}
    for n in notes:
        by_beat.setdefault((n['beat'], n['hand']), []).append(n['midi'])
    chord = max(len(v) for v in by_beat.values())
    span = max((max(v) - min(v)) for v in by_beat.values())
    onsets = sorted({n['beat'] for n in notes})
    # Busiest two-measure window, in attacks per second at the marked tempo.
    win = 2 * meter; best = 0; j = 0
    for i, b in enumerate(onsets):
        while onsets[j] < b - win: j += 1
        best = max(best, i - j + 1)
    density = best / (win * 60 / tempo)
    seconds = end * 60 / tempo
    lo = min(n['midi'] for n in notes); hi = max(n['midi'] for n in notes)
    t = root.find('.//time'); time = f"{t.findtext('beats')}/{t.findtext('beat-type')}" if t is not None and t.findtext('beats') else '4/4'
    return {'tempo': tempo, 'fifths': fifths, 'chord': chord, 'span': span, 'density': round(density, 2), 'seconds': round(seconds),
            'notes': len(notes), 'range': hi - lo, 'time': time, 'leftShare': round(sum(n['hand'] == 'left' for n in notes) / len(notes), 2)}


def build_one(work, cand, out):
    id = work['id']; meta = {'title': work['title'], 'composer': work['composer']}
    data = read_mxl(cand['mxl'])
    xml, hidden = clean_xml(data, meta)
    root = ET.fromstring(xml)
    merge_parts(root)
    if len(root.findall('part')) != 1:
        raise ValueError('not a single piano part')
    folded = unfold(root)
    meter = first_meter(root)
    timed, total = timeline(root)
    if not timed:
        raise ValueError('no notes')
    xml = ET.tostring(root, encoding='unicode')
    tk = verovio.toolkit(); tk.setOptions(OPTIONS)
    if not tk.loadData(xml):
        raise ValueError('verovio could not load')
    pages, systems, heads = [], [], {}
    for p in range(1, tk.getPageCount() + 1):
        raw = tk.renderToSVG(p)
        outer = ET.fromstring(raw); inner = next(e for e in outer.iter(ns + 'svg') if e.get('class') == 'definition-scale')
        for st in list(outer.findall(ns + 'style')):
            if '@font-face' in (st.text or ''):
                outer.remove(st)
        keep = [copy.deepcopy(e) for e in outer if e.tag in (ns + 'style', ns + 'defs')]
        margin = next(e for e in inner.iter(ns + 'g') if e.get('class') == 'page-margin')
        mx, my = map(float, re.findall(r'[-\d.]+', margin.get('transform'))[:2])
        for f in inner.iter(ns + 'g'):
            if f.get('class') == 'fing':
                f.set('class', 'fing source-fingering')
        geo = []
        for g in (g for g in inner.iter(ns + 'g') if g.get('class') == 'system'):
            staves = []
            for st in (s for s in g.iter(ns + 'g') if s.get('class') == 'staff'):
                lines = [list(map(float, re.findall(r'[-\d.]+', l.get('d')))) for l in st.findall(ns + 'path') if l.get('d', '').startswith('M')]
                if len(lines) == 5:
                    staves.append((st, min(l[1] for l in lines), max(l[1] for l in lines), min(l[0] for l in lines), max(l[2] for l in lines)))
            if staves:
                geo.append((g, sorted({round(s[1]) for s in staves}), staves))
        page_notes = []
        for k, (g, tops, staves) in enumerate(geo):
            upper = tops[0]; bottom = max(s[2] for s in staves)
            y0 = (max(s[2] for s in geo[k - 1][2]) + upper) / 2 if k else upper - 1100
            y1 = (bottom + geo[k + 1][1][0]) / 2 if k + 1 < len(geo) else bottom + 1100
            left = min(s[3] for s in staves); right = max(s[4] for s in staves)
            positions = {}; head_ys = []
            for st in staves:
                for note in (e for e in st[0].iter(ns + 'g') if e.get('class') == 'note'):
                    nid = note.get('data-id'); head = note.find(f'{ns}g[@class="notehead"]/{ns}use')
                    if nid not in timed or head is None:
                        continue
                    x, y = map(float, re.findall(r'[-\d.]+', head.get('transform'))[:2])
                    t = timed[nid]; beat = round(t['beat'], 6)
                    note.set('class', 'score-note'); note.set('data-midi', str(t['midi'])); note.set('data-beat', repr(beat)); note.set('data-hand', t['hand'])
                    heads[nid] = True
                    page_notes.append({'beat': beat, 'midi': t['midi'], 'x': (x + mx) / 100, 'y': (y + my) / 100, 'hand': t['hand']})
                    positions[beat] = min(positions.get(beat, 1e9), x - left)
                    head_ys.append(y)
            # Notes on many ledger lines can reach past the halfway line to the next system; widen the
            # band so the moving score never cuts them off (other systems are removed from the crop).
            if head_ys:
                space = (staves[0][2] - staves[0][1]) / 4
                y0 = min(y0, min(head_ys) - 3 * space); y1 = max(y1, max(head_ys) + 3 * space)
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
                u = 0.01
                systems.append({'svg': compact(ET.tostring(crop, encoding='unicode')), 'page': len(pages), 'y': (y0 + my) * u, 'height': (y1 - y0) * u,
                                'staffTop': (upper - y0) * u, 'staffGap': (bottom - upper) * u, 'start': min(positions),
                                'positions': sorted([[b, x * u] for b, x in positions.items()]), 'width': (right - left) * u})
        if page_notes:
            style = ET.SubElement(outer, ns + 'style'); style.text = 'g.score-note, g.score-note * { fill: currentColor; }'
            pages.append({'svg': compact(ET.tostring(outer, encoding='unicode')), 'start': min(n['beat'] for n in page_notes), 'end': max(n['beat'] for n in page_notes), 'notes': page_notes})
    missing = [n for n in timed.values() if n['attack'] and n['id'] not in heads]
    if missing:
        raise ValueError(f'{len(missing)} printed notes Verovio did not draw')
    notes = [{'midi': n['midi'], 'beat': round(n['beat'], 6), 'duration': round(n['duration'], 6), 'hand': n['hand']} for n in timed.values() if n['attack']]
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
    notes = [n for n in notes if n['duration'] > 0 and 21 <= n['midi'] <= 108]
    if len(notes) < 30:
        raise ValueError('fewer than 30 notes')
    if {n['hand'] for n in notes} != {'left', 'right'} or min(sum(n['hand'] == h for n in notes) for h in ('left', 'right')) < 8:
        raise ValueError('both hands are required')
    end = max(max(n['beat'] + n['duration'] for n in notes), total)
    for i, s in enumerate(systems):
        s['end'] = systems[i + 1]['start'] if i + 1 < len(systems) else end
    if not all(s['start'] < s['end'] for s in systems):
        raise ValueError('system order')
    head_keys = {(round(n['beat'], 5), n['midi']) for pg in pages for n in pg['notes']}
    if not all((round(n['beat'], 5), n['midi']) in head_keys for n in notes):
        raise ValueError('an attack is missing from the engraving')
    scroll_keys = set()
    for s in systems:
        for g in ET.fromstring(s['svg']).iter(ns + 'g'):
            if g.get('class') == 'score-note':
                scroll_keys.add((round(float(g.get('data-beat')), 5), int(g.get('data-midi'))))
    if not all((round(n['beat'], 5), n['midi']) in scroll_keys for n in notes):
        raise ValueError('moving notation cuts a notehead')

    dest = out / 'scores' / id
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'original.mxl').write_bytes(pathlib.Path(cand['mxl']).read_bytes())
    ppqn = 9600
    def vlq(n):
        o = [n & 127]
        while n > 127:
            n >>= 7; o.insert(0, (n & 127) | 128)
        return o
    tracks = b''
    for ch, hand in enumerate(('right', 'left')):
        events = []
        for n in notes:
            if n['hand'] == hand:
                events += [(round(n['beat'] * ppqn), 1, n['midi']), (round((n['beat'] + n['duration']) * ppqn), 0, n['midi'])]
        events.sort(key=lambda e: (e[0], e[1]))
        data_ = []; prev = 0
        for tick, is_on, key in events:
            data_ += vlq(tick - prev) + [(0x90 if is_on else 0x80) + ch, key, 90 if is_on else 0]; prev = tick
        data_ += vlq(max(0, round(end * ppqn) - prev)) + [0xFF, 0x2F, 0]
        tracks += b'MTrk' + len(data_).to_bytes(4, 'big') + bytes(data_)
    (dest / 'practice.midi').write_bytes(b'MThd' + (6).to_bytes(4, 'big') + bytes([0, 1, 0, 2]) + ppqn.to_bytes(2, 'big') + tracks)
    sections = []
    for start in range(0, int(end) + 1, max(1, int(meter * 8))):
        if any(start <= n['beat'] < start + meter * 8 for n in notes):
            sections.append({'id': f'block-{start}', 'title': f'Practice block {len(sections) + 1}', 'start': start, 'end': min(end, start + meter * 8)})
    fingered = any('source-fingering' in pg['svg'] for pg in pages)
    repeats = '' if folded is None and False else ('repeats written out' if folded and folded[0] != folded[1] else ('repeats and jumps kept as printed' if folded is None else ''))
    caption = 'Complete practice score · engraved from a public-domain MusicXML transcription' + (f' · {repeats}' if repeats else '')
    license = 'CC0 1.0' if cand['license'] == 'cc-zero' else 'Public Domain Mark' if cand['license'] == 'publicdomain' else cand['license']
    info = {'id': id, 'title': work['title'], 'composer': work['composer'], 'caption': caption, 'sourceURL': cand['url'],
            'sourceFile': f'scores/{id}/original.mxl', 'midi': f'scores/{id}/practice.midi', 'originalPages': 0, 'folder': f'scores/{id}',
            'sourceFingering': fingered, 'attribution': f"{work['composer']} · transcription by {cand['transcriber']} (MuseScore) · {license}", 'beatsPerMeasure': meter}
    payload = {**info, 'notes': notes, 'totalBeats': end, 'movements': [{'title': 'Movement 1', 'start': 0, 'end': end}], 'sections': sections,
               'engraving': {'pages': pages, 'systems': systems, 'source': cand['url'], 'version': 2}}
    blob = json.dumps(payload, separators=(',', ':')).encode()
    gz = gzip.compress(blob, 9, mtime=0)
    (dest / 'practice.json.gz').write_bytes(gz)
    (dest / 'README.md').write_text(f"""# {work['title']}

Composer: {work['composer']}
Transcription: {cand['transcriber']} on MuseScore, released under {license}
Source: {cand['url']} (via the PDMX public-domain MusicXML dataset, https://zenodo.org/records/15571083)

`original.mxl` is the transcription, bundled unchanged. The practice data
(`practice.json.gz`) is engraved from it with Verovio: hidden playback-only notes ({hidden}
in this file) are left out, tied notes sound once, hands follow the staff each note is
printed on{', and repeats are written out in performed order' if folded and folded[0] != folded[1] else ''}{'. Its D.C./D.S. jumps are kept as printed and played once' if folded is None else ''}.
{'Fingerings are printed exactly as the transcriber wrote them; none are generated.' if fingered else 'This transcription has no fingerings, and none are generated.'}
""")
    version = hashlib.sha256(gz).hexdigest()[:12]
    manifest = {**info, 'dataURL': f'scores/{id}/practice.json.gz?v={version}', 'multiMovement': False}
    st = stats_of(notes, root, meter, end)
    st.update({'pages': len(pages), 'bytes': len(gz), 'fingered': fingered, 'measures': folded})
    return manifest, st


def main():
    works = json.loads(pathlib.Path(sys.argv[1]).read_text()); out = pathlib.Path(sys.argv[2]); only = set(sys.argv[3:])
    (out / 'manifest').mkdir(parents=True, exist_ok=True); (out / 'log').mkdir(parents=True, exist_ok=True)
    for work in works:
        if only and work['id'] not in only:
            continue
        done = out / 'manifest' / f"{work['id']}.json"
        if done.exists() and not only:
            continue
        errors = []
        for k, cand in enumerate(work['cands']):
            try:
                manifest, st = build_one(work, cand, out)
                done.write_text(json.dumps({'manifest': manifest, 'stats': st, 'shelf': work['shelf'], 'candidate': k, 'pdmxTitle': cand.get('pdmxTitle'), 'errors': errors}, ensure_ascii=False))
                print(work['id'], 'ok', k, st['notes'], 'notes', st['bytes'] // 1024, 'KB', flush=True)
                break
            except Exception as e:  # noqa: BLE001 - any failure means: try the next transcription
                errors.append(f'{k}: {type(e).__name__}: {e}'[:300])
        else:
            (out / 'log' / f"{work['id']}.txt").write_text('\n'.join(errors) or 'no candidates')
            print(work['id'], 'FAILED', errors[-1:] if errors else '', flush=True)


if __name__ == '__main__':
    main()
