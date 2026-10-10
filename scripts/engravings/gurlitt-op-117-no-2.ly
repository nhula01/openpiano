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
  title = "The First Lessons, No. 2"
  sourcepage = "scan page 1"
  tagline = ##f
}

global = { \key c \major \time 4/4 }

upper = \relative c'' { \tempo "Moderato."
   \repeat volta 2 { c4-1\f e-3 g-5 e-3 | d-2 e-3 c-1 e-3 | c-1 e-3 g-5 e-3 | d-2 e-3 c-1 r }
   \repeat volta 2 { f-4\mf e-3 d-2 e-3 | f-4\< e-3 d-2 e-3 | f-4 e d e | f e d\! r | c-1\f e-3 g-5 e-3 | d-2 e-3 c-1 e-3 | c-1 e g e | d-2 e-3 c-1 r } }

lower = \relative c' { \override Fingering.direction = #DOWN
   \repeat volta 2 { c1-2 | b2-3( c4-2) r | c1-2 | b2-3( c4-2) r }
   \repeat volta 2 { d4-1 c-2 b-3 c-2 | d-1 c-2 b-3 c-2 | d-1 c b c | d c b r | c1-2 | b2-3( c4-2) r | c1-2 | b2-3( c4-2) r } }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 100 }
}
