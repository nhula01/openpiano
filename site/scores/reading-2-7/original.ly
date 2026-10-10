\version "2.24.4"
\header { title = "First-reading miniature 2.7" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key f \major \time 4/4 { a'4\mf bes'4 c''4 a'4 | bes'4 f'4 f'2 | g'4 a'4 g'4 f'4 | g'1 | a'4\p bes'4 c''4 a'4 | bes'4 f'4 f'2 | g'4 a'4 g'2 | f'1 \bar "|." } } \new Staff = "lower" { \clef bass \key f \major \time 4/4 { f,2 c2 | bes,2 f,2 | c2 g,2 | c2 g,2 | f,2 c2 | bes,2 f,2 | c1 | f,1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
