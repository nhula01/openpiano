\version "2.24.4"
\header { title = "First-reading miniature 2.2" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key g \major \time 4/4 { b'4 a' g' a' | a'4 g' a' c'' | g'4 a' c'' b' | a'4 c'' b' a' | c''4 b' a' g' | b'4 a' g' b' | a'4 g' b' a' | g'1 \bar "|." } } \new Staff = "lower" { \clef bass \key g \major \time 4/4 { g1 | g1 | g1 | d'1 | d'1 | g1 | d'1 | g1 \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
