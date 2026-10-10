\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Over the Bridge" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "First keys · piece 16 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Smoothly" 4 = 84 { c'4\mf d' e' c' | R1 | d'4 e' f' e' | d'1 \break | R1 | R1 | e'4 d' c' r | R1 \break | e'4\f f' g' e' | f'4 e' f'2 | e'2 d'2 | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { R1 | b4\mf a b c' | R1 | R1 | c'4\p b a g | a4 b c'2 | r2. b4 | c'1 | c'1 | f1 | g1 | R1 \bar "|." } } >> \layout {} \midi { } }
