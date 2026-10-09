\version "2.24.0"
\header { title = "Tie Accidental" composer = "Tester" tagline = ##f }
\score { \new PianoStaff << \new Staff \relative c'' { \key c \major \time 4/4 c4 d e fis~ | fis2 g2 | a1 \bar "|." }
 \new Staff \relative c { \clef bass c1 | c1 | c1 } >> \layout {} }
