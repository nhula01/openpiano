"""Difficulty score for every OpenPiano piece, computed from its score data.

The level of a piece is decided by evidence (RCM syllabus grade, Henle level, a human review in
scripts/level-overrides.json). This score does two other jobs:

  1. it orders the pieces inside a level, easiest first (scripts/apply-learning-path.py), and
  2. it predicts a level for every piece, so a piece that lands two or more levels away from its
     prediction without evidence is flagged (scripts/difficulty-suspects.md and
     tests/piano-difficulty.test.cjs).

What it reads, for every piece in the site manifests (site/piano-*.js):
  - the practice notes (site/scores/<id>/practice.json or .json.gz, or inline notes): beat,
    duration, MIDI pitch and hand;
  - the tempo: the tempo map of practice.midi when it has one (LilyPond and Mutopia scores), else
    every <sound tempo> in original.mxl (the collection), else the study's own `tempo`, else ♩=100.

Features (at the marked tempo, per hand where it matters) are computed in piece_features(); the model
inputs are listed in FEATURES. The model is a ridge regression of the level on those standardised
inputs, with cut points between levels. It is fitted on the pieces whose level is known (calibration():
RCM/Henle evidence, the hand-levelled library pieces, First keys) and checked with leave-one-out
cross-validation; the accuracy is printed and kept in difficulty.json. Pure Python, no dependencies.

Run:  python3 scripts/difficulty.py            (writes scripts/difficulty.json and
                                                 scripts/difficulty-suspects.md, prints a report)
Then: python3 scripts/apply-learning-path.py    (sets `difficulty` and `order` in the curriculum)
"""
import gzip, json, math, pathlib, re, struct, sys, zipfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
OUT_JSON = ROOT / 'scripts' / 'difficulty.json'
OUT_SUSPECTS = ROOT / 'scripts' / 'difficulty-suspects.md'
MANIFESTS = ['repertoire', 'library', 'additions', 'famous', 'pdmx', 'collection', 'studies']


# ---- loading ------------------------------------------------------------------------------------

def read_js_object(path, marker):
    """The JSON object literal that follows `marker` in a generated manifest file."""
    text = path.read_text()
    start = text.index('{', text.index(marker))
    body = text.rstrip().rstrip(';').rstrip()
    if body.endswith(')'): body = body[:-1]
    return json.loads(body[start:])


def load_repertoire():
    rep = {}
    for name in MANIFESTS:
        path = SITE / f'piano-{name}.js'
        if path.exists(): rep.update(read_js_object(path, 'PianoRepertoire'))
    return rep


def load_curriculum():
    return read_js_object(SITE / 'piano-curriculum.js', 'window.PianoCurriculum=')


def load_notes(entry):
    """(notes, beatsPerMeasure) for one manifest entry, or (None, None)."""
    if entry.get('notes'): return entry['notes'], entry.get('beatsPerMeasure') or 4
    url = entry.get('dataURL')
    if not url: return None, None
    path = SITE / url.split('?')[0]
    if not path.exists(): return None, None
    raw = path.read_bytes()
    data = json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)
    return data.get('notes'), data.get('beatsPerMeasure') or entry.get('beatsPerMeasure') or 4


# ---- tempo ---------------------------------------------------------------------------------------

def midi_tempo_map(path):
    """[(beat, quarter bpm)] from the set-tempo events of a standard MIDI file ([] if none)."""
    data = path.read_bytes()
    if data[:4] != b'MThd': return []
    header_len = struct.unpack('>I', data[4:8])[0]
    tracks = struct.unpack('>H', data[10:12])[0]
    division = struct.unpack('>H', data[12:14])[0]
    if division & 0x8000: return []  # SMPTE time, not used by our scores
    pos, tempos = 8 + header_len, []
    for _ in range(tracks):
        if data[pos:pos + 4] != b'MTrk': break
        length = struct.unpack('>I', data[pos + 4:pos + 8])[0]
        pos += 8; end = pos + length; tick = 0; status = 0
        while pos < end:
            delta = 0
            while True:
                byte = data[pos]; pos += 1; delta = (delta << 7) | (byte & 0x7f)
                if not byte & 0x80: break
            tick += delta
            byte = data[pos]
            if byte == 0xff:
                kind = data[pos + 1]; pos += 2; size = 0
                while True:
                    b = data[pos]; pos += 1; size = (size << 7) | (b & 0x7f)
                    if not b & 0x80: break
                if kind == 0x51 and size == 3:
                    micro = (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2]
                    tempos.append((tick / division, 60e6 / micro))
                pos += size
            elif byte in (0xf0, 0xf7):
                pos += 1; size = 0
                while True:
                    b = data[pos]; pos += 1; size = (size << 7) | (b & 0x7f)
                    if not b & 0x80: break
                pos += size
            else:
                if byte & 0x80: status = byte; pos += 1
                pos += 1 if (status & 0xf0) in (0xc0, 0xd0) else 2
        pos = end
    tempos.sort()
    # LilyPond writes a 120 default before the first real tempo; keep the last event at each beat
    clean = {}
    for beat, bpm in tempos: clean[round(beat, 4)] = bpm
    return sorted(clean.items())


BEAT_UNITS = {'whole': 4, 'half': 2, 'quarter': 1, 'eighth': .5, '16th': .25}


def musicxml_tempo_map(path):
    """[(fraction of the piece, quarter bpm)] from every tempo marking in original.mxl.

    Practice notes have their repeats written out, so a marking is placed by its position as a
    fraction of the score rather than by beat."""
    try:
        archive = zipfile.ZipFile(path)
        name = next(n for n in archive.namelist() if n.endswith(('.xml', '.musicxml')) and not n.startswith('META-INF'))
        root = ET.fromstring(archive.read(name))
    except Exception:
        return []
    part = root.find('part')
    if part is None: return []
    beats, length, events = 4.0, 0.0, []
    for measure in part.findall('measure'):
        time = measure.find('attributes/time')
        if time is not None and time.findtext('beats', '').isdigit() and time.findtext('beat-type', '').isdigit():
            beats = int(time.findtext('beats')) * 4 / int(time.findtext('beat-type'))
        for direction in measure.iter('direction'):
            bpm = None
            sound = direction.find('sound')
            if sound is not None and sound.get('tempo'):
                try: bpm = float(sound.get('tempo'))
                except ValueError: bpm = None
            if bpm is None:
                per_minute = direction.findtext('.//metronome/per-minute')
                unit = direction.findtext('.//metronome/beat-unit')
                try:
                    bpm = float(per_minute) * BEAT_UNITS.get(unit, 1) * (1.5 if direction.find('.//metronome/beat-unit-dot') is not None else 1)
                except (TypeError, ValueError): bpm = None
            if bpm and bpm > 0: events.append((length, bpm))
        sound = measure.find('sound')
        if sound is not None and sound.get('tempo'):
            try: events.append((length, float(sound.get('tempo'))))
            except ValueError: pass
        length += beats
    if not events or length <= 0: return []
    events.sort()
    return [(beat / length, bpm) for beat, bpm in events]


class Clock:
    """Converts beats to seconds through a piecewise-constant tempo map."""
    def __init__(self, tempo_map):
        self.segments, seconds = [], 0.0
        for i, (beat, bpm) in enumerate(tempo_map):
            if i: seconds += (beat - tempo_map[i - 1][0]) * 60 / tempo_map[i - 1][1]
            self.segments.append((beat, bpm, seconds))

    def __call__(self, beat):
        seg = self.segments[0]
        for s in self.segments:
            if s[0] <= beat: seg = s
            else: break
        return seg[2] + (beat - seg[0]) * 60 / seg[1]


def clamp(value, low, high): return max(low, min(high, value))


def tempo_for(pid, entry, total_beats):
    """(tempo map in beats, source name)."""
    folder = SITE / 'scores' / pid
    midi = SITE / entry['midi'].split('?')[0] if entry.get('midi') else None
    tempos = midi_tempo_map(midi) if midi and midi.exists() else []
    if tempos:
        return [(b, clamp(t, 30, 250)) for b, t in tempos], 'midi'
    mxl = folder / 'original.mxl'
    if mxl.exists():
        marks = musicxml_tempo_map(mxl)
        if marks:
            out = [(0.0, clamp(marks[0][1], 30, 250))] + [(f * total_beats, clamp(t, 30, 250)) for f, t in marks if f > 0]
            return out, 'musicxml'
    if entry.get('tempo'):
        return [(0.0, float(entry['tempo']))], 'study'
    return [(0.0, 100.0)], 'default'


# ---- features ------------------------------------------------------------------------------------

def quantile(values, f):
    if not values: return 0
    s = sorted(values)
    return s[min(len(s) - 1, int(f * len(s)))]


MAJOR = [0, 2, 4, 5, 7, 9, 11]
BLACK = {1, 3, 6, 8, 10}


def hand_features(notes, clock, seconds, meter):
    """Speed, texture and movement of one hand."""
    by_onset = {}
    for n in notes: by_onset.setdefault(round(n['beat'], 4), []).append(n)
    onsets = sorted(by_onset)
    chords = [sorted({n['midi'] for n in by_onset[b]}) for b in onsets]
    times = [clock(b) for b in onsets]
    sizes = [len(c) for c in chords]
    spans = [c[-1] - c[0] for c in chords]
    # onsets per second in each bar, 90th percentile: how fast the busy bars go at the marked tempo
    per_bar = {}
    for b in onsets: per_bar[int(b // meter + 1e-6)] = per_bar.get(int(b // meter + 1e-6), 0) + 1
    bar_rates = [count / max(.2, clock((bar + 1) * meter) - clock(bar * meter)) for bar, count in per_bar.items()]
    gaps = [times[i] - times[i - 1] for i in range(1, len(times)) if times[i] - times[i - 1] > 1e-3]
    # leaps of the outer note (top for the right hand, bottom for the left)
    outer = [c[-1] if notes[0]['hand'] == 'right' else c[0] for c in chords]
    leaps = [abs(outer[i] - outer[i - 1]) for i in range(1, len(outer))]
    fast_leaps = sum(1 for i in range(1, len(outer)) if leaps[i - 1] >= 10 and times[i] - times[i - 1] < .35)
    # position shifts: the hand covers about a sixth (9 semitones); a note outside it moves the hand
    shifts, low, high = 0, None, None
    for c in chords:
        if low is None: low, high = c[0], c[-1]; continue
        lo, hi = min(low, c[0]), max(high, c[-1])
        if hi - lo <= max(9, c[-1] - c[0]): low, high = lo, hi
        else: shifts += 1; low, high = c[0], c[-1]
    # voices: notes sounding at each onset in this hand, held notes included (independent voices)
    ends = sorted(n['beat'] + max(.01, n.get('duration') or .01) for n in notes)
    starts = sorted(n['beat'] for n in notes)
    sounding, i, j = [], 0, 0
    for b in onsets:
        while i < len(starts) and starts[i] <= b + 1e-4: i += 1
        while j < len(ends) and ends[j] <= b + 1e-4: j += 1
        sounding.append(i - j)
    minutes = max(seconds, 1) / 60
    return {
        'nps': quantile(bar_rates, .9), 'shortest': quantile(gaps, .1) if gaps else 2.0,
        'chord95': quantile(sizes, .95), 'chordMax': max(sizes), 'chordShare': sum(1 for s in sizes if s > 1) / len(sizes),
        'span95': quantile(spans, .95), 'leap95': quantile(leaps, .95) if leaps else 0,
        'fastLeaps': fast_leaps / minutes, 'shifts': shifts / minutes,
        'voices': quantile(sounding, .95), 'range': max(n['midi'] for n in notes) - min(n['midi'] for n in notes),
    }


def piece_features(notes, meter, tempo_map, key_fifths=None):
    notes = [n for n in notes if isinstance(n.get('midi'), (int, float)) and isinstance(n.get('beat'), (int, float))]
    if not notes: return None
    clock = Clock(tempo_map)
    first = min(n['beat'] for n in notes)
    end = max(n['beat'] + (n.get('duration') or 0) for n in notes)
    seconds = max(1.0, clock(end) - clock(first))
    onsets = sorted({round(n['beat'], 4) for n in notes})
    times = [clock(b) for b in onsets]
    peak, j = 0, 0
    for i, t in enumerate(times):
        while times[j] < t - 4: j += 1
        peak = max(peak, (i - j + 1) / 4)
    hands = {}
    for side in ('right', 'left'):
        part = [n for n in notes if n.get('hand') == side]
        hands[side] = hand_features(part, clock, seconds, meter) if part else None
    present = [h for h in hands.values() if h]
    top = lambda k: max(h[k] for h in present)
    # key and chromatic notes
    counts = [0] * 12
    for n in notes: counts[int(n['midi']) % 12] += 1
    fit, tonic = max((sum(counts[(t + d) % 12] for d in MAJOR), t) for t in range(12))
    if key_fifths is None:
        f = (tonic * 7) % 12
        key_fifths = f - 12 if f > 6 else f
    # notes outside the written key's scale, or outside the best-fitting major scale if that is fewer
    # (minor keys and wrong key signatures would otherwise look chromatic)
    scale = {(key_fifths * 7 + d) % 12 for d in MAJOR}
    chromatic = min(sum(counts[pc] for pc in range(12) if pc not in scale), len(notes) - fit) / len(notes)
    # rhythm: tuplets (on a triplet grid, off the duple grid), dotted values, syncopation
    def off_grid(b): return abs(b * 4 - round(b * 4)) > 1e-3
    def on_triplet_grid(b): return abs(b * 6 - round(b * 6)) < 1e-3 or abs(b * 12 - round(b * 12)) < 1e-3
    tuplets = sum(1 for b in onsets if off_grid(b) and on_triplet_grid(b)) / len(onsets)
    dotted_values = {.375, .75, 1.5, 3.0}
    dotted = sum(1 for n in notes if round(n.get('duration') or 0, 3) in dotted_values) / len(notes)
    syncopation = sum(1 for n in notes if abs(n['beat'] - round(n['beat'])) > 1e-3 and math.floor(n['beat']) + 1 < n['beat'] + (n.get('duration') or 0) - 1e-3) / len(notes)
    # hand independence: one hand attacks while the other holds a note (not just taking turns)
    independence = 0.0
    if hands['right'] and hands['left']:
        held = attacks = 0
        by_hand = {s: [n for n in notes if n.get('hand') == s] for s in ('right', 'left')}
        for side, other in (('right', 'left'), ('left', 'right')):
            other_onsets = {round(n['beat'], 4) for n in by_hand[other]}
            spans = sorted((n['beat'], n['beat'] + (n.get('duration') or 0)) for n in by_hand[other])
            k, latest_end = 0, -1.0  # sweep: the latest end of the other hand's notes begun before b
            for b in sorted({round(n['beat'], 4) for n in by_hand[side]}):
                while k < len(spans) and spans[k][0] < b - 1e-3:
                    latest_end = max(latest_end, spans[k][1]); k += 1
                attacks += 1
                if b not in other_onsets and latest_end > b + 1e-3: held += 1
        independence = held / max(1, attacks)
    return {
        'bpm': round(tempo_map[0][1]), 'seconds': round(seconds), 'notes': len(notes),
        'nps': round(top('nps'), 2), 'rhNps': round(hands['right']['nps'], 2) if hands['right'] else 0,
        'lhNps': round(hands['left']['nps'], 2) if hands['left'] else 0, 'peakNps': round(peak, 2),
        'shortest': round(min(h['shortest'] for h in present), 3),
        'chord95': top('chord95'), 'chordMax': top('chordMax'), 'chordShare': round(top('chordShare'), 2),
        'voices': top('voices'), 'span95': top('span95'), 'leap95': top('leap95'),
        'fastLeaps': round(sum(h['fastLeaps'] for h in present), 1), 'shifts': round(sum(h['shifts'] for h in present), 1),
        'handRange': top('range'), 'range': max(n['midi'] for n in notes) - min(n['midi'] for n in notes),
        'accidentals': abs(key_fifths), 'chromatic': round(chromatic, 3),
        'black': round(sum(1 for n in notes if int(n['midi']) % 12 in BLACK) / len(notes), 3),
        'tuplets': round(tuplets, 3), 'dotted': round(dotted, 3), 'syncopation': round(syncopation, 3),
        'independence': round(independence, 2), 'bothHands': bool(hands['right'] and hands['left']),
    }


def musicxml_key(path):
    try:
        archive = zipfile.ZipFile(path)
        name = next(n for n in archive.namelist() if n.endswith(('.xml', '.musicxml')) and not n.startswith('META-INF'))
        text = archive.read(name).decode('utf8', 'replace')
        m = re.search(r'<fifths>\s*(-?\d+)\s*</fifths>', text)
        return int(m.group(1)) if m else None
    except Exception:
        return None


STUDY_FIFTHS = {'c': 0, 'g': 1, 'd': 2, 'a': 3, 'e': 4, 'b': 5, 'fis': 6, 'f': -1, 'bes': -2, 'es': -3, 'ees': -3, 'as': -4, 'aes': -4, 'des': -5, 'ges': -6, 'cis': 7}


def key_of(pid, entry):
    """Key signature in fifths (+ sharps, - flats), or None to infer it from the notes."""
    mxl = SITE / 'scores' / pid / 'original.mxl'
    if mxl.exists(): return musicxml_key(mxl)
    key = entry.get('studyKey')
    if key in STUDY_FIFTHS:
        fifths = STUDY_FIFTHS[key]
        return fifths - 3 if entry.get('studyMode') == 'minor' else fifths
    return None


# ---- the model -----------------------------------------------------------------------------------

# Model inputs: name → (how it is computed from the features, plain-English label for reports).
# Chosen by leave-one-out cross-validation from a wider set: the faster hand's speed, the busiest
# 4 seconds, shortest note, leaps and fast leaps, rhythm (tuplets, dotted notes, syncopation) and hand
# independence are computed and kept in difficulty.json, but adding them did not improve the
# cross-validated accuracy, so the model leaves them out.
FEATURES = {
    'speed': (lambda f: math.log2(1 + f['rhNps'] + f['lhNps']), 'notes per second at the marked tempo, both hands, busy bars'),
    'range': (lambda f: f['range'] / 12, 'range of the keyboard used (octaves)'),
    'shifts': (lambda f: math.log2(1 + f['shifts']), 'hand position shifts per minute'),
    'stretch': (lambda f: f['span95'] / 12, 'widest chord in one hand (octaves)'),
    'chords': (lambda f: math.log2(f['chordMax']), 'largest chord in one hand'),
    'texture': (lambda f: f['chord95'], 'usual chord size in one hand (95th percentile)'),
    'voices': (lambda f: f['voices'], 'notes sounding at once in one hand, held notes included (voices)'),
    'key': (lambda f: f['accidentals'] / 7 + 3 * f['chromatic'] + f['black'], 'key signature, accidentals and black keys'),
    'length': (lambda f: math.log2(clamp(f['seconds'], 15, 1200) / 30), 'length at the marked tempo'),
}
MODEL = list(FEATURES)
RIDGE = 5.0

# Evidence for a piece's own level: an RCM grade (R3), Henle level (H4), ARCT or a Henle volume, but
# not a remark about another piece ("Op.37/17 is R3").
MODEL_REASON = 'difficulty model'  # levelReason prefix of a piece moved by this model (not evidence)
EVIDENCE = re.compile(r'(?<!is )(?<!are )(?<![\w/.])(?:[RH]\d{1,2}\b(?!-type)|ARCT|Henle)')


def has_evidence(reason):
    if not reason: return False
    cleaned = re.sub(r'\b(?:is|are) (?:[RH]\d{1,2}|ARCT)\b', '', reason)
    return bool(EVIDENCE.search(cleaned))


def solve(a, b):
    """Solve a·x = b (small, symmetric positive definite) by Gaussian elimination."""
    n = len(a); m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c])); m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c and m[c][c]:
                k = m[r][c] / m[c][c]
                for k2 in range(c, n + 1): m[r][k2] -= k * m[c][k2]
    return [m[i][n] / m[i][i] for i in range(n)]


def fit(rows, names=MODEL, ridge=RIDGE):
    """Ridge regression of level on standardised inputs, then cut points between levels."""
    xs = [[FEATURES[k][0](r['features']) for k in names] for r in rows]
    weights = [r.get('weight', 1.0) for r in rows]
    total = sum(weights)
    mu = [sum(w * x[i] for w, x in zip(weights, xs)) / total for i in range(len(names))]
    sd = [math.sqrt(sum(w * (x[i] - mu[i]) ** 2 for w, x in zip(weights, xs)) / total) or 1 for i in range(len(names))]
    z = [[1.0] + [(x[i] - mu[i]) / sd[i] for i in range(len(names))] for x in xs]
    y = [r['level'] for r in rows]
    k = len(names) + 1
    a = [[sum(w * zr[i] * zr[j] for w, zr in zip(weights, z)) + (ridge if i == j and i else 0) for j in range(k)] for i in range(k)]
    b = [sum(w * zr[i] * yy for w, zr, yy in zip(weights, z, y)) for i in range(k)]
    coef = solve(a, b)
    model = {'names': list(names), 'mu': mu, 'sd': sd, 'coef': coef, 'cuts': [l + .5 for l in range(7)]}
    model['cuts'] = fit_cuts([raw_score(model, r['features']) for r in rows], y, weights)
    return model


def raw_score(model, features):
    x = [FEATURES[k][0](features) for k in model['names']]
    return model['coef'][0] + sum(c * (v - m) / s for c, v, m, s in zip(model['coef'][1:], x, model['mu'], model['sd']))


def level_of(model, raw):
    return sum(1 for c in model['cuts'] if raw >= c)


def fit_cuts(scores, levels, weights):
    """Cut points between levels 0..7, starting at x.5. Each cut in turn is moved to the threshold
    that gives the fewest weighted squared level errors among the pieces it decides (those between
    its neighbouring cuts), ties broken by more exact levels; repeated until nothing changes."""
    cuts = [l + .5 for l in range(7)]
    rows = sorted(zip(scores, levels, weights))
    def penalty(level, actual, w):
        d = abs(level - actual); return w * (d * d - .001 * (d == 0))
    for _ in range(20):
        moved = False
        for i in range(7):
            low = cuts[i - 1] if i else -math.inf
            high = cuts[i + 1] if i < 6 else math.inf
            part = [r for r in rows if low <= r[0] < high]
            if not part: continue
            # threshold before part[j] → part[:j] get level i, part[j:] get level i + 1
            below = [0.0]
            for s_, l, w in part: below.append(below[-1] + penalty(i, l, w))
            above = [0.0]
            for s_, l, w in reversed(part): above.append(above[-1] + penalty(i + 1, l, w))
            above.reverse()
            best_j = min(range(len(part) + 1), key=lambda j: (below[j] + above[j], abs(j - len(part) / 2)))
            if best_j == 0: new = (part[0][0] + (low if low > -math.inf else part[0][0] - 1)) / 2
            elif best_j == len(part): new = (part[-1][0] + (high if high < math.inf else part[-1][0] + 1)) / 2
            else: new = (part[best_j - 1][0] + part[best_j][0]) / 2
            new = min(max(new, low + 1e-6 if low > -math.inf else new), high - 1e-6 if high < math.inf else new)
            if abs(new - cuts[i]) > 1e-9: cuts[i] = new; moved = True
        if not moved: break
    return cuts


def to_score(model, raw):
    """0–100 for display: level 0 ≈ 0, level 7 ≈ 100 (prediction scale)."""
    return round(clamp(raw / 7 * 100, 0, 100), 1)


# ---- the old model, for comparison (scripts/gen-collection-guidance.py, no tempo) -----------------

OLD_W = [-2.081, 0.536, 1.296, 1.785, -0.001, 0.179, 0.363, -0.06]


def old_model_level(notes, raw=False):
    by = {}
    for n in notes: by.setdefault((round(n['beat'], 4), n.get('hand')), []).append(n['midi'])
    onsets = sorted({round(n['beat'], 4) for n in notes})
    best, j = 0, 0
    for i, b in enumerate(onsets):
        while onsets[j] < b - 8: j += 1
        best = max(best, i - j + 1)
    chords = sorted(len(v) for v in by.values()); spans = sorted(max(v) - min(v) for v in by.values())
    total = max(n['beat'] + (n.get('duration') or 0) for n in notes)
    gaps = sorted(onsets[i] - onsets[i - 1] for i in range(1, len(onsets)) if onsets[i] - onsets[i - 1] > 1e-3)
    span95 = spans[int(len(spans) * .95)]; chord95 = chords[int(len(chords) * .95)]
    short = gaps[int(len(gaps) * .1)] if gaps else 1
    x = [1, len(onsets) / max(total, 1), math.log10(len(notes)), sum(1 for n in notes if n['midi'] % 12 in BLACK) / len(notes),
         1 if span95 >= 12 else 0, min(chord95, 4), math.sqrt(best / 8), 1 / math.sqrt(max(short, .05))]
    value = sum(v * w for v, w in zip(x, OLD_W))
    return value if raw else max(1, min(7, round(value)))


# ---- main ----------------------------------------------------------------------------------------

def collect():
    rep, cur = load_repertoire(), load_curriculum()
    in_curriculum = {p['id']: p for p in cur['pieces']}
    rows = {}
    for pid, entry in rep.items():
        notes, meter = load_notes(entry)
        if not notes: continue
        total = max(n['beat'] + (n.get('duration') or 0) for n in notes)
        tempo_map, source = tempo_for(pid, entry, total)
        feats = piece_features(notes, meter, tempo_map, key_of(pid, entry))
        if not feats: continue
        feats['tempoSource'] = source
        p = in_curriculum.get(pid)
        rows[pid] = {'id': pid, 'features': feats, 'title': entry.get('title', pid), 'composer': entry.get('composer', ''),
                     'kind': entry.get('kind'), 'studyLevel': entry.get('studyLevel'),
                     'level': p['level'] if p else entry.get('studyLevel'), 'reason': (p or {}).get('levelReason'),
                     'collection': bool((p or {}).get('collection')), 'inCurriculum': bool(p),
                     'old': old_model_level([n for n in notes if isinstance(n.get('midi'), (int, float))]),
                     'oldRaw': old_model_level([n for n in notes if isinstance(n.get('midi'), (int, float))], raw=True),
                     'set': progressive_set(entry)}
    return rows, cur


def calibration(rows):
    """Pieces whose level is known: RCM/Henle evidence, the hand-levelled core (non-collection
    library pieces) and the First keys pieces (Level 0). Reading and key studies are left out: a
    reading level is not a repertoire level, and the key studies are one template in 24 keys."""
    out = []
    for r in rows.values():
        if not r['inCurriculum']: continue
        if r['kind'] == 'first': out.append(dict(r, weight=.5, why='first'))
        elif has_evidence(r['reason']): out.append(dict(r, weight=1.0, why='evidence'))
        elif r['reason'] and r['reason'].startswith(MODEL_REASON): continue  # placed by this model: not a label
        elif not r['collection']: out.append(dict(r, weight=1.0, why='core'))
    return sorted(out, key=lambda r: r['id'])


# Teaching collections whose printed numbering is a learning sequence. Inside a level their pieces
# keep that sequence (scripts/apply-learning-path.py). Concert sets (Chopin's études and preludes,
# Kinderszenen, Tchaikovsky's Op. 39 story) are not listed: their numbering is not a progression.
PROGRESSIVE_SETS = [
    (r'Czerny', None), (r'Burgm', {'100', '109'}), (r'Schumann', {'68'}), (r'Lemoine', {'37'}),
    (r'Duvernoy', {'176'}), (r'Clementi', {'36'}), (r'Kuhlau', {'20', '55'}), (r'Gurlitt', None),
    (r'Heller', {'45', '46', '47'}), (r'Streabbog', None), (r'K[öo]hler', None),
]


def progressive_set(entry):
    """('Composer Op. N', number) for a piece of a teaching collection, else None."""
    title, composer = entry.get('title', ''), entry.get('composer', '')
    if 'Bach' in composer:
        m = re.match(r'(Invention|Sinfonia) No\. (\d+)\b', title)
        return (f'Bach {m.group(1)}s', int(m.group(2))) if m else None
    m = re.search(r'Op\.\s*(\d+)[^·]*?No\.\s*(\d+)', title)
    if not m: return None
    for name, opuses in PROGRESSIVE_SETS:
        if re.search(name, composer) and (opuses is None or m.group(1) in opuses):
            return (f"{composer.split()[-1]} Op. {m.group(1)}", int(m.group(2)))
    return None


def evaluate(cal, names=MODEL, ridge=RIDGE):
    """Leave-one-out: every calibration piece is predicted by a model fitted without it.
    Returns ({id: predicted level}, {id: raw score})."""
    preds, raws = {}, {}
    for i, r in enumerate(cal):
        model = fit(cal[:i] + cal[i + 1:], names, ridge)
        raws[r['id']] = raw_score(model, r['features'])
        preds[r['id']] = level_of(model, raws[r['id']])
    return preds, raws


def spearman(xs, ys):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i]); r = [0.0] * len(v); i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]: j += 1
            for k in range(i, j + 1): r[order[k]] = (i + j) / 2
            i = j + 1
        return r
    a, b = ranks(xs), ranks(ys); ma, mb = sum(a) / len(a), sum(b) / len(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    return num / math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))


def accuracy(rows, pred, key=None):
    rows = [r for r in rows if key is None or key(r)]
    if not rows: return (0, 0, 0)
    exact = sum(1 for r in rows if pred[r['id']] == r['level'])
    within = sum(1 for r in rows if abs(pred[r['id']] - r['level']) <= 1)
    return exact, within, len(rows)


def pct(t): return f"{t[0]}/{t[2]} exact ({100 * t[0] / max(1, t[2]):.0f}%), {t[1]}/{t[2]} within one ({100 * t[1] / max(1, t[2]):.0f}%)"


def explain(model, features, n=3):
    """The inputs that push this piece up (or down) the most, in plain words."""
    parts = []
    for c, k, m, s in zip(model['coef'][1:], model['names'], model['mu'], model['sd']):
        parts.append((c * (FEATURES[k][0](features) - m) / s, k))
    parts.sort(reverse=True)
    return [f"{k} {'+' if v >= 0 else ''}{v:.1f}" for v, k in parts[:n]]


def describe(f):
    hands = f"{f['nps']:.1f} notes/s at ♩={f['bpm']}" + ('' if f['tempoSource'] in ('midi', 'musicxml', 'study') else ' (no marked tempo, ♩=100 assumed)')
    return (f"{hands}, chords up to {f['chord95']} ({f['chordMax']} max), stretch {f['span95']} semitones, "
            f"{f['voices']} voices in a hand, leaps {f['leap95']} ({f['fastLeaps']}/min fast), {f['accidentals']} accidentals in the key, "
            f"{round(100 * f['chromatic'])}% chromatic, {f['seconds']} s")


def main():
    rows, cur = collect()
    cal = calibration(rows)
    loo, loo_raw = evaluate(cal)
    model = fit(cal)
    old_pred = {r['id']: r['old'] for r in cal}

    report = []
    real = [r for r in cal if r['why'] != 'first']
    evidence = [r for r in cal if r['why'] == 'evidence']
    library = [r for r in real if not r['collection']]
    report.append(f"calibration: {len(real)} levelled pieces ({len(evidence)} with RCM/Henle evidence, "
                  f"{len(real) - len(evidence)} other hand-levelled library pieces) plus {len(cal) - len(real)} First keys pieces at half weight")
    report.append(f"new model, leave-one-out, {len(real)} levelled pieces: " + pct(accuracy(real, loo)) +
                  f"; rank correlation with level {spearman([loo_raw[r['id']] for r in real], [r['level'] for r in real]):.2f}")
    report.append(f"new model, leave-one-out, the {len(evidence)} RCM/Henle pieces: " + pct(accuracy(evidence, loo)))
    report.append(f"new model, leave-one-out, the {len(library)} hand-levelled library pieces (the old model's training set): " + pct(accuracy(library, loo)))
    report.append(f"old collection model as shipped (no tempo, its own rounding), same {len(real)} pieces: " + pct(accuracy(real, old_pred)) +
                  f" (its 48% was measured against the levels before they were anchored to RCM; on the {len(library)} library pieces today: "
                  + pct(accuracy(library, old_pred)) + ')')
    # the old model's linear score with its cut points re-fitted to today's levels (leave-one-out)
    refit = {}
    for i, r in enumerate(cal):
        rest = cal[:i] + cal[i + 1:]
        cuts = fit_cuts([x['oldRaw'] for x in rest], [x['level'] for x in rest], [x['weight'] for x in rest])
        refit[r['id']] = sum(1 for c in cuts if r['oldRaw'] >= c)
    report.append(f"old model's score with cut points re-fitted to today's levels, leave-one-out, same {len(real)} pieces: " + pct(accuracy(real, refit)) +
                  f"; rank correlation {spearman([r['oldRaw'] for r in real], [r['level'] for r in real]):.2f}")
    report.append('the inputs were chosen with the same leave-one-out runs, so expect a few points less on new pieces')
    report.append('weights (per standard deviation): ' + ', '.join(f"{k} {c:+.2f}" for k, c in zip(model['names'], model['coef'][1:])))
    report.append('cut points: ' + ', '.join(f"{c:.2f}" for c in model['cuts']))

    out = {}
    for pid in sorted(rows):
        r = rows[pid]; raw = raw_score(model, r['features'])
        out[pid] = {'score': to_score(model, raw), 'predictedLevel': level_of(model, raw), 'features': r['features'],
                    'drivers': explain(model, r['features'])}
        if r['set']: out[pid]['set'], out[pid]['setNo'] = r['set']
    meta = {'about': 'Generated by scripts/difficulty.py; do not edit. score 0-100 (level 0 ≈ 0, level 7 ≈ 100); '
                     'predictedLevel from the score data alone. The level itself comes from evidence in the curriculum.',
            'model': {'inputs': {k: FEATURES[k][1] for k in model['names']},
                      'weights': {k: round(c, 4) for k, c in zip(model['names'], model['coef'][1:])},
                      'intercept': round(model['coef'][0], 4), 'cuts': [round(c, 3) for c in model['cuts']]},
            'accuracy': report}
    # one piece per line, so a rerun shows up in a diff as the pieces that changed
    entries = [('_meta', meta)] + list(out.items())
    OUT_JSON.write_text('{\n' + ',\n'.join(json.dumps(k) + ':' + json.dumps(v, ensure_ascii=False, separators=(',', ':'))
                                             for k, v in entries) + '\n}\n')

    # suspects: curriculum pieces two or more levels from the prediction
    lines = ['# Difficulty suspects', '',
             'Generated by `python3 scripts/difficulty.py`; do not edit. A suspect is a curriculum piece whose level',
             'differs by two or more from the level predicted from its score data. `tests/piano-difficulty.test.cjs`',
             'fails if a suspect has no `levelReason` (a reason starting "difficulty model" does not count): either',
             'move it in `scripts/level-overrides.json` (reason "difficulty model: …") or give the evidence or the',
             'musical reason the model cannot see.', '',
             '## Model', ''] + ['- ' + x for x in report] + ['']
    open_, reasoned = [], []
    for p in cur['pieces']:
        if p['id'] not in out: continue
        d = out[p['id']]
        if abs(d['predictedLevel'] - p['level']) < 2: continue
        justified = p.get('levelReason') and not p['levelReason'].startswith(MODEL_REASON)
        (reasoned if justified else open_).append((p, d))
    def row(p, d):
        r = rows[p['id']]
        reason = p.get('levelReason') or '—'
        return f"| {p['id']} | {p['level']} | {d['predictedLevel']} | {d['score']} | {describe(r['features'])} | {reason} |"
    head = ['| id | level | predicted | score | measured | reason |', '|---|---|---|---|---|---|']
    lines += [f'## Without a reason ({len(open_)})', '', 'These fail the test.', '']
    lines += (head + [row(p, d) for p, d in open_]) if open_ else ['None.']
    lines += ['', f'## With a reason ({len(reasoned)})', '',
              'Evidence (RCM/Henle) or a human reason decides the level; the model is shown for information.', '']
    lines += (head + [row(p, d) for p, d in reasoned]) if reasoned else ['None.']
    OUT_SUSPECTS.write_text('\n'.join(lines) + '\n')

    for x in report: print(x)
    print(f'suspects without a reason: {len(open_)}, with a reason: {len(reasoned)}')
    print(f'wrote {OUT_JSON.relative_to(ROOT)} ({len(out)} pieces) and {OUT_SUSPECTS.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
