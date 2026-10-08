"""Package tagged LilyPond SVG pages and continuous grand-staff systems.
Run portable LilyPond on practice.ly from the score source and engraver below,
then pass its output directory as this script's first argument.
"""
from pathlib import Path
import xml.etree.ElementTree as ET
import json,re,sys,copy
ET.register_namespace("", "http://www.w3.org/2000/svg")
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
src=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/journey-sheets')
ns='{http://www.w3.org/2000/svg}'
pages=[];systems=[]
for file in sorted(src.glob('practice-*.svg'),key=lambda p:int(p.stem.split('-')[-1])):
 svg=file.read_text();root=ET.fromstring(svg);page=len(pages);notes=[];lines=[];edges={}
 for g in root:
  if g.get('class')=='score-note' and g.find(ns+'g') is not None:
   t=g.find(ns+'g').get('transform');x,y=map(float,re.findall(r'[-\d.]+',t));notes.append({'beat':float(g.get('data-beat')),'midi':int(g.get('data-midi')),'x':x,'y':y})
  else:
   line=g.find(ns+'line');trans=g.get('transform','')
   if line is not None and abs(float(line.get('x2','0'))-float(line.get('x1','0')))>70 and 'translate' in trans:
    x,y=map(float,re.findall(r'[-\d.]+',trans));lines.append(y);edges[y]=(x+float(line.get('x1','0')),x+float(line.get('x2','0')))
 lines=sorted(set(lines));staffs=[]
 for y in lines:
  if not staffs or y-staffs[-1][-1]>1.1:staffs.append([y])
  else:staffs[-1].append(y)
 assert len(staffs)%2==0
 centers=[(staffs[i][0]+staffs[i+1][-1])/2 for i in range(0,len(staffs),2)]
 buckets=[[] for _ in centers]
 for n in notes:buckets[min(range(len(centers)),key=lambda i:abs(n['y']-centers[i]))].append(n)
 pages.append({'svg':svg,'start':min(n['beat'] for n in notes),'end':max(n['beat'] for n in notes),'notes':notes})
 for i,bucket in enumerate(buckets):
  # Clip at the white gap between systems, retaining dynamics and ledger lines.
  y0=(centers[i-1]+centers[i])/2 if i else centers[i]-17
  y1=(centers[i]+centers[i+1])/2 if i+1<len(centers) else centers[i]+17
  positions={}
  for n in bucket:positions[n['beat']]=min(positions.get(n['beat'],999),n['x'])
  cropped=copy.deepcopy(root)
  for child in list(cropped):
   transforms=[e.get('transform','') for e in child.iter() if 'translate' in e.get('transform','')]
   if transforms:
    coords=re.findall(r'[-\d.]+',transforms[0]);cy=float(coords[1])
    if not y0-1<=cy<=y1+1:cropped.remove(child)
  left,right=edges[staffs[i*2][0]]
  cropped.set('viewBox',f'{left} {y0} {right-left} {y1-y0}')
  systems.append({'svg':ET.tostring(cropped,encoding='unicode'),'page':page,'y':y0,'height':y1-y0,'staffTop':staffs[i*2][0]-y0,'start':int(min(positions)//2)*2,'positions':sorted([[b,x-left] for b,x in positions.items()]),'width':right-left})
for i,s in enumerate(systems):s['end']=systems[i+1]['start'] if i+1<len(systems) else 304
assert systems[0]['start']==0 and all(s['start']<s['end'] for s in systems)
out={'pages':pages,'systems':systems,'source':'Mutopia original 1902 edition; repeats unfolded for practice','version':1}
Path('site/piano-engraving.js').write_text('/* Tagged engraving of the bundled public-domain score. */\nwindow.PianoEngraving='+json.dumps(out,separators=(',',':'))+';\n')
print(json.dumps({'pages':len(pages),'systems':len(systems),'noteheads':sum(len(p['notes']) for p in pages)}))
