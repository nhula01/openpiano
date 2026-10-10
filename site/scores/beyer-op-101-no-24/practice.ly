
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
  composer = "Ferdinand Beyer (1803–1863)"
  opus = "Op. 101"
  source = "Vorschule im Klavierspiel, Op. 101, Edition Peters No. 2721 (Leipzig, [1895]), revised by Adolf Ruthardt (1849–1934)"
  sourceurl = "https://imslp.org/wiki/Special:ImagefromIndex/81208"
  maintainer = "OpenPiano"
  license = "Public Domain (music and 1895 edition); engraving CC0 1.0"
  title = "Child’s Song (Kinderlied), No. 24"
  sourcepage = "scan page 27"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c''' { g2-5(_\markup { "(Summ, summ, summ, Bienchen summ herum)" } f | e1) | d4( e f d | c1) | e4( f g e | d e f d) | e( f g e | d e f d) | g2( f | e1) | d4( e f d | c1) \bar "|." }

lower = \relative c' { \override Fingering.direction = #DOWN e4-3_\markup { \italic legato } c-5 d g | c, d e c | f e d f | e f g e | c d e g | f e d f | c d e g | f e d f | e c d g | c, d e c | f e d f | e d c2 }

\score {
  \unfoldRepeats \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 96 }
}
