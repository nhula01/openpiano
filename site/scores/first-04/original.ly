\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Bear in the Woods" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "First keys · piece 4 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Heavily" 4 = 80 { R1 | R1 | R1 | R1 \break | R1 | R1 | R1 | R1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c4\f c d d | e4 e d2 | e4 f g g | f4 e d2 | c4\p c d d | e4 f g2 | f4\mf e d d | c1 \bar "|." } } >> \layout {} \midi { } }
