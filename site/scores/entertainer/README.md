# The Entertainer

Scott Joplin, reproduction of the original 1902 edition.
Mutopia-2016/11/25-263, typeset by Chris Sawer, overhauled by Simon Albrecht.
The score and typesetting are Public Domain according to Mutopia.

Source: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=263
Original files: https://www.mutopiaproject.org/ftp/JoplinS/entertainer/

The PDF, MIDI and LilyPond source here are unmodified. Practice notes are
derived from the MIDI; written repeats are unfolded. The second B pass follows
the published MIDI; it is not automatically transposed for the score's “Repeat
8va” instruction. Printed measure mapping comes from the LilyPond source.
Hand assignments follow MIDI staffs except for the intro’s cross-staff voices,
which are split according to the source. The fingering overlay copies selected checked annotations from Roger
Galloway’s CC BY-SA 4.0 edition. Its full annotated PDF is linked; untranscribed
notes stay blank, with no generated fingerings added.

MIDI SHA-256: 33e4e81ee64ffb2edf90d1c6a1ddee7276507296bfb915c2bb775231a467f066

Regenerate with node scripts/build-entertainer.cjs.

`practice.ly` is the derived engraving input: the same source definitions with
repeats unfolded and an engraver adding beat/pitch attributes to noteheads.
Original PDF remains unchanged. Original page JPEGs are direct PDF renders.
Practice SVG has six pages because repeats are written out for progression.
