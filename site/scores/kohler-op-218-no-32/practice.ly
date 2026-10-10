
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
\version "2.24.0"
% Engraved for OpenPiano from the public-domain scan named below; every note checked against it.
% Printed fingerings are copied from that edition. This engraving is dedicated to the public domain (CC0 1.0).
\header {
  composer = "Louis Köhler (1820–1886)"
  opus = "Op. 218"
  source = "Kinder-Übungen und Melodien, Op. 218, Edition Peters (Leipzig, plate 7766), revised by Adolf Ruthardt (1849–1934)"
  sourceurl = "https://imslp.org/wiki/Special:ImagefromIndex/527252"
  maintainer = "OpenPiano"
  license = "Public Domain (music and Peters edition); engraving CC0 1.0"
  title = "Melody No. 32 (Waltz)"
  sourcepage = "scan page 14"
  tagline = ##f
}

global = { \key g \major \time 3/4 \partial 4}

upper = { \clef treble
   \repeat volta 2 { g'8-1( a'-2 | b'4-3-.) r g'8( a' | b'4-.) r g'8( a' | b'8-3 c''-1 d''-2 e''-3 d'' e'' | d''4-2-.) r b''-5->( | c''-1-.) r a''-5->( | b'-1-.) r g''-5-. |
     <g'-1 b'-4>2.( | <fis'-2 a'-3>4-.) r d''8-3( c'' | b'4-.) r g''8-4( fis'' | e''4-.) r c''8-3( b' | a'4-.) r d''8-4( c'' | b'4-.) r g'8-1( a') |
     b'8-3 c''-1 d''-2 e'' d'' e'' | d''8 e'' d'' c''-1 b'-3 a' | g'-1 a' b' c'' d''-5 b'-3 | g'4-1-. r }
   \repeat volta 2 { a'8-1( b' | c''4-.) r c''8-3( d'' | e''4-.) r d''8-4( c'' | b'8-2 c''-1 d''-2 e'' fis'' g'' | d''4-2-.) r a'8-1( b' | c''4-.) c''-3-. c''8-3( d'' | e''4-.) e''-. d''8-4( c''-3 |
     b'8-2 c''-1 d''-2 e'' fis'' g'' | d''4-2-.) r g''8-3( a'' | b''4-.) r g''8-4( fis'' | e''4-.) r c''8-3( d'' | e''4-.) r d''8-4( c'' | b'4-.) r g'8-1( a'-2) |
     b'8-3 c''-1 d''-2 e'' d'' e'' | d''8-2 e'' fis'' g'' fis'' e'' | d''8-2 e'' d''-2 c''-1 b'-3 a' | g'4-. r }
   }

lower = { \clef bass \override Fingering.direction = #DOWN
   \repeat volta 2 { r4 | g4-5 <b-3 d'-1> <b d'> | g <b d'> <b d'> | g <b d'> <b d'> | g <b d'> <b d'> | fis-5 <a-3 d'-1> <a d'> | g-5 <b d'> <b d'> |
     d-. d'-1( cis'-2 | d' c'!-2 a-4) | g-5_\markup { \italic legato } b-3 d' | g c'-2 e' | fis-5 a-4 d' | g-5 b-3 d' |
     g b d' | fis a-4 d' | g-5 r <g b d'>-. | <g b d'>-. r }
   \repeat volta 2 { r4 | fis-5 <a-3 d'-1> <a d'> | fis <a d'> <a d'> | g-5 <b-3 d'-1> <b d'> | g-5 <b-3 d'-1> <b d'> | fis <a d'> <a d'> | fis-5 <a-3 d'-1> <a d'> |
     g-5 <b-3 d'-1> <b d'> | g <b d'> <b d'> | g_\markup { \italic legato } b d' | g c'-2 e' | fis-5 a-4 d' | g-5 b-3 d' |
     g b d' | g b d' | fis a-4 d' | <g-5 b-3>-. r } }

\score {
  \unfoldRepeats \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 132 }
}
