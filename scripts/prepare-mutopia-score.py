"""Download a Mutopia piano score and compile its tagged practice engraving.

Usage: python3 scripts/prepare-mutopia-score.py WORK_ROOT SOURCES_JSON [id ...]

SOURCES_JSON maps an id to the Mutopia path of the main .ly file. When the
source is a multi-file (-lys.zip) upload, the main file and its includes are
flattened into one original.ly so the bundled source stays self-contained.
The practice copy is converted to LilyPond 2.24, repeats are unfolded and
the note-head tagging engraver from the existing library is prepended.
Requires the `lilypond` Python package (pip install lilypond) and poppler.
"""
import json, pathlib, re, shutil, subprocess, sys, urllib.request, zipfile, io

BASE = 'https://www.mutopiaproject.org/ftp/'
root = pathlib.Path(sys.argv[1]); sources = json.loads(pathlib.Path(sys.argv[2]).read_text())
only = set(sys.argv[3:])
import lilypond
bin_dir = pathlib.Path(lilypond.executable()).parent
ENGRAVER = pathlib.Path('site/scores/fur/practice.ly').read_text().split('\\version')[0]
assert 'practice-engraver' in ENGRAVER


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def flatten(path, seen=()):
    text = path.read_text(encoding='utf-8', errors='replace')
    def inline(m):
        target = (path.parent / m.group(1)).resolve()
        if not target.exists() or target in seen:
            return m.group(0)
        body = flatten(target, seen + (target,))
        body = re.sub(r'^\s*\\version\s+"[^"]+"\s*$', '', body, flags=re.M)
        return f'% --- included from {m.group(1)} ---\n{body}\n% --- end {m.group(1)} ---'
    return re.sub(r'\\include\s+"([^"]+\.ly)"', inline, text)


def unfold_spacers(body, cuts, order):
    """Re-sequence a spacer-only dynamics line (written for the folded score) into repeat order."""
    from fractions import Fraction as F
    timed = []; pos = F(0)
    for t in body.split():
        m = re.match(r's(\d+)(\.?)(?:\*(\d+))?(.*)$', t); assert m, t
        unit = F(1, int(m[1])) * (F(3, 2) if m[2] else 1)
        for k in range(int(m[3] or 1)):
            timed.append((pos, f's{m[1]}{m[2]}' + (m[4] if k == 0 else ''))); pos += unit
    out = []
    for name in order:
        a, b = cuts[name]; out.append(' '.join(t for p, t in timed if a <= p < b))
    return pos, '\n  '.join(out)


def _alla_turca(s):
    # The coda repeat uses manual volta brackets, which \unfoldRepeats cannot see; write it out.
    i = s.index("  \\set Score.repeatCommands = #'(start-repeat)\n  \\rightco"); j = s.index("  \\barNumberCheck #98")
    s = s[:i] + ("  % Coda repeat written out for practice (the source uses manual volta brackets).\n"
                 "  \\rightco\n  \\set Timing.measureLength = #(ly:make-moment 1/4)\n  \\rightcoa\n"
                 "  \\set Timing.measureLength = #(ly:make-moment 2/4)\n  \\set Timing.measurePosition = #(ly:make-moment 1/4)\n"
                 "  \\rightco\n  \\rightcoat\n") + s[j + len("  \\barNumberCheck #98\n"):]
    old = "  a,4\n  \\set Timing.measureLength = #(ly:make-moment 2/4)\n  \\stra a8-. a8-."
    assert old in s
    s = s.replace(old, "  a,4\n  \\set Timing.measureLength = #(ly:make-moment 2/4)\n  \\leftc\n  \\stra a8-. a8-.")
    # The separate dynamics line has no repeats; re-sequence it to follow the unfolded hands.
    from fractions import Fraction as F
    i = s.index('dynamics = {'); j = s.index('\n}', i)
    bounds = [0, 4, 12, 16, 20, 28, 32, 36, 44, F(191, 4), 48, F(97, 2), 64]  # whole notes, from ly:music-length
    names = ['A', 'B', 'C', 'D', 'E', 'C2', 'A2', 'B2', 'co', 'coa', 'coat', 'f']
    cuts = {n: (F(bounds[k]), F(bounds[k + 1])) for k, n in enumerate(names)}
    total, body = unfold_spacers(s[i + len('dynamics = {'):j], cuts, 'A A B B C C D D E E C2 C2 A2 A2 B2 B2 co coa co coat f'.split())
    assert total == 64, total
    return s[:i] + 'dynamics = {\n  % Unfolded to match the written-out repeats of the practice score.\n  ' + body + s[j:]


def _mountain_king(s):
    # LilyPond's MIDI plays \appoggiatura on the beat; the printed three-note runs come before it.
    return re.sub(r"\\appoggiatura \{ (\S+?)\[ ([^}]*)\] \} (<[^>]+>4)", r"\\grace { \1[( \2] } \3)", s)


def _rach_prelude(s):
    # Four staves: "upA"/"upB" are the right hand, "downA"/"downB" the left hand.
    i = s.index('#(define (practice-hand context)'); j = s.index('#(define (practice-engraver context)')
    return s[:i] + ('#(define (practice-hand context)\n  (let* ((staff (ly:context-find context \'Staff))\n'
                    '         (name (if staff (ly:context-id staff) "")))\n    (if (string-prefix? "down" name) "left" "right")))\n\n') + s[j:]


def _impromptu(s):
    # The source plays a separately written MIDI part; generate MIDI from the printed music instead.
    i = s.index('\\score {\n \\unfoldRepeats <<\n  \\new Staff = up '); depth = 0; j = i
    while True:
        depth += {'{': 1, '}': -1}.get(s[j], 0)
        if s[j] == '}' and depth == 0: break
        j += 1
    s = s[:i] + '% MIDI comes from the printed music above.\n' + s[j + 1:]
    k = s.index('pedalSustainStrings = #\'("Ped." "*Ped." "*")\n  }\n }\n'); k += len('pedalSustainStrings = #\'("Ped." "*Ped." "*")\n  }\n }\n')
    return s[:k] + ' \\midi { }\n' + s[k:]


FIXUPS = {
    'alla-turca': _alla_turca,
    'mountain-king': _mountain_king,
    'rach-prelude': _rach_prelude,
    'impromptu-gflat': _impromptu,
    # Hidden slur-anchor notes would sound in MIDI as extra attacks.
    'minute-waltz': lambda s: s.replace("{ \\stemDown \\hideNotes \\forceShift \\shapeSlurOne af4_( c) } ", "{ s2 } "),
    'gnossienne1': lambda s: s.replace("\\new Voice{\\voiceOne \\once \\hideNotes af4 }", "\\new Voice{\\voiceOne s4 }"),
}


for id, path in sources.items():
    if only and id not in only:
        continue
    work = root / id; shutil.rmtree(work, ignore_errors=True); work.mkdir(parents=True)
    folder = path.rsplit('/', 1)[0]; stem = folder.rsplit('/', 1)[1]; main = path.rsplit('/', 1)[1]
    try:
        data = fetch(BASE + path); src = work / 'src'; src.mkdir(); (src / main).write_bytes(data)
    except Exception:
        zdata = fetch(f'{BASE}{folder}/{stem}-lys.zip'); src = work / 'src'; zipfile.ZipFile(io.BytesIO(zdata)).extractall(src)
    mains = list(src.rglob(main)); assert mains, (id, 'main file missing')
    original = flatten(mains[0].resolve(), (mains[0].resolve(),))
    (work / 'original.ly').write_text(original)
    for name in (f'{stem}-a4.pdf', f'{stem}-let.pdf'):
        try:
            (work / 'original.pdf').write_bytes(fetch(f'{BASE}{folder}/{name}')); break
        except Exception:
            continue
    assert (work / 'original.pdf').exists(), (id, 'no source PDF')
    conv = work / 'converted.ly'; conv.write_text(original)
    subprocess.run([str(bin_dir / 'convert-ly'), '-e', '-t', '2.24.0', str(conv)], check=True, capture_output=True)
    text = conv.read_text()
    # Obsolete beaming helpers were removed from LilyPond; drop them (beaming only).
    text = re.sub(r'^.*#\((?:revert|override)-auto-beam-setting.*$', '', text, flags=re.M)
    text = text.replace('\\applyMusic #unfold-repeats', '')
    text = re.sub(r'(\\score\s*\{\s*)(?!\\unfoldRepeats)', r'\1\\unfoldRepeats ', text)
    # Every score needs MIDI output for attack timing.
    if '\\midi' not in text:
        text = re.sub(r'(\\layout\s*\{[^{}]*(\{[^{}]*\}[^{}]*)*\})', r'\1 \\midi { }', text, count=0)
    practice = ENGRAVER + text
    if id in FIXUPS:
        fixed = FIXUPS[id](practice); assert fixed != practice, (id, 'fixup did not apply'); practice = fixed
    (work / 'practice.ly').write_text(practice)
    res = subprocess.run([str(bin_dir / 'lilypond'), '-dbackend=svg', '-dno-point-and-click', '-o', 'practice', 'practice.ly'], cwd=work, capture_output=True, text=True)
    (work / 'compile.log').write_text(res.stdout + res.stderr)
    print(id, 'exit', res.returncode, 'svg', len(list(work.glob('practice*.svg'))), 'midi', sorted(p.name for p in work.glob('practice*.mid*')), flush=True)
    for m in work.glob('practice*.mid'):
        m.rename(m.with_suffix('.midi'))
