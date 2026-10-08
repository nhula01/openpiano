
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
\header { title = "First-reading miniature 7.2" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key b \minor \time 4/4 { \tuplet 3/2 { d''8 cis'' b' } cis''4 \tuplet 3/2 { e''8 d'' cis'' } b'4 | \tuplet 3/2 { cis''8 b' cis'' } e''4 \tuplet 3/2 { d''8 cis'' b' } d''4 | \tuplet 3/2 { b'8 cis'' e'' } d''4 \tuplet 3/2 { cis''8 b' d'' } cis''4 | \tuplet 3/2 { cis''8 e'' d'' } cis''4 \tuplet 3/2 { b'8 d'' cis'' } b'4 | \tuplet 3/2 { e''8 d'' cis'' } b'4 \tuplet 3/2 { d''8 cis'' b' } cis''4 | \tuplet 3/2 { d''8 cis'' b' } d''4 \tuplet 3/2 { cis''8 b' cis'' } e''4 | \tuplet 3/2 { cis''8 b' d'' } cis''4 \tuplet 3/2 { b'8 cis'' e'' } d''4 | b'1 \bar "|." } } \new Staff = "lower" { \clef bass \key b \minor \time 4/4 { b4 d' fis' d' | b4 d' fis' d' | b4 d' fis' d' | fis'4 d' fis' d' | fis'4 d' fis' d' | b4 d' fis' d' | fis'4 d' fis' d' | b4 d' fis' d \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
