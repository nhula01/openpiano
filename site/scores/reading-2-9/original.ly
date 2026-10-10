\version "2.24.4"
\header { title = "First-reading miniature 2.9" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 { g'2.\p f'4 | g'2 e'4 c'4 | f'2. e'4 | d'1 | g'2.\mf f'4 | g'2 e'4 c'4 | d'4 g'4 g'4 f'4 | e'4 d'4 c'2 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c2 g2 | c2 g2 | f2 c2 | g2 d2 | c2 g2 | c2 g2 | g1 | c1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
