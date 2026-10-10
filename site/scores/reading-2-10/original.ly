\version "2.24.4"
\header { title = "First-reading miniature 2.10" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key f \major \time 3/4 { f'4\mf a'2 | bes'4 c''4 bes'4 | a'4 a'2 | c''2. | f'4\p a'2 | bes'4 c''4 bes'4 | g'4 g'2 | f'2. \bar "|." } } \new Staff = "lower" { \clef bass \key f \major \time 3/4 { f,2 c4 | bes,2 f,4 | f,2 c4 | c2 g,4 | f,2 c4 | bes,2 f,4 | c2. | f,2. \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
