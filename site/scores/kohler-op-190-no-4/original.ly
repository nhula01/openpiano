\version "2.24.0"
% Engraved for OpenPiano from the public-domain scan named below; every note checked against it.
% Printed fingerings are copied from that edition. This engraving is dedicated to the public domain (CC0 1.0).
\header {
  composer = "Louis Köhler (1820–1886)"
  opus = "Op. 190"
  source = "Die allerleichtesten Übungsstücke, Op. 190 (Moscow: A. Gutheil, c. 1880, plate A. 1714 G.)"
  sourceurl = "https://imslp.org/wiki/Special:ImagefromIndex/105780"
  maintainer = "OpenPiano"
  license = "Public Domain (music and c. 1880 edition); engraving CC0 1.0"
  title = "Very Easy Piece No. 4"
  sourcepage = "scan page 3"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { e4-3 c-1 d2-2 | f4-4 d-2 e2-3 | c4-1 e-3 g-5 f-4 | e2-3 d-2 | e4-3 c-1 d2-2 | f4-4 d-2 e2-3 | g4-5 e-3 c-1 e-3 | d2-2 c-1 \bar "|." }

lower = \relative c' { \override Fingering.direction = #DOWN e4-3 c-5 d2-4 | f4-2 d-4 e2-3 | c4-5 e-3 g-1 f-2 | e2-3 d-4 | e4-3 c-5 d2-4 | f4-2 d-4 e2-3 | g4-1 e-3 c-5 e-3 | d2-4 c-5 }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 92 }
}
