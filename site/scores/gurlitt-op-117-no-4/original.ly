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
  title = "The First Lessons, No. 4"
  sourcepage = "scan page 2"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { \tempo "Con moto."
   \repeat volta 2 { e2-3\f d-2 | c-1 d-2 | e-3\< d-2 | c-1 d-2 | e-3 f-4\! | g-5\> f-4 | e-3 d-2 | }
   \alternative { { c-1 d-2\! } { c-1 b-2 } } | c-3 r \bar "|." }

lower = \relative c' { \override Fingering.direction = #DOWN
   \repeat volta 2 { c2-5 d-4 | e-3 d-4 | c-5 d-4 | e-3 d-4 | c-5 d-4 | e-3 f-2 | g-1 f-2 | }
   \alternative { { e-3 d-4 } { e-3 d-4 } } | \set fingeringOrientations = #'(down) <c-5 e-3> r }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 120 }
}
