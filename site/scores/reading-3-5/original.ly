\version "2.24.4"
\header { title = "First-reading miniature 3.5" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key f \major \time 2/4 { f'2\mf( | a'4 c''8 a'8 | bes'2 | c''2) | a'2\mf( | bes'8 c''8 bes'4 | g'8 f'8 g'8 e'8 | f'2) \bar "|." } } \new Staff = "lower" { \clef bass \key f \major \time 2/4 { f,4 c4 | f,4 c4 | bes,4 f4 | c4 g4 | d4 a4 | bes,4 f4 | c4 g4 | <f, c>2 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
