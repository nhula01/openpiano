\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Sleepy Waltz" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 14 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 3/4 \tempo "Gently swaying" 4 = 92 { e'4\p f' g' | g'2. | d'4 e' f' | e'2. \break | c'4\mf d' e' | f'4 e' d' | e'2 d'4 | d'2. \break | e'4\p f' g' | g'2 e'4 | d'4 e' d' | c'2. \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 3/4 { c2. | c2. | g2. | c2. | c2. | d2. | c2. | g2. | c2. | c2. | g2. | c2. \bar "|." } } >> \layout {} \midi { } }
