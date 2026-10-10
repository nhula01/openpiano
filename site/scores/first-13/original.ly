\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Country Road" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "First keys · piece 13 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key g \major \time 4/4 \tempo "Easygoing" 4 = 84 { d''4\mf c'' b' g' | a'4 b' a'2 | b'4 c'' d'' b' | a'1 \break | g'4\p a' b' g' | c''4 b' a' g' | a'2 fis'2 | g'1 \bar "|." } } \new Staff = "lower" { \clef bass \key g \major \time 4/4 { g,1 | d1 | g,1 | d1 | g,2 b,2 | c2 d2 | d1 | g,1 \bar "|." } } >> \layout {} \midi { } }
