\version "2.24.4"
\header { title = "First-reading miniature 1.1" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 { c'2 d'2 | d'2 e'2 | e'2 d'2 | d'2 c'2 | c'2 e'2 | e'2 f'2 | f'2 e'2 | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c1 | c1 | c1 | g1 | g1 | c1 | g1 | c1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
