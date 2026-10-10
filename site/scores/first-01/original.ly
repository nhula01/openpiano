\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Morning Bells" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 1 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Brightly" 4 = 88 { c'4\mf d' e' e' | d'4 c' d'2 | e'4 f' g' g' | f'4 e' d'2 \break | c'4\p d' e' e' | f'4 e' d' d' | e'4\mf d' e' d' | c'2 c'2 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 \bar "|." } } >> \layout {} \midi { } }
