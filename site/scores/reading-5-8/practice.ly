
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
\header { title = "First-reading miniature 5.8" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key ees \major \time 4/4 { bes'2\mf( g'8 ees'8 f'8 g'8 | ees'4 d'8 c'16 d'16 ees'4 bes'4 | bes'2 f'8 g'8 f'8 ees'8 | d'4 f'8 g'16 aes'16 bes'2) | g'4\f( f'8 g'8 bes'4 g'4 | aes'16 g'16 f'8 g'16 aes'16 bes'8 aes'4. g'8 | f'2 bes'8 aes'16 bes'16 c''8 bes'16 aes'16 | g'4. f'8 ees'2) \bar "|." } } \new Staff = "lower" { \clef bass \key ees \major \time 4/4 { ees8 bes8 g8 bes8 ees8 bes8 g8 bes8 | ees8 bes8 g8 bes8 ees8 bes8 g8 bes8 | bes,8 f8 d8 f8 bes,8 f8 d8 f8 | bes,8 f8 d8 f8 bes,8 f8 d8 f8 | ees8 bes8 g8 bes8 ees8 bes8 g8 bes8 | aes,8 ees8 c8 ees8 aes,8 ees8 c8 ees8 | bes,8 f8 d8 f8 bes,8 f8 d8 f8 | <ees bes>1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
