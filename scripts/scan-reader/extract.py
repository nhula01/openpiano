# Copy the library's two-staff piano sources into <work>/corpus/xml (training and evaluation pages).
#   python3 scripts/scan-reader/extract.py <repo>/site/scores <work>/corpus
import json, pathlib, re, sys, zipfile
scores, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); (out / 'xml').mkdir(parents=True, exist_ok=True)
keep = []
for d in sorted(p for p in scores.iterdir() if (p / 'original.mxl').exists()):
    z = zipfile.ZipFile(d / 'original.mxl')
    name = [n for n in z.namelist() if n.endswith('.xml') and not n.startswith('META')][0]
    x = z.read(name).decode('utf8', 'replace')
    st = re.search(r'<staves>(\d+)</staves>', x)
    if x.count('<score-part ') != 1 or not st or st.group(1) != '2': continue
    (out / 'xml' / f'{d.name}.xml').write_text(x); keep.append(d.name)
json.dump(keep, open(out / 'ids.json', 'w'))
print(len(keep), 'scores')
