
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
\header { title="Twinkle, Twinkle · learning arrangement" composer="Traditional" subtitle="Simple two-hand arrangement by My Journey" maintainer="My Journey" copyright="CC0 1.0" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \relative c' { c4 c g' g | a a g2 | f4 f e e | d d c2 | g'4 g f f | e e d2 | g4 g f f | e e d2 | c4 c g' g | a a g2 | f4 f e e | d d c2 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 \relative c { c1 | f | c | g | c | g | c | g | c | f | c | c } } >> \layout {} \midi { \tempo 4=60 } }