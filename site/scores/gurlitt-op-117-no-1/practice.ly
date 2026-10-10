
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
  composer = "Cornelius Gurlitt (1820–1901)"
  opus = "Op. 117"
  source = "The First Lessons (Die Anfangs-Stunden), Op. 117, Schirmer’s Library No. 324 (New York: G. Schirmer, 1895)"
  sourceurl = "https://imslp.org/wiki/Special:ImagefromIndex/400775"
  maintainer = "OpenPiano"
  license = "Public Domain (music and 1895 edition); engraving CC0 1.0"
  title = "The First Lessons, No. 1"
  sourcepage = "scan page 1"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { \tempo "Moderato." c2-1\p e-3 | d-2 g-5 | e-3 c-1 | d1-2 | c2-1 e-3 | d-2 g-5 | e-3 c-1 | d1-2 | f2-4( d-2 | e-3 c-1) | f-4( d-2 | e-3 c-1) | f-4( d-2 | e-3 c-1) | d-2 g-5 | c,1-1 \bar "|." }

lower = \relative c' { \override Fingering.direction = #DOWN c1-2 | b-3 | c-2 | g-5 | c-2 | b-3 | c-2 | g-5 | b-3( | c-2) | b-3( | c-2) | b-3( | c-2) | g-5( | c-2) }

\score {
  \unfoldRepeats \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 92 }
}
