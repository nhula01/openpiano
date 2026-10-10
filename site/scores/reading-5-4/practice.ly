
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
\header { title = "First-reading miniature 5.4" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \minor \time 3/4 { ees'4\p( g'4. f'8 | ees'8 ees'8 c'8 d'8 ees'4 | c'2 d'8 ees'16 f'16 | g'8 aes'8 g'2) | c''8( c''8 b'16 c''16 d''16 c''16 b'8 c''8 | aes'4 g'8 aes'8 c''4 | b'4 c''16 d''16 ees''16 f''16 g''4 | ees''8 d''8 c''2) \bar "|." } } \new Staff = "lower" { \clef bass \key c \minor \time 3/4 { c8 g8 ees8 g8 ees8 g8 | aes,8 ees8 c8 ees8 c8 ees8 | f,8 c8 aes,8 c8 aes,8 c8 | g,8 d8 b,8 d8 b,8 d8 | c8 g8 ees8 g8 ees8 g8 | aes,8 ees8 c8 ees8 c8 ees8 | g,8 d8 b,8 d8 b,8 d8 | <c g>2. \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
