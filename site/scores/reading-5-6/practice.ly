
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
\header { title = "First-reading miniature 5.6" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key fis \minor \time 2/4 { a'16\f( gis'16 fis'8 eis'4 | fis'8 a'8 gis'16 fis'16 gis'16 a'16 | b'16 cis''16 b'8 d''4 | cis''2) | a'8\mf( b'8 cis''16 b'16 a'16 gis'16 | fis'4 b4 | cis'4 gis'8 eis'8 | fis'2) \bar "|." } } \new Staff = "lower" { \clef bass \key fis \minor \time 2/4 { fis,8 cis8 a,8 cis8 | fis,8 cis8 a,8 cis8 | b,8 fis8 d8 fis8 | cis8 gis8 eis8 gis8 | d8 a8 fis8 a8 | b,8 fis8 d8 fis8 | cis8 gis8 eis8 gis8 | <fis, cis>2 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
