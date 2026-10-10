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
  title = "Child’s Song (Kinderlied), No. 38"
  sourcepage = "scan page 33"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { g2-1^\markup { \italic "non legato (nicht gebunden)" }_\markup { "(A, a, a, der Winter, der ist da)" } b-3 | d2.-5 c4 | b b a a | g2 r | d'4 d c c | b b a a | d d c c | b b a a | g2 b | d2. c4 | b b a a | g1 \bar "|." }

lower = \relative c' { \override Fingering.direction = #DOWN b4-3 g-5 d'-1 g, | b a b c | d g, c d | b d b g | b d a d | g, d' c d | b d a d | g, d' c d | b a g a | b c b a | g d' c d | b d g,2 }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 100 }
}
