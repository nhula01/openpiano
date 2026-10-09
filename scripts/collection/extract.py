import json, tarfile, os
works = json.load(open('works.json')); meta = json.load(open('meta.json'))
want = {c['mxl'].lstrip('./') for w in works for c in w['cands']}
os.makedirs('mxl', exist_ok=True); got = 0
with tarfile.open('/home/claude/pdmx/raw/mxl.tar.gz', 'r|gz') as t:
    for m in t:
        if m.name in want:
            open('mxl/' + os.path.basename(m.name), 'wb').write(t.extractfile(m).read()); got += 1
print('extracted', got, 'of', len(want))
build = []
for w in works:
    cands = []
    for c in w['cands']:
        f = 'mxl/' + os.path.basename(c['mxl']); md = meta.get(c['metadata'].lstrip('./'))
        if not os.path.exists(f) or not md: continue
        if c['license'] not in ('cc-zero', 'publicdomain') or md.get('license') not in (None, 'cc-zero', 'publicdomain', 'cc0'): continue
        cands.append({'mxl': os.path.abspath(f), 'url': md['url'], 'transcriber': md['transcriber'], 'license': c['license'], 'pdmxTitle': c['pdmxTitle']})
    build.append({'id': w['id'], 'key': w['key'], 'title': w['title'], 'composer': w['composer'], 'shelf': w['shelf'], 'cands': cands})
json.dump(build, open('works-build.json', 'w'), ensure_ascii=False, indent=0)
print('works', len(build), 'with candidates', sum(bool(b['cands']) for b in build))
