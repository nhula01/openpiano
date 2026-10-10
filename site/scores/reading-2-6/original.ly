\version "2.24.4"
\header { title = "First-reading miniature 2.6" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key g \major \time 3/4 { d''4\mf b'2 | d''4 c''4 b'4 | c''4 g'2 | a'4 a'2 | d''4\p b'2 | d''4 c''4 b'4 | a'2. | g'2. \bar "|." } } \new Staff = "lower" { \clef bass \key g \major \time 3/4 { g,2 d4 | g,2 d4 | c2 g,4 | d2 a,4 | g,2 d4 | g,2 d4 | d2. | g,2. \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
