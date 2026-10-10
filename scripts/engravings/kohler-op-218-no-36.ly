\version "2.24.0"
% Engraved for OpenPiano from the public-domain scan named below; every note checked against it.
% Printed fingerings are copied from that edition. This engraving is dedicated to the public domain (CC0 1.0).
\header {
  composer = "Louis Köhler (1820–1886)"
  opus = "Op. 218"
  source = "Kinder-Übungen und Melodien, Op. 218, Edition Peters (Leipzig, plate 7766), revised by Adolf Ruthardt (1849–1934)"
  sourceurl = "https://imslp.org/wiki/Special:ImagefromIndex/527252"
  maintainer = "OpenPiano"
  license = "Public Domain (music and Peters edition); engraving CC0 1.0"
  title = "Melody No. 36 (Steirisch)"
  sourcepage = "scan pages 16–17"
  tagline = ##f
}

global = { \key f \major \time 3/4 }

upper = { \clef treble
   \repeat volta 2 { f'8-1( a'-2 c''-3 f''-5 e''-4 d''-3) | d''4-4->( <a'-1 c''-3>-.) <a' c''>-. | d'4-1->( <g'-3 bes'-5>-.) <g' bes'>-. | d'4-1->( <f'-3 a'-5>-.) <f' a'>-. |
     f'8-1( a'-2 c''-3 f'' e'' d''-3) | d''4-4->( <a'-1 c''-3>-.) <a' c''>-. | d'4->( <g'-3 bes'-5>-.) <g' bes'>-. }
   \alternative { { <f'-2 a'-4>2 r4 } { <f'-2 a'-4>2 r4 } }
   \repeat volta 2 { bes'8-2( f' d''-4 bes'-2 f''-5 d''-4 | c''4-3-.) <a'-1 c''-3>8( d'' <a' c''>4-.) | c'4-1-. <g'-3 bes'-5>8( d'-1 <g' bes'>4-.) | c'4-1-. <f'-3 a'-5>8( d'-1 <f' a'>4-.) |
     bes'8-2( f' d''-4 bes'-2 f''-5 d''-4 | c''4-3-.) <a'-1 c''-3>8( d'' <a' c''>4-.) }
   \alternative { { c'4-. <g'-3 bes'-5>8( d' <g' bes'>4-.) | <f'-2 a'-4>2 r4 } { <bes'-3 d''-5>4( d'-1-.) e'-2-. | f'2-> r4 } }
   \bar "|." }

lower = { \clef bass \override Fingering.direction = #DOWN
   \repeat volta 2 { f4-5( <a-3 c'-1> bes-2 | f-5 <a-3 c'-1>-.) <a c'>-. | e-5( c'-1-.) c'-. | f-5( c'-1-.) c'-. |
     f( <a-3 c'-1> bes-2 | f-5 <a-3 c'-1>-.) <a c'>-. | e-5( c'-1-.) <e c'>-. }
   \alternative { { f-1-. c-2 f,-5-. } { <f-4 c'-1>2 r4 } }
   \repeat volta 2 { f4-5( <bes-2 d'-1> <bes d'> | f-.) <a-3 c'-1>-. <a c'>-. | e-5-. c'-. c'-. | <f-5 a-3>-. c'-. c'-. |
     f( <bes-2 d'-1> <bes d'> | f-.) <a-3 c'-1>-. <a c'>-. }
   \alternative { { e-. c'-. c'-. | <f-4 c'>-. c-1 f,-5-. } { bes,-5-. r <c-5 bes-1>-. | <f-3 a-1>2-> r4 } } }

\score {
  \new PianoStaff <<
    \new Staff = "upper" { \global \upper }
    \new Staff = "lower" { \global \lower }
  >>
  \layout { }
  \midi { \tempo 4 = 108 }
}
