import json, sys, collections, numpy as np
GLYPH = {'E050':'clefG','E07A':'clefG','E052':'clefG','E053':'clefG','E062':'clefF','E07C':'clefF','E05C':'clefC','E07B':'clefC',
 'E262':'sharp','E260':'flat','E261':'natural','E263':'dsharp','E264':'dflat',
 'E4E3':'restW','E4E4':'restH','E4E5':'rest4','E4E6':'rest8','E4E7':'rest16','E4E8':'rest32','E4E9':'rest32','E4EA':'rest32',
 'E08A':'tsC','E08B':'tsCut','E4A2':'dot','E4A3':'dot'}
for i in range(10): GLYPH['E08%X' % i] = 'ts%d' % i; GLYPH['E88%X' % i] = 'tup%d' % i
NOTE = {'notehead','stem','beam','flag','ledgerLines'}
def labels_for(page, labdir):
    L = json.load(open(f'{labdir}/{page}.json')); out = []
    for e in L:
        c = e['c'][0] if e['c'] else ''
        cls = None
        if c in NOTE or (c == 'chord' and e['k'] == 'use'): cls = 'note'
        elif e['k'] == 'use' and e['g'] in GLYPH: cls = GLYPH[e['g']]
        elif c == 'dots' or (e['k'] == 'ellipse'): cls = 'dot'
        elif c in ('slur', 'tie'): cls = 'curve'
        elif c == 'barLine': cls = 'bar'
        elif c in ('grpSym', 'brace'): cls = 'brace'
        elif c == 'staff': continue
        else: cls = 'other'
        out.append((cls, e['x0'], e['y0'], e['x1'], e['y1']))
    return out
def assign(box, labs):
    x0, y0, x1, y1 = box; A = max(1, (x1 - x0) * (y1 - y0)); best = ('other', 0)
    note = 0
    for cls, a0, b0, a1, b1 in labs:
        ix = max(0, min(x1, a1) - max(x0, a0)); iy = max(0, min(y1, b1) - max(y0, b0)); I = ix * iy
        if not I: continue
        B = max(1, (a1 - a0) * (b1 - b0))
        if cls == 'note' and I / B > 0.3: note += 1
        iou = I / (A + B - I)
        if iou > best[1]: best = (cls, iou)
    if note: return 'note'
    return best[0] if best[1] >= 0.35 else 'other'
if __name__ == '__main__':
    src, labdir, out = sys.argv[1:4]
    cache = {}; X = []; Y = []; cnt = collections.Counter()
    for line in open(src):
        r = json.loads(line)
        if r['page'] not in cache: cache[r['page']] = labels_for(r['page'], labdir)
        y = assign(r['box'], cache[r['page']]); X.append(r['f']); Y.append(y); cnt[y] += 1
    np.savez_compressed(out, X=np.array(X, np.float32), Y=np.array(Y))
    print(cnt.most_common())
