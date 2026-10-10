# Synthetic piano scores that use every symbol the reader knows, for training the symbol classifier.
import random, sys, pathlib
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True); N = int(sys.argv[2]); seed = int(sys.argv[3])
STEPS = 'CDEFGAB'
TYPES = [('whole', 16), ('half', 8), ('quarter', 4), ('eighth', 2), ('16th', 1)]
TSP = float(sys.argv[4]) if len(sys.argv) > 4 else 0.3
TS_ALL = [(2,4),(3,4),(4,4),(2,2),(3,8),(6,8),(9,8),(12,8),(5,4),(7,8),(5,8),(3,2),(6,4),(1,4),(7,4),(9,4)]
TS = [(3,4),(3,8),(3,2),(6,8),(9,8),(5,4),(7,8),(5,8),(6,4),(7,4),(9,4),(3,4),(3,4)] if len(sys.argv) > 5 else TS_ALL
def pitch(r, staff, clef):
    base = {'G': 30, 'F': 18, 'C': 24}[clef]
    d = base + r.randint(-6, 12)
    step = STEPS[d % 7]; octave = d // 7
    alter = r.choice([0]*8 + [1, -1, 1, -1, 2, -2])
    return step, octave, alter
def gen(i):
    r = random.Random(seed * 1000 + i)
    measures = []
    clefs = {1: 'G', 2: 'F'}
    for m in range(r.randint(10, 18)):
        attrs = ''
        if m == 0 or r.random() < TSP:
            b, t = r.choice(TS); sym = ''
            if (b, t) == (4, 4) and r.random() < 0.4: sym = ' symbol="common"'
            if (b, t) == (2, 2) and r.random() < 0.5: sym = ' symbol="cut"'
            attrs += f'<time{sym}><beats>{b}</beats><beat-type>{t}</beat-type></time>'
        if m == 0 or r.random() < 0.15: attrs = f'<key><fifths>{r.randint(-7, 7)}</fifths></key>' + attrs
        cl = ''
        for st in (1, 2):
            if m == 0 or r.random() < 0.12:
                c = r.choice(['G', 'F', 'C', 'G', 'F']) if m else clefs[st]
                clefs[st] = c; line = {'G': 2, 'F': 4, 'C': r.choice([3, 3, 4])}[c]
                cl += f'<clef number="{st}"><sign>{c}</sign><line>{line}</line></clef>'
        x = f'<measure number="{m+1}">'
        if attrs or cl: x += '<attributes>' + ('<divisions>12</divisions>' if m == 0 else '') + attrs + ('<staves>2</staves>' if m == 0 else '') + cl + '</attributes>'
        for st in (1, 2):
            if st == 2: x += '<backup><duration>48</duration></backup>'
            total = 0
            while total < 48:
                kind = r.random()
                tname, units = r.choice(TYPES[1:] if r.random() < 0.9 else TYPES)
                dots = 1 if r.random() < 0.15 else 0
                tup = r.random() < 0.12 and tname in ('eighth', '16th', 'quarter')
                if tup:
                    n = r.choice([3, 3, 3, 5, 6]); norm = {3: 2, 5: 4, 6: 4}[n]
                    for k in range(n):
                        st_, oc, al = pitch(r, st, clefs[st])
                        tm = f'<time-modification><actual-notes>{n}</actual-notes><normal-notes>{norm}</normal-notes></time-modification>'
                        nt = ('<notations><tuplet type="start"/></notations>' if k == 0 else '<notations><tuplet type="stop"/></notations>' if k == n - 1 else '')
                        beam = '' if tname == 'quarter' else f'<beam number="1">{"begin" if k == 0 else "end" if k == n - 1 else "continue"}</beam>'
                        x += f'<note><pitch><step>{st_}</step>{f"<alter>{al}</alter>" if al else ""}<octave>{oc}</octave></pitch><duration>{units * 3 * norm // n}</duration><voice>{st}</voice><type>{tname}</type>{tm}{beam}<staff>{st}</staff>{nt}</note>'
                    total += units * 3 * norm; continue
                dur = units * 3 * (3 if dots else 2) // 2
                if kind < 0.2:
                    x += f'<note><rest/><duration>{dur}</duration><voice>{st}</voice><type>{tname}</type>{"<dot/>" * dots}<staff>{st}</staff></note>'
                else:
                    chord = r.randint(1, 3) if r.random() < 0.3 else 1
                    for k in range(chord):
                        st_, oc, al = pitch(r, st, clefs[st])
                        acc = {1: 'sharp', -1: 'flat', 0: 'natural', 2: 'double-sharp', -2: 'flat-flat'}[al] if al or r.random() < 0.05 else None
                        x += f'<note>{"<chord/>" if k else ""}<pitch><step>{st_}</step>{f"<alter>{al}</alter>" if al else ""}<octave>{oc}</octave></pitch><duration>{dur}</duration><voice>{st}</voice><type>{tname}</type>{"<dot/>" * dots}{f"<accidental>{acc}</accidental>" if acc else ""}<staff>{st}</staff></note>'
                total += dur
        x += '</measure>'; measures.append(x)
    xml = '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">' + ''.join(measures) + '</part></score-partwise>'
    (out / f'synth-{seed}-{i}.xml').write_text(xml)
for i in range(N): gen(i)
