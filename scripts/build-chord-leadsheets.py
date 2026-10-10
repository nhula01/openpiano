#!/usr/bin/env python3
"""Lead sheets for the "Play by chords" route (site/piano-leadsheets.js).

A lead sheet is the melody of a library song with chord symbols above it: the right hand plays the
melody, the left hand plays the chords (checked by the chord checker in site/piano-chords.js).

Only songs that are public domain worldwide AND whose library transcription already carries
<harmony> chord symbols are used. The chord symbols are taken unchanged from that transcription
(released by its transcriber under CC0 or the Public Domain Mark, the same licence as the score);
nothing is harmonised here and no modern fake book is used. The melody is the top note of the right
hand in the library's practice data, so it lines up beat for beat with the practice score.

Each song's chord symbols are checked against its melody: the share of melody notes on strong beats
that belong to the chord above them is printed and stored, and a song below 60% is refused (that
would mean the symbols are misplaced or are analysis labels, not playable chords).

Run: python3 scripts/build-chord-leadsheets.py
"""
import gzip, json, os, sys, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
OUT = os.path.join(ROOT, 'piano-leadsheets.js')

# id, chords level (1-5), why it is public domain worldwide (writers and death years), a short note.
SONGS = [
    ('amazing-grace', 1, 'Tune "New Britain", traditional American (first printed 1829/1835); words John Newton (d. 1807).',
     'Three chords in F: F, B♭ and C, one per bar in 3/4.'),
    ('skip-to-my-lou', 1, 'Traditional American play-party song (19th century).',
     'D, Em and A(7): a two-beat song with a chord change every bar or half bar.'),
    ('scarborough-fair', 2, 'Traditional English ballad (the folk melody, not any 1960s arrangement).',
     'A minor-key song: Em with D, G and A/E.'),
    ('go-down-moses', 2, 'African-American spiritual, traditional (first printed 1872).',
     'G minor: Gm, Cm, D and E♭.'),
    ('the-holly-and-the-ivy', 3, 'Traditional English carol (tune as collected by Cecil Sharp, d. 1924).',
     'F major with Gm7 and C7: the ii7–V7–I cadence.'),
    ('kelley-home-on-the-range', 4, 'Music Daniel E. Kelley (d. 1905), words Brewster Higley (d. 1911); published 1873/1910.',
     'Dominant sevenths and secondary dominants (F7, D7, G7, C7) in F.'),
    ('edwards-by-the-light-of-the-silvery-moon-1909', 5, 'Music Gus Edwards (d. 1945), words Edward Madden (d. 1952); published 1909.',
     'A 1909 popular song: sevenths, diminished and sixth chords, the circle of dominants.'),
    ('sometimes-i-feel-like-a-motherless-child', 5, 'Spiritual, arranged by Harry T. Burleigh (d. 1949), published 1917/1918.',
     'Minor-key colour chords: Em7, Em6, F♯m7, B7, slash chords.'),
]
# Library songs whose transcriptions carry chord symbols that are NOT used, and why.
SKIPPED = {
    'glaser-o-for-a-thousand-tongues-to-sing': 'its symbols include stray "CMaj" labels on A-major harmony; not reliable',
    'mary-had-a-little-lamb': 'the symbols are a modern jazz reharmonisation (Ami7, D7/A, ii–V chains), an arrangement rather than the song’s chords',
}

KIND = {'major': '', 'minor': 'm', 'dominant': '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7', 'diminished': 'dim',
        'diminished-seventh': 'dim7', 'half-diminished': 'm7b5', 'augmented': 'aug', 'major-sixth': '6', 'minor-sixth': 'm6',
        'suspended-fourth': 'sus4', 'suspended-second': 'sus2', 'dominant-ninth': '9', 'power': '5'}
TEXT = {'mi7': 'm7', 'mi': 'm', 'min': 'm', 'min7': 'm7', '-': 'm', '-7': 'm7', 'M7': 'maj7', 'Maj7': 'maj7', '°': 'dim', '°7': 'dim7', 'ø7': 'm7b5'}
ACC = {1: '#', -1: 'b', 0: ''}
STEP = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
INTERVALS = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], 'dim': [0, 3, 6],
             'dim7': [0, 3, 6, 9], 'm7b5': [0, 3, 6, 10], 'aug': [0, 4, 8], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9],
             'sus4': [0, 5, 7], 'sus2': [0, 2, 7], '9': [0, 4, 7, 10, 2], '5': [0, 7]}


def load(song):
    z = zipfile.ZipFile(os.path.join(ROOT, 'scores', song, 'original.mxl'))
    name = [n for n in z.namelist() if n.endswith(('.xml', '.musicxml')) and not n.startswith('META')][0]
    return ET.fromstring(z.read(name))


def symbol(h):
    r = h.find('root')
    if r is None:
        return None  # a Roman-numeral analysis label, not a chord symbol
    k = h.find('kind')
    text = k.get('text') if k is not None else None
    suffix = TEXT.get(text, text) if text is not None else KIND.get((k.text or '').strip() if k is not None else 'major')
    if suffix is None or suffix not in INTERVALS:
        raise SystemExit(f'unknown chord kind {ET.tostring(h)[:200]}')
    alter = int(float(r.findtext('root-alter') or 0))
    s = r.findtext('root-step') + ACC[alter] + suffix
    b = h.find('bass')
    if b is not None:
        s += '/' + b.findtext('bass-step') + ACC[int(float(b.findtext('bass-alter') or 0))]
    return s


def measures(part):
    """Each printed measure: (number, length in quarter beats, [(offset, symbol)], repeat marks)."""
    out, div = [], 1
    for m in part.findall('measure'):
        a = m.find('attributes')
        if a is not None and a.find('divisions') is not None:
            div = int(a.find('divisions').text)
        pos = top = 0
        chords = []
        for c in m:
            if c.tag == 'harmony':
                s = symbol(c)
                off = int(c.findtext('offset') or 0)
                if s:
                    chords.append(((pos + off) / div, s))
            elif c.tag == 'note':
                if c.find('chord') is None and c.find('grace') is None:
                    pos += int(c.findtext('duration') or 0)
            elif c.tag == 'backup':
                pos -= int(c.findtext('duration'))
            elif c.tag == 'forward':
                pos += int(c.findtext('duration'))
            top = max(top, pos)
        fwd = any(b.find('repeat') is not None and b.find('repeat').get('direction') == 'forward' for b in m.findall('barline'))
        back = any(b.find('repeat') is not None and b.find('repeat').get('direction') == 'backward' for b in m.findall('barline'))
        out.append({'n': m.get('number'), 'len': top / div, 'chords': chords, 'fwd': fwd, 'back': back})
    return out


def unfold(ms):
    """Performed order for simple repeats (|: … :|, or :| back to the start), no endings."""
    order, start, i, done = [], 0, 0, set()
    while i < len(ms):
        m = ms[i]
        if m['fwd']:
            start = i
        order.append(m)
        if m['back'] and i not in done:
            done.add(i)
            i = start
            continue
        i += 1
    return order


def pcs(sym):
    main, _, bass = sym.partition('/')
    root = STEP[main[0]] + (1 if main[1:2] == '#' else -1 if main[1:2] == 'b' else 0)
    suffix = main[1:].lstrip('#b')
    return {(root + i) % 12 for i in INTERVALS[suffix]}


def build(song, level, why, note):
    practice = json.load(gzip.open(os.path.join(ROOT, 'scores', song, 'practice.json.gz')))
    ms = measures(load(song).findall('part')[0])
    printed = sum(m['len'] for m in ms)
    order = ms if abs(printed - practice['totalBeats']) < 1e-6 else unfold(ms)
    if abs(sum(m['len'] for m in order) - practice['totalBeats']) > 1e-6:
        raise SystemExit(f'{song}: cannot line the measures up with the practice score')
    bars, chords, beat = [], [], 0.0
    for m in order:
        bars.append(round(beat, 4))
        for off, s in m['chords']:
            chords.append([round(beat + off, 4), s])
        beat += m['len']
    # drop a symbol that only repeats the chord already sounding
    tidy = []
    for c in chords:
        if not tidy or tidy[-1][1] != c[1]:
            tidy.append(c)
    # melody: the highest right-hand note at each onset
    top = {}
    for n in practice['notes']:
        if n['hand'] == 'right' and (n['beat'] not in top or n['midi'] > top[n['beat']]['midi']):
            top[n['beat']] = n
    melody = [[n['midi'], n['beat'], n['duration']] for _, n in sorted(top.items())]
    # check: melody notes on the beat that belong to the chord above them
    fits = total = 0
    for midi, b, _ in melody:
        if abs(b - round(b)) > 1e-6:
            continue
        current = [c for c in tidy if c[0] <= b + 1e-6]
        if not current:
            continue
        total += 1
        fits += (midi % 12) in pcs(current[-1][1])
    fit = round(100 * fits / max(1, total))
    if fit < 60:
        raise SystemExit(f'{song}: only {fit}% of melody notes on the beat fit the chords; refused')
    first = min(c[0] for c in tidy)
    print(f'{song}: {len(tidy)} chords, {len(melody)} melody notes, {fit}% of beat notes are chord tones, chords from beat {first}')
    return {
        'id': song, 'title': practice['title'], 'level': level, 'attribution': practice.get('attribution', ''),
        'source': practice.get('sourceURL', ''), 'why': why, 'note': note, 'fit': fit,
        'meter': practice['beatsPerMeasure'], 'total': practice['totalBeats'], 'bars': bars,
        'chords': tidy, 'melody': melody,
    }


def main():
    sheets = [build(*s) for s in SONGS]
    body = json.dumps({'songs': sheets, 'skipped': SKIPPED}, ensure_ascii=False, separators=(',', ':'))
    with open(OUT, 'w', encoding='utf8') as f:
        f.write("'use strict';\n// Generated by scripts/build-chord-leadsheets.py: do not edit by hand.\n"
                "// Lead sheets (melody + chord symbols) from public-domain library songs whose transcriptions carry\n"
                "// chord symbols; the symbols are the transcriber's (CC0 / Public Domain Mark), unchanged.\n"
                f"window.PianoLeadSheets={body};\n")
    print('wrote', os.path.relpath(OUT), len(sheets), 'songs')


if __name__ == '__main__':
    main()
