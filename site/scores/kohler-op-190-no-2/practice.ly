
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
  composer = "Louis Köhler (1820–1886)"
  opus = "Op. 190"
  source = "Die allerleichtesten Übungsstücke, Op. 190 (Moscow: A. Gutheil, c. 1880, plate A. 1714 G.)"
  sourceurl = "https://imslp.org/wiki/Special:ImagefromIndex/105780"
  maintainer = "OpenPiano"
  license = "Public Domain (music and c. 1880 edition); engraving CC0 1.0"
  title = "Very Easy Piece No. 2"
  sourcepage = "scan page 3"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { c2-1 e-3 | f-4 d-2 | e-3 c-1 | d-2 g-5 | e-3 c-1 | d-2 f-4 | e-3 d-2 | c1-1 \bar "|." }

lower = \relative c' { \override Fingering.direction = #DOWN c2-5 e-3 | f-2 d-4 | e-3 c-5 | d-4 g-1 | e-3 c-5 | d-4 f-2 | e-3 d-4 | c1-5 }

\score {
  \unfoldRepeats \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 88 }
}
