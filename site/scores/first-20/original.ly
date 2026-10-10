\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Graduation March" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 20 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Proudly" 4 = 88 { c'4\mf e'8 f' g'4 e' | d'4 f'8 e' d'2 | e'4 g'8 f' e'4 c' | d'8 e' f' e' d'2 \break | e'4\f e'8 f' g'4 e' | f'4 f'8 e' d'4 f' | e'8 f' g' f' e'4 c' | d'4 e'8 f' g'2 \break | c'4\mf e'8 f' g'4 e' | d'4 f'8 e' d'4 g' | e'8 d' c' d' e'4 d' | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c2 e2 | g1 | c2 e2 | g1 | c2 e2 | d2 g2 | c2 e2 | g1 | e2 c2 | g1 | c2 g2 | c1 \bar "|." } } >> \layout {} \midi { } }
