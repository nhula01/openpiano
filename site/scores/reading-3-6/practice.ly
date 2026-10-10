
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
\header { title = "First-reading miniature 3.6" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key d \minor \time 4/4 { f'8\f( d'8 e'8 d'8 f'4 e'4 | f'4 g'4 f'2 | d'8 e'8 f'8 g'8 g'4 f'4 | e'4 d'8 e'8 a'2) | f'4\p( g'8 a'8 bes'8 d''8 cis''4 | d''8 e''8 d''4 g''4 f''4 | e''2. cis''4 | d''4 d''8 cis''8 d''2) \bar "|." } } \new Staff = "lower" { \clef bass \key d \minor \time 4/4 { d4 a4 f4 a4 | d4 a4 f4 a4 | g,4 d4 bes,4 d4 | a,4 e4 cis4 e4 | bes,4 f4 d4 f4 | g,4 d4 bes,4 d4 | a,4 e4 cis4 e4 | <d a>1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
