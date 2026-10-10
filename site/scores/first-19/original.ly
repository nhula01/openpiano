\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Village Dance" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "First keys · piece 19 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key g \major \time 4/4 \tempo "Lively" 4 = 92 { g'4\mf b' d'' b' | a'4 c'' b' a' | g'4 a' b' g' | fis'2 a'2 \break | g'4 b' d'' b' | d''4 c'' b' a' | a'4 b' a' fis' | g'1 \break | b'4\f c'' d'' b' | a'4 c'' b' a' | g'4 b' a' fis' | g'1 \bar "|." } } \new Staff = "lower" { \clef bass \key g \major \time 4/4 { <g, d>2 <g, d> | d2 d | <g, d>2 <g, d> | d2 d | <g, d>2 <g, d> | <g, d>2 <g, d> | d2 d | <g, d>1 | <g, d>2 <g, d> | d2 d | <g, d>2 d | <g, d>1 \bar "|." } } >> \layout {} \midi { } }
