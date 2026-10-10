
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

\paper {
    obsolete-page-top-space = #0.0  top-system-spacing.basic-distance = #(/ obsolete-page-top-space staff-space)
    %indent = 0.0
    line-width = 18.0\cm
    ragged-bottom = ##f
    ragged-last-bottom = ##f
}

% #(set-default-paper-size "a4")

#(set-global-staff-size 19)

\header {
        title = "Praeludium Nr. 4"
        subtitle = "\"Sechs kleine Präludien\""
        piece = "Bwv 936"
        mutopiatitle = "Praeludium Nr. 4"
        composer = "Johann Sebastian Bach (165-1750)"
        mutopiacomposer = "BachJS"
        opus = "BWV 936"
        date = "1717-1723?"
        mutopiainstrument = "Clavier"
        style = "Baroque"
        source = "Bach-Gesellschaft Edition Band 36 / Ernst Naumann 1890"
        copyright = "Creative Commons Attribution-ShareAlike 3.0"
        maintainer = "Hajo Dezelski"
		maintainerWeb = "http://www.roxele.de/"
        maintainerEmail = "dl1sdz (at) gmail.com"
 footer = "Mutopia-2008/10/29-1576"
 tagline = \markup { \override #'(box-padding . 1.0) \override #'(baseline-skip . 2.7) \box \center-column { \small \line { Sheet music from \with-url "http://www.MutopiaProject.org" \line { \teeny www. \hspace #-1.0 MutopiaProject \hspace #-1.0 \teeny .org \hspace #0.5 } • \hspace #0.5 \italic Free to download, with the \italic freedom to distribute, modify and perform. } \line { \small \line { Typeset using \with-url "http://www.LilyPond.org" \line { \teeny www. \hspace #-1.0 LilyPond \hspace #-1.0 \teeny .org } by \maintainer \hspace #-1.0 . \hspace #0.5 Copyright © 2008. \hspace #0.5 Reference: \footer } } \line { \teeny \line { Licensed under the Creative Commons Attribution-ShareAlike 3.0 (Unported) License, for details see: \hspace #-0.5 \with-url "http://creativecommons.org/licenses/by-sa/3.0" http://creativecommons.org/licenses/by-sa/3.0 } } } }
	}

     sopranoOne =   \relative a' {
		 \repeat volta 2 { 
			  a4 d ~ | % 1
			  d8 [ cis16 d ] e8 [ g, ] | % 2
			  g8 [ fis ] r8 d'8 | % 3
			  fis,8 [ e ] r8 cis'8 | % 4
			  e,8 [ d ] r8 b'8 | % 5
			  d,8 [ cis ] r8 a'8 | % 6
			  b,8 [ cis ] d4 ~ | % 7
			  d8 [ cis16 d ] e [ d cis d ] | % 8
			  e16 [ d cis b ] a [ g fis e ] | % 9
			  fis8 fis'16 [ g ] a [ g fis g ] | % 10
			  a16 [ g fis e ] d [ c b a ] | % 11
			  b16 [ d e fis ] g [ b cis d ] | % 12
			  e16 [ g, fis e ] fis [ e' d cis ] | % 13
			  d16 [ fis, gis a ] gis [ d' cis b ] | % 14
			  cis16 [ a b cis ] d, [ cis' b a ] | % 15
			  gis16 [ e fis gis ] a [ b cis d ] | % 16
			  e4 a ~ | % 17
			  a8 [ gis16 a ] b8 [ d, ] | % 18
			  cis8 [ e ] d16 [ cis b a ] | % 19
			  a2 | % 20

		 }
		 \repeat volta 2 {
			  a4 e' ~ | % 21
			  e8 [ fis16 g ] a [ g fis e ] | % 22
			  fis2 ~ | % 23
			  fis2 | % 24
			  g4 fis ~| % 25
			  fis8 [ e16 dis ] e4 ~ | % 26
			  e8 [ a16 b ] a [ g fis e ] | % 27
			  e8 dis4 e16 [ fis ] | % 28
			  g8 [ fis16 g ] a [ g fis a ] | % 29
			  g16 [ fis e g ] fis [ e dis fis ] | % 30
			  e2 ~ | % 31
			  e2 ~ | % 32
			  e8 fis4 e8 ~ | % 33
			  e8 [ dis e g ] | % 34
			  a,16 [ g' fis a ] g [ fis e dis ] | % 35
			  e4. r8 | % 36
			  b'4 s4 | % 37
			  e,2 ~ | % 38
			  e4 g ~ | % 39
			  g8 [ fis16 e ] fis16 [ a g b ]| % 40
			  a16 [ c, b a ] b [ a' g fis ] | % 41
			  g16 [ b, cis d ] cis [ g' fis e ] | % 42
			  fis16 [ d e fis ] g, [ fis' e d ] | % 43
			  cis16 [ a b cis ] d [ e fis g ]| % 44
			  a4 d ~ | % 45
			  d8 [ cis16 d ] e8 [ g, ] | % 46
			  fis8 [ a ] g16 fis e d ] | % 47
			  d2 | % 48h
		 }
	 }

	 sopranoTwo =   \relative f' {
		 \repeat volta 2 { 
			  fis2 | % 1
			  e2 ~| % 2
			  e4 d ~ | % 3
			  d4 cis ~| % 4
			  cis4 b ~ | % 5
			  b4 a ~ | % 6
			  a4 gis | % 7
			  a2 ~ | % 8
			  a8 s4. | % 9
			  s2 | % 10
			  s2 | % 11
			  s2 | % 12
			  s2 | % 13
			  s2 | % 14
			  s2 | % 15
			  s2 | % 16
			  cis'2 | % 17
			  b2 ~ | % 18
			  b8 a4 gis8 | % 19
			  r16 e16 [ cis8 ] ~ cis4 | % 20
		 }
		 \repeat volta 2 {
			  r2 | % 21
			  r2| % 22
			  d4 a' ~ | % 23
			  a8 [ b16 c ] d [ c b a ] | % 24
			  b4 a | % 25
			  g4. a16 [ b ] | % 26
			  c2 ~ | % 27
			  c4 b ~ | % 28
			  b2 ~| % 29
			  b2 ~ | % 30
			  b8 [ b16 c ] d [ c b d ] | % 31
			  c16 [ b a c ] b [ a gis b ] | % 32
			  a4 g | % 33
			  fis4 e8 r8 | % 34
			  r4 r8 a,8 ~ | % 35
			  a16 [ g fis a ] g8 r8 | % 36
			  s4 d''4 ~ | % 37
			  d8 [ cis16 b ] cis [ a gis b ] | % 38
			  a2 ~ | % 39
			  a4 r4 | % 40
			  s2 | % 41
			  s2 | % 42
			  s2 | % 43
			  s2 | % 44
			  fis'2 | % 45
			  e2 ~ | % 46
			  e8 d4 cis8 | % 47
			  r16 a16 [ fis8 ] ~ fis4 | % 48

		 } 
	 }

  soprano = << \sopranoOne \\ \sopranoTwo>>

%%
%% Bass Clef
%% 

bass = \relative d {
		 \repeat volta 2 { 
			  d8 [ e fis g ] | % 1
			  a8 [ b cis a ] | % 2
			  d8 [ cis b a ] | % 3
			  g8 [ e a g ] | % 4
			  fis8 [ b gis e ] | % 5
			  a8 [ gis fis e ] | % 6
			  d8 [ cis b e ] | % 7
			  a,8 [ b cis b ] | % 8
			  a8 [ b cis a ] | % 9
			  d8 [ e fis e ] | % 10
			  d8 [ e fis d ] | % 11
			  g8 [ fis e d ] | % 12
			  cis8 [ b ais fis ] | % 13
			  b8 [ e, e' gis ] | % 14
			  a8 [ gis fis d ] | % 15
			  e8 [ d cis b ] | % 16
			  a8 [ b cis d ] | % 17
			  e8 [ fis gis e ] | % 18
			  a8 [ cis, d e ] | % 19
			  a,8. [ e'16 ] a4 | % 20

		 }
		 \repeat volta 2 {
			  a8 [ b a g ] | % 21
			  fis8 [ e fis a ]| % 22
			  d,8 [ e d c ] | % 23
			  b8 [ a b d ] | % 24
			  g,8 [ g' a b ] | % 25
			  c8 [ c, c' b ] | % 26
			  a8 [ fis g a ] | % 27
			  b8 [ a g fis ] | % 28
			  e8 [ e' b dis ] | % 29
			  e8 [ g, a fis ] | % 30
			  g8 [ e' gis, e' ] | % 31
			  a,8 [ c d b ] | % 32
			  c16 [ b a c ] b [ a g b ] | % 33
			  a16 [ g fis a ] g [ fis e d ] | % 34
			  c16 [ b a c ] b4 | % 35
			  e4 ~ e16 [ dis e fis ] | % 36
			  gis8 [ b gis e ] | % 37
			  a8 a,4 b8 | % 38
			  cis8 [ e cis a ] | % 39
			  d8 d,4 e'8 | % 40
			  fis8 [ e dis b ] | % 41
			  e8 [ a, a' cis ] | % 42
			  d8 [ cis b g ] | % 43
			  a8 [ g fis e ] | % 44
			  d8 [ e fis g ] | % 45
			  a8 [ b cis a ] | % 46
			  d8 [ fis, g a ] | % 47
			  d,8. [ a'16 ] d4 | % 48

		 }

}


%% Merge score - Piano staff

\score {
    \unfoldRepeats \context PianoStaff <<
        \set PianoStaff.instrumentName = "Clavier  "
        \set PianoStaff.midiInstrument = "harpsichord"
        \new Staff = "upper" { \clef "treble" \key d \major \time 2/4 \soprano  }
        \new Staff = "lower"  { \clef "bass" \key d \major \time 2/4 \bass }
    >>
    \layout{  }
    \midi { }

}
