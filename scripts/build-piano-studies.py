"""Complete original studies: Level 0 "First keys" pieces, key studies and first-reading
miniatures. No borrowed lesson content and no fingering. Everything is reproducible:
the reading generator uses its own seeded generator, so every build writes the same music.

  python3 scripts/build-piano-studies.py [LILYPOND]            build all studies
  python3 scripts/build-piano-studies.py --sources-only DIR     only write DIR/<id>.ly
"""
import pathlib,json,subprocess,sys,re,shutil,hashlib,os,zlib
from fractions import Fraction as Fr
from concurrent.futures import ThreadPoolExecutor
args=sys.argv[1:];sources_only=None
if args[:1]==['--sources-only']:sources_only=pathlib.Path(args[1]);args=args[2:]
lily=args[0] if args else '/tmp/lilypond-2.24.4/bin/lilypond'
root=pathlib.Path(os.environ.get('JOURNEY_STUDIES_DIR','/tmp/journey-studies'))
keys=[('c','C',60),('g','G',67),('d','D',62),('a','A',69),('e','E',64),('b','B',71),('fis','F♯',66),('des','D♭',61),('aes','A♭',68),('ees','E♭',63),('bes','B♭',70),('f','F',65)]
# Spell pitches in the selected key, including raised leading tones in minor.
names={'c':['c','d','e','f','g','a','b'], 'g':['g','a','b','c','d','e','fis'], 'd':['d','e','fis','g','a','b','cis'], 'a':['a','b','cis','d','e','fis','gis'], 'e':['e','fis','gis','a','b','cis','dis'], 'b':['b','cis','dis','e','fis','gis','ais'], 'fis':['fis','gis','ais','b','cis','dis','eis'], 'des':['des','ees','f','ges','aes','bes','c'], 'aes':['aes','bes','c','des','ees','f','g'], 'ees':['ees','f','g','aes','bes','c','d'], 'bes':['bes','c','d','ees','f','g','a'], 'f':['f','g','a','bes','c','d','e']}
minor={'c':['c','d','ees','f','g','aes','bes','b'], 'g':['g','a','bes','c','d','ees','f','fis'], 'd':['d','e','f','g','a','bes','c','cis'], 'a':['a','b','c','d','e','f','g','gis'], 'e':['e','fis','g','a','b','c','d','dis'], 'b':['b','cis','d','e','fis','g','a','ais'], 'fis':['fis','gis','a','b','cis','d','e','eis'], 'des':['des','ees','fes','ges','aes','beses','ces','c'], 'aes':['aes','bes','ces','des','ees','fes','ges','g'], 'ees':['ees','f','ges','aes','bes','ces','des','d'], 'bes':['bes','c','des','ees','f','ges','aes','a'], 'f':['f','g','aes','bes','c','des','ees','e']}
minor['cis']=['cis','dis','e','fis','gis','a','b','bis']  # reading pieces spell C-sharp minor; the key study keeps D-flat minor
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

pieces=[]  # (id, LilyPond source, manifest details) in build order
def source(title,key,mode,rh,lh,time='4/4',subtitle='Complete original eight-bar study',tempo=None):
 # tempo=None keeps the original studies' source byte for byte (MIDI tempo 60, nothing printed).
 mark=f'\\tempo "{tempo[0]}" 4 = {tempo[1]} ' if tempo else '';midi=' ' if tempo else ' \\tempo 4=60 '
 size='#(set-global-staff-size 24)\n' if tempo else ''  # larger notes for Level 0
 return f'''\\version "2.24.4"
{size}\\header {{ title = "{title}" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "{subtitle}" }}
\\score {{ \\new PianoStaff << \\new Staff = "upper" {{ \\clef treble \\key {key} \\{mode} \\time {time} {mark}{{ {rh} \\bar "|." }} }} \\new Staff = "lower" {{ \\clef bass \\key {key} \\{mode} \\time {time} {{ {lh} \\bar "|." }} }} >> \\layout {{}} \\midi {{{midi}}} }}
'''
def create(id,title,key,mode,rh,lh,kind,level,time='4/4',literal=False,subtitle='Complete original eight-bar study',tempo=None,extra=None):
 if not literal:
  pc=next(k[2]-60 for k in keys if k[0]==key);rh=absolute(rh,key,mode,60+pc);lh=absolute(lh,key,mode,48+pc)
 pieces.append((id,source(title,key,mode,rh,lh,time,subtitle,tempo),{'kind':kind,'studyLevel':level,'studyKey':key,'studyMode':mode,'timeSignature':time,**(extra or {})}))

# ---------------------------------------------------------------------------------------------
# Level 0 "First keys": twenty complete pieces, one new demand at a time. Absolute pitches
# (c' = middle C). A resting hand shows whole-bar rests. No fingering numbers.
first=[
 ('Morning Bells','c','4/4',('Brightly',88),'Right hand alone · C position · steps and repeated notes',
  "c'4\\mf d' e' e' | d'4 c' d'2 | e'4 f' g' g' | f'4 e' d'2 | c'4\\p d' e' e' | f'4 e' d' d' | e'4\\mf d' e' d' | c'2 c'2",
  'R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1'),
 ('Little Boat','c','4/4',('Gently rocking',80),'Right hand alone · whole notes',
  "e'4\\p f' g'2 | f'4 e' d'2 | e'4 f' g' f' | e'1 | d'4\\mf e' f'2 | e'4 d' c'2 | d'4\\p e' d'2 | c'1",
  'R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1'),
 ('Sunny Steps','c','4/4',('Cheerfully',92),'Right hand alone · a twelve-bar melody with whole notes',
  "g'4\\mf g' f' e' | f'4 f' e' d' | e'4 d' c' d' | e'1 | d'4\\f e' f' g' | g'2 g'2 | f'4 e' f' g' | g'1 | g'4\\mf g' f' e' | f'4 f' e' d' | e'2 d'2 | c'1",
  'R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1'),
 ('Bear in the Woods','c','4/4',('Heavily',80),'Left hand alone · C position in the bass',
  'R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1',
  'c4\\f c d d | e4 e d2 | e4 f g g | f4 e d2 | c4\\p c d d | e4 f g2 | f4\\mf e d d | c1'),
 ('Evening Song','c','4/4',('Slowly',76),'Left hand alone · half and whole notes',
  'R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1',
  'g2\\p f2 | e2 d2 | e4 f g f | e1 | f4\\mf g f e | d4 e f e | d4\\p e d2 | c1'),
 ('Echo Valley','c','4/4',('Calling out',84),'Melody passed between the hands · skips of a third',
  "c'4\\mf e' g'2 | f'4 d' c'2 | R1 | R1 | e'4\\mf g' f' d' | e'2 r2 | R1 | R1 | g'4\\mf e' f' d' | e'4 d' c'2 | R1 | R1",
  'R1 | R1 | c4\\p e g2 | f4 d c2 | R1 | R1 | e4\\p g f d | e2 r2 | R1 | R1 | g4\\p e f d | c1'),
 ('Garden Conversation','c','4/4',('Chatting',80),'Hands take turns within the bar · rests',
  "c'4\\mf e' r2 | d'4 f' r2 | e'4 g' r2 | f'4 e' d'2 | r2 g'4 e' | r2 f'4 d' | r2 e'4 d' | c'1",
  'r2 g4\\p e | r2 f4 d | r2 e4 c | R1 | e4\\mf g r2 | d4 f r2 | f4 g r2 | R1'),
 ('Raindrops','c','4/4',('Lightly',76),'Hands take turns · quarter rests and skips',
  "g'4\\p r e' r | f'4 r d' r | e'4 d' c'2 | R1 | R1 | R1 | c'4\\mf e' g'2 | R1 | e'4\\p r g' r | f'4 r d' r | R1 | R1",
  'R1 | R1 | R1 | g4\\p r e r | f4 r d r | e4 d c2 | R1 | g4\\mf e c2 | R1 | R1 | e4\\p f d2 | c1'),
 ('Lantern Light','c','4/4',('Warmly',76),'Hands together for the first time · the left hand holds whole notes',
  "c'4\\p d' e' d' | e'4 f' g'2 | g'4 f' e' d' | e'1 | c'4\\mf d' e' d' | e'4 f' g' e' | d'4 e' d'2 | c'1",
  'c1 | c1 | c1 | c1 | c1 | c1 | g1 | c1'),
 ('Quiet Pond','c','4/4',('Calmly',80),'Hands together · left-hand half notes',
  "e'4\\p f' g'2 | g'4 f' e' d' | e'4 d' c' e' | d'1 | e'4\\mf f' g'2 | g'4 f' e' c' | d'4\\p e' d'2 | c'1",
  'c2 e2 | c2 g2 | c2 e2 | g2 g2 | c2 e2 | c2 g2 | g2 g2 | c1'),
 ('Walking Together','c','4/4',('Steadily',88),'Hands together · the left hand moves by step and by fifth',
  "e'4\\mf f' g' e' | f'4 d' e' c' | d'4 e' f' d' | e'1 | e'4\\f f' g'2 | f'4 e' d' f' | e'2\\mf d'2 | c'1",
  'c2 e2 | d2 c2 | g2 f2 | e2 c2 | c2 e2 | d2 g2 | c2 g2 | c1'),
 ('Hilltop Kite','g','4/4',('Breezy',88),'G position · the first F♯ · right hand',
  "g'4\\mf a' b' g' | a'4 b' c''2 | b'4 a' g' fis' | a'1 | b'4\\f c'' d'' b' | c''4 b' a' g' | fis'4\\mf g' a' fis' | g'1",
  'R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1'),
 ('Country Road','g','4/4',('Easygoing',84),'G position · both hands',
  "d''4\\mf c'' b' g' | a'4 b' a'2 | b'4 c'' d'' b' | a'1 | g'4\\p a' b' g' | c''4 b' a' g' | a'2 fis'2 | g'1",
  'g,1 | d1 | g,1 | d1 | g,2 b,2 | c2 d2 | d1 | g,1'),
 ('Sleepy Waltz','c','3/4',('Gently swaying',92),'3/4 time · dotted half notes',
  "e'4\\p f' g' | g'2. | d'4 e' f' | e'2. | c'4\\mf d' e' | f'4 e' d' | e'2 d'4 | d'2. | e'4\\p f' g' | g'2 e'4 | d'4 e' d' | c'2.",
  'c2. | c2. | g2. | c2. | c2. | d2. | c2. | g2. | c2. | c2. | g2. | c2.'),
 ('Carousel','g','3/4',('Merrily',96),'3/4 time in G major · both hands',
  "g'4\\mf b' d'' | d''2. | c''4 b' a' | b'2. | a'4 b' c'' | b'4 a' g' | a'2 b'4 | a'2. | g'4\\f b' d'' | d''2 c''4 | a'4 b' a' | g'2.",
  'g,2. | g,2. | c2. | g,2. | d2. | g,2. | d2. | d2. | g,2. | g,2. | d2. | g,2.'),
 ('Over the Bridge','c','4/4',('Smoothly',84),'Middle-C position · both thumbs share middle C',
  "c'4\\mf d' e' c' | R1 | d'4 e' f' e' | d'1 | R1 | R1 | e'4 d' c' r | R1 | e'4\\f f' g' e' | f'4 e' f'2 | e'2 d'2 | c'1",
  "R1 | b4\\mf a b c' | R1 | R1 | c'4\\p b a g | a4 b c'2 | r2. b4 | c'1 | c'1 | f1 | g1 | R1"),
 ('Swaying Willow','f','4/4',('Flowing',84),'F position · the first B♭',
  "f'4\\mf g' a' c'' | bes'4 a' g'2 | a'4 bes' c'' a' | g'1 | c''4\\f bes' a' g' | a'4 bes' c''2 | a'2\\mf g'2 | f'1",
  'f,1 | bes,2 c2 | f,1 | c1 | a,2 c2 | f,2 a,2 | c1 | f,1'),
 ('Hopscotch','c','4/4',('Playfully',88),'Fourths and fifths · legato slurs and staccato',
  "c'4-.\\mf g'-. c'-. g'-. | f'4( e' d'2) | d'4-. g'-. d'-. g'-. | e'4( f' g'2) | g'4-. c'-. f'-. c'-. | e'4( d' c' d') | g'4-.\\p d'-. g'-. d'-. | e'2( d'2) | e'4(\\mf f' g'2) | f'4( e' d'2) | c'4-. g'-. e'-. d'-. | c'1",
  'c1 | f2 g2 | g1 | c1 | e2 f2 | c1 | g1 | c2 g2 | c1 | d1 | e2 g2 | c1'),
 ('Village Dance','g','4/4',('Lively',92),'A melody over a I–V accompaniment in open fifths',
  "g'4\\mf b' d'' b' | a'4 c'' b' a' | g'4 a' b' g' | fis'2 a'2 | g'4 b' d'' b' | d''4 c'' b' a' | a'4 b' a' fis' | g'1 | b'4\\f c'' d'' b' | a'4 c'' b' a' | g'4 b' a' fis' | g'1",
  '<g, d>2 <g, d> | d2 d | <g, d>2 <g, d> | d2 d | <g, d>2 <g, d> | <g, d>2 <g, d> | d2 d | <g, d>1 | <g, d>2 <g, d> | d2 d | <g, d>2 d | <g, d>1'),
 ('Graduation March','c','4/4',('Proudly',88),'First eighth notes · a graduation piece',
  "c'4\\mf e'8 f' g'4 e' | d'4 f'8 e' d'2 | e'4 g'8 f' e'4 c' | d'8 e' f' e' d'2 | e'4\\f e'8 f' g'4 e' | f'4 f'8 e' d'4 f' | e'8 f' g' f' e'4 c' | d'4 e'8 f' g'2 | c'4\\mf e'8 f' g'4 e' | d'4 f'8 e' d'4 g' | e'8 d' c' d' e'4 d' | c'1",
  'c2 e2 | g1 | c2 e2 | g1 | c2 e2 | d2 g2 | c2 e2 | g1 | e2 c2 | g1 | c2 g2 | c1'),
]

# ---------------------------------------------------------------------------------------------
# First-reading generator. Pitches are diatonic steps above the tonic (0 = tonic, 7 = octave);
# minor keys use the harmonic minor, so the dominant always has its raised leading tone.
PC={'c':0,'cis':1,'des':1,'d':2,'ees':3,'e':4,'f':5,'fis':6,'g':7,'aes':8,'a':9,'bes':10,'b':11}
class Rng:
 """mulberry32: a tiny generator whose output never depends on the Python version."""
 def __init__(s,text):s.state=zlib.crc32(text.encode())
 def random(s):
  s.state=(s.state+0x6D2B79F5)&0xFFFFFFFF;t=s.state
  t=((t^(t>>15))*(t|1))&0xFFFFFFFF;t^=(t+(((t^(t>>7))*(t|61))&0xFFFFFFFF))&0xFFFFFFFF
  return ((t^(t>>14))&0xFFFFFFFF)/4294967296
 def pick(s,items,weights=None):
  weights=weights or [1]*len(items);x=s.random()*sum(weights)
  for item,w in zip(items,weights):
   x-=w
   if x<0:return item
  return items[-1]
 def order(s,items,weights):
  return [i for k,i in sorted(((s.random()**(1/w),i) for i,w in zip(items,weights) if w>0),key=lambda p:-p[0])]
class Key:
 def __init__(s,key,mode):
  s.key,s.mode=key,mode;s.names=names[key] if mode=='major' else minor[key][:6]+[minor[key][7]]
  s.off=[0,2,4,5,7,9,11] if mode=='major' else [0,2,3,5,7,8,11]
  s.rh=60+PC[key];s.lh=40+(PC[key]-4)%12  # treble tonic C4-B4; bass tonic E2-D#3
 def midi(s,d,base,alt=0):return base+12*(d//7)+s.off[d%7]+alt
 def name(s,d,base,alt=0):
  n=s.names[d%7]
  if alt==1:n=n[:-2] if n.endswith('es') else n+'is'
  acc=n[1:].count('is')-n[1:].count('es');octave=(s.midi(d,base,alt)-acc)//12-4
  return n+("'"*octave if octave>0 else ','*(-octave))
SIMPLE={'q':([4],1),'h':([8],2),'dh':([12],3),'w':([16],4),'ee':([2,2],1),'dqe':([6,2],2),'ssss':([1,1,1,1],1),'ess':([2,1,1],1),'sse':([1,1,2],1),'des':([3,1],1),'trip':(['t']*3,1)}
COMPOUND={'dq':([6],1),'qe':([4,2],1),'eee':([2,2,2],1),'dh':([12],2),'ssee':([1,1,2,2],1),'eq':([2,4],1)}
BUSY={'ssss','ess','sse','des','trip','ssee'}
METER={'4/4':(4,4),'3/4':(3,4),'2/4':(2,4),'6/8':(2,6)}  # beats per bar, sixteenths per beat
MAJOR_BASIC=[[0,3,0,4,0,3,4,0],[0,4,0,4,0,3,4,0],[0,0,3,4,0,0,4,0],[0,3,4,4,0,3,4,0],[0,0,4,4,0,3,4,0]]
MAJOR=MAJOR_BASIC+[[0,5,3,4,0,5,4,0],[0,0,3,4,5,3,4,0],[0,5,1,4,0,3,4,0]]
MINOR=[[0,3,0,4,0,3,4,0],[0,5,3,4,0,5,4,0],[0,0,3,4,5,3,4,0],[0,4,0,4,0,3,4,0],[0,3,4,4,0,3,4,0]]
# Per level: plans (key, mode, meter, left-hand pattern) for pieces 3-10, melodic range in steps
# around the tonic, largest leap in steps, rhythm cells with weights, and what each piece must show.
READING={
 1:dict(plans=[('c','major','4/4','whole')]*8,lo=0,hi=4,win=(55,84),leap=2,cells={'q':4,'h':3,'w':.4},need=set()),
 2:dict(plans=[('g','major','4/4','root5'),('f','major','3/4','root5'),('c','major','3/4','root5'),('g','major','3/4','root5'),('f','major','4/4','root5'),('g','major','4/4','root5'),('c','major','4/4','root5'),('f','major','3/4','root5')],
  lo=0,hi=4,win=(55,84),leap=3,cells={'q':4,'h':2.2,'dh':.5,'w':.3},need=set()),
 3:dict(plans=[('g','major','4/4','broken'),('e','minor','3/4','broken'),('f','major','2/4','broken'),('d','minor','4/4','broken'),('g','major','3/4','broken'),('f','major','4/4','broken'),('e','minor','4/4','broken'),('d','minor','3/4','broken')],
  lo=-7,hi=12,win=(60,79),leap=4,cells={'q':3,'h':1.5,'dh':.6,'ee':3.5},need={'ee'}),
 4:dict(plans=[('d','major','4/4','chordal'),('g','minor','3/4','chordal'),('bes','major','6/8','chordal'),('b','minor','4/4','chordal'),('d','major','6/8','chordal'),('bes','major','3/4','chordal'),('g','minor','4/4','chordal'),('b','minor','6/8','chordal')],
  lo=-7,hi=12,win=(59,81),leap=4,cells={'q':3,'h':1.2,'dh':.3,'ee':2,'dqe':3},cells8={'dq':2,'qe':3,'eee':2,'dh':.4},need={'dqe'}),
 5:dict(plans=[('a','major','4/4','alberti'),('c','minor','3/4','alberti'),('ees','major','6/8','alberti'),('fis','minor','2/4','alberti'),('a','major','3/4','alberti'),('ees','major','4/4','alberti'),('c','minor','6/8','alberti'),('fis','minor','4/4','alberti')],
  lo=-7,hi=12,win=(57,84),leap=5,cells={'q':3,'h':1,'ee':2,'dqe':1,'ssss':.8,'ess':1.4,'sse':1.4},cells8={'dq':2,'qe':2,'eee':2,'ssee':1.6},need={'sixteenths','ledger'}),
 6:dict(plans=[('ees','major','4/4','alberti'),('fis','minor','3/4','chordal'),('d','major','6/8','chordal'),('c','minor','4/4','chordal'),('a','major','3/4','alberti'),('g','minor','6/8','alberti'),('bes','major','4/4','chordal'),('b','minor','3/4','chordal')],
  lo=-7,hi=12,win=(57,81),leap=5,cells={'q':3,'h':1.5,'ee':2.5,'dqe':1,'ess':.6,'sse':.6,'des':.6},cells8={'dq':2.5,'qe':2.5,'eee':2,'ssee':.5},need={'dyads','chromatic'}),
 7:dict(plans=[('e','major','4/4','arpeggio'),('f','minor','3/4','arpeggio'),('aes','major','6/8','arpeggio'),('cis','minor','4/4','arpeggio'),('e','major','3/4','arpeggio'),('aes','major','4/4','arpeggio'),('f','minor','6/8','arpeggio'),('cis','minor','3/4','arpeggio')],
  lo=-7,hi=12,win=(55,84),leap=7,cells={'q':3,'h':1,'ee':2,'dqe':1,'ess':.5,'sse':.5,'trip':2.2},cells8={'dq':2,'qe':2,'eee':2,'ssee':.6,'eq':.5},need={'trip','wide'}),
}
# Melodic intervals allowed for each diatonic distance (no augmented or diminished leaps, no sevenths).
GOOD={0:{0},1:{1,2},2:{3,4},3:{5},4:{7},5:{8,9},7:{12}}
DUR={Fr(16):'1',Fr(12):'2.',Fr(8):'2',Fr(6):'4.',Fr(4):'4',Fr(3):'8.',Fr(2):'8',Fr(1):'16'}

def fits(meter,name,pos,beats):
 cells=COMPOUND if meter=='6/8' else SIMPLE;span=cells[name][1]
 if pos+span>beats:return False
 if span==1:return True
 if name in ('w','dh'):return pos==0
 return pos%2==0 if meter=='4/4' else True
def bar_rhythm(rng,P,meter,kind):
 """kind: 'normal', 'half' (phrase end) or 'final'. Returns a list of cell names."""
 beats=METER[meter][0];compound=meter=='6/8';weights=dict(P.get('cells8',{}) if compound else P['cells'])
 if kind=='normal':weights.pop('w',None)  # whole notes only end a phrase
 if kind!='normal':
  # The phrase ends on a held note.
  if compound:ends=['dh'] if kind=='final' else ['dq','dh']
  elif meter=='4/4':ends=['w','h'] if 'w' in weights else ['h']
  elif meter=='3/4':ends=['dh','h'] if 'dh' in weights else ['h']
  else:ends=['h'] if kind=='final' else ['h','q']
  last=rng.pick(ends);span=(COMPOUND if compound else SIMPLE)[last][1];head=bar_fill(rng,meter,weights,beats-span)
  return head+[last]
 return bar_fill(rng,meter,weights,beats)
def bar_fill(rng,meter,weights,beats):
 for _ in range(50):
  out=[];pos=0
  while pos<beats:
   opts=[c for c in weights if fits(meter,c,pos,beats)]
   if not opts:break
   c=rng.pick(opts,[weights[o] for o in opts]);out.append(c);pos+=(COMPOUND if meter=='6/8' else SIMPLE)[c][1]
  if pos==beats and sum(c in BUSY for c in out)<=2:return out
 return ['q']*beats if meter!='6/8' else ['dq']*beats

def lh_events(pattern,K,prog,meter,final_root_fifth):
 """Left hand per bar: list of (onset, duration, [steps above the bass tonic]) in sixteenths."""
 beats,unit=METER[meter];L=beats*unit;bars=[]
 for b,r in enumerate(prog):
  # Five-finger patterns stay in the position on the bass tonic; the others put the root between E2 and D#3.
  R=r if pattern in ('whole','root5') or K.midi(r,K.lh)<=51 else r-7
  T,F,O=R+2,R+4,R+7
  if b==7:bars.append([(0,L,[R,F] if final_root_fifth else [R])]);continue
  if pattern=='whole':ev=[(0,L,[R])]
  elif pattern=='root5':
   # Five-finger position on the bass tonic: root, then another chord tone in the position.
   tones=sorted({x for x in range(0,5) if x%7 in {r%7,(r+2)%7,(r+4)%7}})
   a=r if r<=4 else tones[0];others=[x for x in tones if x!=a];c=(r+4)%7 if (r+4)%7 in others else others[-1]
   ev=[(0,L,[a])] if b==6 else [(0,8,[a]),(8,8 if beats==4 else 4,[c])]  # the dominant is held before the final bar
  elif pattern=='broken':
   seq={'4/4':[R,F,T,F],'3/4':[R,T,F],'2/4':[R,F]}[meter];ev=[(i*4,4,[x]) for i,x in enumerate(seq)]
  elif pattern=='chordal':
   ev={'4/4':[(0,8,[R]),(8,8,[T,F])],'3/4':[(0,4,[R]),(4,4,[T,F]),(8,4,[T,F])],'2/4':[(0,4,[R]),(4,4,[T,F])],'6/8':[(0,6,[R]),(6,6,[T,F])]}[meter]
  elif pattern=='alberti':
   seq={'4/4':[R,F,T,F]*2,'3/4':[R,F,T,F,T,F],'2/4':[R,F,T,F],'6/8':[R,F,T,F,T,F]}[meter];ev=[(i*2,2,[x]) for i,x in enumerate(seq)]
  else:  # arpeggio
   seq={'4/4':[R,F,O,F]*2,'3/4':[R,F,O,F,T,F],'6/8':[R,F,O,F,O,F]}[meter];ev=[(i*2,2,[x]) for i,x in enumerate(seq)]
  bars.append(ev)
 return bars

def interval_ok(K,a,b):
 dd=abs(a-b);return dd in GOOD and abs(K.midi(a,K.rh)-K.midi(b,K.rh)) in GOOD[dd]

def reading_piece(level,number):
 P=READING[level];key,mode,meter,pattern=P['plans'][number-3];K=Key(key,mode);rng=Rng(f'reading-{level}-{number}')
 beats,unit=METER[meter];L=beats*unit;compound=meter=='6/8';cells=COMPOUND if compound else SIMPLE
 templates=(MAJOR_BASIC if level<=2 else MAJOR) if mode=='major' else MINOR
 found=[]
 for attempt in range(400):
  prog=rng.pick(templates);parallel=prog[4:6]==prog[0:2] and rng.random()<.7
  r1=bar_rhythm(rng,P,meter,'normal');r2=bar_rhythm(rng,P,meter,'normal')
  r3=r1 if rng.random()<.5 else bar_rhythm(rng,P,meter,'normal');r4=bar_rhythm(rng,P,meter,'half')
  r5,r6=(r1,r2) if parallel else (bar_rhythm(rng,P,meter,'normal'),bar_rhythm(rng,P,meter,'normal'))
  rhythm=[r1,r2,r3,r4,r5,r6,bar_rhythm(rng,P,meter,'normal'),bar_rhythm(rng,P,meter,'final')]
  used={c for bar in rhythm for c in bar}
  if 'ee' in P['need'] and not used&{'ee'}:continue
  if 'dqe' in P['need'] and not used&({'dq'} if compound else {'dqe'}):continue  # dotted quarters
  if 'sixteenths' in P['need'] and not used&{'ssss','ess','sse','ssee'}:continue
  if 'trip' in P['need'] and not compound and 'trip' not in used:continue
  lh=lh_events(pattern,K,prog,meter,level>=3)
  # Melody slots.
  slots=[]
  for b,bar in enumerate(rhythm):
   pos=Fr(0)
   for c in bar:
    durs,span=cells[c]
    for j,d in enumerate(durs):
     d=Fr(4,3) if d=='t' else Fr(d)
     slots.append(dict(bar=b,on=pos,dur=d,strong=pos%(unit if compound else 8 if meter=='4/4' else L)==0,trip=j if c=='trip' else None,cell=c));pos+=d
  n=len(slots);copy={}
  if parallel:
   first=[i for i,s in enumerate(slots) if s['bar'] in (0,1)];later=[i for i,s in enumerate(slots) if s['bar'] in (4,5)]
   copy=dict(zip(later,first))
  for s in slots:
   chord=prog[s['bar']];s['chord']={chord%7,(chord+2)%7,(chord+4)%7}
   s['needct']=s['strong'] or s['dur']>=(6 if compound else 8)  # accents and long notes are chord tones
   end=s['on']+s['dur'];s['lhmax']=max(K.midi(x,K.lh) for on,dur,xs in lh[s['bar']] if on<end and on+dur>s['on'] for x in xs)
  last4=max(i for i,s in enumerate(slots) if s['bar']==3)
  res=[None]*n;nodes=[0];wlo,whi=P['win'];pitch={d:K.midi(d,K.rh) for d in range(P['lo']-7,P['hi']+8)};center=K.rh+4 if level<=2 else (wlo+whi)/2
  def ok(i,d):
   s=slots[i]
   ct=d%7 in s['chord']
   if s['needct'] and not ct:return False
   if i==0:return d%7 in (0,2,4)
   p=res[i-1];diff=d-p;ad=abs(diff)
   if ad not in GOOD or abs(pitch[d]-pitch[p]) not in GOOD[ad]:return False
   if i==n-1 and (d%7!=0 or ad!=1):return False
   if i==last4 and (d%7==0 or not ct):return False   # half cadence on a chord tone of V
   if diff==0 and (i>=2 and res[i-2]==p or s['dur']<2 or slots[i-1]['dur']<2 or slots[i-1]['dur']>=8):return False  # no restruck long notes or repeated sixteenths
   if i>=3 and res[i-3]==p and res[i-2]==d and d!=p:return False  # no a-b-a-b wobble
   if not ct and ad!=1:return False                       # passing or neighbour tone: approached by step
   if i>=1 and p%7 not in slots[i-1]['chord'] and ad!=1:return False   # ...and left by step
   if s['trip'] in (1,2) and ad!=1:return False
   if (s['dur']<2 or slots[i-1]['dur']<2) and ad>1:return False        # sixteenths move by step
   if s['dur']<=2 and slots[i-1]['dur']<=2 and ad>(3 if level>=7 else 2):return False
   if i>=2:
    q=res[i-1]-res[i-2]
    if abs(q)>=3 and (diff*q>0 or ad>2):return False     # a leap turns back by step or third
   if i>=6:
    moves=[b-a for a,b in zip(res[i-6:i-1],res[i-5:i])]+[diff]
    if all(m>0 for m in moves) or all(m<0 for m in moves):return False   # at most five moves one way
   return True
  def weights(i,cands):
   s=slots[i];p=res[i-1] if i else None;w=[]
   for d in cands:
    if p is None:w.append(3 if d in (0,2,4) else 1);continue
    ad=abs(d-p);x={0:1.0 if level==1 else .6,1:4,2:2.2,3:1.1,4:.7,5:.5,7:.4}.get(ad,0)
    if level>=7 and ad>=3:x*=2.2
    up=s['bar'] in (1,2,5,6);down=s['bar'] in (3,7)
    if (d>p and up) or (d<p and down):x*=1.5
    if level==6 and i>=2 and res[i-1]==res[i-2]-1 and d==res[i-2]:x*=4
    w.append(x/(1+((pitch[d]-center)/7)**2))  # stay near the middle of the range
   return w
  def rec(i):
   nodes[0]+=1
   if nodes[0]>600:return False
   if i==n:return True
   if i in copy:cands=[res[copy[i]]]
   else:
    lo,hi=(P['lo'],P['hi']) if i==0 else (max(P['lo'],res[i-1]-P['leap']),min(P['hi'],res[i-1]+P['leap']))
    cands=[d for d in range(lo,hi+1) if wlo<=pitch[d]<=whi and pitch[d]>slots[i]['lhmax']];cands=rng.order(cands,weights(i,cands))
   for d in cands:
    if ok(i,d):
     res[i]=d
     if rec(i+1):return True
   res[i]=None;return False
  if not rec(0):continue
  mel=list(res);top=max(mel)
  if top-min(mel)<(3 if level<=2 else 4) or len(set(mel))<4:continue
  if 'ledger' in P['need'] and not any(K.midi(d,K.rh)>=81 or K.midi(d,K.rh)<=60 for d in mel):continue
  if 'wide' in P['need'] and not any(abs(a-b)>=5 for a,b in zip(mel,mel[1:])):continue
  # Chromatic lower neighbours (level 6): T, step below, T becomes T, raised step, T.
  alt=[0]*n
  if 'chromatic' in P['need']:
   sites=[i for i in range(1,n-1) if not slots[i]['needct'] and slots[i]['trip'] is None and mel[i+1]==mel[i-1] and mel[i]==mel[i-1]-1 and K.midi(mel[i-1],K.rh)-K.midi(mel[i],K.rh)==2 and not K.names[mel[i]%7].endswith('is') and i not in copy]
   for i in sorted(rng.order(sites,[1]*len(sites))[:2]):alt[i]=1  # one or two per piece
   for i,j in copy.items():alt[i]=alt[j]
   if not any(alt):continue
  # Two-note right-hand textures (level 6): a third or sixth below long strong-beat notes.
  low=[None]*n
  if 'dyads' in P['need']:
   for i,s in enumerate(slots):
    if i in copy or not s['strong'] or s['dur']<4 or rng.random()<.35:continue
    for k in (2,5):
     x=mel[i]-k
     if (x%7) in s['chord'] and K.midi(x,K.rh)>s['lhmax'] and K.midi(x,K.rh)>=wlo:low[i]=x;break
   for i,j in copy.items():low[i]=low[j]
   if sum(x is not None for x in low)<3:continue
  # Score: smooth lines, one clear high point, variety, no parallel octaves/fifths with the bass.
  cost=sum({0:.8,1:0,2:.4,3:1.2,4:1.8,5:2.5,7:3}[abs(a-b)]*(.6 if level>=7 and a!=b else 1) for a,b in zip(mel,mel[1:]))
  cost+=2*max(0,top-min(mel)-(9 if level>=5 else 7))  # a compact range
  peaks=[slots[i]['bar'] for i,d in enumerate(mel) if d==top]
  if len(set(peaks))==1 and peaks[0] in (1,2,5,6):cost-=2
  if len(set(mel))<5:cost+=3
  for half in (range(0,n//2),range(n//2,n)):
   if len({mel[i] for i in half})<4:cost+=3
  wobble=sum(mel[i]==mel[i+2]!=mel[i+1] for i in range(n-2));cost+=max(0,wobble-n//6)
  cost+=max(0,sum(a==b for a,b in zip(mel,mel[1:]))-2)
  cost+=abs(sum(pitch[d] for d in mel)/n-center)
  # Outer voices at every onset of either hand: melody against the lowest left-hand note.
  top=[(s['bar']*L+s['on'],s['bar']*L+s['on']+s['dur'],pitch[mel[i]]) for i,s in enumerate(slots)]
  bass=[(b*L+on,b*L+on+dur,min(K.midi(x,K.lh) for x in xs)) for b,ev in enumerate(lh) for on,dur,xs in ev]
  times=sorted({x[0] for x in top+bass});outer=[(next(m for a,e,m in top if a<=t<e),next(m for a,e,m in bass if a<=t<e)) for t in times]
  parallels=[t for t,(a,b),(c,d) in zip(times[1:],outer,outer[1:]) if (a-b)%12 in (0,7) and (a-b)%12==(c-d)%12 and (c-a)*(d-b)>0]
  if any(t%(8 if meter=='4/4' else L)==0 for t in parallels):continue  # no parallel octaves or fifths onto a strong beat
  cost+=2*len(parallels)
  found.append((cost,attempt,prog,rhythm,slots,mel,alt,low,lh,parallel))
  if len(found)>=12:break
 assert found,f'reading-{level}-{number}: no melody satisfied the constraints'
 cost,attempt,prog,rhythm,slots,mel,alt,low,lh,parallel=min(found,key=lambda f:(f[0],f[1]))
 # LilyPond text.
 dyn=rng.pick(['\\mf','\\p','\\f','\\mf'] if level>=3 else ['\\mf','\\p'])
 second=('\\p' if dyn!='\\p' else '\\mf') if parallel else rng.pick(['','\\mf','\\f' if dyn!='\\f' else '\\p'])
 bars=[[] for _ in range(8)];i=0
 firsts={min(j for j,s in enumerate(slots) if s['bar']==b) for b in (0,4)};lasts={max(j for j,s in enumerate(slots) if s['bar']==b) for b in (3,7)}
 while i<len(slots):
  s=slots[i]
  def note(j,dur):
   head=K.name(mel[j],K.rh,alt[j]);text=f'<{K.name(low[j],K.rh)} {head}>{dur}' if low[j] is not None else head+dur
   if j==0:text+=dyn
   if slots[j]['bar']==4 and j in firsts and second:text+=second
   if level>=3 and j in firsts:text+='('
   if level>=3 and j in lasts:text+=')'
   return text
  if s['trip']==0:bars[s['bar']].append('\\tuplet 3/2 { '+' '.join(note(j,'8') for j in (i,i+1,i+2))+' }');i+=3
  else:bars[s['bar']].append(note(i,DUR[s['dur']]));i+=1
 lhbars=[]
 for ev in lh:
  out=[]
  for on,dur,xs in ev:
   ns=[K.name(x,K.lh) for x in xs];out.append((ns[0] if len(ns)==1 else '<'+' '.join(ns)+'>')+DUR[Fr(dur)])
  lhbars.append(' '.join(out))
 return key,mode,meter,' | '.join(' '.join(b) for b in bars),' | '.join(lhbars)

# ---------------------------------------------------------------------------------------------
# Key studies, levelled by the usual teaching order of keys.
KEY_LEVEL={('c','major'):2,('g','major'):2,('f','major'):2,('a','minor'):2,('d','minor'):2,('e','minor'):2,
 ('d','major'):3,('bes','major'):3,('b','minor'):3,('g','minor'):3,
 ('a','major'):4,('ees','major'):4,('fis','minor'):4,('c','minor'):4,
 ('e','major'):5,('aes','major'):5,('des','minor'):5,('f','minor'):5}
for key,label,midi in keys:
 for mode in ['major','minor']:
  n=names[key] if mode=='major' else minor[key];lead=n[6] if mode=='major' else n[7]
  tonic=f'<{n[0]} {n[2]} {n[4]}>';sub=f'<{n[3]} {n[5]} {n[0]}>';dom=f'<{n[4]} {lead} {n[1]} {n[3]}>'
  rh=f'{n[0]}4 {n[1]} {n[2]} {n[3]} | {n[4]} {n[3]} {n[2]} {n[1]} | {n[0]} {n[2]} {n[4]} {n[2]} | {n[3]} {n[5]} {n[0]} {n[5]} | {n[4]} {lead} {n[1]} {lead} | {n[0]} {n[2]} {n[4]} {n[2]} | {n[1]} {lead} {n[0]}2 | {n[0]}1'
  lh=f'{tonic}1 | {tonic} | {tonic} | {sub} | {dom} | {tonic} | {dom} | {tonic}'
  create(f'key-{key}-{mode}',f'{label.replace(chr(9839),"-sharp").replace(chr(9837),"-flat")} {mode} · scale fragments and cadence',key,mode,rh,lh,'technique',KEY_LEVEL.get((key,mode),6))
# The original fourteen eight-bar miniatures (ids and music unchanged; learners' seen state refers to them).
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
for number,(title,key,time,tempo,focus,rh,lh) in enumerate(first,1):
 rh=' | '.join(bar.strip()+(' \\break' if i%4==3 else '') for i,bar in enumerate(rh.split('|')[:-1]))+' | '+rh.split('|')[-1].strip()  # one four-bar phrase per line
 create(f'first-{number:02d}',title,key,'major',rh,lh,'first',0,time,literal=True,subtitle=f'First keys · piece {number} of {len(first)}',tempo=tempo,extra={'studyOrder':number,'focus':focus,'tempo':tempo[1]})
for level in range(1,8):
 for number in range(3,11):
  key,mode,time,rh,lh=reading_piece(level,number)
  create(f'reading-{level}-{number}',f'First-reading miniature {level}.{number}',key,mode,rh,lh,'reading',level,time,literal=True)

if sources_only:
 sources_only.mkdir(parents=True,exist_ok=True)
 for id,src,info in pieces:(sources_only/f'{id}.ly').write_text(src)
 sys.exit(0)

# ---------------------------------------------------------------------------------------------
root.mkdir(parents=True,exist_ok=True)
prefix=pathlib.Path('site/scores/ode/practice.ly').read_text().split('\\version')[0]
def compile(piece):
 id,src,info=piece;d=root/id;d.mkdir(exist_ok=True);dest=pathlib.Path('site/scores')/id;dest.mkdir(exist_ok=True)
 for old in d.glob('practice*.svg'):old.unlink()
 (d/'original.ly').write_text(src);(dest/'original.ly').write_text(src);(d/'practice.ly').write_text(prefix+src)
 with (d/'compile.log').open('w') as log:
  subprocess.run([lily,'-o',str(d/'source-score'),str(d/'original.ly')],stdout=log,stderr=log,check=True)
  subprocess.run([lily,'-dno-point-and-click','-dbackend=svg','-o',str(d/'practice'),str(d/'practice.ly')],stdout=log,stderr=log,check=True)
 shutil.copy(d/'source-score.pdf',dest/'original.pdf')
with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as pool:list(pool.map(compile,pieces))
choices={id:f'Learning/{id}/{id}.ly' for id,src,info in pieces};details={id:info for id,src,info in pieces}
pathlib.Path('scripts/piano-study-sources.json').write_text(json.dumps(choices,indent=2)+'\n')
subprocess.run(['node','scripts/read-piano-library-midi.cjs',str(root),'scripts/piano-study-sources.json'],check=True)
subprocess.run(['python3','scripts/build-piano-library.py',str(root),'scripts/piano-study-sources.json','site/piano-studies.js'],check=True)
p=pathlib.Path('site/piano-studies.js');s=p.read_text();data=json.loads(s.split('Object.assign(window.PianoRepertoire,')[1].rsplit(');',1)[0])
for id,info in data.items():
 info.update(details[id]);kind=details[id]['kind']
 if kind=='first':
  info['caption']=f"Complete original Level 0 piece · {details[id]['focus']}"
  readme=f"Complete original Level 0 piece by OpenPiano, number {details[id]['studyOrder']} of the twenty First keys pieces. Released under CC0 1.0. Not an excerpt or an adaptation of any method book or Piano Marvel lesson. Original PDF and source, MIDI and tagged practice engraving are included. No fingerings are generated.\n"
 else:
  info['caption']='Complete original eight-bar '+kind+' study · both hands'
  readme=f"Complete original eight-bar {kind} study by OpenPiano. Released under CC0 1.0. Not an excerpt or an adaptation of a Piano Marvel lesson. Original PDF and source, both-hand MIDI and tagged practice engraving are included. No fingerings are generated.\n"
 info['attribution']='OpenPiano · original learning study · CC0 1.0'
 folder=pathlib.Path('site')/info['folder'];j=folder/'practice.json';payload=json.loads(j.read_text());payload.update(info);j.write_text(json.dumps(payload,separators=(',',':')))
 info['dataURL']=f"{info['folder']}/practice.json?v={hashlib.sha256(j.read_bytes()).hexdigest()[:12]}"
 (folder/'README.md').write_text(f"# {info['title']}\n\n"+readme)
p.write_text('/* Original complete Level 0 pieces, technique and first-reading studies, CC0. */\nObject.assign(window.PianoRepertoire,'+json.dumps(data,separators=(',',':'))+');\n')
