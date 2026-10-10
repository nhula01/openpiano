\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Swaying Willow" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 17 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key f \major \time 4/4 \tempo "Flowing" 4 = 84 { f'4\mf g' a' c'' | bes'4 a' g'2 | a'4 bes' c'' a' | g'1 \break | c''4\f bes' a' g' | a'4 bes' c''2 | a'2\mf g'2 | f'1 \bar "|." } } \new Staff = "lower" { \clef bass \key f \major \time 4/4 { f,1 | bes,2 c2 | f,1 | c1 | a,2 c2 | f,2 a,2 | c1 | f,1 \bar "|." } } >> \layout {} \midi { } }
