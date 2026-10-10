# Note-level accuracy of an OMR MusicXML against the source MusicXML (written measures, attacks only).
import re, sys, json, xml.etree.ElementTree as ET
from fractions import Fraction as F
STEP = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def measures(xml, limit=None):
    root = ET.fromstring(re.sub(r'<!DOCTYPE[^>]*>', '', xml).encode())
    part = root.find('part'); out = []; div = 1
    for m in part.findall('measure'):
        pos = F(0); last = F(0); notes = set()
        for e in m:
            if e.tag == 'attributes' and e.find('divisions') is not None: div = int(e.find('divisions').text)
            elif e.tag == 'backup': pos -= F(int(e.find('duration').text), div)
            elif e.tag == 'forward': pos += F(int(e.find('duration').text), div)
            elif e.tag == 'note':
                dur = F(int(e.find('duration').text), div) if e.find('duration') is not None else F(0)
                if e.find('chord') is not None: onset = last
                else: onset = pos; last = pos; pos += dur
                if e.find('grace') is not None or e.find('rest') is not None or e.find('pitch') is None: continue
                ties = [t.get('type') for t in e.findall('tie')]
                if 'stop' in ties: continue
                p = e.find('pitch'); midi = 12 * (int(p.find('octave').text) + 1) + STEP[p.find('step').text] + round(float(p.find('alter').text) if p.find('alter') is not None else 0)
                st = e.find('staff'); notes.add((onset, midi, int(st.text) if st is not None else 1))
        out.append(notes)
        if limit and len(out) >= limit: break
    return out
def f1(a, b, key):
    A = {key(n) for n in a}; B = {key(n) for n in b}
    return len(A & B), len(A), len(B)
def align(T, P, key):
    n, m = len(T), len(P); INF = 1e9
    D = [[INF] * (m + 1) for _ in range(n + 1)]; D[0][0] = 0; bk = {}
    for i in range(n + 1):
        for j in range(m + 1):
            if i < n and D[i][j] + len(T[i]) < D[i + 1][j]: D[i + 1][j] = D[i][j] + len(T[i]); bk[i + 1, j] = (i, j, None)
            if j < m and D[i][j] + len(P[j]) < D[i][j + 1]: D[i][j + 1] = D[i][j] + len(P[j]); bk[i, j + 1] = (i, j, None)
            if i < n and j < m:
                h, a, b = f1(T[i], P[j], key); c = a + b - 2 * h
                if D[i][j] + c < D[i + 1][j + 1]: D[i + 1][j + 1] = D[i][j] + c; bk[i + 1, j + 1] = (i, j, 1)
    i, j, hit = n, m, 0; pairs = []
    while (i, j) != (0, 0):
        pi, pj, t = bk[i, j]
        if t: pairs.append((pi, pj))
        i, j = pi, pj
    return pairs
def score(truth_xml, pred_xml, nmeas):
    T = measures(truth_xml, nmeas); P = measures(pred_xml)
    res = {}
    for name, key in [('pitch+onset', lambda n: (n[0], n[1])), ('pitch+onset+staff', lambda n: n), ('pitch', lambda n: n[1])]:
        pairs = align(T, P, key); hit = sum(f1(T[i], P[j], key)[0] for i, j in pairs)
        nt = sum(len({key(n) for n in t}) for t in T); npd = sum(len({key(n) for n in p}) for p in P)
        res[name] = {'recall': hit / max(1, nt), 'precision': hit / max(1, npd)}
    perfect = sum(1 for i, j in align(T, P, lambda n: n) if T[i] == P[j])
    res['measures'] = {'truth': len(T), 'pred': len(P), 'exact': perfect}
    return res
if __name__ == '__main__':
    print(json.dumps(score(open(sys.argv[1]).read(), open(sys.argv[2]).read(), int(sys.argv[3]) if len(sys.argv) > 3 else None), indent=1))
