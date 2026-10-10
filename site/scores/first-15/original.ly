\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Carousel" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 15 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key g \major \time 3/4 \tempo "Merrily" 4 = 96 { g'4\mf b' d'' | d''2. | c''4 b' a' | b'2. \break | a'4 b' c'' | b'4 a' g' | a'2 b'4 | a'2. \break | g'4\f b' d'' | d''2 c''4 | a'4 b' a' | g'2. \bar "|." } } \new Staff = "lower" { \clef bass \key g \major \time 3/4 { g,2. | g,2. | c2. | g,2. | d2. | g,2. | d2. | d2. | g,2. | g,2. | d2. | g,2. \bar "|." } } >> \layout {} \midi { } }
