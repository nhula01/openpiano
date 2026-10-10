
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
\header { title = "First-reading miniature 7.6" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key cis \minor \time 4/4 { cis'4\f( \tuplet 3/2 { dis'8 e'8 dis'8 } cis'8 e'8 fis'8 gis'8 | e''4 dis''4 cis''4. e''8 | fis''8 cis''8 dis''4 cis''4. a'8 | \tuplet 3/2 { gis'8 fis'8 e'8 } fis'4 gis'2) | a'4\p( gis'8 fis'16 gis'16 a'8 gis'8 fis'8 e'16 dis'16 | cis'8 dis'8 e'8 dis'8 cis'8 bis8 cis'8 fis'8 | dis'8 cis'8 bis8 cis'8 \tuplet 3/2 { dis'8 e'8 fis'8 } gis'4 | e'4. dis'8 cis'2) \bar "|." } } \new Staff = "lower" { \clef bass \key cis \minor \time 4/4 { cis8 gis8 cis'8 gis8 cis8 gis8 cis'8 gis8 | cis8 gis8 cis'8 gis8 cis8 gis8 cis'8 gis8 | fis,8 cis8 fis8 cis8 fis,8 cis8 fis8 cis8 | gis,8 dis8 gis8 dis8 gis,8 dis8 gis8 dis8 | a,8 e8 a8 e8 a,8 e8 a8 e8 | fis,8 cis8 fis8 cis8 fis,8 cis8 fis8 cis8 | gis,8 dis8 gis8 dis8 gis,8 dis8 gis8 dis8 | <cis gis>1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
