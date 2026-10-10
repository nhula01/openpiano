\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Echo Valley" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 6 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Calling out" 4 = 84 { c'4\mf e' g'2 | f'4 d' c'2 | R1 | R1 \break | e'4\mf g' f' d' | e'2 r2 | R1 | R1 \break | g'4\mf e' f' d' | e'4 d' c'2 | R1 | R1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { R1 | R1 | c4\p e g2 | f4 d c2 | R1 | R1 | e4\p g f d | e2 r2 | R1 | R1 | g4\p e f d | c1 \bar "|." } } >> \layout {} \midi { } }
