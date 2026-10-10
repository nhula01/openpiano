
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
% Converted to LilyPond 2.0 syntax by Chris Sawer, chris@sawer.uklinux.net
% in order to correct a mistake in bar 17

\version "2.24.4"
\header { title = "First-reading miniature 6.7" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key a \major \time 3/4 { cis''2\f( a'8. gis'16 | <cis' a'>4 b'8 a'16 gis'16 a'16 b'16 cis''8 | <gis' e''>2 d''8. cis''16 | <gis' b'>4 e''2) | <a' cis''>2( e'4 | fis'8 a'8 b'4 cis''4 | b'8 ais'8 b'8 cis''8 d''8 e''8 | cis''8 b'8 a'2) \bar "|." } } \new Staff = "lower" { \clef bass \key a \major \time 3/4 { a,8 e8 cis8 e8 cis8 e8 | a,8 e8 cis8 e8 cis8 e8 | e,8 b,8 gis,8 b,8 gis,8 b,8 | e,8 b,8 gis,8 b,8 gis,8 b,8 | a,8 e8 cis8 e8 cis8 e8 | d8 a8 fis8 a8 fis8 a8 | e,8 b,8 gis,8 b,8 gis,8 b,8 | <a, e>2. \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
