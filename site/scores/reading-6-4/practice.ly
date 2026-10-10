
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
\header { title = "First-reading miniature 6.4" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key fis \minor \time 3/4 { <fis' a'>4\mf( b'4. cis''8 | b'8 ais'8 b'2 | <eis' gis'>4 fis'4. gis'8 | eis'8 fis'8 gis'2) | <fis' a'>4\p( b'4. cis''8 | b'8 ais'8 b'2 | cis''16 b'16 ais'8 b'4 cis''8 b'8 | a'8 gis'8 fis'2) \bar "|." } } \new Staff = "lower" { \clef bass \key fis \minor \time 3/4 { fis,4 <a, cis>4 <a, cis>4 | b,4 <d fis>4 <d fis>4 | cis4 <eis gis>4 <eis gis>4 | cis4 <eis gis>4 <eis gis>4 | fis,4 <a, cis>4 <a, cis>4 | b,4 <d fis>4 <d fis>4 | cis4 <eis gis>4 <eis gis>4 | <fis, cis>2. \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
