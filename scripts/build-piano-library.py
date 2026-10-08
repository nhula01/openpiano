import pathlib,json,re,xml.etree.ElementTree as ET,copy,subprocess,shutil,sys,hashlib
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/journey-library');choices=json.loads(pathlib.Path(sys.argv[2] if len(sys.argv)>2 else 'scripts/piano-library-sources.json').read_text());ns='{http://www.w3.org/2000/svg}';ET.register_namespace('',ns[1:-1]);ET.register_namespace('xlink','http://www.w3.org/1999/xlink')
titles={'minuet':('Minuet in G major, BWV Anh. 114','Christian Petzold'),'melody':('Melody, Op. 68 No. 1','Robert Schumann'),'wild-rider':('The Wild Rider, Op. 68 No. 8','Robert Schumann'),'happy-farmer':('The Happy Farmer, Op. 68 No. 10','Robert Schumann'),'innocence':('Innocence, Op. 100 No. 1','Friedrich Burgmüller'),'arabesque':('Arabesque, Op. 100 No. 2','Friedrich Burgmüller'),'ballade':('Ballade, Op. 100 No. 15','Friedrich Burgmüller'),'clementi':('Sonatina in C, Op. 36 No. 1 · all three movements','Muzio Clementi'),'prelude':('Prelude in C major, BWV 846','Johann Sebastian Bach'),'fur':('Für Elise · complete','Ludwig van Beethoven'),'gymnopedie':('Gymnopédie No. 1','Erik Satie'),'chopin-prelude':('Prelude in E minor, Op. 28 No. 4','Frédéric Chopin'),'invention1':('Invention No. 1 in C, BWV 772','Johann Sebastian Bach'),'mozart545':('Sonata in C, K. 545 · first movement','Wolfgang Amadeus Mozart'),'clair':('Clair de lune','Claude Debussy'),'nocturne':('Nocturne in E-flat, Op. 9 No. 2','Frédéric Chopin'),'traumerei':('Träumerei, Op. 15 No. 7','Robert Schumann'),'pathetique':('Pathétique Sonata · second movement','Ludwig van Beethoven'),'revolutionary':('Revolutionary Étude, Op. 10 No. 12','Frédéric Chopin'),'czerny':('Eight-measure study, Op. 821 No. 1','Carl Czerny'),'fugue':('Fugue in C major, BWV 846','Johann Sebastian Bach'),'etude9':('Étude in F minor, Op. 10 No. 9','Frédéric Chopin')}
titles.update({'ode':('Ode to Joy · theme arrangement','Ludwig van Beethoven'),'twinkle':('Twinkle, Twinkle · learning arrangement','Traditional'),'frere':('Frère Jacques · learning arrangement','Traditional')})
titles.update({"pastoral":("La Pastorale, Op. 100 No. 3","Friedrich Burgmüller"),"reunion":("La Petite Réunion, Op. 100 No. 4","Friedrich Burgmüller")})
titles.update({"fantaisie-impromptu":("Fantaisie-Impromptu, Op. 66","Frédéric Chopin"),"minute-waltz":("Minute Waltz, Op. 64 No. 1","Frédéric Chopin"),"raindrop":("Raindrop Prelude, Op. 28 No. 15","Frédéric Chopin"),"ballade1":("Ballade No. 1 in G minor, Op. 23","Frédéric Chopin"),"moonlight":("Moonlight Sonata · first movement","Ludwig van Beethoven"),"alla-turca":("Rondo alla Turca, K. 331 · third movement","Wolfgang Amadeus Mozart"),"rach-prelude":("Prelude in C♯ minor, Op. 3 No. 2","Sergei Rachmaninoff"),"arabesque1":("Arabesque No. 1","Claude Debussy"),"maple-leaf":("Maple Leaf Rag","Scott Joplin"),"mountain-king":("In the Hall of the Mountain King · piano version","Edvard Grieg"),"gnossienne1":("Gnossienne No. 1","Erik Satie"),"impromptu-gflat":("Impromptu in G-flat, D. 899 No. 3","Franz Schubert"),"consolation3":("Consolation No. 3, S. 172","Franz Liszt"),"brahms-waltz":("Waltz in A-flat, Op. 39 No. 15","Johannes Brahms")})
manifest={}
for id,path in choices.items():
 d=root/id;dest=pathlib.Path('site/scores')/id;
 if (d/'compile.log').exists():assert 'error:' not in (d/'compile.log').read_text().lower(),f'{id}: compilation failed; refusing a partial score'
 src=(d/'original.ly').read_text() if (d/'original.ly').exists() else (d/pathlib.Path(path).name).read_text();meta=lambda name:(re.search(r'\b'+name+r'\s*=\s*"([^"]+)"',src) or [None,''])[1]
 time=re.search(r'\\time\s+(\d+)/(\d+)',src);meter=int(time[1])*4/int(time[2]) if time else 4
 midi=json.loads((d/'midi-notes.json').read_text());lengths=[max(m.get('endBeat',0),max(n['beat']+n['duration'] for n in m['notes'])) for m in midi];offsets=[0]
 for n in lengths[:-1]:offsets.append(offsets[-1]+n)
 notes=[]
 for j,m in enumerate(midi):
  tracks=sorted(set(n['track'] for n in m['notes']));assert len(tracks)>=2,(id,tracks)
  # Scores with more MIDI tracks (extra staves or per-voice tracks) take every hand from the tagged engraving below.
  for n in m['notes']:notes.append({'midi':n['midi'],'beat':n['beat']+offsets[j],'duration':n['duration'],'hand':('right' if n['track']==tracks[0] else 'left') if len(tracks)==2 else None})
 notes.sort(key=lambda n:(n['beat'],n['midi']));pages=[];systems=[];movement=0;previousStart=-1
 files=sorted(d.glob('practice*.svg'),key=lambda p:int(re.search(r'-(\d+)\.svg$',p.name)[1]) if re.search(r'-(\d+)\.svg$',p.name) else 0)
 for file in files:
  tree=ET.fromstring(file.read_text());width=float(tree.get('viewBox').split()[2]);heads=[];lines=[];edges={}
  for g in tree:
   if g.get('class')=='score-note' and g.find(ns+'g') is not None:
    t=g.find(ns+'g').get('transform','');v=re.findall(r'[-\d.]+',t)
    if len(v)>=2:heads.append((g,{'beat':float(g.get('data-beat')),'midi':int(g.get('data-midi')),'x':float(v[0]),'y':float(v[1]),'hand':g.get('data-hand'),'grace':any('scale(0.0028' in e.get('transform','') for e in g.iter())}))
   else:
    line=g.find(ns+'line');trans=g.get('transform','')
    if line is not None and abs(float(line.get('x2','0'))-float(line.get('x1','0')))>20 and 'translate' in trans:
     x,y=map(float,re.findall(r'[-\d.]+',trans));lines.append(y);edges[y]=(x+float(line.get('x1','0')),x+float(line.get('x2','0')))
  if not heads:continue
  staffs=[]
  for y in sorted(set(lines)):
   if not staffs or y-staffs[-1][-1]>1.1:staffs.append([y])
   else:staffs[-1].append(y)
  if len(staffs)%2: 
   last=staffs[-1][0];staffs.append([last+18+j for j in range(5)]);edges[last+18]=edges[last]
  centers=[(staffs[i][0]+staffs[i+1][-1])/2 for i in range(0,len(staffs),2)];buckets=[[] for _ in centers]
  for g,n in heads:buckets[min(range(len(centers)),key=lambda i:abs(n['y']-centers[i]))].append((g,n))
  page=len(pages)
  for i,bucket in enumerate(buckets):
   if not bucket:continue
   start=min(n['beat'] for g,n in bucket)
   if start<previousStart-.5 and len(midi)>1:movement+=1
   assert movement<len(midi),(id,movement)
   previousStart=start;shift=offsets[movement]
   # MIDI pickup timing starts at zero; LilyPond uses a negative first moment.
   if movement==0:
    firstMidi=min(n['beat'] for n in midi[0]['notes']);firstHead=min(n['beat'] for g,n in heads) if not systems else 0
    if not systems and firstHead<0:pickupShift=firstMidi-firstHead
    elif not systems:pickupShift=0
   shift+=pickupShift
   used=set()
   for g,n in sorted(bucket,key=lambda pair:(pair[1]['beat'],pair[1]['x'],pair[1]['midi'])):
    raw=n['beat']+shift
    candidates=[(j,attack) for j,attack in enumerate(notes) if attack['midi']==n['midi'] and abs(attack['beat']-raw)<(.5 if n['grace'] else .03) and (not n['grace'] or (j not in used and attack['beat']<=raw))]
    if candidates:
     j,attack=min(candidates,key=lambda pair:pair[1]['beat'] if n['grace'] else abs(pair[1]['beat']-raw));n['beat']=attack['beat'];used.add(j)
    else:n['beat']=raw
    g.set('data-beat',str(n['beat']))
   y0=(centers[i-1]+centers[i])/2 if i else centers[i]-19;y1=(centers[i]+centers[i+1])/2 if i+1<len(centers) else centers[i]+19
   left=min(edges[staffs[i*2][0]][0],edges[staffs[i*2+1][0]][0]);right=max(edges[staffs[i*2][0]][1],edges[staffs[i*2+1][0]][1]);positions={}
   for g,n in bucket:positions[n['beat']]=min(positions.get(n['beat'],999),n['x']-left)
   cropped=copy.deepcopy(tree)
   for child in list(cropped):
    transforms=[e.get('transform','') for e in child.iter() if 'translate' in e.get('transform','')]
    if transforms:
     coords=re.findall(r'[-\d.]+',transforms[0]);cy=float(coords[1])
     if not y0-1<=cy<=y1+1:cropped.remove(child)
   cropped.set('viewBox',f'{left} {y0} {right-left} {y1-y0}')
   systems.append({'svg':ET.tostring(cropped,encoding='unicode'),'page':page,'y':y0,'height':y1-y0,'staffTop':staffs[i*2][0]-y0,'staffGap':staffs[i*2+1][-1]-staffs[i*2][0],'start':min(positions),'positions':sorted([[b,x] for b,x in positions.items()]),'width':right-left})
  pn=[n for g,n in heads];pages.append({'svg':ET.tostring(tree,encoding='unicode'),'start':min(n['beat'] for n in pn),'end':max(n['beat'] for n in pn),'notes':pn})
 end=offsets[-1]+lengths[-1]
 for i,s in enumerate(systems):s['end']=systems[i+1]['start'] if i+1<len(systems) else end
 hands={}
 for p in pages:
  for head in p['notes']:
   if head.get('hand'):hands.setdefault((round(head['beat'],5),head['midi']),[]).append(head['hand'])
 for note in notes:
  candidates=hands.get((round(note['beat'],5),note['midi']),[])
  if len(set(candidates))==1:note['hand']=candidates[0]
  elif note['hand'] is None and candidates:note['hand']=candidates.pop(0)  # unison in both hands: one note per engraved head
 assert all(n['hand'] for n in notes),f'{id}: a note has no hand assignment'
 title,composer=titles.get(id,(meta("title"),meta("composer")));copyright=meta('license') or meta('mutopiacopyright') or meta('copyright');number=re.search(r'Mutopia-\d{4}/\d{2}/\d{2}-(\d+)',src);url='https://www.mutopiaproject.org/cgibin/piece-info.cgi?id='+number[1] if number else 'https://www.mutopiaproject.org/ftp/'+str(pathlib.Path(path).parent)+'/'
 if path.startswith('Learning/'):url=f'scores/{id}/original.ly'
 fingers=sum(p['svg'].count('source-fingering') for p in pages)
 original=dest/'original';original.mkdir(exist_ok=True);subprocess.run(['pdftoppm','-scale-to','1400','-jpeg',str(dest/'original.pdf'),str(original/'page')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 # Normalize Poppler's padded multi-digit page names.
 for f in original.glob('page-*.jpg'):target=original/f'page-{int(f.stem.split("-")[-1])}.jpg';f.rename(target) if f!=target else None
 count=len(list(original.glob('*.jpg')))
 sections=[]
 for start in range(0,int(end),int(meter*8)):
  if any(start<=n['beat']<start+meter*8 for n in notes):sections.append({'id':f'block-{start}','title':f'Practice block {len(sections)+1}','start':start,'end':min(end,start+meter*8)})
 if len(midi)>1:sections=[{'id':f'movement-{j+1}','title':f'Movement {j+1}','start':offsets[j],'end':offsets[j]+lengths[j]} for j in range(len(midi))]+sections
 info={'id':id,'title':title,'composer':composer,'caption':'Complete practice score'+(' · three movements' if len(midi)>1 else '')+' · repeats unfolded','sourceURL':url,'pdf':f'scores/{id}/original.pdf','midi':f'scores/{id}/practice.midi','originalPages':count,'folder':f'scores/{id}','sourceFingering':fingers>0,'attribution':composer+' · Mutopia · '+meta('maintainer')+' · '+copyright,'beatsPerMeasure':meter}
 if path.startswith('Learning/'):info['caption']='Complete learning arrangement of the public-domain melody · simple two-hand accompaniment';info['attribution']=composer+' · My Journey learning arrangement · CC0 1.0'
 head_keys={(round(n['beat'],5),n['midi']) for page in pages for n in page['notes']}
 assert all((round(n['beat'],5),n['midi']) in head_keys for n in notes),f'{id}: an attack is missing from the engraving'
 scroll_keys=set()
 for system in systems:
  for head in ET.fromstring(system['svg']).iter(ns+'g'):
   if head.get('class')=='score-note' and head.find(ns+'g') is not None:scroll_keys.add((round(float(head.get('data-beat')),5),int(head.get('data-midi'))))
 assert all((round(n['beat'],5),n['midi']) in scroll_keys for n in notes),f'{id}: moving notation cuts a notehead'
 assert pages and systems and end>=max(n['beat']+n['duration'] for n in notes),f'{id}: incomplete score timeline'
 payload={**info,'notes':notes,'totalBeats':end,'movements':[{'title':f'Movement {j+1}','start':offsets[j],'end':offsets[j]+lengths[j]} for j in range(len(midi))],'sections':sections,'engraving':{'pages':pages,'systems':systems,'source':url,'version':2}}
 (dest/'practice.json').write_text(json.dumps(payload,separators=(',',':')));shutil.copy(d/'practice.ly',dest/'practice.ly')
 if len(midi)==1:shutil.copy(d/'practice.midi',dest/'practice.midi')
 if len(midi)>1:
  # Every movement remains separately downloadable; the player uses the combined data.
  for j,m in enumerate(midi):shutil.copy(d/m['file'],dest/f'movement-{j+1}.midi')
  subprocess.run(['node','scripts/combine-piano-midi.cjs'],check=True)
 (dest/'README.md').write_text(f'# {title}\n\nComposer: {composer}\nTypesetting: {meta("maintainer")}\nLicense: {copyright}\nSource: {url}\n\nOriginal PDF and LilyPond source are bundled unchanged. The practice source is\nconverted to LilyPond 2.24, with repeats unfolded and tagged noteheads added.\nPrinted fingerings are retained directly from that edition; no generated\nfingerings are added. The player derives attacks and durations from the\ncompiled MIDI and assigns hands from the two MIDI staff tracks.\n\nThis engraving and practice data inherit the source license.\n')
 version=hashlib.sha256((dest/'practice.json').read_bytes()).hexdigest()[:12]
 manifest[id]={**info,'dataURL':f'scores/{id}/practice.json?v={version}','multiMovement':len(midi)>1}
 print(id,len(notes),len(pages),'pages',fingers,'fingerings',flush=True)
pathlib.Path(sys.argv[3] if len(sys.argv)>3 else 'site/piano-library.js').write_text('/* Complete scores, fetched locally only when selected. */\nObject.assign(window.PianoRepertoire,'+json.dumps(manifest,separators=(',',':'))+');\n')
