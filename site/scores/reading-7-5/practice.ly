
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
\header { title = "First-reading miniature 7.5" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key aes \major \time 6/8 { ees''16\mf( des''16 ees''8 c''8 aes'8 g'8 aes'8 | aes'4. c''4. | aes''4. f''4. | ees''2.) | c''4\mf( des''8 c''4 aes'8 | aes'8 des''4 des''8 c''4 | bes'8 aes'4 g'4. | aes'2.) \bar "|." } } \new Staff = "lower" { \clef bass \key aes \major \time 6/8 { aes,8 ees8 aes8 ees8 aes8 ees8 | aes,8 ees8 aes8 ees8 aes8 ees8 | des8 aes8 des'8 aes8 des'8 aes8 | ees8 bes8 ees'8 bes8 ees'8 bes8 | f,8 c8 f8 c8 f8 c8 | des8 aes8 des'8 aes8 des'8 aes8 | ees8 bes8 ees'8 bes8 ees'8 bes8 | <aes, ees>2. \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
