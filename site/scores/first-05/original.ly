\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Evening Song" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 5 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Slowly" 4 = 76 { R1 | R1 | R1 | R1 \break | R1 | R1 | R1 | R1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { g2\p f2 | e2 d2 | e4 f g f | e1 | f4\mf g f e | d4 e f e | d4\p e d2 | c1 \bar "|." } } >> \layout {} \midi { } }
