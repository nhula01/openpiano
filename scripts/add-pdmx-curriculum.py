"""Add study guidance for the PDMX (public-domain MusicXML) scores to site/piano-curriculum.js.
Only ids with a built score in site/piano-pdmx.js are added; an existing
reference entry with the same id (e.g. Moonlight) is replaced by the full score.
"""
import json, pathlib, re
cur = pathlib.Path('site/piano-curriculum.js'); text = cur.read_text()
prefix, body = text.split('window.PianoCurriculum=', 1)
data = json.loads(body.rstrip().rstrip(';'))
built = set(re.findall(r'"([a-z0-9-]+)":\{"id"', pathlib.Path('site/piano-pdmx.js').read_text()))
G = {
 'campanella': (7, 'Wide leaps to a ringing repeated note',
   'Play secure octave leaps and fast repeated notes, and read high ledger lines and 8va passages.',
   'A bell-like high D♯ that the right hand keeps leaping back to, in variations that grow more brilliant.',
   'Leaping by moving the arm and looking ahead, instead of stretching the hand, transfers to Liszt, Chopin études and other virtuoso writing.',
   'Practice one leap slowly: play the low note, move the arm and touch the high D♯ silently before playing it. Then join one bar at a slow, even pulse.',
   'Leaps land without hesitation, the repeated D♯ stays light and the left hand keeps time through every variation.'),
 'liebestraum': (6, 'A melody in the middle of rolling arpeggios',
   'Read A♭ major, hold a melody with the thumb while the other fingers play arpeggios, and change the pedal with each harmony.',
   'A song-like melody inside the texture, surrounded by arpeggios shared between the hands, with two cadenzas.',
   'A middle-voice melody inside shared arpeggios is a Romantic texture also found in Schumann and Chopin.',
   'Play only the melody notes, singing them with the thumbs. Then add the arpeggio notes very softly around them.',
   'The melody is heard above the arpeggios, the pedal stays clean and each cadenza flows back into the pulse.'),
 'hungarian2': (7, 'Contrasting slow and fast sections, leaps and repeated chords',
   'Play octaves and chords at speed, judge wide leaps and read dense accidentals.',
   'A slow, improvisatory first part (lassan) followed by a fast dance (friska) that keeps accelerating.',
   'Changing character between sections and building speed gradually transfer to rhapsodies, dances and showpieces.',
   'Learn the friska’s repeated-chord patterns slowly in short loops; play the lassan with free but counted rhythm.',
   'Each section has its own character, leaps are accurate and the friska grows without losing control.'),
 'ballade1': (7, 'Long-form storytelling, wide leaps and a virtuosic coda',
   'Be comfortable with Chopin nocturnes or études, 6/4 meter, wide left-hand leaps and octaves.',
   'Themes that return transformed across a long form, closing with a fast G-minor coda.',
   'Following a theme as its character changes builds structural memory for sonatas and other large Romantic works.',
   'Mark where each theme returns in the score. Practice one phrase of the first theme slowly, then work the coda in short loops.',
   'Name every section from memory, connect the transitions without stopping and play the coda at a controlled tempo.'),
 'heroic': (7, 'Left-hand octave runs and a grand chordal theme',
   'Play fast left-hand octaves with a loose wrist, voice thick chords and read A♭ major and E major.',
   'A heroic chordal theme over a driving polonaise rhythm, with a middle section built on a repeating left-hand octave pattern.',
   'Octave endurance and voicing the top of each chord transfer to Liszt, Rachmaninoff and other large Romantic works.',
   'Play the left-hand octave pattern slowly with a loose wrist and stop before any tension. Add the right hand only when the octaves stay relaxed.',
   'Octaves stay even and relaxed, chord melodies ring on top and the main theme returns with power, not harshness.'),
 'tristesse': (6, 'A singing top melody with accompaniment in the same hand',
   'Read E major, bring out the top note of the right hand above inner notes and pedal legato.',
   'A slow, famous melody above inner-voice accompaniment, with an agitated middle section in double notes.',
   'Playing melody and accompaniment in one hand is core Chopin technique, also needed in the nocturnes.',
   'Play the right-hand melody alone with the fingering you will use, then add the inner notes very softly.',
   'The melody sings above everything, inner notes stay even and soft, and the middle section stays controlled.'),
 'winter-wind': (7, 'Fast right-hand figuration over a marching left hand',
   'Play long sixteenth-note passages fluently in A minor, with strong left-hand chords and leaps.',
   'Cascading right-hand sixteenths that sweep up and down the keyboard over a march-like left-hand theme.',
   'Endurance and evenness in long passagework, and grouping notes into hand positions, transfer to every virtuoso étude.',
   'Group the right-hand figure into hand positions and play each position as a block chord. Then play it slowly as written.',
   'The right hand stays even at a steady tempo, the left-hand theme is clear and you finish without tension.'),
 'etude-op10-4': (7, 'Fast sixteenth notes handed between the hands',
   'Play C♯-minor scales and arpeggios fluently, with sixteenth notes at speed in both hands.',
   'A torrent of sixteenth notes passed back and forth between the hands, punctuated by accented chords.',
   'Equal hands and smooth hand-overs transfer to all fast passagework.',
   'Practice each passage in dotted rhythms (long–short, then short–long) slowly, then evenly.',
   'Both hands sound equal, accents are clear and the tempo holds to the final chords.'),
 'nocturne-csharp': (5, 'A lyrical melody with free runs over a steady accompaniment',
   'Read C♯ minor, play left-hand broken chords evenly and fit groups of fast notes over them.',
   'A sorrowful melody over gentle left-hand chords, with quick ornamental runs and a contrasting middle section.',
   'Fitting free-sounding runs over a steady accompaniment prepares the other nocturnes and much Romantic melody.',
   'Count the left hand steadily. Fit each run so it arrives together with the next bass note.',
   'Runs fit inside the beat, the left hand never hurries and the melody sings.'),
 'nocturne-op9-1': (6, 'Long melodic phrases and flowing runs over wide arpeggios',
   'Read B♭ minor, play wide left-hand arpeggios with pedal and fit large groups of fast notes over a steady bass.',
   'A long, sighing melody with ornamental runs, and a calmer D♭-major middle section.',
   'Shaping long phrases over an even accompaniment transfers to every Chopin nocturne.',
   'Practice the left-hand arpeggios with pedal alone. Then fit each run by marking where it meets the bass.',
   'The left hand flows evenly, runs sound unhurried and each phrase has a clear shape.'),
 'nocturne-op48': (7, 'From a quiet chorale to stormy octaves',
   'Read C minor, voice wide chords and play octaves with a loose wrist.',
   'A grave melody, a chorale middle section that grows into stormy octave triplets, and an agitated return.',
   'Voicing chorale chords and building a long climax transfer to large Romantic works.',
   'Voice the chorale chords with the top note clear. Practice the octave triplets slowly in short groups.',
   'The chorale is calm and voiced, the octaves stay controlled and the return keeps its agitation without rushing.'),
 'waltz-csharp': (5, 'A waltz with a fast, flowing running section',
   'Read C♯ minor, keep a waltz bass and play fluent right-hand eighth notes.',
   'A melancholy waltz theme, a quick running section and a warmer D♭-major middle section.',
   'Waltz accompaniment and light running passages transfer to every Chopin waltz.',
   'Play the running section slowly in groups of three, with a light wrist. Add the waltz bass once it is even.',
   'The waltz lilts, the running section is even and light, and each return of the theme is calm.'),
}
pieces = [p for p in data['pieces'] if p['id'] not in G]
added = []
for id, (level, skill, pre, pattern, transfer, exercise, check) in G.items():
    if id not in built:
        continue
    pieces.append({'id': id, 'level': level, 'skill': skill, 'prerequisites': pre, 'pattern': pattern, 'transfer': transfer, 'exercise': exercise, 'check': check})
    added.append(id)
data['pieces'] = pieces
cur.write_text(prefix + 'window.PianoCurriculum=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('added', len(added), added)
