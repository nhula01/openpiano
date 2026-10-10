\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Little Boat" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 2 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Gently rocking" 4 = 80 { e'4\p f' g'2 | f'4 e' d'2 | e'4 f' g' f' | e'1 \break | d'4\mf e' f'2 | e'4 d' c'2 | d'4\p e' d'2 | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { R1 | R1 | R1 | R1 | R1 | R1 | R1 | R1 \bar "|." } } >> \layout {} \midi { } }
