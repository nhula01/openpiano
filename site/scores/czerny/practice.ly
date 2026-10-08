
#(define practice-staffs (make-hash-table))
#(define (practice-hand context)
  (let* ((staff (ly:context-find context 'Staff))
         (score (ly:context-find context 'Score))
         (known (hashq-ref practice-staffs score '()))
         (entry (assq staff known)))
    (if entry (cdr entry)
      (let ((hand (if (even? (length known)) "right" "left")))
        (hashq-set! practice-staffs score (append known (list (cons staff hand))))
        hand))))

#(define (practice-engraver context)
  (let ((hand "right"))
  (make-engraver
    ((initialize engraver) (set! hand (practice-hand context)))
    (acknowledgers
      ((note-head-interface engraver grob source-engraver)
       (let* ((event (ly:grob-property grob 'cause))
              (p (ly:event-property event 'pitch #f))
              (m (ly:context-current-moment context))
              (staff (ly:context-find context 'Staff)))
         (if (ly:pitch? p)
             (ly:grob-set-property! grob 'output-attributes
               `((class . "score-note")
                 (data-staff . ,(if staff (ly:context-id staff) ""))
                 (data-hand . ,hand)
                 (data-midi . ,(number->string (+ 60 (ly:pitch-semitones p))))
                 (data-beat . ,(number->string (exact->inexact (* 4 (ly:moment-main m))))))))))
      ((finger-interface engraver grob source-engraver)
       (ly:grob-set-property! grob 'output-attributes '((class . "source-fingering"))))))))
\layout { \context { \Voice \consists #practice-engraver } }
\version "2.24.0"

\header {
    composer	      =	"Czerny, C."
    mutopiacomposer   = "CzernyC"

    title	        =	"160 Eight-Measure Exercises"
    mutopiatitle        = 	"160 Eight-Measure Exercises, No. 1"

    opus	        =	"Op. 821"
    mutopiaopus         = 	"Op. 821, No. 1"
    
    source        	=	"IMLSP; Leipzig: Edition Peters, n.d.[1888]. Plate 6990-6993."
    style         	=	"Technique"
    license       	=	"Public Domain"
    maintainer	        =	"Manuel Castejon Limas"
    maintainerWeb       =	"https://github.com/mcasl/Czerny"
    mutopiainstrument   = "Piano"

 footer = "Mutopia-2015/11/06-2060"
 copyright =  \markup { \override #'(baseline-skip . 0 ) \right-column { \sans \bold \with-url "http://www.MutopiaProject.org" { \abs-fontsize #9  "Mutopia " \concat { \abs-fontsize #12 \with-color #white \char ##x01C0 \abs-fontsize #9 "Project " } } } \override #'(baseline-skip . 0 ) \center-column { \abs-fontsize #11.9 \with-color #grey \bold { \char ##x01C0 \char ##x01C0 } } \override #'(baseline-skip . 0 ) \column { \abs-fontsize #8 \sans \concat { " Typeset using " \with-url "http://www.lilypond.org" "LilyPond" " by " \maintainer " " \char ##x2014 " " \footer } \concat { \concat { \abs-fontsize #8 \sans{ " Placed in the " \with-url "http://creativecommons.org/licenses/publicdomain" "public domain" " by the typesetter " \char ##x2014 " free to distribute, modify, and perform" } } \abs-fontsize #13 \with-color #white \char ##x01C0 } } }
 tagline = ##f
}


%--------Definitions
global = {
  \key c \major
  \time 4/4
}

exerciseNumber = "1."

upperStaff =   { \tempo "Allegro"
         <e''-3 >16 <g''-5 >16 f'' g'' <e''-3 >16 f'' <d''-2 >16 e'' <c''-1 >16 <c'''-5 >16 b'' c''' <a''-3 >16 b'' <g''-2 >16 a''		| %1
         <f''-1 >16 <a''-5 >16 g'' a'' <f''-3 >16 g'' e'' f'' d'' <f''-5 >16 e'' f'' <d''-3 >16 e'' c'' d''					| %2
         <b'-1 >16-\cresc <d''-5 >16 c'' d'' <b'-3 >16 c'' a' b' <g'-1 >16 <b'-5 >16 a' b' g' a' f' g'						| %3
         <e'-1 >16 <g'-5 >16 f' g' e' f' d' e' <c'-1 >16 <e'-5 >16 d' e' c' d' b c'                                         | %4
        <>  \f <a-1 >16 <d'-3 >16 cis' <e'-4 >16 <d'-1 >16 f' e' <g'-4 >16 <f'-1 >16 a' gis' <b'-4 >16 <a'-1 >16 <d''-3 >16 cis'' <e''-4 >16 	| %5
         <d''-1 >16 f'' e'' <g''-4 >16 <f''-1> a'' gis'' <b''-4> \ottava #1  <a''-1>16 d''' cis''' <e'''-4> <d'''-1> e''' f''' d'''					| %6
         <a'''-5> g'''! f''' e''' \ottava #0  <d'''-1 >16 <c'''-3 >16 b'' a'' <g''-4 >16 f'' e'' d'' <c''-3 >16 b' a' b'				| %7
         c'' d'' c'' b' <c''-1 >16 e'' g'' c''' c''8-\staccato r8 r4  								        \bar "|." %8
}

lowerStaff =  {
  \clef treble
         <c' g'>4 r <e' g'> r           | %1
         <d' a'> r \clef bass <f a> r   | %2
         <g d'> r <b, d g> r            | %3
         <g c> r <e g> r                | %4
         <f, a, d> r r2                 | %5
         <f a d'>4 r r2                 | %6
         <g c' e'>4 r <g d' f'> r       | %7
         <c' e'> r r2           \bar "|." %8    
}

%-------Typeset music and generate midi
\score { \unfoldRepeats 
    \context PianoStaff <<
        \set PianoStaff.midiInstrument = "acoustic grand"
        \set PianoStaff.instrumentName = \markup \huge \bold \exerciseNumber  
        \new Staff = "upper" { \clef treble \global \upperStaff }
        \new Staff = "lower" { \clef bass   \global \lowerStaff }
    >>
    \layout{ }
    \midi  { \tempo 4 = 110 }
}
