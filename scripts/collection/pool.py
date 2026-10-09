import pandas as pd, re, json
from composers import C
d = pd.read_csv('/home/claude/pdmx/PDMX.csv', low_memory=False)
p = d[(d.license_conflict == False) & (d.tracks.astype(str).isin(['0', '0-0'])) & (d.n_notes.between(40, 15000))].copy()
for col in ['title','composer_name','artist_name','subtitle','song_name']:
    p[col] = p[col].fillna('').astype(str)
text = (p.composer_name + ' | ' + p.artist_name + ' | ' + p.title + ' | ' + p.subtitle).str.lower()
comp = []
pats = [(k, re.compile(rx)) for k, _, died, rx in C if died <= 1955]
for t in text:
    hit = None
    for k, rx in pats:
        if rx.search(t): hit = k; break
    comp.append(hit)
p['ckey'] = comp
p.to_pickle('pool.pkl')
print(len(p), p.ckey.notna().sum())
print(p.ckey.value_counts().head(60).to_string())
