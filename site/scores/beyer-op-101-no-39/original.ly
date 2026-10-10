\version "2.24.0"
% Engraved for OpenPiano from the public-domain scan named below; every note checked against it.
% Printed fingerings are copied from that edition. This engraving is dedicated to the public domain (CC0 1.0).
\header {
  composer = "Ferdinand Beyer (1803–1863)"
  opus = "Op. 101"
  source = "Vorschule im Klavierspiel, Op. 101, Edition Peters No. 2721 (Leipzig, [1895]), revised by Adolf Ruthardt (1849–1934)"
  sourceurl = "https://imslp.org/wiki/Special:ImagefromIndex/81208"
  maintainer = "OpenPiano"
  license = "Public Domain (music and 1895 edition); engraving CC0 1.0"
  title = "Exercise No. 39"
  sourcepage = "scan page 33"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { b2-3( c | d c | b a | g1) | a2( g | a g | c-4 b | a4-2 d c a) | b2( c | d c | b a | g1) | a2( g | c b | a4-2 c-4 b-3 a-2 | g-1 b g2) \bar "|." }

lower = \relative c { \override Fingering.direction = #DOWN g'4-5 d'-1 a-4 d | b-3 d a d | g, d' c-2 d | b d b d | c d b d | c d b d | a d g, b | d1 | g,4 d' a d | b d a d | g, d' c d | b d b d | c d b d | a d g, b | c-2 a-4 d-1 c-2 | b-3 d g,2 }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 100 }
}
