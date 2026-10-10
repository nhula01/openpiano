\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Hilltop Kite" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 12 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key g \major \time 4/4 \tempo "Breezy" 4 = 88 { g'4\mf a' b' g' | a'4 b' c''2 | b'4 a' g' fis' | a'1 \break | b'4\f c'' d'' b' | c''4 b' a' g' | fis'4\mf g' a' fis' | g'1 \bar "|." } } \new Staff = "lower" { \clef bass \key g \major \time 4/4 { R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 \bar "|." } } >> \layout {} \midi { } }
