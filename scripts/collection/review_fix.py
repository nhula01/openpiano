import json, re, shutil, pathlib, unicodedata
W = json.load(open('works-build.json'))
EXCL = {'gaudete': r'rovetta', 'angels-we-have-heard-on-high': r'^gloria in excelsis deo$', 'cohan-over-there-1917': r'prior',
        'bach-little-prelude-in-d-minor-bwv-926': r'praeludium 2', 'bach-minuet-in-g-minor-bwv-anh-115': r'^menuet in g$',
        'bach-polonaise-in-g-minor-bwv-anh-119': r'bach - polonaise$', 'rameau-gavotte-and-doubles-in-a-minor': r'premier livre',
        'pierpont-jingle-bells': r'minor key', 'burgmuller-progress-op-100-no-6': r'arabesque', 'skye-boat-song': r'outlander',
        'parry-jerusalem-parry': r'golden', 'holden-all-hail-the-power-of-jesus-name': r'\(ward\)', 'sullivan-onward-christian-soldiers': r'wilson'}
DROP = {'beethoven-symphony-no-9-ode-to-joy-complete-theme'}
TITLE = {'bach-little-prelude-in-c-major-bwv-933': 'Little Prelude in D minor, BWV 935',
         'bach-italian-concerto-bwv-971-first-movement': 'Italian Concerto, BWV 971 · second movement',
         'telemann-fantasia-in-d-minor': 'Fantasia No. 8 (TWV 33)',
         'mozart-overture-to-the-marriage-of-figaro': 'Nun vergiss leises Flehn (The Marriage of Figaro)',
         'cottrau-santa-lucia': 'Santa Lucia (arr. Czerny)'}
def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\b(op|no|bwv|k|d|hob|woo|anh|s|b|l|hwv|twv)\.?\s*(?=\d)', lambda m: m.group(1) + '-', s)
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s)).strip('-')[:60].strip('-')
def base(c):
    if c in ('Traditional', 'Spiritual', 'Anonymous') or c.startswith(('Traditional', 'Spiritual')): return ''
    toks = c.split(' (')[0].replace(' and ', ' ').split()
    toks = [t for t in toks if t not in ('I', 'II', 'Jr.', 'Sr.')]
    return slug(toks[-1])
out = pathlib.Path('out'); redo = []; seen = set(); new = []
for w in W:
    old = w['id']
    if old in DROP or any(old.startswith(d) for d in DROP):
        shutil.rmtree(out / 'scores' / old, ignore_errors=True); (out / 'manifest' / f'{old}.json').unlink(missing_ok=True); continue
    if old in TITLE: w['title'] = TITLE[old]
    if old in EXCL:
        w['cands'] = [c for c in w['cands'] if not re.search(EXCL[old], c['pdmxTitle'].lower())]
    b = base(w['composer']); i = (b + '-' if b else '') + slug(w['title']); i = i[:64].strip('-'); j = i; n = 2
    while j in seen: j = f'{i}-{n}'; n += 1
    seen.add(j); w['id'] = j
    if old != j or old in EXCL or old in TITLE:
        shutil.rmtree(out / 'scores' / old, ignore_errors=True); (out / 'manifest' / f'{old}.json').unlink(missing_ok=True); (out / 'log' / f'{old}.txt').unlink(missing_ok=True)
        redo.append(j)
    new.append(w)
json.dump(new, open('works-build.json', 'w'), ensure_ascii=False, indent=0)
json.dump([w for w in new if w['id'] in redo], open('wb-redo.json', 'w'), ensure_ascii=False)
print(len(new), 'works;', len(redo), 'to rebuild:', redo)
