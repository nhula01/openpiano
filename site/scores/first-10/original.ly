\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Quiet Pond" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "First keys · piece 10 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Calmly" 4 = 80 { e'4\p f' g'2 | g'4 f' e' d' | e'4 d' c' e' | d'1 \break | e'4\mf f' g'2 | g'4 f' e' c' | d'4\p e' d'2 | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c2 e2 | c2 g2 | c2 e2 | g2 g2 | c2 e2 | c2 g2 | g2 g2 | c1 \bar "|." } } >> \layout {} \midi { } }
