
#(define practice-staffs (make-hash-table))
#(define (practice-hand context)
  (let* ((staff (ly:context-find context 'Staff))
         (score (ly:context-find context 'Score))
         (known (hashq-ref practice-staffs score '()))
         (entry (assq staff known)))
    (if entry (cdr entry)
      (let ((hand (if (even? (length known)) "right" "left")))
        (hashq-set! practice-staffs score (append known (list (cons staff hand))))
        hand))))

#(define (practice-engraver context)
  (let ((hand "right"))
  (make-engraver
    ((initialize engraver) (set! hand (practice-hand context)))
    (acknowledgers
      ((note-head-interface engraver grob source-engraver)
       (let* ((event (ly:grob-property grob 'cause))
              (p (ly:event-property event 'pitch #f))
              (m (ly:context-current-moment context))
              (staff (ly:context-find context 'Staff)))
         (if (ly:pitch? p)
             (ly:grob-set-property! grob 'output-attributes
               `((class . "score-note")
                 (data-staff . ,(if staff (ly:context-id staff) ""))
                 (data-hand . ,hand)
                 (data-midi . ,(number->string (+ 60 (ly:pitch-semitones p))))
                 (data-beat . ,(number->string (exact->inexact (* 4 (ly:moment-main m))))))))))
      ((finger-interface engraver grob source-engraver)
       (ly:grob-set-property! grob 'output-attributes '((class . "source-fingering"))))))))
\layout { \context { \Voice \consists #practice-engraver } }
\version "2.24.0"
% Engraved for OpenPiano from the public-domain scan named below; every note checked against it.
% Printed fingerings are copied from that edition. This engraving is dedicated to the public domain (CC0 1.0).
\header {
  composer = "Carl Czerny (1791–1857)"
  opus = "Op. 139"
  source = "100 Progressive Studies without Octaves, Op. 139, Vol. I, revised and fingered by Max Vogrich (1852–1916) (New York: G. Schirmer, 1893)"
  sourceurl = "https://imslp.org/wiki/Special:ImagefromIndex/81113"
  maintainer = "OpenPiano"
  license = "Public Domain (music and 1893 edition); engraving CC0 1.0"
  title = "Progressive Study No. 1"
  sourcepage = "scan page 1"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { \tempo "Moderato."
   \repeat volta 2 { e2-3( f-4 | g-5 <c, e>-2-4) | <b d>4-1-3-. <b d>-1-3( <c e>-2-4 <d f>-3-5) | <d f>2-3-5( <c e>-2-4) |
     e2-3( f-4 | g-5 <c, e>-2-4) | <b d>4-1-3( <c e>-2-4 <d f>-3-5 <b d>-1-3) | c4-2( e-4 c-2) r }
   \repeat volta 2 { <b d>2-1-3 <b d> | <c e>-2-4 <c e>-1-3 | <d fis>-2-4 <d fis>-1-3 | <b g'>4-1-4( a'-5 f!-3 g-4 |
     e2-2) f-3( | g-5 <c, e>-2-4) | <b d>4-1-3( <c e> <d f> <b d>) | c4( e c) r } }

lower = \relative c' { \override Fingering.direction = #DOWN \set fingeringOrientations = #'(down)
   \repeat volta 2 { c4-5( g'-1 d-4 g-1 | e-3 g-1 c,-5 g'-1) | g,-5 g'-1 g-1 g-1 | b,-5 g'-1 c,-4 g'-1 |
     c,-5( g'-1 d-4 g-1 | e-3 g-1 c,-5 g'-1) | g,-5 g'-1 g-1 f-2 | <c-5 e-3>( g'-1 <c, e>-5-3) r }
   \repeat volta 2 { g-5 g'-1 g-1 g-1 | c,-5 g'-1 g-1 g-1 | d-5 c'-1 c-1 c-1 | <g-4 b-2>2 r |
     c,4-5( g' d g | e g c, g') | g,-5 g' g f | <c-5 e-3>( g' <c, e>) r } }

\score {
  \unfoldRepeats \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 100 }
}
