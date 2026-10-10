\version "2.24.4"
\header { title = "First-reading miniature 2.5" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 3/4 { e'2.\p | f'4 g'4 f'4 | e'2. | d'4 g'2 | e'2.\mf | f'4 g'4 f'4 | d'4 e'4 d'4 | c'2. \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 3/4 { c2 g4 | f2 c4 | c2 g4 | g2 d4 | c2 g4 | f2 c4 | g2. | c2. \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
