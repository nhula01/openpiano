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
  title = "Exercise No. 25"
  sourcepage = "scan page 27"
  tagline = ##f
}

global = { \key c \major \time 3/4 }

upper = \relative c''' { g4-5( f-4 e-3 | e-3 d-2 c-1 | d e d | c d e | g)( f e | e d c | d e d | c2.) \repeat volta 2 { f4-4( g f | e d c | d e d | c d e | g-5)( f e | e-3 d c | d e d | c2.) } }

lower = \relative c' { \override Fingering.direction = #DOWN R2. | g'4-1( f-2 e-3 | f g f | e d c) | R2. | g'4( f e | f g f | e g c,) \repeat volta 2 { d4-4( e d | c d e | f g f | e d c) | R2. | g'4-1( f e | f g f | e g c,) } }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 104 }
}
