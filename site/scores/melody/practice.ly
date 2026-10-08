
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

 \paper { obsolete-between-system-padding = #1  system-system-spacing.padding = #(/ obsolete-between-system-padding staff-space)  score-system-spacing.padding = #(/ obsolete-between-system-padding staff-space)
	ragged-bottom=##f
	ragged-last-bottom=##f
	}

     \header {

      title = "Album pour la jeunesse"
  subtitle = "40 (43) pièces de piano"
  subsubtitle = "-----"
  composer = "Robert Schumann (1810-1856)"
  opus = "Opus 68 N°1"
  instrument = "Mélodie"
  copyright = "Creative Commons Attribution-ShareAlike 2.5"
     
       % These are headers used by the Mutopia Project
       % http://www.mutopiaproject.org/
       mutopiatitle = "Album pour la jeunesse - 1.Mélodie "
       mutopiacomposer = "SchumannR"
       mutopiaopus = "O 68 n°1"
       mutopiainstrument = "Piano"
       date = "1848"
       source = "Peters "
       style = "Romantic"
       copyright = "Creative Commons Attribution-ShareAlike 2.5"
       maintainer = "Philippe Hézaine"
       maintainerEmail = "philippe.hezaine@free.fr"
       maintainerWeb = ""
       lastupdated = "2006/Jun/20"



       
 footer = "Mutopia-2007/02/11-647"
 tagline = \markup { \override #'(box-padding . 1.0) \override #'(baseline-skip . 2.7) \box \center-column { \small \line { Sheet music from \with-url "http://www.MutopiaProject.org" \line { \teeny www. \hspace #-1.0 MutopiaProject \hspace #-1.0 \teeny .org \hspace #0.5 } • \hspace #0.5 \italic Free to download, with the \italic freedom to distribute, modify and perform. } \line { \small \line { Typeset using \with-url "http://www.LilyPond.org" \line { \teeny www. \hspace #-1.0 LilyPond \hspace #-1.0 \teeny .org } by \maintainer \hspace #-1.0 . \hspace #0.5 Copyright © 2007. \hspace #0.5 Reference: \footer } } \line { \teeny \line { Licensed under the Creative Commons Attribution-ShareAlike 2.5 License, for details see: \hspace #-0.5 \with-url "http://creativecommons.org/licenses/by-sa/2.5" http://creativecommons.org/licenses/by-sa/2.5 } } } }
     }

     upper = \relative c'' {
       \clef treble
       \key c \major
       \time 4/4
	\repeat volta 2 {
        \once\override TextScript.extra-offset = #'(-5 . 2)

	e4-5^\markup { \bold "pas vite" }( d c b |
	a8 c b d c4 \stemUp g) |
	\stemDown g'-5( f e c |
	b_1 \stemUp <fis_2 a_3> g_1) r 
     }
	\stemDown d'-3\espressivo( c b) r |
	f'-3\espressivo( e d) r |
	a'-5\espressivo( g f e |
	d8 f e g
	\voiceOne
	<<
	{ f4.^\markup { \finger "4-5" } d8) | } 
	\context Voice="1" { \voiceTwo
	a8 c b d
	\oneVoice
	}
	>>
	\stemDown <c e>4( d c b |
	a8 c b d c4 \stemUp g) |
	\stemDown a'-5( g^\markup { \finger "4-5" } <b, f'>^\markup { \finger "4-5" } <c e> |
	d8-3 f-5 b,-1 d-3 c4-2) a4\rest |
	d-3\espressivo( c b) a4\rest  |
	f'-3\espressivo( e d) a4\rest |
	a'-5\espressivo( g f e |
	d8 f e g
	\voiceOne
	<<
	{ f4. d8) | } 
	\context Voice="1" { \voiceTwo
	a8 c b d
	\oneVoice
	}
	>>
	\stemDown <c e>4( d c b |
	a8 c b d c4 \stemUp g) |
	\stemDown a'( g <b, f'> <c e> |
	d8 f b, d c4) a4\rest \bar "|." 
     }
     
     lower = \relative c' {
       \clef treble
       \key c \major
       \time 4/4

	\repeat volta 2 {
	c8_5( g' f g e g c, e |
	f d g f e f e d) |
	e_3( g d g c, g' e g |
	d g c, d b d g,4) |
     }
	f'!8_2( g e g d g fis g) |
	d_3( g c, g' b, g' fis g) |
	f!_2( g e g d g c, g' |
	b, g' c, cis d4 g) |
	c,8_5( g' f g e g c, e |
	f d g f e f e c)
	f( c' e, c' d, g c, g' |
	f a g f e g c, e)
	f( g e g d g fis g) |
	d( g c, g' b, g' fis g) |
	f!( g e g d g c, g' |
	b, g' c, cis d4 g) |
	c,8( g' f g e g c, e |
	f d g f e f e c) |
	f( c' e, c' d, g c, g' |
	f a g f e g c,4)

     }
     
     dynamics = {
        
	s1\p 
	s1*5
	s4\> s2 s4\!
	s1*7
	s4\> s2 s4\!
	s1*5
     }
     
     \score { \unfoldRepeats 
       \context PianoStaff <<
   \set PianoStaff.instrumentName = \markup{ \fontsize #6 {"1. "} \hspace #1.0
}
         \context Staff=upper \upper
         \context Dynamics=dynamics \dynamics
         \context Staff=lower <<
           \clef bass
           \lower
         >>

       >>
       \layout {
	ragged-last = ##f
         % [Convert-ly] The Dynamics context is now included by default.
         \context {
           \PianoStaff
           \accepts Dynamics
           \override VerticalAlignment.forced-distance = #5
         }
       }
     }
     \score { \unfoldRepeats 
	\unfoldRepeats
       \context PianoStaff <<
         \context Staff=upper  \upper %\dynamics

         \context Staff=lower << \lower %\dynamics
	>>
       >>
       \midi {
	\tempo 4 = 60

         \context {
           \type "Performer_group"
           \name Dynamics
         }
	
         \context {
           \PianoStaff
           \accepts Dynamics
         }
       }
     }
