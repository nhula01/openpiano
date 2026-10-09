"""Write site/piano-collection.js and study guidance for every piece in the large collection.

Usage: python3 scripts/gen-collection-guidance.py OUT_DIR SITE_DIR  (OUT_DIR as written by build-collection.py)

Levels come from a small linear model fitted to the hand-levelled core library (note density,
length, black-key share, octave stretches, chord size); it agrees within one level for 96% of
those pieces. Guidance text is assembled from measured facts about each score (key, meter,
chords, stretches, length) and the kind of music it is. It never invents fingering.
"""
import gzip, json, math, pathlib, re, sys
OUT, SITE = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
W = [-2.081, 0.536, 1.296, 1.785, -0.001, 0.179, 0.363, -0.06]
SHARPS, FLATS = 'F♯ C♯ G♯ D♯ A♯ E♯ B♯'.split(), 'B♭ E♭ A♭ D♭ G♭ C♭ F♭'.split()
COLLECTION = {'Christmas': 'Christmas carols', 'Hymns & spirituals': 'Hymns & spirituals', 'Folk songs of the world': 'Folk songs',
              'Children’s songs': 'Children’s songs', 'Americana & early popular': 'Early American songs'}


def feats(notes):
    by = {}
    for n in notes: by.setdefault((round(n['beat'], 4), n['hand']), []).append(n['midi'])
    onsets = sorted({round(n['beat'], 4) for n in notes})
    best = j = 0
    for i, b in enumerate(onsets):
        while onsets[j] < b - 8: j += 1
        best = max(best, i - j + 1)
    chords = sorted(len(v) for v in by.values()); spans = sorted(max(v) - min(v) for v in by.values())
    total = max(n['beat'] + n['duration'] for n in notes)
    gaps = sorted(b - a for a, b in zip(onsets, onsets[1:]) if b - a > 1e-3)
    return {'n': len(notes), 'avg': len(onsets) / max(total, 1), 'peak': best / 8, 'black': sum(n['midi'] % 12 in (1, 3, 6, 8, 10) for n in notes) / len(notes),
            'span95': spans[int(len(spans) * 0.95)], 'chord95': chords[int(len(chords) * 0.95)], 'short': gaps[int(len(gaps) * 0.1)] if gaps else 1}


def level_of(f):
    x = [1, f['avg'], math.log10(f['n']), f['black'], f['span95'] >= 12, min(f['chord95'], 4), f['peak'] ** 0.5, 1 / max(f['short'], 0.05) ** 0.5]
    return max(1, min(7, round(sum(a * b for a, b in zip(W, x)))))


def key_text(fifths):
    if fifths == 0: return 'a key signature with no sharps or flats'
    names = SHARPS[:fifths] if fifths > 0 else FLATS[:-fifths]
    return f"{abs(fifths)} {'sharp' if fifths > 0 else 'flat'}{'s' if abs(fifths) > 1 else ''} ({', '.join(names)})"


def guidance(m, st, f, shelf, level):
    title = m['title']; t = title.lower()
    octaves = f['span95'] >= 12; chords = f['chord95'] >= 3; fast = f['avg'] >= 3.5 or f['peak'] >= 6; left = st['leftShare'] >= 0.45
    minutes = max(1, round(st['seconds'] / 60))
    if shelf == 'Hymns & spirituals': skill = 'Four-part hymn chords' if chords else 'A hymn tune with simple harmony'
    elif shelf == 'Christmas': skill = 'A carol melody over a simple bass' if level <= 2 else 'Carol harmony in both hands'
    elif shelf == 'Children’s songs': skill = 'A first tune with a simple left hand'
    elif shelf == 'Folk songs of the world': skill = 'A folk melody with accompaniment'
    elif shelf == 'Ragtime & early jazz' or 'rag' in t: skill = 'A stride left hand under a syncopated melody'
    elif re.search(r'waltz|valse|walzer', t): skill = 'A waltz bass with a singing melody'
    elif re.search(r'march|marche|polonaise', t): skill = 'A steady march rhythm with firm chords'
    elif re.search(r'fugue|invention|sinfonia|canon', t): skill = 'Independent voices in both hands'
    elif re.search(r'nocturne|reverie|rêverie|romance|song|lied|lullaby|berceuse|air\b|aria', t): skill = 'A singing melody over flowing accompaniment'
    elif re.search(r'[eé]tude|study|velocity|dexterity|toccata', t): skill = 'Even, fast passagework'
    elif re.search(r'symphony|concerto|overture', t): skill = 'An orchestral piece in piano form'
    elif shelf == 'Opera & ballet': skill = 'A famous stage melody arranged for piano'
    elif octaves and chords: skill = 'Octaves and full chords'
    elif fast: skill = 'Fast, even passagework'
    elif left: skill = 'An active left hand'
    else: skill = 'Melody over accompaniment'
    extra = []
    if chords: extra.append(f"chords of up to {f['chord95']} notes in one hand")
    if octaves: extra.append('octave stretches')
    stage = {1: 'find notes in a five-finger position', 2: 'move between hand positions', 3: 'keep a broken-chord accompaniment even',
             4: 'balance a melody over its accompaniment', 5: 'keep two independent lines steady together', 6: 'control voicing, pedalling and rubato',
             7: 'sustain advanced technique through a long piece'}[level]
    pre = f"Read {key_text(st['fifths'])} in {st['time']} time and {stage}" + (f", with {' and '.join(extra)}" if extra else '') + '.'
    kind = {'Hymns & spirituals': 'A hymn or spiritual set for piano', 'Christmas': 'A Christmas favourite set for piano', 'Children’s songs': 'A children’s song set for piano',
            'Folk songs of the world': 'A traditional tune set for piano', 'Americana & early popular': 'A popular song from before 1931, set for piano',
            'Opera & ballet': 'A stage work arranged for solo piano', 'Ragtime & early jazz': 'Syncopated piano music from the ragtime era'}.get(shelf, f'A complete {shelf.lower()} piece for piano' if shelf in ('Baroque', 'Classical', 'Romantic') else 'A complete piano piece')
    rep = ', repeats written out' if st.get('measures') and st['measures'][0] != st['measures'][1] else ''
    pattern = f"{kind}: {st['notes']} notes over about {minutes} minute{'s' if minutes > 1 else ''} at the marked tempo{rep}."
    transfer = {'Hymns & spirituals': 'Reading four-part chords and moving between them smoothly transfers to accompanying singers and to chorales by Bach.',
                'Christmas': 'Carol harmonies use the most common chord progressions, so they transfer to playing by ear and accompanying.',
                'Children’s songs': 'Simple tunes build note reading and steady pulse that every later piece relies on.',
                'Folk songs of the world': 'Folk tunes train phrasing and melody shaping that carry over to lyrical classical pieces.',
                'Americana & early popular': 'Song accompaniments with a bass note and chord are the basis of popular piano styles.',
                'Ragtime & early jazz': 'Leaping stride bass and off-beat accents transfer to ragtime, early jazz and dance music.',
                'Opera & ballet': 'Keeping a melody clear inside an orchestral-style texture transfers to concertos and transcriptions.',
                'Baroque': 'Hearing each voice separately transfers to Bach’s inventions, suites and fugues.',
                'Classical': 'Clear phrasing and even passagework transfer to sonatas by Haydn, Mozart and Beethoven.'}.get(shelf, 'Shaping melody, balance and pedal transfers to the wider Romantic and modern repertoire.')
    if fast: ex = 'Find the busiest passage and practise it hands separately at half speed in short groups, then join the hands.'
    elif chords: ex = 'Play the chords as blocks and listen to how they change before adding the melody on top.'
    elif left: ex = 'Learn the left hand first until it runs by itself, then add the right hand slowly.'
    else: ex = 'Play each hand through one practice block, then join the hands slowly with the metronome.'
    if st.get('fingered'): ex += ' Follow the printed fingering.'
    check = 'Play one practice block hands together at a steady tempo without stopping' + (', then the whole piece.' if minutes > 1 else ', then the whole piece twice.')
    if octaves: check = check[:-1] + ', keeping the hand relaxed in every stretch.'
    return {'id': m['id'], 'level': level, 'skill': skill, 'prerequisites': pre, 'pattern': pattern, 'transfer': transfer, 'exercise': ex, 'check': check, 'collection': True}


manifest, guide = {}, []
for p in sorted((OUT / 'manifest').glob('*.json')):
    d = json.loads(p.read_text()); m = d['manifest']; st = d['stats']; shelf = d['shelf']
    notes = json.loads(gzip.decompress((OUT / 'scores' / m['id'] / 'practice.json.gz').read_bytes()))['notes']
    f = feats(notes); lv = level_of(f)
    m = {**m, 'shelf': shelf}
    if shelf in COLLECTION: m['collection'] = COLLECTION[shelf]
    manifest[m['id']] = m
    guide.append(guidance(m, st, f, shelf, lv))
(SITE / 'piano-collection.js').write_text('/* The large public-domain collection (PDMX MusicXML, CC0 / public domain). Scores load only when selected. */\nObject.assign(window.PianoRepertoire,' + json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + ');\n')
cur = SITE / 'piano-curriculum.js'; text = cur.read_text(); prefix, body = text.split('window.PianoCurriculum=', 1)
data = json.loads(body.rstrip().rstrip(';'))
data['pieces'] = [p for p in data['pieces'] if not p.get('collection')] + guide
cur.write_text(prefix + 'window.PianoCurriculum=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
from collections import Counter
print(len(manifest), 'pieces; levels', sorted(Counter(g['level'] for g in guide).items()))
