\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Walking Together" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "First keys · piece 11 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Steadily" 4 = 88 { e'4\mf f' g' e' | f'4 d' e' c' | d'4 e' f' d' | e'1 \break | e'4\f f' g'2 | f'4 e' d' f' | e'2\mf d'2 | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c2 e2 | d2 c2 | g2 f2 | e2 c2 | c2 e2 | d2 g2 | c2 g2 | c1 \bar "|." } } >> \layout {} \midi { } }
