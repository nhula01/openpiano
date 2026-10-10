\version "2.24.4"
#(set-global-staff-size 24)
\header { title = "Garden Conversation" composer = "My Journey" license = "CC0 1.0" maintainer = "My Journey" subtitle = "First keys · piece 7 of 20" }
\score { \new PianoStaff << \new Staff = "upper" { \clef treble \key c \major \time 4/4 \tempo "Chatting" 4 = 80 { c'4\mf e' r2 | d'4 f' r2 | e'4 g' r2 | f'4 e' d'2 \break | r2 g'4 e' | r2 f'4 d' | r2 e'4 d' | c'1 \bar "|." } } \new Staff = "lower" { \clef bass \key c \major \time 4/4 { r2 g4\p e | r2 f4 d | r2 e4 c | R1 | e4\mf g r2 | d4 f r2 | f4 g r2 | R1 \bar "|." } } >> \layout {} \midi { } }
