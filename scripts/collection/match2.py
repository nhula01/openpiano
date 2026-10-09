import pandas as pd, re, json, unicodedata, math, warnings
warnings.filterwarnings('ignore')
from composers import C
from catalog import W
from fixes import FIX, GLOBAL_FORBID
p = pd.read_pickle('pool.pkl')
def norm(s): return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
p['t'] = (p.title + ' | ' + p.song_name + ' | ' + p.subtitle).map(norm)
p['who'] = (p.composer_name + ' | ' + p.artist_name).map(norm)
p['all'] = p.who + ' | ' + p.t
p = p[~p['all'].str.contains(re.compile(r'$^'))]
CRX = {k: re.compile(norm(rx)) for k, _, died, rx in C}
DENY = re.compile(r'kyle landry|george winston|lang lang|piano guys|animenz|theishter|rousseau|maxence|jacob.?s piano|hal leonard|\balfred\b|faber|synthesia|\btrap\b|remix|\bmeme\b|undertale|toby fox|duet|four hands|4 hands|\b4h\b|violin|cello|flute|orchestra|quartet|\bvocal|choir|satb|guitar|ukulele|clarinet|trumpet|saxophone|\bsax\b|horn\b|for (2|two) pianos|trans.?siberian|mannheim|pentatonix|mariah|bubl[eé]|disney|frozen|zimmer|einaudi|yiruma|hisaishi|ghibli|anime|minecraft|pokemon|zelda|mario|sonic|fnaf|roblox|genshin|lofi|lo-fi|jazz version|boogie|swing version|metal|rock version|fortnite|tiktok|kpop|k-pop|bts|blackpink|taylor swift|ed sheeran|adele|coldplay|imagine dragons|billie eilish|elvis|beatles|queen\b|abba|celine|whitney|josh groban|andrea bocelli arrangement|sarah brightman|lindsey stirling|2cellos|vitamin string|piano tiles|my own arrangement in the style|in the style of|mashup|medley of (pop|songs)|ost\b|soundtrack|movie|film|series|game|cover by|lyrics by .*(19[3-9]\d|20\d\d)|\(19[4-9]\d\)|\(20\d\d\)|wilhousky|crosby|rudolph|frosty|santa claus is|white christmas|let it snow|last christmas|all i want|feliz navidad|little drummer|silver bells|winter wonderland|holly jolly|rockin|jingle bell rock|it.s the most|carol of the bells.*(rock|epic|metal|dubstep)')
p = p[~p['all'].str.contains(DENY) & ~p['all'].str.contains(re.compile(GLOBAL_FORBID)) & (p['song_length.bars'] >= 8)]
print('pool after deny', len(p), flush=True)
SUB = {k: p[p['all'].str.contains(rx)] for k, rx in CRX.items()}
EXISTING = set()
rows, miss = [], []
used = set()
for wid, title, comp, rx, shelf in W:
    f = FIX.get(wid, {})
    if rx == '$^' or f.get('skip'): continue
    R = re.compile(norm(rx))
    if comp in CRX:
        m = SUB[comp]; m = m[m.t.str.contains(R)]
    else:
        m = p[p.t.str.contains(R)]
        # traditional: the person named as composer must not be one of the PD composers' famous
        # names (that would be a different piece) — keep anything else for manual review.
        pass
    if f.get('must'): m = m[m['all'].str.contains(re.compile(f['must']))]
    if f.get('forbid'): m = m[~m['all'].str.contains(re.compile(f['forbid']))]
    m = m[~m.path.isin(used)]
    if not len(m): miss.append(wid); continue
    score = (m.n_views + 1).map(math.log10) + m.rating * m.n_ratings.clip(upper=20) / 20 + m.n_favorites.clip(lower=0).map(lambda x: math.log10(x + 1)) - (m.tracks.astype(str) == '0-0') * 1.0
    m = m.assign(score=score).sort_values('score', ascending=False)
    cands = []
    for r in m.iloc[:8].itertuples():
        cands.append(dict(title=r.title, who=r.who, views=int(r.n_views), rating=float(r.rating), bars=int(r._asdict().get('_38', 0) or 0), notes=int(r.n_notes),
                          license=r.license, path=r.path, mxl=r.mxl, metadata=r.metadata, twopart=str(r.tracks) == '0-0', complexity=float(r.complexity)))
    used.add(m.iloc[0].path)
    rows.append(dict(id=wid, want=f.get('title', title), composer=f.get('composer'), comp=comp, shelf=shelf, n=len(m), cands=cands))
json.dump(rows, open('matches2.json', 'w'), indent=0)
print(len(rows), 'matched;', len(miss), 'missing')
print('missing:', ' '.join(miss))
