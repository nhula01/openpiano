\version "2.24.4"
\header { title = "First-reading miniature 1.7" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 { c'2\p e'4 g'4 | f'4 e'4 f'2 | g'4 f'4 e'4 c'4 | d'4 e'4 d'2 | c'2\mf e'4 g'4 | f'4 e'4 f'2 | d'4 e'4 d'4 d'4 | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c1 | f1 | c1 | g1 | c1 | f1 | g1 | c1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
