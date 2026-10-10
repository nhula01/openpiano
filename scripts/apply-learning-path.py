"""Apply the learning path's hand-reviewed decisions to the site data.

- scripts/level-overrides.json: level corrections (with evidence), chorale settings moved up, entries
  removed (incomplete or misidentified scores) and corrected titles.
- Level 0 "First keys": the stage before Level 1, and its 20 original pieces (first-01 … first-20,
  built by scripts/build-piano-studies.py) with their own guidance.

Run after any script that rewrites site/piano-curriculum.js (gen-collection-guidance.py,
add-famous-curriculum.py, add-pdmx-curriculum.py). Idempotent.
"""
import json, pathlib, re, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
over = json.loads((ROOT / 'scripts/level-overrides.json').read_text())

# ---- Level 0 ----------------------------------------------------------------------------------
LEVEL0 = {
    "id": 0, "title": "Start here · first keys",
    "focus": "Find your way around the keys and read your first notes, one new thing at a time.",
    "skills": [
        "Find C, F and middle C from the groups of two and three black keys, and name the white keys around them.",
        "Read notes that step and skip from middle C in both clefs, and count quarter, half and whole notes aloud.",
        "Play with each hand alone, then pass the melody between the hands, then hold a left-hand note under a right-hand tune.",
    ],
    "theory": "Notes move by step (to the next line or space) or by skip (line to line, space to space). A sharp raises a note to the nearest key on the right, a flat lowers it to the nearest key on the left; G position needs F♯ and F position needs B♭.",
    "common": "Most first pieces end on the note they are named after: a piece in C ends on C, in G on G. Listen for that feeling of home at the end of each piece.",
    "routine": "Five to fifteen minutes a day is enough: find the starting key, clap and count the rhythm once, play it in Wait mode, then once In time at a slow tempo. Stop while it still feels easy.",
    "checks": [
        "I can find any C, F and middle C without counting keys from the bottom.",
        "I can read a step and a skip up or down without naming every note.",
        "I can play a short piece with a held left-hand note under the melody without stopping.",
    ],
}
# per piece: (prerequisites, exercise, check); skill = the study's focus line
FIRST = {
    1: ("Find middle C: the white key just left of the two black keys in the middle of the keyboard.", "Say the note names C–D–E–F–G aloud as you play them, then play the piece in Wait mode.", "I can play Morning Bells in Wait mode without a wrong note."),
    2: ("Morning Bells.", "Count four beats for every whole note out loud; let each note ring to its end.", "I hold every whole note for all four counts."),
    3: ("Little Boat.", "Find the starting note, read the first two bars by step and skip, then play it In time at a slow tempo.", "I can play Sunny Steps In time without stopping."),
    4: ("Find the C an octave below middle C with your left hand.", "Play it once in Wait mode, saying the note names; then once In time.", "My left hand reads C to G in the bass clef."),
    5: ("Bear in the Woods.", "Keep the left hand relaxed and the notes even; listen for the quiet ending.", "I can play Evening Song In time with an even beat."),
    6: ("Both hands in C position (each thumb on a C).", "Before playing, point to where the melody moves from one hand to the other.", "The hand-overs keep the beat: no gap between the hands."),
    7: ("Echo Valley.", "Count the rests aloud; a rest is a silent beat, not a pause.", "I can play Garden Conversation In time with every rest counted."),
    8: ("Garden Conversation.", "Play the piece once very slowly In time, then raise the tempo a little.", "I can play Raindrops at the marked tempo with no extra stops."),
    9: ("Raindrops.", "Play the left-hand whole notes first; then add the right-hand melody on top.", "I can hold the left-hand note while the right hand plays the tune."),
    10: ("Lantern Light.", "Practise each hand alone once, then together in Wait mode.", "Both hands start and end each half note together."),
    11: ("Quiet Pond.", "Find where the left hand moves by a fifth before you start.", "I can play Walking Together hands together In time."),
    12: ("Find F♯: the black key just right of F.", "Circle every F in your mind before playing: in G position each one is F♯.", "I play every F as F♯ in Hilltop Kite."),
    13: ("Hilltop Kite.", "Hands separately in Wait mode, then together at a slow tempo.", "I can play Country Road hands together without stopping."),
    14: ("Count to three: ONE two three.", "Count the dotted half notes for three beats each; feel the strong first beat.", "I can play Sleepy Waltz with three beats in every bar."),
    15: ("Sleepy Waltz and Country Road.", "Play In time; let the first beat of each bar be a little stronger.", "I can play Carousel In time in G position."),
    16: ("Both thumbs share middle C.", "Find where the melody crosses middle C from one clef to the other.", "I can read across the two clefs without losing the beat."),
    17: ("Find B♭: the black key just left of B.", "Remember that every B is B♭ in F position; play it once in Wait mode.", "I play every B as B♭ in Swaying Willow."),
    18: ("Swaying Willow.", "Play the slurred notes smoothly and the dotted notes short and light.", "You can hear the difference between my legato and staccato."),
    19: ("Hopscotch and Country Road.", "Play the left-hand open fifths first, listening to I and V; then add the melody.", "I can play Village Dance with a steady left hand."),
    20: ("Village Dance.", "Clap the eighth notes in pairs (1-and 2-and) before playing; play it In time at the marked tempo.", "I can play Graduation March In time at the marked tempo: ready for Level 1."),
}

def write_curriculum(data, prefix):
    (SITE / 'piano-curriculum.js').write_text(prefix + 'window.PianoCurriculum=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')

def remove_block(text, key):
    """Remove `"key": {...}` (with its comma) from a JSON text without reformatting the rest."""
    m = re.search(r'"' + re.escape(key) + r'"\s*:\s*\{', text)
    if not m: return text, False
    i = m.end() - 1; depth = 0; in_str = False; esc = False
    for j in range(i, len(text)):
        ch = text[j]
        if in_str:
            if esc: esc = False
            elif ch == '\\': esc = True
            elif ch == '"': in_str = False
        elif ch == '"': in_str = True
        elif ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0: end = j + 1; break
    start = m.start()
    after = re.match(r'\s*,', text[end:])
    if after: end += after.end()
    else:
        before = re.search(r',\s*$', text[:start])
        if before: start = before.start()
    return text[:start] + text[end:], True

def main():
    cur = SITE / 'piano-curriculum.js'; prefix, body = cur.read_text().split('window.PianoCurriculum=', 1)
    data = json.loads(body.rstrip().rstrip(';'))
    ids = {p['id'] for p in data['pieces']}
    problems = []

    def resolve(key):
        if not key.endswith('*'): return key if key in ids else None
        hits = [i for i in ids if i.startswith(key[:-1])]
        return hits[0] if len(hits) == 1 else None

    # removals (curriculum, collection manifest and sources, score folder)
    for rid, why in over['remove'].items():
        data['pieces'] = [p for p in data['pieces'] if p['id'] != rid]
        for f in ['scripts/collection-sources.json', 'site/piano-collection.js']:
            path = ROOT / f; text = path.read_text(); text, hit = remove_block(text, rid)
            if hit: path.write_text(text)
        folder = SITE / 'scores' / rid
        if folder.exists(): shutil.rmtree(folder)
    ids = {p['id'] for p in data['pieces']}

    # method-book ladders (scripts/piano-method-pieces.json, optional): their curriculum entries, built from the
    # hand-written guidance; the level comes from over['levels'] below. Only pieces built into site/piano-method.js.
    method_file = ROOT / 'scripts/piano-method-pieces.json'
    if method_file.exists():
        method = json.loads(method_file.read_text())
        built = set(re.findall(r'"([a-z0-9-]+)":\{"id"', (SITE / 'piano-method.js').read_text())) if (SITE / 'piano-method.js').exists() else set()
        before = {p['id']: p for p in data['pieces']}
        data['pieces'] = [p for p in data['pieces'] if p['id'] not in method['pieces']]
        for pid, m in method['pieces'].items():
            if pid not in built: problems.append('method piece not built ' + pid); continue
            data['pieces'].append({'id': pid, 'level': over['levels'].get(pid, [3])[0], 'order': m['order'], 'set': m['set'],
                                   **{k: m[k] for k in ('skill', 'prerequisites', 'pattern', 'transfer', 'exercise', 'check')}})
            if before.get(pid, {}).get('levelReason'): data['pieces'][-1]['levelReason'] = before[pid]['levelReason']
        ids = {p['id'] for p in data['pieces']}
        for pid, order in method.get('order', {}).items():
            p = next((x for x in data['pieces'] if x['id'] == pid), None)
            if p: p['order'] = order
            else: problems.append('no piece to order ' + pid)

    # levels
    changed = 0
    for key, (level, why) in over['levels'].items():
        pid = resolve(key)
        if not pid: problems.append('no single piece matches ' + key); continue
        p = next(x for x in data['pieces'] if x['id'] == pid)
        if p['level'] != level or p.get('levelReason') != why: changed += 1
        p['level'] = level; p['levelReason'] = why
    ch = over['chorales']
    for pid in ch['ids']:
        p = next((x for x in data['pieces'] if x['id'] == pid), None)
        if not p: problems.append('no chorale ' + pid); continue
        if p['level'] < ch['level']: p['level'] = ch['level']; changed += 1
        p['levelReason'] = 'four-voice setting: chorale reading (Schumann Op.68/4 is H3)'

    # titles: curriculum keeps no titles for library pieces; fix the sources and manifests
    for pid, title in over['titles'].items():
        for f in ['site/piano-library.js', 'site/piano-collection.js', 'scripts/collection-sources.json', 'scripts/build-piano-library.py']:
            path = ROOT / f; text = path.read_text()
            pattern = re.compile(r'("' + re.escape(pid) + r'"\s*:\s*\{\s*"id"\s*:\s*"' + re.escape(pid) + r'"\s*,\s*"title"\s*:\s*")[^"]*(")')
            pattern2 = re.compile(r'("' + re.escape(pid) + r'"\s*:\s*\{\s*"title"\s*:\s*")[^"]*(")')
            pattern3 = re.compile(r"('" + re.escape(pid) + r"'\s*:\s*\(')[^']*(')")
            new = pattern.sub(lambda m: m[1] + title + m[2], text); new = pattern2.sub(lambda m: m[1] + title + m[2], new); new = pattern3.sub(lambda m: m[1] + title + m[2], new)
            if new != text: path.write_text(new)
        pj = SITE / 'scores' / pid / 'practice.json'
        if pj.exists():
            d = json.loads(pj.read_text())
            if d.get('title') != title: d['title'] = title; pj.write_text(json.dumps(d, separators=(',', ':')))

    # Level 0
    data['levels'] = [l for l in data['levels'] if l['id'] != 0]
    data['levels'].insert(0, LEVEL0)
    studies = json.loads((SITE / 'piano-studies.js').read_text().split('Object.assign(window.PianoRepertoire,', 1)[1].rsplit(');', 1)[0])
    data['pieces'] = [p for p in data['pieces'] if not p['id'].startswith('first-')]
    first = []
    for n in range(1, 21):
        pid = f'first-{n:02d}'; s = studies.get(pid)
        if not s: problems.append('missing study ' + pid); continue
        pre, ex, check = FIRST[n]
        first.append({'id': pid, 'level': 0, 'order': n, 'skill': s['focus'], 'prerequisites': pre,
                      'pattern': f"{s['title']}: {s['focus'].lower()}; {s['timeSignature']} at ♩={s['tempo']}.",
                      'transfer': 'Each First keys piece adds one new thing to the last; together they prepare Level 1.',
                      'exercise': ex, 'check': check, 'original': True})
    data['pieces'] = first + data['pieces']
    # within each level: original order kept, levels ascending
    data['pieces'].sort(key=lambda p: p['level'])
    write_curriculum(data, prefix)
    counts = {}
    for p in data['pieces']: counts[p['level']] = counts.get(p['level'], 0) + 1
    print('level changes', changed, '· pieces per level', dict(sorted(counts.items())))
    for x in problems: print('WARNING', x)
    return 1 if problems else 0

if __name__ == '__main__':
    sys.exit(main())
