\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Hopscotch" composer = "OpenPiano" license = "CC0 1.0" maintainer = "OpenPiano" subtitle = "First keys · piece 18 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Playfully" 4 = 88 { c'4-.\mf g'-. c'-. g'-. | f'4( e' d'2) | d'4-. g'-. d'-. g'-. | e'4( f' g'2) \break | g'4-. c'-. f'-. c'-. | e'4( d' c' d') | g'4-.\p d'-. g'-. d'-. | e'2( d'2) \break | e'4(\mf f' g'2) | f'4( e' d'2) | c'4-. g'-. e'-. d'-. | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { c1 | f2 g2 | g1 | c1 | e2 f2 | c1 | g1 | c2 g2 | c1 | d1 | e2 g2 | c1 \bar "|." } } >> \layout {} \midi { } }
