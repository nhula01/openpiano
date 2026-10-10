
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
  title = "Very Easy Piece No. 27"
  sourcepage = "scan page 9"
  tagline = ##f
}

global = { \key f \major \time 3/4 }

upper = { \clef treble a'2.-3 | a'2 a'4 | c''2.-5-> | a'2.-3 | f'2.-1 | g'2.-2 | a'2.-3 | R2. |
   a'2.-1 | a'2 a'4 | c''2.-3 | a'2.-1 | f''2.-5-> | b'!2.-1 | c''2.-2 | R2. |
   a'2.-3 | a'2 a'4 | c''2.-5-> | bes'2.-4 | bes'2. | a'2.-3 | g'2.-2 | R2. |
   a'2.-3 | a'2 a'4 | c''2.-5-> | bes'2.-4 | a'2-3 f'4-1 | g'-2 a' g' | f'2.-1 | R2. \bar "|." }

lower = { \clef bass \override Fingering.direction = #DOWN f4-5 a-3 c'-1 | f a c' | f a c' | f a c' | d-5 f-3 a-1 | e-5 g-3 c'-1 | f-5 a-3 c'-1 | f a c' |
   f a c' | f a c' | f a c' | f a c' | f-5 a-3 d'-1 | g-5 d'-2 f'-1 | e'-2 d'-3 c'-1 | bes!-2 a-3 g-4 |
   f-5 a-3 c'-1 | f a c' | fis-5 a-3 d'-1 | g-4 bes-2 d'-1 | e-5 g-3 c'-1 | f-5 a-3 c'-1 | e-5 g-3 c'-1 | bes-2 a-3 g-4 |
   f-5 a-3 c'-1 | f a c' | ees-4 f-3 a-1 | d-5 f-3 bes-1 | c-5 f-2 a-1 | c c' bes | a-3 c'-1 a-3 | f2.-5 }

\score {
  \unfoldRepeats \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 108 }
}
