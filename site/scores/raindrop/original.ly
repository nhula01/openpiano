\version "2.18.2"

                    %                 "PRELUDE Op28 No15"
                    %                 by Frederic Chopin
                    %
                    %    Please see "header.ly" for more information

%#(set-default-paper-size "letter")

\include "english.ly"
% --- included from header.ly ---

\header {
                                % LILYPOND HEADERS
    %head =  "0.08 (12 Aug 2004)" 

    %%    dedication = "Dedication"
    title = "Prelude"
    subtitle = "`Raindrop'"
    %%    subsubtitle = "Subsubtitle"

    composer = "Frederic Chopin (1810-1849)"
    opus = "Op.28, No.15"

                                % LILYPOND FOOTERS


                                % MUTOPIA HEADERS
    mutopiatitle = "Prelude: Op. 28, No. 15"
    mutopiacomposer = "ChopinFF"
    mutopiaopus = "Op. 28"
    mutopiainstrument = "Piano"
    date = "1838/39"
    source = "Edition Peters"
    style = "Romantic"
    enteredby = "Magnus Lewis-Smith"
    maintainer = "Magnus Lewis-Smith"
    maintainerEmail = "mlewissmith@users.sourceforge.net"
    maintainerWeb = "http://magware.sourceforge.net/"
    license = "Public Domain"
    lastupdated = "2015/01/15"  %Update to LilyPond v2.18.2 (Javier Ruiz-Alma)

 footer = "Mutopia-2015/01/16-471"
 copyright =  \markup { \override #'(baseline-skip . 0 ) \right-column { \sans \bold \with-url #"http://www.MutopiaProject.org" { \abs-fontsize #9  "Mutopia " \concat { \abs-fontsize #12 \with-color #white \char ##x01C0 \abs-fontsize #9 "Project " } } } \override #'(baseline-skip . 0 ) \center-column { \abs-fontsize #11.9 \with-color #grey \bold { \char ##x01C0 \char ##x01C0 } } \override #'(baseline-skip . 0 ) \column { \abs-fontsize #8 \sans \concat { " Typeset using " \with-url #"http://www.lilypond.org" "LilyPond" " by " \maintainer " " \char ##x2014 " " \footer } \concat { \concat { \abs-fontsize #8 \sans{ " Placed in the " \with-url #"http://creativecommons.org/licenses/publicdomain" "public domain" " by the typesetter " \char ##x2014 " free to distribute, modify, and perform" } } \abs-fontsize #13 \with-color #white \char ##x01C0 } } }
 tagline = ##f
}


\paper {
    top-margin = 8 \mm
    bottom-margin = 10 \mm
    top-markup-spacing.basic-distance = #6
    markup-system-spacing.basic-distance = #8 %distance from header/title to 1st system
    top-system-spacing.basic-distance = #10 %dist. from top margin to system (no titles)
    system-system-spacing.basic-distance = #20  %fixed distance between systems
}



%{
BUGLIST
*	http: 
*	category:  projects/lily
*	group:     sources/lily/chopin_prelude_op28_no15


FEATURE REQUEST
*	http: 
*	category:  projects/lily
*	group:     sources/lily/chopin_prelude_op28_no15

LINKS
*       http: 
*	http: 
*	http: 
*	http: 
*	http: 
%}

% --- end header.ly ---

% --- included from defs.ly ---

paperOFF = { \set Score.skipTypesetting = ##t }
paperON = { \set Score.skipTypesetting = ##f }

barRest =  { s1 }

myBreak = { \break }

%% Hide note heads
hh  = { \override NoteHead.transparent = ##t }
uhh = { \revert NoteHead.transparent }
ohh = { \once\override NoteHead.transparent = ##t  }
% ohh = { \once\override NoteColumn.force-hshift = #1 }

% hide note entirely (stem up)
ohnu = {
    \once\override NoteHead.transparent = ##t
    \once\override Stem.transparent = ##t
    \once\override Stem.direction = #1
    \once\override Beam.transparent = ##t
}
% hide note entirely (stem down)
ohnd = {
    \once\override NoteHead.transparent = ##t
    \once\override Stem.transparent = ##t
    \once\override Stem.direction = #-1
    \once\override Beam.transparent = ##t
}


%% Force clashing note columns ('line up')
ignoreClash = \once \override NoteColumn.ignore-collision = ##t
lu  = { \override NoteColumn.force-hshift = #0 \ignoreClash }
ulu = { \revert NoteColumn.force-hshift }
olu = { \once\override NoteColumn.force-hshift = #0 \ignoreClash }

%% Change staff
csrh = { \change Staff = "rh" }
cslh = { \change Staff = "lh" }

%% simpler sustain commands
sd  =  { s8\sustainOn }
su  =  { s8\sustainOff }
sud =  { s8\sustainOff\sustainOn }

%% Dyn Text Spanners
setDimSpanner = {
  \override TextSpanner.bound-details.left.text = \markup { \left-align \italic "dim." }
  \override TextSpanner.direction = -1 %down
  \override TextSpanner.bound-details.left.stencil-align-dir-y = #CENTER
  \override TextSpanner.padding = #3.8
}
setCrescSpanner = {
  \override TextSpanner.bound-details.left.text = \markup { \italic "cresc." }
  \override TextSpanner.direction = -1 %down
  \override TextSpanner.bound-details.left.stencil-align-dir-y = #CENTER
  \override TextSpanner.padding = #3.8
}

%% tuplets
hideTupletBracket = \override TupletBracket.bracket-visibility = ##f
showTupletBracket = \revert TupletBracket.bracket-visibility
tupletNumberDown = \once \override TupletNumber.Y-offset = #-0.6

%% positioning
posDynTxtA = \once \override DynamicText.extra-offset = #'(0 . -0.8)
posDynSpanA = \once \override DynamicTextSpanner.extra-offset = #'(0 . -1.5)
posTxtScriptA = \once \override TextScript.extra-offset = #'(2 . 1)
posTxtScriptB = \once\override TextScript.extra-offset = #'(-4 . 0)
posHairpinA = \once \override Hairpin.extra-offset = #'(0 . -1.4)
beamFlattenA = \once \override Beam.damping = #+inf.0
beamFlattenB = \once\override Beam.damping = #5

%% labels
txtSostenuto = \markup { \override #'( baseline-skip . 1.6 )
                  \column { \bold \large "Sostenuto" 
                            \line { \hspace #4 \italic "con espressione e semplice" }
                  }
} 
% --- end defs.ly ---

% --- included from sec1.ly ---

% --- included from defs.ly ---

paperOFF = { \set Score.skipTypesetting = ##t }
paperON = { \set Score.skipTypesetting = ##f }

barRest =  { s1 }

myBreak = { \break }

%% Hide note heads
hh  = { \override NoteHead.transparent = ##t }
uhh = { \revert NoteHead.transparent }
ohh = { \once\override NoteHead.transparent = ##t  }
% ohh = { \once\override NoteColumn.force-hshift = #1 }

% hide note entirely (stem up)
ohnu = {
    \once\override NoteHead.transparent = ##t
    \once\override Stem.transparent = ##t
    \once\override Stem.direction = #1
    \once\override Beam.transparent = ##t
}
% hide note entirely (stem down)
ohnd = {
    \once\override NoteHead.transparent = ##t
    \once\override Stem.transparent = ##t
    \once\override Stem.direction = #-1
    \once\override Beam.transparent = ##t
}


%% Force clashing note columns ('line up')
ignoreClash = \once \override NoteColumn.ignore-collision = ##t
lu  = { \override NoteColumn.force-hshift = #0 \ignoreClash }
ulu = { \revert NoteColumn.force-hshift }
olu = { \once\override NoteColumn.force-hshift = #0 \ignoreClash }

%% Change staff
csrh = { \change Staff = "rh" }
cslh = { \change Staff = "lh" }

%% simpler sustain commands
sd  =  { s8\sustainOn }
su  =  { s8\sustainOff }
sud =  { s8\sustainOff\sustainOn }

%% Dyn Text Spanners
setDimSpanner = {
  \override TextSpanner.bound-details.left.text = \markup { \left-align \italic "dim." }
  \override TextSpanner.direction = -1 %down
  \override TextSpanner.bound-details.left.stencil-align-dir-y = #CENTER
  \override TextSpanner.padding = #3.8
}
setCrescSpanner = {
  \override TextSpanner.bound-details.left.text = \markup { \italic "cresc." }
  \override TextSpanner.direction = -1 %down
  \override TextSpanner.bound-details.left.stencil-align-dir-y = #CENTER
  \override TextSpanner.padding = #3.8
}

%% tuplets
hideTupletBracket = \override TupletBracket.bracket-visibility = ##f
showTupletBracket = \revert TupletBracket.bracket-visibility
tupletNumberDown = \once \override TupletNumber.Y-offset = #-0.6

%% positioning
posDynTxtA = \once \override DynamicText.extra-offset = #'(0 . -0.8)
posDynSpanA = \once \override DynamicTextSpanner.extra-offset = #'(0 . -1.5)
posTxtScriptA = \once \override TextScript.extra-offset = #'(2 . 1)
posTxtScriptB = \once\override TextScript.extra-offset = #'(-4 . 0)
posHairpinA = \once \override Hairpin.extra-offset = #'(0 . -1.4)
beamFlattenA = \once \override Beam.damping = #+inf.0
beamFlattenB = \once\override Beam.damping = #5

%% labels
txtSostenuto = \markup { \override #'( baseline-skip . 1.6 )
                  \column { \bold \large "Sostenuto" 
                            \line { \hspace #4 \italic "con espressione e semplice" }
                  }
} 
% --- end defs.ly ---

sInull =  {
                                % section 1: 27 bars
    \repeat unfold 4 {\barRest|} \myBreak
    \repeat unfold 5 {\barRest|} \myBreak
    \repeat unfold 5 {\barRest|} \myBreak
    \repeat unfold 5 {\barRest|} \myBreak
    \repeat unfold 4 {\barRest|} \myBreak
    \repeat unfold 4 {\barRest|} \myBreak
}

sIrh =  \relative f'' {
    \clef treble
    \key df \major
    \time 4/4

                                % 1 - 4
    \posTxtScriptB
    f8.^\(^\txtSostenuto df16 af2 bf4 |
    c2. df4 |
    \stemUp
    ef8. f16 gf2 f4  |
    \hideTupletBracket
    f4. ef8 df4( \slashedGrace ef8) \tupletNumberDown \tuplet 7/2 { ef8[( f ef d8 ef f gf]) } |
    \showTupletBracket

                                % 5 - 8
    \stemNeutral
    f8. df16 af2 bf4 |
    c2. df4 |
    \stemUp
    ef8. f16 gf2 f4 |
    f4. ef8 df4\) \stemNeutral c8( df |

                                % 9 - 12
    ef4 ef2 f4 |
    gf8 f ef df f2 |
    ef8 cf bf af bf4 \appoggiatura {cf8[ bf af]} bf8. cf16 |
    af4) ef'( df ff |

                                % 13 - 16
    ef4 ef2 f4 |
    gf8 f ef df f2~ |
    f8 df c bf c4 \appoggiatura {df8[ c bf]} c8 df |
    bf4) f'( ef gf |

                                % 17 - 19
    f8 df c bf c4 \appoggiatura {df8[ c bf]} c8. df16 |
    bf4) ef( f ef |
    f2. ef4 |

                                % 20 - 23
    f8.)\( df16 af2 bf4 |
    c2. df4 |
    \stemUp
    ef8. f16 gf2 f4 |
    \hideTupletBracket
    f4. ef8 df4 \omit TupletNumber \tuplet 7/2 { d8([ ef e f af8 g gf)\)] } |
    \showTupletBracket

                                % 24 - 27
    \stemNeutral
    f8.\( df16 af2 bf4 |
    c2. df4 |
    \stemUp
    ef8. f16 gf2 c,4 |
    ef2\) r2 |

}

sIlh =  \relative df {
    \clef bass
    \key df \major
    \time 4/4

    \stemDown
                                % 1
    <<
        \stemDown
        { df8[ af' \ohh<df f> af] af af <df f> af } \\
        { s4 <df f>2 s4 }
    >> |

                                % 2
    <<
        \stemDown
        { \ohh<ef gf>8 af, af af bf af <df f> af } \\
        { <ef' gf>2. }
    >> |

                                % 3
    <<
        \relative gf' {
            \stemDown
            \beamFlattenB
            \csrh gf8[ \cslh af,16 \csrh af' \ohh bf8 \cslh af,]
            af8 af \csrh <df af'> \cslh af
        } \\
        \relative c'  { \stemDown \csrh c2. } \\ % [mils] expect warning: Too many clashing notecolumns
        \relative af  { \stemUp   s8 af4 s4 af} \\
        \relative bf' { \stemDown s4 \csrh \olu bf2 } \\
    >> |

                                % 4
    <<
        \stemDown
        { \csrh \beamFlattenA af8 \cslh af, \csrh gf' \cslh af, \csrh \beamFlattenA <df f> \cslh af \csrh <c gf'> \cslh af } \\
        { \csrh c2 } % [mils] expect warning: Too many clashing notecolumns
    >> |

                                % 5
    <<
        \stemDown
        { df,8 af' \ohh <df f> af af af af af }\\
        { s4 <df f>2. }
    >> |

                                % 6
    <<
        \stemDown
        { \ohh<ef gf>8 af, af af bf af <df f> af } \\
        { <ef' gf>2. }
    >> |

                                % 7
    <<
        \relative gf' {
            \stemDown
            \once\override Beam.damping = #2
            \csrh gf8[ \cslh af,16 \csrh af' \ohh bf8 \cslh af,]
            af8 af \csrh <df af'> \cslh af
        } \\
        \relative c'  { \stemDown \csrh c2. } \\ % [mils] expect warning: Too many clashing notecolumns
        \relative af  { \stemUp   s8 af4 s4 af} \\
        \relative bf' { \stemDown s4 \csrh \olu bf2 } \\
    >> |

                                % 8
    <<
        \stemDown
        { \csrh \beamFlattenA af8 \cslh af, \csrh ef' \cslh af, <df f> af <df f> af } \\
        { \csrh c2 } % [mils] expect warning: Too many clashing notecolumns
    >> |

                                % 9 - 12
    af,8 af' ef' af, <cf ef> af <df, cf' f> df' |
    <bf gf>8 df <bf gf'> df df, af' <df f> af |
    ef8 af <cf ef> af ef g <df' ef> g, |
    af,8 af' <cf ef> af <bf df> af <df ff> af |

                                % 13
    <<
        \stemDown
        { af,8 af' \ohh <cf ef> af af af <cf f> af } \\
        { s4 <cf ef>2 }
    >> |
                                % 14 - 16
    ef,8 gf <bf gf'> gf bf, f' <bf df f> f |
    f,8 f' <bf df f> f f, f' <a ef' f> f |
    bf,8 f' <df' f> f, <c' ef> f, <ef' gf> f, |

                                % 17 - 18
    <df' f>8 f, <bf df f> f <a ef'> f <ef' f> f, |
    bf,8 f' <c' ef> f, <df' f> f, <c' ef> f, |

                                % 19
    <<
        \stemDown
        { \ohh <df' f>8 f, f f <df' f> gf, <c ef> af } \\
        { <df f>2 s8 \stemUp gf,4 }
    >>

                                % 20
    <<
        \stemDown
        { df8 af' \ohh <df f> af af af <df f> af } \\
        { s4 <df f>2}
    >> |

                                % 21
    <<
        \stemDown
        { \ohh <ef gf>8 af, af af bf af <df f> af } \\
        { <ef' gf>2 }
    >> |

                                % 22
    <<
        \relative gf' {
            \stemDown
            \once\override Beam.damping = #2
            \csrh gf8[ \cslh af,16 \csrh af' \ohh bf8 \cslh af,]
            af8 af \csrh <df af'> \cslh af
        } \\
        \relative c'  { \stemDown \csrh c2. } \\ % [mils] expect warning: Too many clashing notecolumns
        \relative af  { \stemUp   s8 af4 s4 af} \\
        \relative bf' { \stemDown s4 \csrh \olu bf2 } \\
    >> |

                                % 23
    \csrh \beamFlattenA <c af'>8 \cslh af \csrh <c gf'> \cslh af \csrh \beamFlattenA <df f> \cslh af \csrh <c gf'> \cslh af |

                                % 24
    <<
        \stemDown
        { df,8 af' \ohh <df f> af af af af af } \\
        { s4 <df f>2}
    >> |

                                % 25
    <<
        \stemDown
        { \ohh <ef gf>8 af, af af bf af <df f> af } \\
        { <ef' gf>2 }
    >> |

                                % 26
    <<
        \relative gf' {
            \stemDown
            \once\override Beam.damping = #2
            \csrh gf8[ \cslh af,16 \csrh af' \ohh bf8 \cslh af,]
            af8 af \csrh ef' \cslh af,
        } \\
        \relative c'  { \stemDown \csrh c2. } \\ % [mils] expect warning: Too many clashing notecolumns
        \relative af  { \stemUp   s8 af4 s4 af} \\
        \relative bf' { \stemDown s4 \csrh \olu bf2 } \\
    >> |

                                % 27
    <<
        \stemDown
        \once\override Beam.damping = #4
        { \csrh \ohh gf8 \cslh af, af af af af af af } \\
        { \csrh gf'2 } % [mils] expect warning: Too many clashing notecolumns
    >> |
}

sIsustain =  {
                                % 1 - 4
    \sd s8 s s s s s \su |
    \sd s s s \su s \sd s |
    \sud s \sud s s s \sud s |
    \sud s s s \sud s \sud \su |

                                % 5 - 8
    \sd s s s s s \su s |
    \sd s s s \su s \sd s |
    \sud s \sud s s s \sud s |
    \sud s s s \sud s s \su |

                                % 9 - 12
    \sd s s s \sud s \sud s |
    \sud s s s \sud s s s |
    \sud s s s \sud s s \su |
    \sd s s \su s s s s |

                                % 13 - 16
    \sd s s s s s \su s |
    \sd s s s \sud s s s |
    \sud s s s \sud s s s |
    \sud s s \su s s s s |

                                % 17 - 19
    \barRest |
    \sd s8 s \su s s s s |
    \sd s s \su s s s s |

                                % 20 - 23
    \sd s8 s s s s \su s |
    \sd s s s \su s \sd s |
    \sud s \sud s s s \sud s |
    \sud s s s \sud s \sud \su |

                                % 24 - 27
    \sd s s s s s \su s |
    \sd s s s \su s \sd s |
    \sud s \sud s s s s s |
    s s s s s s s \su |
}

sIdyn =  {
                                % 1 - 4
    \posDynTxtA s8\p s s s s s s s |
    s8\< s s s s s s s |
    s s s s\! s\> s s s |
    s s s s\! s s s s|

                                % 5 - 8
    \barRest |
    s8\< s s s s s s s |
    s s s\! s\> s s s s |
    s s s s\! s s \posDynTxtA s\p s |

                                % 9 - 12
    \barRest |
    \barRest |
    \barRest |
    \barRest |

                                % 13 - 16
    s8 s s\< s s s s\! s |
    s\> s s s\! s s s s |
    \barRest |
    \barRest |

                                % 17 - 20
    \barRest |
    s8 s s\< s s s s s |
    s\! s s\> s s s s\! s |
    \posDynTxtA s\p s s s s s s s|

                                % 21 - 24
    s8\< s s s s s s s |
    s s s\!\> s s s s s |
    s s s s\! s s s s |
    \barRest |

                                % 25 - 27
    s8\< s s s s s s s |
    s s s s\> s s s s |
    s\! s s s s s s s|
}

% --- end sec1.ly ---
% --- included from sec2.ly ---

% --- included from defs.ly ---

paperOFF = { \set Score.skipTypesetting = ##t }
paperON = { \set Score.skipTypesetting = ##f }

barRest =  { s1 }

myBreak = { \break }

%% Hide note heads
hh  = { \override NoteHead.transparent = ##t }
uhh = { \revert NoteHead.transparent }
ohh = { \once\override NoteHead.transparent = ##t  }
% ohh = { \once\override NoteColumn.force-hshift = #1 }

% hide note entirely (stem up)
ohnu = {
    \once\override NoteHead.transparent = ##t
    \once\override Stem.transparent = ##t
    \once\override Stem.direction = #1
    \once\override Beam.transparent = ##t
}
% hide note entirely (stem down)
ohnd = {
    \once\override NoteHead.transparent = ##t
    \once\override Stem.transparent = ##t
    \once\override Stem.direction = #-1
    \once\override Beam.transparent = ##t
}


%% Force clashing note columns ('line up')
ignoreClash = \once \override NoteColumn.ignore-collision = ##t
lu  = { \override NoteColumn.force-hshift = #0 \ignoreClash }
ulu = { \revert NoteColumn.force-hshift }
olu = { \once\override NoteColumn.force-hshift = #0 \ignoreClash }

%% Change staff
csrh = { \change Staff = "rh" }
cslh = { \change Staff = "lh" }

%% simpler sustain commands
sd  =  { s8\sustainOn }
su  =  { s8\sustainOff }
sud =  { s8\sustainOff\sustainOn }

%% Dyn Text Spanners
setDimSpanner = {
  \override TextSpanner.bound-details.left.text = \markup { \left-align \italic "dim." }
  \override TextSpanner.direction = -1 %down
  \override TextSpanner.bound-details.left.stencil-align-dir-y = #CENTER
  \override TextSpanner.padding = #3.8
}
setCrescSpanner = {
  \override TextSpanner.bound-details.left.text = \markup { \italic "cresc." }
  \override TextSpanner.direction = -1 %down
  \override TextSpanner.bound-details.left.stencil-align-dir-y = #CENTER
  \override TextSpanner.padding = #3.8
}

%% tuplets
hideTupletBracket = \override TupletBracket.bracket-visibility = ##f
showTupletBracket = \revert TupletBracket.bracket-visibility
tupletNumberDown = \once \override TupletNumber.Y-offset = #-0.6

%% positioning
posDynTxtA = \once \override DynamicText.extra-offset = #'(0 . -0.8)
posDynSpanA = \once \override DynamicTextSpanner.extra-offset = #'(0 . -1.5)
posTxtScriptA = \once \override TextScript.extra-offset = #'(2 . 1)
posTxtScriptB = \once\override TextScript.extra-offset = #'(-4 . 0)
posHairpinA = \once \override Hairpin.extra-offset = #'(0 . -1.4)
beamFlattenA = \once \override Beam.damping = #+inf.0
beamFlattenB = \once\override Beam.damping = #5

%% labels
txtSostenuto = \markup { \override #'( baseline-skip . 1.6 )
                  \column { \bold \large "Sostenuto" 
                            \line { \hspace #4 \italic "con espressione e semplice" }
                  }
} 
% --- end defs.ly ---

sIInull =  {
    \repeat unfold 4 {\barRest|} \myBreak % 28 - 31
    \repeat unfold 4 {\barRest|} \myBreak % 32 - 35
    \repeat unfold 4 {\barRest|} \myBreak % 36 - 39
    \repeat unfold 5 {\barRest|} \myBreak % 40 - 44
    \repeat unfold 6 {\barRest|} \myBreak % 45 - 50
    \repeat unfold 5 {\barRest|} \myBreak % 51 - 55
    \repeat unfold 5 {\barRest|} \myBreak % 56 - 60
    \repeat unfold 5 {\barRest|} \myBreak % 61 - 65
    \repeat unfold 5 {\barRest|} \myBreak % 66 - 70
    \repeat unfold 5 {\barRest|} \myBreak % 71 - 75
}

% right-hand upper voice
sIIrhI =  {
    \relative gs {
        \key cs \minor
        \slurUp

                                % 28 - 31
        gs8^\markup{\bold\large "Poco più animato"}( gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |

                                % 32 - 35
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs8 <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'>) |

                                % 36 - 39
        <gs gs'>( <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> |
        <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> |
        <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> |
        <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> |

                                % 40 - 43
        <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> |
        <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> |
        <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> |
        <b ds gs b>_> gs gs gs gs gs gs gs) |

                                % 44 - 47
        gs8( gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |

                                % 48 - 51
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs8 \ignoreClash <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'>) |

                                % 52 - 55
        <gs gs'>( <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> |
        <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> |
        <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> |
        <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> <gs gs'> \ignoreClash <gs gs'> |

                                % 56 - 59
        <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> |
        <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> |
        <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> <b b'> |
        <b ds gs b>_> gs' gs gs gs gs gs gs) |

                                % 60 - 63
        <bs bs,>2( <cs cs,> |
        <ds cs ds,>2. <ds bs ds,>4 |
        <e ds e,>4 <e cs e,> <ds cs ds,> <ds bs ds,> |
        <cs cs,>1 |

                                % 64 - 67
        <bs, ds gs>2 <cs e gs>4 <as cs gs'> |
        <bs ds gs>4 <cs e gs> <as cs gs'> <cs e gs> |
        <cs e gs> <bs ds gs> <ds fs gs> <cs e gs> |
        <bs ds gs>1 |

                                % 68 - 71
        <bs ds bs'>2 <cs cs'> |
        <ds cs' ds>2. <ds bs' ds>4 |
        <e ds' e>4 <e cs' e> <ds cs' ds> <ds bs' ds> |
        <gs b cs>2 <gs a cs>4 <fs a cs> |

                                % 72 - 75
        <ds fs gs>2 <cs fs gs>4 <cs e as> |
        <cs e as>2 <bs ds gs>4) <cs e as>( |
        <cs e as>2 <bs ds gs>4) <cs e as>( |
        <cs e as> <bs ds gs>) b'2\rest
    }
}


% right-hand lower voice
sIIrhII =  {
    \relative cs' {
        \key cs \minor
        \stemDown
        \slurDown
                                % 28 - 31
        \barRest |
        \barRest |
        \barRest |
        \barRest |

                                % 32 - 35
        \barRest |
        \barRest |
        \barRest |
        \barRest |

                                % 36 - 39
        s4 s cs bs |
        s s ds cs~ |
        cs ds e ds |
        ds1 |

                                % 40 - 43
        <e gs>2_> <ds gs>_> |
        <e gs>_> <ds gs>_> |
        <ds gs>_> <ds fss>_> |
        \barRest |

                                % 44 - 47
        \barRest |
        \barRest |
        \barRest |
        \barRest |

                                % 48 - 51
        \barRest |
        \barRest |
        \barRest |
        \barRest |

                                % 52 - 55
        s4 s cs bs |
        s s ds cs~ |
        cs ds e ds |
        ds1 |

                                % 56 - 59
        <e gs>2_> <ds gs>_> |
        <e gs>_> <ds gs>_> |
        <ds gs>_> <ds fss>_> |
        \barRest |

                                % 60 - 63
        \override Beam.positions = #'(-5 . -5)
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs8 gs gs gs gs gs gs gs |
        gs gs fs fs gs gs a a |
        \revert Beam.positions

                                % 64 - 67
        gs,8 gs gs gs gs gs gs gs |
        gs gs gs gs gs gs gs gs |
        gs gs gs gs gs gs gs gs |
        gs gs gs gs gs gs gs gs |

                                % 68 - 71
        \override Beam.positions = #'(-5 . -5)
        gs'8 gs gs gs gs gs gs gs |
        gs gs gs gs gs gs gs gs |
        gs gs gs gs gs gs gs gs |
        \revert Beam.positions
        cs, cs cs cs cs cs cs cs |

                                % 72 - 75
        gs8 gs gs gs gs gs gs gs |
        gs gs gs gs gs gs gs gs |
        gs gs gs gs gs gs gs gs |
        gs gs gs gs {
            \dynamicUp
            \set decrescendoText = \markup { \italic "dim." }
            \set decrescendoSpanner = #'text
            \once \override DynamicTextSpanner.extra-offset = #'( 1.3 . -6.1)
            af[\> af af \cslh \stemUp af\!]
        }|
    }
}


sIIrh =   {
    <<
        { \context Voice = "upper" {\sIIrhI} } \\
        { \context Voice = "lower" {\sIIrhII} }
    >>
}

sIIdyn =   {
                                % 28 - 31
    \context Voice = "upper" { s8_\markup{\italic "sotto voce"} s s s s s s s | }
    \barRest |
    \barRest |
    \barRest |

                                % 32 - 35
    \barRest |
    \barRest |
    \barRest |
    \context Voice = "lower" {
       
        %% transparent note to align "cresc" correctly
        \ohnu gs8\p s \ohnu \setCrescSpanner gs\startTextSpan s s s s s | % [mils] expect warning: Too many clashing notecolumns
    }

                                % 36 - 39
    \barRest |
    \barRest |
    \barRest |
    \context Voice = "lower" { s8 s s s s s s \ohnu gs\stopTextSpan | } % [mils] expect warning: Too many clashing notecolumns

                                % 40 - 43
    \context Voice = "lower" { s8\ff s s s s s s s | }
    \barRest |
    \barRest |

    \context Voice = "upper" {
        \setDimSpanner
        s8 s\startTextSpan s s s s s s\stopTextSpan |
    }

                                % 44 - 47
    \context Voice = "upper" { s8\p s s s s s s s | }
    \barRest |
    \barRest |
    \barRest |

                                % 48 - 51
    \barRest |
    \barRest |
    \barRest |

    \context Voice = "lower" {
        %% transparent note to align "cresc" correctly
        \ohnu gs8\p \ohnu gs\startTextSpan s s s s s s | % [mils] expect warning: Too many clashing notecolumns
    }
                                % 52 - 55
    \barRest |
    \barRest |
    \barRest |
    \context Voice = "lower" { s8 s s s s s s \ohnu gs\stopTextSpan | } % [mils] expect warning: Too many clashing notecolumns

                                % 56 - 59
    \context Voice = "upper" { s8\ff s s s s s s s | }
    \barRest |
    \barRest |
    \context Voice = "upper" {
        \crescTextCresc
        s8\fz \setDimSpanner  s_\startTextSpan s s s s s s\stopTextSpan |
    }

                                % 60 - 63
    \context Voice = "lower" { s\p s s s s s s s | }
    \barRest |
    \barRest |
    \context Voice = "lower" { s8\> s s s s s s s\! | }

                                % 64 - 67
    \context Voice = "lower" { s8\p s s s s s s s | }
    \barRest |
    \barRest |
    \barRest |

                                % 68 - 71
    \context Voice = "lower" {
        s8\p\< s s s s s s s |
        s s s s s s s s\! |
        s\f s s s s s s s |
        s s s s s\> s s s\! |
    }

                                % 72 - 75
    \context Voice = "lower" {
        s8\< s s s s s s s\! |
        s\> s s s s s s s\! |
        s\> s s s s s s s\! |
        s\> s s s\! s s s s |
    }
}

% left-hand
sIIlh =  \relative gs, {
    \key cs \minor
    \slurDown

                                % 28 - 31
    \once\override Slur.height-limit = #3
    <gs cs,>4\<( <gs ds> <cs e,> <bs ds,> |
    <gs ds> <gs e> <ds' fs,> <cs e,> |
    <cs e,> <ds gs,> <e cs> <ds gs,>\! |
    <ds gs,>1\>~ |

                                % 32 - 35
    <ds gs,>4 <e cs> <ds gs,> <cs e,> |
    <ds gs,> <cs e,> <bs ds,> <cs e,>\! |
    <bs ds,>\< <cs e,> <ds ds,> <e cs,>\! |
    <ds gs,>1) |

                                % 36 - 39
    <gs, cs,>4( <gs ds> <cs e,> <bs ds,> |
    <gs ds> <gs e> <ds' fs,> <cs e,> |
    <cs e,> <ds gs,> <e cs> <ds gs,> |
    \appoggiatura gs,,8) <ds'' gs,>1 |

                                % 40 - 43
    <e, e,>2( <b' b,> |
    <e, e,> <b' b,>4. <as as,>8 |
    <gs gs,>2 <ds' ds,> |
    <gs, gs,>) r2 |

                                % 44 - 47
    <gs cs,>4\<( <gs ds> <cs e,> <bs ds,> |
    <gs ds> <gs e> <ds' fs,> <cs e,> |
    <cs e,> <ds gs,> <e cs> <ds gs,>\! |
    <ds gs,>1\>~ |

                                % 48 - 51
    <ds gs,>4 <e cs> <ds gs,> <cs e,> |
    <ds gs,> <cs e,>\! <bs ds,> <cs e,> |
    <bs ds,>\< <cs e,> <ds ds,> <e cs,>\! |
    <ds gs,>1) |

                                % 52 - 55
    <gs, cs,>4( <gs ds> <cs e,> <bs ds,> |
    <gs ds> <gs e> <ds' fs,> <cs e,> |
    <cs e,> <ds gs,> <e cs> <ds gs,> |
    \appoggiatura gs,,8) <ds'' gs,>1 |

                                % 56 - 59
    <e, e,>2( <b' b,> |
    <e, e,> <b' b,>4. <as as,>8 |
    <gs gs,>2 <ds' ds,> |
    <gs, gs,>) r2 |

                                % 60 - 63
    <fs gs ds'>2( << { <e e'>4 <cs cs'> } \\
                    { gs'2 } >> |
    <gs gs,>2.) <gs gs'>4( |
    <cs gs'>2 <gs gs'> |
    <a a'> <gs gs'>4 <fs fs'> |

                                % 64 - 67
    gs2) <gs cs,> |
    <gs gs,>4 <gs cs,>2._> |
    <gs cs,>4 <gs gs,>2_> <gs cs,>4 |
    <gs gs,>1 |

                                % 68 - 71
    << { <fs fs'>2( <e gs e'>4 <cs cs'> | <gs gs'>1) } \\
       { gs'8 gs gs gs } >>  |
    <gs cs,>2 <gs gs'> |
    <es es'>2 <fs fs'> |

                                % 72 - 75
    <bs bs,>2 <cs cs,> |
    <gs gs,>2. <gs cs,>4 |
    <gs gs,>2. <gs cs,>4 |
    << { gs4
         \once\override TextScript.staff-padding = #0
         gs_\markup{\italic "poco rit."} } \\
       { gs,2 } >> af''8[ f gf ef] |
}

% sustain
sIIsustain =  {
                                % 28 - 31
    s8\unaCorda s s s s s s s |
    \barRest |
    \barRest |
    \barRest |
                                % 32 - 35
    \barRest |
    \barRest |
    \barRest |
    \sd s8 s s s s s \su |
                                % 36 - 39
    s8\treCorde s s s s s s s |
    \barRest |
    \barRest |
    \sd s8 s s s s s \su |

                                % 40 - 43
    \sd s s s \sud s s s |
    \sud s s s \sud s s s |
    \sud s s s \sud s s s |
    \sud s s s s s s \su |

                                % 44 - 47
    s8\unaCorda s s s s s s s |
    \barRest |
    \barRest |
    \barRest |

                                % 48 - 51
    \barRest |
    \barRest |
    \barRest |
    \sd s8 s s s s s \su |
                                % 52 - 55
    s8\treCorde s s s s s s s |
    \barRest |
    \barRest |
    \sd s8 s s s s s \su |

                                % 56 - 59
    \sd s s s \sud s s s |
    \sud s s s \sud s s s |
    \sud s s s \sud s s s |
    \sud s s s s s s \su |

                                % 60 - 63
    \sd s s s \sud s s s |
    \sud s s s s \su s s |
    \barRest |
    \barRest |

                                % 64 - 67
    \sd s s s \sud s s \su |
    s s \sd s s s s s |
    s s \sud s s s \sud s |
    \sud s s s s s s \su |

                                % 68 - 71
    \sd s s s \sud s s s |
    \sud s s s s s s s |
    \sud s s s \sud s s s |
    \sud s s s \sud s s s |

                                % 72 - 75
    \sud s s s \sud s s s |
    \sud s s \su s s \sd s |
    s s s \su s s \sd s |
    s s s \su s s s s |

}

% --- end sec2.ly ---
% --- included from sec3.ly ---

% --- included from defs.ly ---

paperOFF = { \set Score.skipTypesetting = ##t }
paperON = { \set Score.skipTypesetting = ##f }

barRest =  { s1 }

myBreak = { \break }

%% Hide note heads
hh  = { \override NoteHead.transparent = ##t }
uhh = { \revert NoteHead.transparent }
ohh = { \once\override NoteHead.transparent = ##t  }
% ohh = { \once\override NoteColumn.force-hshift = #1 }

% hide note entirely (stem up)
ohnu = {
    \once\override NoteHead.transparent = ##t
    \once\override Stem.transparent = ##t
    \once\override Stem.direction = #1
    \once\override Beam.transparent = ##t
}
% hide note entirely (stem down)
ohnd = {
    \once\override NoteHead.transparent = ##t
    \once\override Stem.transparent = ##t
    \once\override Stem.direction = #-1
    \once\override Beam.transparent = ##t
}


%% Force clashing note columns ('line up')
ignoreClash = \once \override NoteColumn.ignore-collision = ##t
lu  = { \override NoteColumn.force-hshift = #0 \ignoreClash }
ulu = { \revert NoteColumn.force-hshift }
olu = { \once\override NoteColumn.force-hshift = #0 \ignoreClash }

%% Change staff
csrh = { \change Staff = "rh" }
cslh = { \change Staff = "lh" }

%% simpler sustain commands
sd  =  { s8\sustainOn }
su  =  { s8\sustainOff }
sud =  { s8\sustainOff\sustainOn }

%% Dyn Text Spanners
setDimSpanner = {
  \override TextSpanner.bound-details.left.text = \markup { \left-align \italic "dim." }
  \override TextSpanner.direction = -1 %down
  \override TextSpanner.bound-details.left.stencil-align-dir-y = #CENTER
  \override TextSpanner.padding = #3.8
}
setCrescSpanner = {
  \override TextSpanner.bound-details.left.text = \markup { \italic "cresc." }
  \override TextSpanner.direction = -1 %down
  \override TextSpanner.bound-details.left.stencil-align-dir-y = #CENTER
  \override TextSpanner.padding = #3.8
}

%% tuplets
hideTupletBracket = \override TupletBracket.bracket-visibility = ##f
showTupletBracket = \revert TupletBracket.bracket-visibility
tupletNumberDown = \once \override TupletNumber.Y-offset = #-0.6

%% positioning
posDynTxtA = \once \override DynamicText.extra-offset = #'(0 . -0.8)
posDynSpanA = \once \override DynamicTextSpanner.extra-offset = #'(0 . -1.5)
posTxtScriptA = \once \override TextScript.extra-offset = #'(2 . 1)
posTxtScriptB = \once\override TextScript.extra-offset = #'(-4 . 0)
posHairpinA = \once \override Hairpin.extra-offset = #'(0 . -1.4)
beamFlattenA = \once \override Beam.damping = #+inf.0
beamFlattenB = \once\override Beam.damping = #5

%% labels
txtSostenuto = \markup { \override #'( baseline-skip . 1.6 )
                  \column { \bold \large "Sostenuto" 
                            \line { \hspace #4 \italic "con espressione e semplice" }
                  }
} 
% --- end defs.ly ---

sIIInull =  {
    \repeat unfold 4 {\barRest|} \myBreak
    \repeat unfold 5 {\barRest|} \myBreak
    \repeat unfold 5 {\barRest|} \myBreak
}


sIIIrh =   \context Voice = "vIIIrh" {
    \relative f''{
        \key df \major

                                % 76 - 79
        f8.\( df16 af2 bf4 |
        c2. df4 |
        \stemUp
        ef8. f16 gf2 f4 |
        f4. ef8 df8. d16 \tupletNumberDown \tuplet 10/4 { ef16( f ef d ef e f af g gf) } |

                                % 80 - 83
        \stemNeutral
        f8. df16 af2 bf4 |
        c4\) r r
        bf'^>(~ |
        bf af gf c, |
        f ef df bf |

                                % 84 - 87
        << { <gf ef>1( | f) | <ef gf>1 | <ef gf> } \\
           \context Voice = "vIIIrhLOWER" {
               \stemDown\slurDown\tieDown
               bf2( c | df)~ df8[ df] ef8.[ df16] | df4 c bf' c, | c1_>
           } >> |

                                % 88 - 89
        \override TextScript.staff-padding = #0
        <df f>1 |
        \revert TextScript.staff-padding
        <af df f>)\fermata |
    }
}

sIIIlh =  \relative df {
    \key df \major

    \stemDown
                                % 76
    <<
        \stemDown
        { df8[ af' \ohh<df f> af] af af af af } \\
        { s4 <df f>2 s4 }
    >> |

                                % 77
    <<
        \stemDown
        { \ohh<ef gf>8 af, af af bf af <df f> af } \\
        { <ef' gf>2. }
    >> |

                                % 78
    <<
        \relative gf' {
            \stemDown
            \beamFlattenB
            \csrh gf8[ \cslh af,16 \csrh af' \ohh bf8 \cslh af,]
            af8 af \csrh <df af'> \cslh af
        } \\
        \relative c'  { \stemDown \csrh \ignoreClash c2. } \\ % [mils] expect warning: Too many clashing notecolumns
        \relative af  { \stemUp   s8 af4 s4 af} \\
        \relative bf' { \stemDown s4 \csrh \olu bf2 } \\
    >> |

                                % 79
    <<
        \stemDown
        { \csrh \beamFlattenA af8 \cslh af, \csrh gf' \cslh af, \csrh \beamFlattenA <df f> \cslh af \csrh <c gf'> \cslh af } \\
        { \csrh \ignoreClash c2 } % [mils] expect warning: Too many clashing notecolumns
    >> |

                                % 80
    <<
        \stemDown
        { df,8[ af' \ohh<df f> af] af af af af } \\
        { s4 <df f>2 s4 }
    >> |

                                % 81 - 83
    <ef gf>8 af, af( af bf af) r4 |   % [mils] expect warning rest direction
    R1 |
    R1 |

                                % 84 - 87
    << { r8 af af af af af af af } \\
       { af,1 } >> |
    << { af'8 af af af af af af af } \\
       { df,1 } >> |
    << { af'8 af af af af af af af } \\
       { af,1 } >> |
    << { af'8 af af af af af af af } \\
       { af,1 } >> |

                                % 88 - 89
    << { af'8 \csrh \stemDown af af af af af af af } \\
       { df,2( af | df,1)\fermata } >>
}

sIIIsustain =  {
                                % 76 - 79
    \sd s8 s s s s \su s |
    \sd s s s \su s \sd s |
    \sud s \sud s s s \sud s |
    \sud s s s \sud s \sud s |
                                % 80 - 83
    \sud s s s s s \su s |
    \sd s s \su s s s s |
    \barRest |
    \barRest |

                                % 84 - 89
    \sd s8 s s \sud s s s |
    \sud s s s s s \su s |
    \sd s \sud s s s \su s |
    \sd s s s s s s s |
    \sud s s s s s s s |
    %% let the sustain come up by default
}


sIIIdyn =  \context Voice = "vIIIrh" {
                                % 76 - 79
    \posTxtScriptA \posDynTxtA s8\p_\markup{\italic "a tempo"} s s s s s s s |
    s\< s s s s s s s |
    s s s\! \posHairpinA s\> s s s s\! |
    \set crescendoText = \markup { \italic \smaller \whiteout "smorzando" }
    \set crescendoSpanner = #'text
    s s s s s s s s\< |

                                % 80 - 83
    \barRest |
    s s\!_\markup{\italic "slentando"} s s s s s\f s |
    \crescHairpin
    s\> s s s s s s s |
    s s s s s s s s\! |

                                % 84 - 89
    \context Voice = "vIIIrhLOWER" {
        \override Voice.DynamicLineSpanner.staff-padding = #0.1
        s\p s s s s s s s |
        s s s s s^\< s s s |
        s\! s s s s^\> s s s\! |
        s\pp s s s s s s s |
        \revert Voice.DynamicLineSpanner.staff-padding
    }
    s8^\markup{\italic "riten."} s s s s s s s |
    \barRest |
}

% --- end sec3.ly ---

playRH =  {
                                % section 1
    <<
        \sIrh
        \sIdyn
    >>
    \bar "||"
                                % section 2
    <<
        \sIIrh
        \sIIdyn
    >>
    \bar "||"
                                % section 3
    <<
        \sIIIrh
        \sIIIdyn
    >>
    \bar "|."
}


playLH =  {
                                % section 1
    <<
        \sIlh
        \sIsustain
    >>
    \bar "||"

                                % section 2
    <<
        \sIIlh
        \sIIsustain
    >>
    \bar "||"

                                % section 3
    <<
        \sIIIlh
        \sIIIsustain
    >>
    \bar "|."
}

playNull =  {
     \sInull
     \sIInull
     \sIIInull
}

scoreAll =  {
    \new PianoStaff {
                                % setup instrument
        \set PianoStaff.midiInstrument = "acoustic grand"

                                % PLAY!
        <<
            \context Staff = "rh" {
                                % setup dynamics
                \override Staff.TextScript.staff-padding = #3
                \override Staff.DynamicLineSpanner.staff-padding = #3  % (forced-distance - 6) / 2
                \accidentalStyle Score.modern-cautionary

                                % PLAY RH!
                <<
                    \playRH
                    \playNull
                >>
            }
            \context Staff = "lh" {
                                % setup pedals
                \set Staff.pedalSustainStyle = #'bracket
                \accidentalStyle Score.modern-cautionary

                                % setup dynamics
                \override Staff.TextScript.staff-padding = #3
                \override Staff.DynamicLineSpanner.staff-padding = #3  % (forced-distance - 6) / 2

                                % PLAY LH!
                <<
                    \playLH
                    \playNull
                >>
            }
        >>
    }
}

%%%
%%% MAIN PAPER / MIDI
%%%
\score
{
     { \scoreAll }
    \layout {
        \context {
            \PianoStaff
            \override StaffGrouper.staff-staff-spacing.minimum-distance = #12.2
        }

    }
    \midi {
        \tempo 4 = 80
        %% Remove the dynamics from the midi output
        \context {
            \Voice
            \remove "Dynamic_performer"
        }
    }
}