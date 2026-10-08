
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
       opus = "Opus 68 n°10"
       instrument = "Le gai laboureur"
       copyright = "Creative Commons Attribution-ShareAlike 2.5"
     
       % These are headers used by the Mutopia Project
       % http://www.mutopiaproject.org/
      mutopiatitle = "Album pour la jeunesse - 10.Le gai laboureur "
       mutopiacomposer = "SchumannR"
       mutopiaopus = "O 68 n°10 "
       mutopiainstrument = "Piano"
       date = "1848"
       source = "Peters"
       style = "Romantic"
       copyright = "Creative Commons Attribution-ShareAlike 2.5"
       maintainer = "Philippe Hézaine"
       maintainerEmail = "philippe.hezaine@free.fr"
       lastupdated = "2006/Jun/20"


 
 footer = "Mutopia-2007/02/11-659"
 tagline = \markup { \override #'(box-padding . 1.0) \override #'(baseline-skip . 2.7) \box \center-column { \small \line { Sheet music from \with-url "http://www.MutopiaProject.org" \line { \teeny www. \hspace #-1.0 MutopiaProject \hspace #-1.0 \teeny .org \hspace #0.5 } • \hspace #0.5 \italic Free to download, with the \italic freedom to distribute, modify and perform. } \line { \small \line { Typeset using \with-url "http://www.LilyPond.org" \line { \teeny www. \hspace #-1.0 LilyPond \hspace #-1.0 \teeny .org } by \maintainer \hspace #-1.0 . \hspace #0.5 Copyright © 2007. \hspace #0.5 Reference: \footer } } \line { \teeny \line { Licensed under the Creative Commons Attribution-ShareAlike 2.5 License, for details see: \hspace #-0.5 \with-url "http://creativecommons.org/licenses/by-sa/2.5" http://creativecommons.org/licenses/by-sa/2.5 } } } }
     }

     upper = \relative c'' {
       \clef treble
       \key f \major
       \time 4/4
	\partial 8
	\phrasingSlurUp
	\override TextScript.extra-offset = #'(-4 . 2)
	
	r8^\markup { \bold "Frais et gaillard" }
	r <c, f a> <c f a> r r <f a c> <f a c> r
	r <f bes d> <bes d> r r <f a c> <f a c> r
	r <e bes c> <e bes c>4 r8 <c f a> <c f a>4
	r8 <c g'> r <f g b!> r <e g c> <e g c>4 \break
	r8 <c f a> <c f a> r r <f a c> <f a c> r
	r <f bes d> <bes d> r r <f a c> <f a c> r
	r <e bes' c> <e bes' c>4 r8 <c f a> <c f a>4
	r8 <c g'> r <f g b!> r <e g c> <e g c>
	\voiceOne
	<< { 
	c8(\noBeam \break
	bes'4.^> a8 g4.) c,8(
	bes'-> a-. g-. f-. g4.) c,8(
	f4.) a8( c4.) f,8(
	bes d f d c4.) d8\rest \break
      }  
	\context Voice = "1" { \voiceTwo
	s8 c,\rest <c e> <c e> r r <bes c> <bes c> f\rest
	b\rest c c b! b\rest c c f,\rest
	a\rest <a c> <a c> a\rest a\rest <f' a> <f a> a,\rest
	d\rest <f bes> d\rest <f bes> d\rest <f a> <f a> d\rest
	\oneVoice
	}
	>>
	b'\rest  <e, bes' c> <e bes' c>4 b'8\rest <c, f a> <c f a> <c f a>
	b'\rest <d, g> b'\rest <bes, c> b'\rest <a, c f> <a c f> \noBeam (c
	\voiceOne
	<< { bes'4.^> a8 g4.) c,8(
	bes'-> a-. g-. f-. g4.) c,8( \break
	f4.) a8( c4.) f,8(
	bes d f d c4.) d8\rest
	}  
	\context Voice = "1" { \voiceTwo
	r8 <c, e> <c e> r r <bes c> <bes c> f\rest
	b\rest c c b! b\rest c c f,\rest
	a\rest <a c> <a c> a\rest a\rest <f' a> <f a> a,\rest
	d\rest <f bes> d\rest <f bes> d\rest <f a> <f a> d\rest
	\oneVoice
	}
	>>
	b'\rest  <e, bes' c> <e bes' c>4 b'8\rest <c, f a> <c f a> <c f a>
	b'\rest <d, g> b'\rest <bes, c> b'\rest <a, c f> \noBeam <a c f> b'\rest
	 \bar "|." 	 
     }
     
     lower = \relative c {
       \clef bass
       \key f \major
       \time 4/4
	\phrasingSlurUp
	\partial 8
	c\(
	f4. a8 c4. f,8
	bes d f d c4.\) a8\(
	bes g c, bes' a f c a'
	e4 d c\) r8 c\(
	f4. a8 c4. f,8
	bes d f d c4.\) a8\(
	bes g c, bes' a f c a'
	e4 d c\) r8 c\(
	g'4._> f8 e4.\) c8\(
	g'_> f-. e-. d-. e4.\) c8\(
	f4.\) a8\( c4.\) f,8\(
	bes d f d c4.\) a8\(
	bes g c, bes' a f c a'
	\voiceOne
	<< { g4 e f\)
	}
	\context Voice = "1" { \voiceTwo
	bes,4 c f
	\oneVoice
	}
	>>
	d8\rest c\(
	\stemDown
	g'4._> f8 e4.\) c8\(
	g'_> f-. e-. d-. e4.\) \stemUp c8\(
	\stemDown f4.\) a8\( c4.\) f,8\(
	bes d f d c4.\) a8\(
	bes g c, bes' a f c a'
	\voiceOne
	<< { g4 e f\)
	}
	\context Voice = "1" { \voiceTwo
	bes,4 c f
	\oneVoice
	}
	>>
	d4\rest \bar "|."
     }
     
     dynamics = {
        
	s8\f
	s1*3
	s2. s8 \once\override DynamicText.extra-offset = #'(0 . -0.1) s8\f
	s1*5
	s2. 
	\once\override DynamicText.extra-offset = #'(3.1 . 10.5) s8\f
	\once\override DynamicText.extra-offset = #'(0.2 . -7) s8\f 
	s1*5
	s2. 
	\once\override DynamicText.extra-offset = #'(3.1 . 10.5) s8\f
	\once\override DynamicText.extra-offset = #'(0.2 . -7) s8\f
	s1*4
 
     }
     
     \score { \unfoldRepeats 
       \context PianoStaff <<
   \set PianoStaff.instrumentName = \markup{ \fontsize #6 {"10. "} \hspace #1.0
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
           \override VerticalAlignment.forced-distance = #5.4
         }
       }
     }
     \score { \unfoldRepeats 
       \context PianoStaff <<
         \context Staff=upper  \upper \dynamics

         \context Staff=lower << \lower \dynamics
	>>

       >>
       \midi {
	\tempo 4 = 100

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
