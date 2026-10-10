
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
\header { title = "Village Dance" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 19 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key g \major \time 4/4 \tempo "Lively" 4 = 92 { g'4\mf b' d'' b' | a'4 c'' b' a' | g'4 a' b' g' | fis'2 a'2 \break | g'4 b' d'' b' | d''4 c'' b' a' | a'4 b' a' fis' | g'1 \break | b'4\f c'' d'' b' | a'4 c'' b' a' | g'4 b' a' fis' | g'1 \bar "|." } } \new Staff = "lower" { \clef bass \key g \major \time 4/4 { <g, d>2 <g, d> | d2 d | <g, d>2 <g, d> | d2 d | <g, d>2 <g, d> | <g, d>2 <g, d> | d2 d | <g, d>1 | <g, d>2 <g, d> | d2 d | <g, d>2 d | <g, d>1 \bar "|." } } >> \layout {} \midi { } }
