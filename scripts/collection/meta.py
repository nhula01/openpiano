import json, tarfile
works = json.load(open('works.json'))
want = {c['metadata'].lstrip('./') for w in works for c in w['cands']}
got = {}
with tarfile.open('/home/claude/pdmx/raw/metadata.tar.gz', 'r|gz') as t:
    for m in t:
        if m.name in want:
            d = json.load(t.extractfile(m))['data']['score']
            got[m.name] = {'url': d.get('url') or d['share']['publicUrl'], 'transcriber': d['user']['name'], 'pd': d.get('is_public_domain'),
                           'license': d.get('license'), 'title': d.get('title')}
json.dump(got, open('meta.json', 'w'), ensure_ascii=False)
print(len(want), len(got))
