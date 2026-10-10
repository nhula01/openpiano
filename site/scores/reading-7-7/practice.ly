
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
\header { title = "First-reading miniature 7.7" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key e \major \time 3/4 { b'4\mf( gis'4 fis'8 e'16 dis'16 | e'4 cis''4 a'4 | b'2 \tuplet 3/2 { a'8 gis'8 a'8 } | b'16 cis''16 dis''8 dis''2) | b'4\p( gis'4 fis'8 e'16 dis'16 | e'4 cis''4 a'4 | fis'4 dis'4 b'8 a'8 | b'16 cis''16 dis''8 e''2) \bar "|." } } \new Staff = "lower" { \clef bass \key e \major \time 3/4 { e,8 b,8 e8 b,8 gis,8 b,8 | a,8 e8 a8 e8 cis8 e8 | b,8 fis8 b8 fis8 dis8 fis8 | b,8 fis8 b8 fis8 dis8 fis8 | e,8 b,8 e8 b,8 gis,8 b,8 | a,8 e8 a8 e8 cis8 e8 | b,8 fis8 b8 fis8 dis8 fis8 | <e, b,>2. \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
