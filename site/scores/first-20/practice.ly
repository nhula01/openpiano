
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
#(set-global-staff-size 24)
\header { title = "Graduation March" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "First keys · piece 20 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Proudly" 4 = 88 { c'4\mf e'8 f' g'4 e' | d'4 f'8 e' d'2 | e'4 g'8 f' e'4 c' | d'8 e' f' e' d'2 \break | e'4\f e'8 f' g'4 e' | f'4 f'8 e' d'4 f' | e'8 f' g' f' e'4 c' | d'4 e'8 f' g'2 \break | c'4\mf e'8 f' g'4 e' | d'4 f'8 e' d'4 g' | e'8 d' c' d' e'4 d' | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c2 e2 | g1 | c2 e2 | g1 | c2 e2 | d2 g2 | c2 e2 | g1 | e2 c2 | g1 | c2 g2 | c1 \bar "|." } } >> \layout {} \midi { } }
