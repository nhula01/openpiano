\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Sunny Steps" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "First keys · piece 3 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Cheerfully" 4 = 92 { g'4\mf g' f' e' | f'4 f' e' d' | e'4 d' c' d' | e'1 \break | d'4\f e' f' g' | g'2 g'2 | f'4 e' f' g' | g'1 \break | g'4\mf g' f' e' | f'4 f' e' d' | e'2 d'2 | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 \bar "|." } } >> \layout {} \midi { } }
