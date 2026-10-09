import json, re, unicodedata, pandas as pd
from composers import C
from picks import P
from who import WHO, DEFAULT, SPIRITUAL
NAME = {k: n for k, n, _, _ in C}
m2 = json.load(open('matches2.json'))
pool = pd.read_pickle('pool.pkl')
def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\b(op|no|bwv|k|d|hob|woo|anh|s|b|l|hwv)\.?\s*(?=\d)', lambda m: m.group(1) + '-', s)
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s)).strip('-')[:60].strip('-')
works, seen_ids = [], set()
def credit(wid, comp):
    if comp in NAME: return NAME[comp]
    if wid in WHO: return WHO[wid]
    if wid in SPIRITUAL: return 'Spiritual'
    return DEFAULT.get(comp, 'Traditional')
def cand(r):
    return {'path': r['path'], 'mxl': r['mxl'], 'metadata': r['metadata'], 'license': r['license'], 'pdmxTitle': r['title'], 'twopart': r.get('twopart', False)}
for w in m2:
    comp = credit(w['id'], w['comp'])
    if w.get('composer'): comp = w['composer']
    works.append({'key': w['id'], 'title': w['want'], 'composer': comp, 'shelf': w['shelf'], 'cands': [cand(c) for c in w['cands']]})
used = {c['path'] for w in works for c in w['cands'][:1]}
miss = []
for title, ck, disp, shelf, who in P:
    m = pool[pool.title.str.strip().str.startswith(title.strip())].sort_values('n_views', ascending=False)
    m = m[~m.path.isin(used)]
    if not len(m): miss.append(title); continue
    r = m.iloc[0]
    works.append({'key': 'pick-' + slug(disp), 'title': disp, 'composer': who or NAME.get(ck, 'Traditional'), 'shelf': shelf,
                  'cands': [{'path': r.path, 'mxl': r.mxl, 'metadata': r.metadata, 'license': r.license, 'pdmxTitle': r.title, 'twopart': str(r.tracks) == '0-0'}]})
    used.add(r.path)
for w in works:
    base = slug(w['composer'].split(' (')[0].split()[-1] if w['composer'] not in ('Traditional', 'Spiritual') and not w['composer'].startswith('Traditional') else '') 
    i = slug(w['title']) if not base else base + '-' + slug(w['title'])
    i = i[:64].strip('-'); j = i; n = 2
    while j in seen_ids: j = f'{i}-{n}'; n += 1
    seen_ids.add(j); w['id'] = j
json.dump(works, open('works.json', 'w'), indent=0, ensure_ascii=False)
print(len(works), 'works;', len(miss), 'picks not found:', miss)
