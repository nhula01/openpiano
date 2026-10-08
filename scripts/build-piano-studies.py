"""Complete original eight-bar studies; no borrowed lesson content or fingering."""
import pathlib,json,subprocess,sys,re,shutil
root=pathlib.Path('/tmp/journey-studies');root.mkdir(exist_ok=True)
lily=sys.argv[1] if len(sys.argv)>1 else '/tmp/lilypond-2.24.4/bin/lilypond'
prefix=pathlib.Path('site/scores/ode/practice.ly').read_text().split('\\version')[0]
keys=[('c','C',60),('g','G',67),('d','D',62),('a','A',69),('e','E',64),('b','B',71),('fis','F♯',66),('des','D♭',61),('aes','A♭',68),('ees','E♭',63),('bes','B♭',70),('f','F',65)]
# Spell pitches in the selected key, including raised leading tones in minor.
names={'c':['c','d','e','f','g','a','b'], 'g':['g','a','b','c','d','e','fis'], 'd':['d','e','fis','g','a','b','cis'], 'a':['a','b','cis','d','e','fis','gis'], 'e':['e','fis','gis','a','b','cis','dis'], 'b':['b','cis','dis','e','fis','gis','ais'], 'fis':['fis','gis','ais','b','cis','dis','eis'], 'des':['des','ees','f','ges','aes','bes','c'], 'aes':['aes','bes','c','des','ees','f','g'], 'ees':['ees','f','g','aes','bes','c','d'], 'bes':['bes','c','d','ees','f','g','a'], 'f':['f','g','a','bes','c','d','e']}
minor={'c':['c','d','ees','f','g','aes','bes','b'], 'g':['g','a','bes','c','d','ees','f','fis'], 'd':['d','e','f','g','a','bes','c','cis'], 'a':['a','b','c','d','e','f','g','gis'], 'e':['e','fis','g','a','b','c','d','dis'], 'b':['b','cis','d','e','fis','g','a','ais'], 'fis':['fis','gis','a','b','cis','d','e','eis'], 'des':['des','ees','fes','ges','aes','beses','ces','c'], 'aes':['aes','bes','ces','des','ees','fes','ges','g'], 'ees':['ees','f','ges','aes','bes','ces','des','d'], 'bes':['bes','c','des','ees','f','ges','aes','a'], 'f':['f','g','aes','bes','c','des','ees','e']}
choices={};details={}
def absolute(text,key,mode,base):
 n=names[key] if mode=='major' else minor[key]
 offsets=[0,2,4,5,7,9,11] if mode=='major' else [0,2,3,5,7,8,10,11]
 def pitch(name,extra=0):
  midi=base+offsets[n.index(name)]+extra;octave=midi//12-4
  return name+("'"*octave if octave>=0 else ','*(-octave))
 def chord(match):
  previous=-1;out=[]
  for name in match[1].split():
   offset=offsets[n.index(name)];extra=0
   while offset+extra<previous:extra+=12
   previous=offset+extra;out.append(pitch(name,extra))
  return '<'+' '.join(out)+'>'
 # Temporarily protect explicit chord notes from the single-note replacement.
 chords=[]
 def protect(m):chords.append(chord(m));return '@'+str(len(chords)-1)+'@'
 text=re.sub(r'<([^>]+)>',protect,text)
 text=re.sub(r'(?<![A-Za-z\\])([a-g](?:is|es)*)(?=\d|\s|>|[{}|])',lambda m:pitch(m[1]),text)
 for i,c in enumerate(chords):text=text.replace('@'+str(i)+'@',c)
 return text

def create(id,title,key,mode,rh,lh,kind,level):
 d=root/id;d.mkdir(exist_ok=True);dest=pathlib.Path('site/scores')/id;dest.mkdir(exist_ok=True)
 pc=next(k[2]-60 for k in keys if k[0]==key);rh=absolute(rh,key,mode,60+pc);lh=absolute(lh,key,mode,48+pc)
 src=f'''\\version "2.24.4"
\\header {{ title = "{title}" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }}
\\score {{ \\new PianoStaff << \\new Staff = "upper" {{ \\clef treble \\key {key} \\{mode} \\time 4/4 {{ {rh} \\bar "|." }} }} \\new Staff = "lower" {{ \\clef bass \\key {key} \\{mode} \\time 4/4 {{ {lh} \\bar "|." }} }} >> \\layout {{}} \\midi {{ \\tempo 4=60 }} }}
'''
 (d/'original.ly').write_text(src);(dest/'original.ly').write_text(src);(d/'practice.ly').write_text(prefix+src)
 with (d/'compile.log').open('w') as log:
  subprocess.run([lily,'-o',str(d/'source-score'),str(d/'original.ly')],stdout=log,stderr=log,check=True)
  subprocess.run([lily,'-dno-point-and-click','-dbackend=svg','-o',str(d/'practice'),str(d/'practice.ly')],stdout=log,stderr=log,check=True)
 shutil.copy(d/'source-score.pdf',dest/'original.pdf')
 choices[id]=f'Learning/{id}/{id}.ly';details[id]={'kind':kind,'studyLevel':level,'studyKey':key,'studyMode':mode}
for key,label,midi in keys:
 for mode in ['major','minor']:
  n=names[key] if mode=='major' else minor[key];lead=n[6] if mode=='major' else n[7]
  tonic=f'<{n[0]} {n[2]} {n[4]}>';sub=f'<{n[3]} {n[5]} {n[0]}>';dom=f'<{n[4]} {lead} {n[1]} {n[3]}>'
  rh=f'{n[0]}4 {n[1]} {n[2]} {n[3]} | {n[4]} {n[3]} {n[2]} {n[1]} | {n[0]} {n[2]} {n[4]} {n[2]} | {n[3]} {n[5]} {n[0]} {n[5]} | {n[4]} {lead} {n[1]} {lead} | {n[0]} {n[2]} {n[4]} {n[2]} | {n[1]} {lead} {n[0]}2 | {n[0]}1'
  lh=f'{tonic}1 | {tonic} | {tonic} | {sub} | {dom} | {tonic} | {dom} | {tonic}'
  create(f'key-{key}-{mode}',f'{label.replace(chr(9839),"-sharp").replace(chr(9837),"-flat")} {mode} · scale fragments and cadence',key,mode,rh,lh,'technique',3)
# Independent eight-bar miniatures. Level labels describe reading tasks, not exams.
for level in range(1,8):
 for variant in range(2):
  key=['c','g','f','a','d','ees','b'][level-1];mode='minor' if level in [4,7] else 'major';n=(minor if mode=='minor' else names)[key]
  seq=[0,1,2,1,0,2,3,2] if not variant else [2,1,0,1,3,2,1,0]
  bars=[]
  for i in range(7):
   degrees=seq[i:]+seq[:i];p=[n[j] for j in degrees]
   if level==1:bar=f'{p[0]}2 {p[1]}2'
   elif level==2:bar=f'{p[0]}4 {p[1]} {p[2]} {p[3]}'
   elif level==3:bar=f'{p[0]}4 {p[1]}8 {p[2]} {p[3]}4 {p[4]}'
   elif level==4:bar=f'{p[0]}4. {p[1]}8 {p[2]}4 {p[3]}'
   elif level==5:bar=f'{p[0]}8 {p[1]} {p[2]} {p[3]} {p[4]} {p[5]} {p[6]} {p[7]}'
   elif level==6:bar=f'<{p[0]} {n[4]}>4 {p[1]}8 {p[2]} <{p[3]} {n[5]}>4 {p[4]}'
   else:bar=f'\\tuplet 3/2 {{ {p[0]}8 {p[1]} {p[2]} }} {p[3]}4 \\tuplet 3/2 {{ {p[4]}8 {p[5]} {p[6]} }} {p[7]}4'
   bars.append(bar)
  bars.append(f'{n[0]}1');lh=[]
  for i in range(8):
   base=n[0] if i in [0,1,2,5,7] else n[4]
   lh.append(f'{base}1' if level<=2 else f'{base}2 {n[2]}2' if level<=4 else f'{base}4 {n[2]} {n[4]} {n[2]}' )
  create(f'reading-{level}-{variant+1}',f'First-reading miniature {level}.{variant+1}',key,mode,' | '.join(bars),' | '.join(lh),'reading',level)
pathlib.Path('scripts/piano-study-sources.json').write_text(json.dumps(choices,indent=2)+'\n')
subprocess.run(['node','scripts/read-piano-library-midi.cjs',str(root),'scripts/piano-study-sources.json'],check=True)
subprocess.run(['python3','scripts/build-piano-library.py',str(root),'scripts/piano-study-sources.json','site/piano-studies.js'],check=True)
p=pathlib.Path('site/piano-studies.js');s=p.read_text();data=json.loads(s.split('Object.assign(window.PianoRepertoire,')[1].rsplit(');',1)[0])
for id,info in data.items():
 info.update(details[id]);info['caption']='Complete original eight-bar '+details[id]['kind']+' study · both hands';info['attribution']='My Journey · original learning study · CC0 1.0'
 folder=pathlib.Path('site')/info['folder'];j=folder/'practice.json';payload=json.loads(j.read_text());payload.update(info);j.write_text(json.dumps(payload,separators=(',',':')))
 import hashlib
 info['dataURL']=f"{info['folder']}/practice.json?v={hashlib.sha256(j.read_bytes()).hexdigest()[:12]}"
 (folder/'README.md').write_text(f"# {info['title']}\n\nComplete original eight-bar {info['kind']} study by My Journey. Released under CC0 1.0. Not an excerpt or an adaptation of a Piano Marvel lesson. Original PDF and source, both-hand MIDI and tagged practice engraving are included. No fingerings are generated.\n")
p.write_text('/* Original complete technique and first-reading studies, CC0. */\nObject.assign(window.PianoRepertoire,'+json.dumps(data,separators=(',',':'))+');\n')
