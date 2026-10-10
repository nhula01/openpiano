
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
\header { title = "First-reading miniature 4.6" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key b \minor \time 4/4 { fis''2.\f( e''8 d''8 | d''4. cis''8 d''4. d''8 | b'2. ais'8 b'8 | cis''4. b'8 ais'2) | b'4.\mf( g'8 d'4 e'8 fis'8 | g'4 e'8 g'8 b'4 g'8 e'8 | fis'4 ais'8 b'8 ais'4 cis''4 | b'8 d''8 cis''4 b'2) \bar "|." } } \new Staff = "lower" { \clef bass \key b \minor \time 4/4 { b,2 <d fis>2 | b,2 <d fis>2 | e,2 <g, b,>2 | fis,2 <ais, cis>2 | g,2 <b, d>2 | e,2 <g, b,>2 | fis,2 <ais, cis>2 | <b, fis>1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
