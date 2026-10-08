
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

\version "2.24.3"
\header { title="Ode to Joy · theme arrangement" composer="Ludwig van Beethoven" subtitle="Simple two-hand arrangement by My Journey" maintainer="My Journey" copyright="CC0 1.0" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \relative c' { e4 e f g | g f e d | c c d e | e4. d8 d2 | e4 e f g | g f e d | c c d e | d4. c8 c2 | d4 d e c | d e8 f e4 c | d e8 f e4 d | c d g2 | e4 e f g | g f e d | c c d e | d4. c8 c2 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 \relative c { c1 | c | g | g | c | c | g | c | g | c | g | g | c | c | g | c } } >> \layout {} \midi { \tempo 4=60 } }