\version "2.24.4"
\header { title = "First-reading miniature 1.10" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 { c'4\p d'4 e'2 | g'4 f'4 e'4 e'4 | f'4 g'4 f'2 | d'4 e'4 d'2 | c'4\mf d'4 e'2 | g'4 f'4 e'4 e'4 | d'4 c'4 d'2 | e'4 d'4 c'2 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c1 | c1 | f1 | g1 | c1 | c1 | g1 | c1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
