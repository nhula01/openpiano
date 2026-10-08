
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


                                % "VALSE Op64 No1"
                                % 'Minute Waltz'
                                % by Frederic Chopin
                                %
                                % Please see "header.ly" for more information

\include "english.ly"
% --- included from header.ly ---

\header {
                                % LILYPOND HEADERS       
    dedication = "A Madame la Comtesse DELPHINE POTOCKA"
    title = "Valse"
    subtitle = "`Minute Waltz'"
    %% subsubtitle = "subsubtitle"

    composer = "Frederic Chopin (1810-1849)"
    opus = "Op.~64, No.~1"
    %% arranger = "Arranger"

    %% poet = "Poet"
    %% texttranslator = "Translator"
    %% meter = "meter"

    %% instrument = "Pianoforte"
    %% piece = "\\textbf{\large Molto Vivace}"

                                % LILYPOND FOOTERS
    license = "Public Domain"
    %footer = "0.04 (12 Aug 2004)" 
    %% tagline = "tagline"

                                % MUTOPIA HEADERS       
    mutopiatitle = "Valse Op. 64, No. 1 ('Minute Waltz')"
    mutopiacomposer = "ChopinFF"
    mutopiaopus = "Op. 64"
    mutopiainstrument = "Piano"
    date = "1847"
    source = "Edition Peters"
    style = "Romantic"
    enteredby = "Magnus Lewis-Smith"
    maintainer = "Magnus Lewis-Smith"
    maintainerEmail = "mlewissmith@users.sourceforge.net"
    maintainerWeb = "http://magware.sourceforge.net/"

 footer = "Mutopia-2015/01/17-483"
 copyright =  \markup { \override #'(baseline-skip . 0 ) \right-column { \sans \bold \with-url "http://www.MutopiaProject.org" { \abs-fontsize #9  "Mutopia " \concat { \abs-fontsize #12 \with-color #white \char ##x01C0 \abs-fontsize #9 "Project " } } } \override #'(baseline-skip . 0 ) \center-column { \abs-fontsize #11.9 \with-color #grey \bold { \char ##x01C0 \char ##x01C0 } } \override #'(baseline-skip . 0 ) \column { \abs-fontsize #8 \sans \concat { " Typeset using " \with-url "http://www.lilypond.org" "LilyPond" " by " \maintainer " " \char ##x2014 " " \footer } \concat { \concat { \abs-fontsize #8 \sans{ " Placed in the " \with-url "http://creativecommons.org/licenses/publicdomain" "public domain" " by the typesetter " \char ##x2014 " free to distribute, modify, and perform" } } \abs-fontsize #13 \with-color #white \char ##x01C0 } } }
 tagline = ##f
}




%{
BUGLIST
*	http: 
*	category:  projects/lily
*	group:     sources/lily/chopin_valse_op64_no1

 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 

FEATURE REQUEST
*	http: 
*	category:  projects/lily
*	group:     sources/lily/chopin_valse_op64_no1

LINKS
*	http: 
*	http: 
*	http: 
*	http: 

%}

% --- end header.ly ---

paperOFF = { \set Score.skipTypesetting = ##t }
paperON = { \set Score.skipTypesetting = ##f }

myBreak = {} %  { \break }
barRest =  { s1*3/4 }

%% Change to staff LH/RH
cslh = { \change Staff = "lh" }
csrh = { \change Staff = "rh" }

%% hide notes (once)
ohn = {
    \once\override NoteHead.transparent = ##t
    \once\override Stem.transparent = ##t
    \once\override Beam.transparent = ##t
}

%% Hide stem
noStem = \once \override Stem.transparent = ##t

%% Shift note to the right
forceShift = \once \override NoteColumn.force-hshift = #1.0

%% Shape the slur
shapeSlurOne = \shape #'((-0.5 . 0.7) (0 . 0.5) (0.5 . 0.5) (1 . 0.5)) Slur
shapeSlurTwo = \shape #'((0 . 0) (0.5 . 0) (1 . 0) (1.5 . 0)) LaissezVibrerTie

%% simpler sustain commands
sd  =  { s8\sustainOn }
su  =  { s8\sustainOff }
sud =  { s8\sustainOff\sustainOn }
sbar =  { s8\sustainOn s s s s s\sustainOff }

% --- included from sec1.ly ---

secOneSilent =  {
                                % 1 - 4
    \barRest |
    \barRest |
    \barRest |
    \barRest |

                                % 5 - 8
    \barRest | \myBreak
    \barRest |
    \barRest |
    \barRest |

                                % 9 - 12
    \barRest |
    \barRest | \myBreak
    \barRest |
    \barRest |

                                % 13 - 16
    \barRest |
    \barRest |
    \barRest | \myBreak
    \barRest |

                                % 17 - 20
    \barRest |
    \barRest |
    \barRest |
    \barRest | \myBreak
}


secOneRHnotes =  \relative af' {
    \slurUp
                                % 1 - 4
    af4->^( g8 af c bf |
    g af bf af c bf |
    g af c bf g af |
    c bf g af c bf |

                                % 5 - 8
    g af c bf g af |
    c bf g af c bf |
    g af c bf g af |
    bf c df ef f gf? |

                                % 9 - 12
    bf4. af8[ gf f] |
    f ef ef\prall d ef4) |
    bf'4.( af8[ gf f] |
    f ef\prall d ef f bf, |

                                % 13 - 16
    g af c bf g af |
    c bf g af c bf |
    g af c bf g af |
    bf c df ef f gf? |

                                % 17 - 20
    bf4. af8[ gf f] |
    f ef ef\prall d ef4 |
    bf'4. af8[ gf f] |
    ef f ef\prall d ef e) |
}

secOneRHdyn =  {
                                % 1 - 4
    \tempo "Molto Vivace"
    s8_\markup{\italic leggiero} s s s s s |
    \barRest |
    \barRest |
    \barRest |

                                % 5 - 8
    s8\< s s s s s |
    \barRest |
    \barRest |
    s8 s s s s s\! |

                                % 9 - 12
    s8\> s s s s s |
    s s s s s s\! |
    s8\> s s s s s |
    s s s s s s\! |

                                % 13 - 16
    \barRest |
    \barRest |
    s8\< s s s s s\! |
    s8\< s s s s s\! |

                                % 17 - 20
    s8\> s s s s s |
    s s s s s s\! |
    \barRest |
    \barRest |
}

secOneRH =  {
    <<
        \secOneSilent
        \secOneRHnotes
        \secOneRHdyn
    >>
}



secOneLHnotes =  \relative d {
                                % 1 - 4
    R2. |
    R2. |
    R2. |
    R2. |

                                % 5 - 8
    df4 <af' df f> <af df f> |
    f <af df f> <af df f> |
    df, <af' df f> <af df f> |
    f <af df f> <af df f> |

                                % 9 - 12
    af, <af' c gf'> <af c gf'> |
    ef <af c gf'> <af c gf'> |
    af, <c' gf'> <c gf'> |
    af <c gf'> <c gf'> |

                                % 13 - 16
    df, <af' df f> <af df f> |
    f <af df f> <af df f> |
    df, <af' df f> <af df f> |
    f <af df f> <af df f> |

                                % 17 - 20
    af, <af' c gf'> <af c gf'> |
    ef <af c gf'> <af c gf'> |
    af, <af' c gf'> <af c gf'> |
    af <c gf'> af,  |
}

secOneLHdyn =  {
                                % 1 - 4
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 5 - 8
    \sbar |
    \sbar |
    \sbar |
    \sbar |


                                % 9 - 12
    \sbar |
    \sbar |
    \sbar |
    \sbar |

                                % 13 - 16
    \sbar |
    \sbar |
    \sbar |
    \sbar |

                                % 17 - 20
    \sbar |
    \sbar |
    \sbar |
    \sbar |

}

secOneLH =  {
    <<
        \secOneSilent
        \secOneLHnotes
        \secOneLHdyn
    >>
}

% --- end sec1.ly ---
% --- included from sec2.ly ---

secTwoSilent =  {
    \repeat volta 2 {
                                % 21 - 24
        \barRest |
        \barRest |
        \barRest |
        \barRest |

                                % 25 - 28
        \barRest | \myBreak
        \barRest |
        \barRest |
        \barRest |

                                % 29 - 32
        \barRest |
        \barRest | \myBreak
        \barRest |
        \barRest |

                                % 33 - 35
        \barRest |
        \barRest |
        \barRest | \myBreak
    }
    \alternative {
                                % 36
        { \barRest | }
                                % 37 (partial)
        { s4 s }
    }
}


secTwoRHnotes =  \relative f'' {
    \repeat volta 2 {
                                % 21 - 24
        \context Voice = "longSlur" {
          \tuplet 3/2 { f8([ gf f] } e f af gf |
          f gf f e f bf |
          \tuplet 3/2 { af[ bf af] } g af c bf |
          af bf af g af df |
  
                                  % 25 - 28
          c bf af gf f ef |
          df c bf af gf f |
          ef df c ef bf' af |
          g af bf c df ef |
  
                                  % 29 - 32
          <<
            \context Voice = "longSlur" {
              \voiceOne
              \tuplet 3/2 { f8[ gf? f] } e f af gf |
              f gf f e f bf |
              \tuplet 3/2 { af[ bf af] } g af c bf |
            }
            \\
            {
              r4 <ef,, f> q | 
              r4 <df f> q  |
              r4 <gf af> q |
            }
          >>
          af'8 bf af g af f' |
  
                                  % 33 - 35
          ef df c bf af gf |
          \stemNeutral
          f ef df c bf af |
          a c bf f gf c, |
        }
    }
    \alternative {
                                % 36
        { \context Voice = "longSlur" df4) r 
          \shapeSlurTwo f' -\tweak X-extent #'(0 . 4) \laissezVibrer }
                                % 37 (partial bar)
        { df,4 \repeatTie r } 
    }
}

secTwoRHDyn =  {
    \repeat volta 2 {
                                % 21 - 24
        \barRest |
        \barRest |
        \barRest |
        \barRest |
                                % 25 - 28
        s8\> s s s s s |
        \barRest |
        s8 s s\!\< s s s |
        s8 s s s s s\! |
                                % 29 - 32
        \barRest |
        \barRest |
        \barRest |
        \barRest |

                                % 33 - 35
        s8 s\> s s s s |
        \barRest |
        s8 s s s s s\! |
    }
    \alternative {
                                % 36
        { \barRest | }
                                % 37 (partial)
        { s2 }
    }
}

secTwoRH =  {
    <<
        \secTwoSilent
        \secTwoRHnotes
        \secTwoRHDyn
    >>
}



secTwoLHnotes =  \relative a, {
    \repeat volta 2 {
                                % 21 - 24
        a4 <f' c' ef?> <f c' ef> |
        bf, <f' df'> <f df'> |
        c <af' ef' gf?> <af ef' gf> |
        df, <af' f'> r |

                                % 25 - 28
        gf <bf ef> r |
        af, <f' af df> r |
        af, <gf' af> <gf af c> |
        df <af' df f> r |

                                % 29 - 32
        a2.( |
        bf2. |
        c2. |
        df4) \stemDown\csrh <f af> \stemNeutral\cslh r |

                                % 33 - 35
        gf,?4 \stemDown\csrh <df' ef bf'> \stemNeutral\cslh r |
        af,4 <f' af df> r |
        af,? <gf' af?> <gf af> |

    }
    \alternative {
                                % 36
        { df4 <af' f'> r | }
                                % 37 (partial)
        { df,4 <af' f'> }
    }
}

secTwoLHDyn =  {
    \repeat volta 2 {
                                % 21 - 24
        \sbar |
        \sbar |
        \sbar |
        \sbar |
                                % 25 - 28
        \sd s8 \su s8 s s |
        \sbar |
        \sbar |
        \sbar |
                                % 29 - 32
        \barRest |
        \barRest |
        \barRest |
        \barRest |
                                % 33 - 35
        \sbar |
        \sbar |
        \barRest |
    }
    \alternative {
                                % 36
        { \sbar | }
                                % 37 (partial)
        { s2 }
    }
}

secTwoLH =  {
    <<
        \secTwoSilent
        \secTwoLHnotes
        \secTwoLHDyn
    >>
}

% --- end sec2.ly ---
% --- included from sec3.ly ---

secThreeSilent =  {
                                % 37 (partial)
    s4 |

                                % 38 - 41
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 42 - 45
    \barRest | \myBreak
    \barRest |
    \barRest |
    \barRest |
                                % 46 - 49
    \barRest |
    \barRest |
    \barRest |
    \barRest | \myBreak
                                % 50 - 53
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 54 - 57
    \barRest |
    \barRest | \myBreak
    \barRest |
    \barRest |
                                % 58 - 61
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 62 - 65
    \barRest | \myBreak
    \barRest |
    \barRest |
    \barRest |
                                % 66 - 69
    \barRest |
    \barRest |
    \barRest |
    \barRest | \myBreak
}


secThreeRHnotes =  \relative af' {
                                % 37 (partial)
    af4(~ |

                                % 38 - 41
    af2 ef4 |
    af2 e4 |
    af2 f4 |
    f'2) f4\(~ |

                                % 42 - 45
    f2 bf,4 |
    f'2 c4 |
    ef2 df4 |
    \tuplet 4/3 { c ef df bf } |

                                % 46 - 49
    af2 ef4_( |
    af2) e4 |
    af2 f4 |
    f'2. |

                                % 50 - 53
    c4\trill b c |
    af' bf, g' |
    a, gf' af, |
    f' f, bf |
                                % 54 - 57
    af2 ef4 |
    \acciaccatura {
        % [bug] really ugly slurs.  Perhaps improved in lilypond 2.2.5 or greater?
        af'8 } af,2 e4 |
    \acciaccatura {
        % [bug] really ugly slurs.  Perhaps improved in lilypond 2.2.5 or greater?
        af'8 } af,2 f4 |
    \acciaccatura {af'8} f2\) f4\( |

                                % 58 - 61
    \acciaccatura { af8 } f2 bf,4 |
    \acciaccatura { af'8 } f2 c4 |
    \acciaccatura { af'8 } ef4 df c |
    \acciaccatura { af'8 } ef4 df4. bf8 |

                                % 62 - 65
    \acciaccatura { af'8 } af,2 ef4 |
    \acciaccatura { af'8 } af,2 e4 |
    \acciaccatura { af'8 } af,2 f4 |
    f'2.\) |

                                % 66 - 69
    f2( bf,4 |
    ef2 bff4 |
    ef af, d |
    f ef af) |
}

secThreeRHdyn =  {
                                % 37 (partial)
    s4 |

                                % 38 - 41
    s4_\markup{\italic "sostenuto"} s s |
    \barRest |
    s4\< s s |
    s\! s s |
                                % 42 - 45
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 46 - 49
    \barRest |
    s4\< s s |
    s s s |
    s\! s s |
                                % 50 - 53
    \barRest |
    \barRest |
    s4\> s s |
    s s s\! |
                                % 54 - 57
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 58 - 61
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 62 - 65
    \barRest |
    \barRest |
    s4\< s s |
    s\! s s |
                                % 66 - 69
    \barRest |
    \barRest |
    \once\override Hairpin.extra-offset = #'(0 . 1.5)
    s4\< s s |
    s s s\! |
}

secThreeRH =  {
    <<
        \secThreeSilent
        \secThreeRHnotes
        \secThreeRHdyn
    >>
}



secThreeLHnotes =  \relative a, {
                                % 37 (partial)
    r4 |

                                % 38 - 41
    af4 <gf' af c> <gf af c> |
    <gf af c> <gf af c> <gf af c> |
    df <af' df> <af df> |
    af, <af' df f> <af df f> |

                                % 42 - 45
    ef <af c gf'> <af c gf'> |
    af, <af' ef' gf> <af ef' gf> |
    df, <af' df f> <af df f> |
    f  <af df f> <af df f> |

                                % 46 - 49
    c,4 <gf' af> <gf af> |
    af, <gf' af> <gf af c> |
    df <af' df> <af df> |
    b, <af' df f> <af df f> |

                                % 50 - 53
    c,4 <af' c f> <af c f> |
    c,, <g'' c e> r |
    f, r <f' c'> |
    R1*3/4 |

                                % 54 - 57
    c4 <gf' af> <gf af> |
    af, <gf' af c> <gf af c> |
    df <af' df> <af df> |
    af, <af' df f> <af df f> |

                                % 58 - 61
    ef <af c gf'> <af c gf'> |
    af, <af' ef' gf> <af ef' gf> |
    df, <af' df f> <af df f> |
    f  <af df f> <af df f> |

                                % 62 - 65
    << { r4 <gf af> <gf af> } \\
       { c,2. } >> |
    af4 <gf' af c> <gf af c> |
    cf, <f af ef'> <f af ef'> |
    bf, <f' af d> <f af d> |

                                % 66 - 69
    ef4 <df' g> <df g> |
    r4 <df gf> <df gf> |
    %{
    <<
        << { r4 <c gf'> } \\
           { af2 } >>           % [mils] expect warning
        { \hideNotes af4_(  c) \unHideNotes }
    >> r4 |
    %}
    
    %\mergeDifferentlyHeadedOn
    << 
      { r4 <c gf'> } \\ 
      { af2 } \\
      { s2 } % hidden slur-anchor notes removed: they sounded in MIDI

    >> r4 |

    R1*3/4 |
}

secThreeLHdyn =  {
                                % 37 (partial)
    s4 |

                                % 38 - 41
    \sd s8 s s s s |
    s s s s s \su |
    \sd s8 s s s s |
    s s s s s \su |
                                % 42 - 45
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 46 - 49
    \sbar |
    \sbar |
    \sd s8 s s s s |
    s s s s s \su |
                                % 50 - 53
    \sbar |
    \sbar |
    \sbar |
    \barRest |
                                % 54 - 57
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 58 - 61
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 62 - 65
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 66 - 69
    \sbar |
    \barRest |
    \barRest |
    \barRest |
}

secThreeLH =  {
    <<
        \secThreeSilent
        \secThreeLHnotes
        \secThreeLHdyn
    >>
}

% --- end sec3.ly ---
% --- included from sec4.ly ---

secFourSilent =  {
                                % 70 - 73
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 74 - 77
    \barRest |
    \barRest |
    \barRest |
    \barRest | \myBreak
                                % 78 - 81
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 82 - 85
    \barRest |
    \barRest | \myBreak
    \barRest |
    \barRest |
                                % 86 - 89
    \barRest |
    \barRest |
    \barRest | \myBreak
    \barRest |
                                % 90 - 93
    \barRest |
    \barRest |
    \barRest |
    \barRest | \myBreak
                                % 94 - 97
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 98 - 101
    \barRest | \myBreak        % end of page
    \barRest |
    \barRest |
    \barRest |
                                % 102 - 105
    \barRest |
    \barRest | \myBreak
    \barRest |
    \barRest |
                                % 106 - 109
    \barRest |
    \barRest |
    \barRest |
    \barRest | \myBreak
                                % 110 - 113
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 114 - 117
    \barRest | \myBreak
    \barRest |
    \barRest |
    \barRest |
                                % 118 - 121
    \barRest |
    \barRest | \myBreak
    \barRest |
    \barRest |
                                % 122 - 125
    \barRest |
    \barRest |
    \barRest |
    \barRest | \myBreak
}


secFourRHnotes =  \relative af' {
                                % 70 - 73
    af2.\trill(~ |
    af2.\trill~ |
    af2.\trill~ |
    af2.\trill |

                                % 74 - 77
    g8 af c bf g af |
    c bf g af c bf |
    g af c bf g af |
    c bf g af c bf |

                                % 78 - 81
    g af c bf g af |
    c bf g af c bf |
    g af c bf g af |
    bf c df ef f gf? |

                                % 82 - 85
    bf4. af8[ gf f] |
    f ef ef\prall d ef4) |
    bf'4.( af8[ gf f] |
    f ef\prall d ef f b, |

                                % 86 - 89
    g af c bf g af |
    c bf g af c bf |
    g af c bf g af |
    bf c df ef f gf? |

                                % 90 - 93
    bf4. af8[ gf f] |
    f ef ef\prall d ef4) |
    \context Voice = "longSlur" {
      bf'4.( af8[ gf f] |
      ef f ef\prall d ef e |

                                % 94 - 97
      \tuplet 3/2 { f8[ gf f] } e f af gf |
      f gf f e f bf |
      \tuplet 3/2 { af[ bf af] } g af c bf |
      af bf af g af df |
  
                                  % 98 - 101
      c bf af gf f ef |
      df c bf af gf f |
      ef df c ef bf' af |
      g af bf c df ef |
  
                                  % 102 - 105
      <<
        \context Voice = "longSlur" {
          \voiceOne
          \tuplet 3/2 { f8[ gf f] } e f af gf |
          f gf f e f bf |
          \tuplet 3/2 { af[ bf af] } g af c bf |
        }
        \\
        {
          r4 <ef,, f> q | 
          r4 <df f> q  |
          r4 <gf af> q |
        }
      >>
      af'8 bf af g af f' |
  
                                  % 106 - 109
      ef df c bf af gf |
      \stemNeutral
      f ef df c bf af |
      a c bf f gf c, |
      df4) r
    }
    \context Voice = "longSlur" { f'->(~ |

                                % 110 - 113
      \tuplet 3/2 { f8[ gf f] } e f af gf |
      f gf f e f bf |
      \tuplet 3/2 { af[ bf af] } g af c bf |
      af bf af g af df |
  
                                % 114 - 117
      c bf af gf f ef |
      df c bf af gf f |
      ef df c ef bf' af |
      g af bf c df ef |
  
                                % 118 - 121
      << 
        \context Voice = "longSlur" { 
          \voiceOne
          \tuplet 3/2 { f8[ gf f] } e f af gf | 
          f8 gf f e f bf |
          \tuplet 3/2 { af8[ bf af] } g af c bf |
        }
        \\
        { 
          r4 <ef,, f> q | 
          r4 <df f> q  |
          r4 <gf af> q |
        }
      >>
      af'8[ bf af g af]) 
    }
    \stemNeutral
    \override Staff.OttavaBracket.extra-offset = #'(0 . 1)
    \ottava #1
    f''\>( |

                                % 122 - 125
    \tiny
    \tuplet 24/18 {
        ef8[ df c bf af gf f ef
        \ottava #0
        df c bf af gf f
        ef df c bf a\!\< c bf f gf c,\!]
    } |
    \normalsize
    df2) r4 |
}

secFourRHdyn =  {
                                % 70 - 73
    \barRest |
    s8\< s s s s s |
    \barRest |
    \barRest |
                                % 74 - 77
    \barRest |
    \barRest |
    \barRest |
    s8 s s s s s\! |
                                % 78 - 81
    s8\f s s s s s |
    \barRest |
    \barRest |
    \barRest |
                                % 82 - 85
    s8\> s s s s s |
    s s s s s s\! |
    s\> s s s s s |
    s s s s s s\! |
                                % 86 - 89
    s8\p s s s s s |
    \barRest |
    s8\< s s s s s |
    s s s s s s\! |
                                % 90 - 93
    s8\> s s s s s |
    s s s s s s\! |
    s\< s s s s s |
    s s s s s s\! |
                                % 94 - 97
    s8 s s\< s s s |
    \barRest |
    \barRest |
    s8 s s s s s\! |
                                % 98 - 101
    s8\> s s s s s |
    \barRest
    s8 s s\!\< s s s |
    s s s s s s \! |
                                % 102 - 105
    \barRest |
    \barRest |
    \barRest |
    s8 s\> s s s s |
                                % 106 - 109
    s s s s s s\! |
    s\> s s s s s |
    s s s s s s\! |
    \barRest |
                                % 110 - 113
    s8\pp s s\< s s s |
    \barRest |
    \barRest |
    s8 s s s s s\! |
                                % 114 - 117
    s8\> s s s s s |
    \barRest |
    s s s\!\< s s s |
    s s s s s s\! |
                                % 118 - 121
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 122 - 125
    \barRest |
    \barRest |
    \barRest |
    s4\f s s |
}

secFourRH =  {
    <<
        \secFourSilent
        \secFourRHnotes
        \secFourRHdyn
    >>
}



secFourLHnotes =  \relative df, {
                                % 70 - 73
    R1*3/4 |
    R1*3/4 |
    R1*3/4 |
    R1*3/4 |

                                % 74 - 77
    R1*3/4 |
    R1*3/4 |
    R1*3/4 |
    R1*3/4 |

                                % 78 - 81
    df4 <af'' df f> <af df f> |
    f <af df f> <af df f> |
    df, <af' df f> <af df f> |
    f <af df f> <af df f> |

                                % 82 - 85
    af, <af' c gf'> <af c gf'> |
    ef <af c gf'> <af c gf'> |
    af, <c' gf'> <c gf'> |
    af <c gf'> <c gf'> |

                                % 86 - 89
    df, <af' df f> <af df f> |
    f <af df f> <af df f> |
    df, <af' df f> <af df f> |
    f <af df f> <af df f> |

                                % 90 - 93
    af, <af' c gf'> <af c gf'> |
    ef <af c gf'> <af c gf'> |
    af, <af' c gf'> <af c gf'> |
    af <c gf'> af,  |

                                % 94 - 97
    a4 <f' c' ef?> <f c' ef> |
    bf, <f' df'> <f df'> |
    c <af' ef' gf?> <af ef' gf> |
    df, <af' f'> r |

                                % 98 - 101
    gf? <bf ef> r |
    af, <f' af df> r |
    af, <gf' af> <gf af c> |
    df <af' df f> r |

                                % 102 - 105
    a2. ( |
    bf2. |
    c2. |
    df4) \stemDown\csrh <f af> \stemNeutral\cslh r |

                                % 106 - 109
    gf,?4 \stemDown\csrh <df' ef bf'> \stemNeutral\cslh r |
    af,4 <f' af df> r |
    af,? <gf' af?> <gf af> |
    df4 <af' f'> r |

                                % 110 - 113
    a,4 <f' c' ef?> <f c' ef> |
    bf, <f' df'> <f df'> |
    c <af' ef' gf?> <af ef' gf> |
    df, <af' f'> r |

                                % 114 - 117
    gf? <bf ef> r |
    af, <f' af df> r |
    af, <gf' af> <gf af c> |
    df <af' df f> r |

                                % 118 - 121
    a2.( |
    bf2. |
    c2. |
    df4) \stemDown\csrh <f af> \stemNeutral\cslh r |

                                % 122 - 125
    gf,,?4 \clef treble <df'' ef bf'> r |
    R1*3/4 |
    \clef bass
    af,4 <gf' af> <gf af> |
    df, <f' af f'> r |
}

secFourLHdyn =  {
                                % 70 - 73
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 74 - 77
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 78 - 81
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 82 - 85
    \sbar |
    \sbar |
    \sd s8 s s s s |
    s s s s s \su |
                                % 86 - 89
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 90 - 93
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 94 - 97
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 98 - 101
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 102 - 105
    \barRest |
    \barRest |
    \barRest |
    \barRest |
                                % 106 - 109
    \sbar |
    \sbar |
    \barRest |
    \sbar |
                                % 110 - 113
    \sbar |
    \sbar |
    \sbar |
    \sbar |
                                % 114 - 117
    \sd s8 \su s8 s s |
    \sbar |
    \sbar |
    \sbar |
                                % 118 - 121
    \barRest |
    \barRest |
    \barRest |
    \sbar |

                                % 122 - 125
    \sbar |
    \barRest |
    \sbar |
    \sd s8 s \su s8 s |
}

secFourLH =  {
    <<
        \secFourSilent
        \secFourLHnotes
        \secFourLHdyn
    >>
}

% --- end sec4.ly ---

% Things common to both staves
global = {
  \key df \major
  \time 3/4
  
  % accidental style default for PianoStaff is "piano"
  \accidentalStyle default
}

scoreAll =  {
    \new PianoStaff {
                                % setup instrument
            \set PianoStaff.midiInstrument = "acoustic grand"

                                % PLAY!
            <<
                \context Staff = "rh" {
                    \global

                                % setup dynamics
                    \override Staff.TextScript.staff-padding = #3
                    \override Staff.DynamicLineSpanner.staff-padding = #3  % (forced-distance - 6) / 2

                                % PLAY RH!
                    \clef treble
                    \secOneRH
                    \secTwoRH
                    \secThreeRH
                    \secFourRH
                    \bar "|."
                }
                \context Staff = "lh" {
                    \global

                                % setup pedals
                    % \set Staff.pedalSustainStyle = #'mixed
                    \override Staff.SustainPedalLineSpanner.staff-padding = #2
                    \override Staff.SustainPedalLineSpanner.padding = #0

                                % PLAY LH!
                    \clef bass
                    \secOneLH
                    \secTwoLH
                    \secThreeLH
                    \secFourLH
                    \bar "|."
                }
            >>
    }
}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%
%%% MAIN PAPER / MIDI
%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\paper {
  system-system-spacing.minimum-distance = #16
}

\score
{
    
    \unfoldRepeats {
        \scoreAll
    }
    \layout {}
                                %     \midi {
                                %         \tempo 4 = 280
                                %         %% Remove the dynamics from the midi output
                                %         \context {
                                %             \Voice
                                %             \remove "Dynamic_performer"
                                %             \remove "Span_dynamic_performer"
                                %         }
                                %     }
}

%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%
%%% MIDI ONLY ALL REPEATS
%%%
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
\score
{
    \unfoldRepeats {
        
        \scoreAll
    }
    \midi {
        \tempo 4 = 280
        %% Remove the dynamics from the midi output
        \context {
            \Voice
            \remove "Dynamic_performer"
        }
    }
}


%{
convert-ly.py (GNU LilyPond) 2.18.2  convert-ly.py: Processing `'...
Applying conversion: 2.3.1, 2.3.2, 2.3.4, 2.3.6, 2.3.8, 2.3.9, 2.3.10,
2.3.11, 2.3.12, 2.3.16, 2.3.17, 2.3.18, 2.3.22, 2.3.23, 2.3.24,
2.3.25, 2.4.0, 2.5.0, 2.5.1, 2.5.2, 2.5.3, 2.5.12, 2.5.13, 2.5.17,
2.5.18, 2.5.21, 2.5.25, 2.6.0, 2.7.0, 2.7.1, 2.7.2, 2.7.4, 2.7.6,
2.7.10, 2.7.11, 2.7.12, 2.7.13, 2.7.14, 2.7.15, 2.7.22, 2.7.24,
2.7.28, 2.7.29, 2.7.30, 2.7.31, 2.7.32, 2.7.32, 2.7.36, 2.7.40, 2.9.4,
2.9.6, 2.9.9, 2.9.11, 2.9.13, 2.9.16, 2.9.19, 2.10.0, 2.11.2, 2.11.3,
2.11.5, 2.11.6, 2.11.10, 

Span_dynamic_performer has been merged into
Dynamic_performer

2.11.11, 2.11.13, 2.11.15,  

Not smart enough to
convert VerticalAlignment #'forced-distance. Use the `alignment-
offsets' sub-property of NonMusicalPaperColumn #'line-break-system-
details to set fixed distances between staves. 

2.11.23, 2.11.35,
2.11.38, 2.11.46, 2.11.48, 2.11.50, 2.11.51, 2.11.52, 2.11.53,
2.11.55, 2.11.57, 2.11.60, 2.11.61, 2.11.62, 2.11.64, 2.12.0, 2.12.3,
2.13.0, 2.13.1, 2.13.4, 2.13.10, 2.13.16, 2.13.18, 2.13.20, 2.13.27,
2.13.29, 2.13.31, 2.13.36, 2.13.39, 2.13.40, 2.13.42, 2.13.44,
2.13.46, 2.13.48, 2.13.51, 2.14.0, 2.15.7, 2.15.9, 2.15.10, 2.15.16,
2.15.17, 2.15.18, 2.15.19, 2.15.20, 2.15.25, 2.15.32, 2.15.39,
2.15.40, 2.15.42, 2.15.43, 2.16.0, 2.17.0, 2.17.4, 2.17.5, 2.17.6,
2.17.11, 2.17.14, 2.17.15, 2.17.18, 2.17.19, 2.17.20, 2.17.25,
2.17.27,  

Not smart enough to convert staff-padding. Staff-padding now
controls the distance to the baseline, not the nearest point.

2.17.29,
2.17.97, 2.18.0
%}
