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
  title = "Exercise No. 15"
  sourcepage = "scan page 24"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { c4( d e f | g f e d | c d e f | e2 d) | c4( d e f | g f e d | c d e f | e d c2) \bar ".|:" \repeat volta 2 { d4( e f e | d1) | e4( f g f | e2.) d4( | c d e f | g f e d | c d e f | e d c2) } }

lower = \relative c' { c1( | g' | c, | g'4-.)( g-. g-.) g( | c,1 | g' | c,2. f4 | g2 c,) \repeat volta 2 { g'1 | g4( f e d | c1) | c4 g'-1 e-3 g-1 | c,1( | g' | c,2. f4 | g2 c,) } }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 96 }
}
