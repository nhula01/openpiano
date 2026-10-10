\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Lantern Light" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 9 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Warmly" 4 = 76 { c'4\p d' e' d' | e'4 f' g'2 | g'4 f' e' d' | e'1 \break | c'4\mf d' e' d' | e'4 f' g' e' | d'4 e' d'2 | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c1 | c1 | c1 | c1 | c1 | c1 | g1 | c1 \bar "|." } } >> \layout {} \midi { } }
