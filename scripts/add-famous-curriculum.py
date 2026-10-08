"""Add study guidance for the famous-repertoire scores to site/piano-curriculum.js.
Only ids with a built score in site/piano-famous.js are added; an existing
reference entry with the same id (e.g. Moonlight) is replaced by the full score.
"""
import json, pathlib, re
cur = pathlib.Path('site/piano-curriculum.js'); text = cur.read_text()
prefix, body = text.split('window.PianoCurriculum=', 1)
data = json.loads(body.rstrip().rstrip(';'))
built = set(re.findall(r'"([a-z0-9-]+)":\{"id"', pathlib.Path('site/piano-famous.js').read_text()))
G = {
 'fantaisie-impromptu': (7, 'Four against three and fast right-hand figuration',
   'Play even 3-against-2, fluent sixteenth-note scales and arpeggios, and read C♯ minor and D♭ major.',
   'Rapid right-hand sixteenths over left-hand triplet arpeggios, with a slower singing D♭-major middle section.',
   'Feeling two subdivisions at once prepares Chopin études and much Romantic accompaniment; the middle section trains a singing melody over broken chords.',
   'Tap four against three on a table, meeting on each beat, until it is even. Then play one beat of the opening slowly, hands separately before together.',
   'Hands meet exactly on each beat with even notes between, the middle melody sings, and the ending stays clear.'),
 'minute-waltz': (6, 'Light, fast turning figures over a waltz bass',
   'Read five flats, keep a bass–chord–chord waltz pattern in 3/4 and use a relaxed rotating hand.',
   'Circling right-hand eighth notes over a waltz accompaniment, with a slower lyrical middle section.',
   'Waltz accompaniment and forearm rotation transfer to every Chopin waltz and dance; the key builds black-key fluency.',
   'Play the left-hand waltz pattern alone for one phrase. Group the right-hand figure by beats and play it slowly with a light wrist, then combine.',
   'Feel one pulse per bar, keep the right hand even and the left-hand chords light on beats two and three.'),
 'raindrop': (5, 'Voicing a melody over a repeated note',
   'Read D♭ major and C♯ minor, hold a melody above repeated notes and pedal simply.',
   'A repeated A♭ (respelled G♯ in the minor middle section) beneath a calm melody that later darkens and builds.',
   'Keeping repeated notes soft under a melody is basic voicing; the same piano key named A♭ and G♯ teaches enharmonic reading.',
   'Play the repeated note alone, softly and evenly. Then add the melody above it and make the melody clearly louder.',
   'The repeated notes stay even and quiet, the melody leads, and the middle climax returns to a calm ending.'),
 'ballade1': (7, 'Long-form storytelling, wide leaps and a virtuosic coda',
   'Be comfortable with Chopin nocturnes or études, 6/4 meter, wide left-hand leaps and octaves.',
   'Themes that return transformed across a long form, closing with a fast G-minor coda.',
   'Following a theme as its character changes builds structural memory for sonatas and other large Romantic works.',
   'Mark where each theme returns in the score. Practice one phrase of the first theme slowly, then work the coda in short loops.',
   'Name every section from memory, connect the transitions without stopping and play the coda at a controlled tempo.'),
 'moonlight': (6, 'Sustained melody over quiet triplets',
   'Read three rhythmic layers and keep an accompaniment even at a slow tempo.',
   'A sustained line above repeating triplet accompaniment and bass.',
   'Balancing melody, accompaniment and bass at a soft dynamic transfers to nocturnes and slow movements.',
   'Play the triplets alone, very evenly and quietly, with the pedal changing on each harmony. Then add the melody above them.',
   'The triplets never rush, the melody carries over them and the bass supports each harmony to the final chords.'),
 'alla-turca': (5, 'Crisp Classical articulation and a percussive march bass',
   'Read A minor and A major, play even sixteenth-note turns and light broken chords.',
   'A returning A-minor rondo theme with bright A-major episodes and march-like left-hand chords.',
   'Rondo form and crisp Classical articulation transfer to sonatas by Mozart, Haydn and Clementi.',
   'Practice the opening turn figure slowly with even fingers. Then add the left-hand chords as short, light strokes.',
   'Turns stay even, staccato chords are crisp and the coda keeps time to the last chord.'),
 'rach-prelude': (6, 'Powerful chord voicing and a wide dynamic range',
   'Read thick chords in C♯ minor, span octaves and pedal for long resonance.',
   'A three-note motto (A–G♯–C♯) framing an agitated middle section and a massive return.',
   'Using arm weight rather than finger force, and voicing the top note of a chord, transfers to all large Romantic repertoire.',
   'Play the opening three-chord motto with relaxed arm weight and listen to each chord fade before the next. Then bring out the top note.',
   'Chords sound together and ring, the top notes are clear and the ending fades evenly.'),
 'arabesque1': (6, 'Flowing arpeggios and two against three',
   'Read E major, play two against three and connect arpeggios across both hands.',
   'Rising and falling arpeggio figures shared between the hands, with triplets set against duplets.',
   'Two against three and pedaled arpeggio color prepare Debussy and Ravel; sharing a line between hands builds evenness.',
   'Tap two against three slowly. Play the opening arpeggio divided between the hands so it sounds like one line.',
   'Arpeggios flow without bumps where the hands meet and the triplets stay even against the duplets.'),
 'maple-leaf': (6, 'Ragtime syncopation over a stride bass',
   'Read A♭ major, count syncopated sixteenth-note rhythms and leap between a low bass and a middle chord.',
   'Several strains, each repeated, with a syncopated right hand over a steady stride left hand.',
   'Stride bass and syncopation transfer to ragtime and much jazz piano; it builds directly on The Entertainer.',
   'Practice the left-hand stride alone, low bass then middle chord, slowly and evenly. Then clap the right-hand rhythm over it.',
   'The stride stays steady, syncopations land against the beat and every strain ends cleanly.'),
 'mountain-king': (4, 'Gradual crescendo over a repeating theme',
   'Read B minor, play light staccato and recognize a repeated motive.',
   'One short theme repeated again and again, growing louder, higher and faster.',
   'Planning a long crescendo and spotting repeated motives speeds up reading in any piece.',
   'Play the theme quietly at a slow, steady tempo. Then mark in the score where each repetition should grow.',
   'The theme stays short and even, the build-up is gradual and the ending lands in time.'),
 'gnossienne1': (4, 'A free melody over a steady bass-and-chord pulse',
   'Read F minor, keep a simple bass-then-chord left-hand pattern and read long note values.',
   'An ornamented, modal-sounding melody over an unchanging accompaniment.',
   'Keeping an accompaniment steady under a flexible melody transfers to song accompaniment and film-style piano writing.',
   'Play the left-hand pattern alone until it is steady. Add the melody, counting through each long note and ornament.',
   'The left hand stays even, ornaments do not disturb the pulse and each phrase has space to breathe.'),
 'impromptu-gflat': (6, 'Melody and accompaniment in the same hand',
   'Read six flats, sustain long phrases and hold a top melody while the same hand plays inner notes.',
   'A long melody at the top of the right hand above flowing broken-chord triplets and a deep bass.',
   'Melody and accompaniment within one hand is core Romantic technique, found in Chopin nocturnes and Liszt.',
   'Play only the right-hand melody notes with the fingering you will use, then add the inner notes very softly.',
   'The melody stays on top and connected, the inner notes are even and quiet and the bass supports each harmony.'),
 'consolation3': (5, 'A singing line over rolling left-hand arpeggios',
   'Read D♭ major, play wide left-hand broken chords and change the pedal cleanly.',
   'A sustained melody over rolling left-hand accompaniment, rising to a warm climax and settling back.',
   'Clean pedal changes on each harmony and a long singing line prepare Liszt’s Liebesträume and Chopin’s nocturnes.',
   'Practice the left-hand arpeggios alone, changing the pedal on each new harmony. Then add the melody.',
   'The pedal changes without blur, the melody sings above and the tempo stays calm.'),
 'brahms-waltz': (4, 'Thirds and sixths in a gentle waltz',
   'Read A♭ major, play double notes (thirds and sixths) and keep a waltz bass.',
   'A melody in thirds and sixths over a waltz accompaniment, in a short form with repeats.',
   'Reading double notes as intervals and voicing the top note of each pair transfers to Chopin and Schubert.',
   'Play the right-hand pairs slowly, listening for the top note. Then add the waltz bass.',
   'Each pair sounds together, the top notes lead and the waltz lilts with a light third beat.'),
}
pieces = [p for p in data['pieces'] if not (p['id'] in built and p['id'] in G)]
added = []
for id, (level, skill, pre, pattern, transfer, exercise, check) in G.items():
    if id not in built:
        continue
    pieces.append({'id': id, 'level': level, 'skill': skill, 'prerequisites': pre, 'pattern': pattern, 'transfer': transfer, 'exercise': exercise, 'check': check})
    added.append(id)
data['pieces'] = pieces
cur.write_text(prefix + 'window.PianoCurriculum=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('added', len(added), added)
