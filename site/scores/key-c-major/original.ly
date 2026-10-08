\version "2.24.4"
\header { title = "C major · scale fragments and cadence" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "Complete original eight-bar study" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 { c'4 d' e' f' | g' f' e' d' | c' e' g' e' | f' a' c' a' | g' b' d' b' | c' e' g' e' | d' b' c'2 | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { <c e g>1 | <c e g> | <c e g> | <f a c'> | <g b d' f'> | <c e g> | <g b d' f'> | <c e g> \bar "|." } } >> \layout {} \midi { \tempo 4=60 } }
