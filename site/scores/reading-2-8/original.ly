\version "2.24.4"
\header { title = "First-reading miniature 2.8" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key g \major \time 4/4 { d''4\p c''4 b'2 | d''2. b'4 | c''4 d''4 c''2 | a'4 g'4 a'2 | d''4\mf c''4 b'2 | d''2. b'4 | a'4 a'4 d''4 c''4 | b'4 a'4 g'2 \bar "|." } } \new Staff = "lower" { \clef bass \key g \major \time 4/4 { g,2 d2 | g,2 d2 | c2 g,2 | d2 a,2 | g,2 d2 | g,2 d2 | d1 | g,1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
