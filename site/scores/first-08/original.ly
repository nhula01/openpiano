\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Raindrops" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 8 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Lightly" 4 = 76 { g'4\p r e' r | f'4 r d' r | e'4 d' c'2 | R1 \break | R1 | R1 | c'4\mf e' g'2 | R1 \break | e'4\p r g' r | f'4 r d' r | R1 | R1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { R1 | R1 | R1 | g4\p r e r | f4 r d r | e4 d c2 | R1 | g4\mf e c2 | R1 | R1 | e4\p f d2 | c1 \bar "|." } } >> \layout {} \midi { } }
