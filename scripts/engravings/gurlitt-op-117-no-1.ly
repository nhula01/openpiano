\version "2.24.0"
% Engraved for OpenPiano from the public-domain scan named below; every note checked against it.
% Printed fingerings are copied from that edition. This engraving is dedicated to the public domain (CC0 1.0).
\header {
  composer = "Cornelius Gurlitt (1820–1901)"
  opus = "Op. 117"
  source = "The First Lessons (Die Anfangs-Stunden), Op. 117, Schirmer’s Library No. 324 (New York: G. Schirmer, 1895)"
  sourceurl = "https://imslp.org/wiki/Special:ImagefromIndex/400775"
  maintainer = "OpenPiano"
  license = "Public Domain (music and 1895 edition); engraving CC0 1.0"
  title = "The First Lessons, No. 1"
  sourcepage = "scan page 1"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { \tempo "Moderato." c2-1\p e-3 | d-2 g-5 | e-3 c-1 | d1-2 | c2-1 e-3 | d-2 g-5 | e-3 c-1 | d1-2 | f2-4( d-2 | e-3 c-1) | f-4( d-2 | e-3 c-1) | f-4( d-2 | e-3 c-1) | d-2 g-5 | c,1-1 \bar "|." }

lower = \relative c' { \override Fingering.direction = #DOWN c1-2 | b-3 | c-2 | g-5 | c-2 | b-3 | c-2 | g-5 | b-3( | c-2) | b-3( | c-2) | b-3( | c-2) | g-5( | c-2) }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 92 }
}
