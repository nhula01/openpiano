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
  title = "Exercise No. 13"
  sourcepage = "scan page 24"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { c1-1( | g'-5 | c, | g' | c, | g' | c,2 g' | c,1) \bar "|." }

lower = \relative c' { \set fingeringOrientations = #'(down) \override Fingering.direction = #DOWN c4-5( d-4 e-3 f-2 | g-1 f e d | c d e f | g f e d | c d e f | g f e d | e-3 g-1 e g | c,1) }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 96 }
}
