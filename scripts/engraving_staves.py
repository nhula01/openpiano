"""Find the staves on a LilyPond SVG page and cut it into grand-staff systems.

Staff lines are the only long, solid, horizontal lines that come in evenly spaced groups of five.
Other long lines on a page (hairpins, which are two slanted lines; dashed 8va and text spanners;
pedal and volta brackets) must never be taken for a staff: one stray line shifts every later
staff into the wrong pair, and the moving score, the sheet playhead and auto-scroll then crop
the wrong part of the page.
"""
import copy, re, xml.etree.ElementTree as ET

from engraving_extent import defs_of, extent, widen

NS = '{http://www.w3.org/2000/svg}'


def _number(text, default='0'):
    return float(text if text not in (None, '') else default)


def staff_lines(tree):
    """{y: (left, right)} for every long, solid, horizontal line drawn directly on the page."""
    edges = {}
    for g in tree:
        if g.get('class') == 'score-note':
            continue
        line, trans = g.find(NS + 'line'), g.get('transform', '')
        if line is None or 'translate' not in trans:
            continue
        x1, x2 = _number(line.get('x1')), _number(line.get('x2'))
        if abs(x2 - x1) <= 20 or abs(_number(line.get('y2')) - _number(line.get('y1'))) > 1e-3:
            continue
        if line.get('stroke-dasharray') or g.get('stroke-dasharray'):
            continue
        x, y = map(float, re.findall(r'[-\d.]+', trans)[:2])
        edges[y] = (x + min(x1, x2), x + max(x1, x2))
    return edges


def staves(edges):
    """Groups of five evenly spaced lines, top to bottom; anything else is not a staff."""
    groups = []
    for y in sorted(edges):
        if groups and y - groups[-1][-1] <= 1.1:
            groups[-1].append(y)
        else:
            groups.append([y])
    found = []
    for g in groups:
        gaps = [b - a for a, b in zip(g, g[1:])]
        if len(g) == 5 and max(gaps) - min(gaps) < .05:
            found.append(g)
    return found


def vertical_spans(tree):
    """[(top, bottom)] of the thin vertical rules on the page (bar lines, span bars, system start bars)."""
    spans = []
    for g in tree:
        if g.get('class') == 'score-note':
            continue
        v = re.findall(r'[-\d.]+', g.get('transform', ''))
        if len(v) < 2:
            continue
        y = float(v[1])
        for c in g:
            tag = c.tag.split('}')[-1]
            if tag == 'rect' and _number(c.get('width')) < 1.5 and _number(c.get('height')) > 2:
                top = y + _number(c.get('y'))
                spans.append((top, top + _number(c.get('height'))))
            elif tag == 'line' and abs(_number(c.get('x2')) - _number(c.get('x1'))) < 1e-3 and abs(_number(c.get('y2')) - _number(c.get('y1'))) > 2:
                a, b = sorted((_number(c.get('y1')), _number(c.get('y2'))))
                spans.append((y + a, y + b))
    return spans


def systems_of(tree, found):
    """Group the staves into systems: [(top staff, bottom staff)]; both are the same staff on a
    one-staff line.

    Neighbouring staves belong to one system when a bar line runs from one to the other. Lines
    where the left-hand staff is hidden have a single staff and no such bar line; passages written
    on four staves (two joined grand staves) form one system. A page with
    no connecting bar lines at all is read as plain grand-staff pairs."""
    spans = vertical_spans(tree)
    joined = [any(a <= up[-1] + .5 and b >= low[0] - .5 for a, b in spans) for up, low in zip(found, found[1:])]
    groups, i = [], 0
    if not any(joined):
        while i < len(found):
            groups.append((found[i], found[i + 1] if i + 1 < len(found) else found[i]))
            i += 2
        return groups
    while i < len(found):
        j = i
        while j + 1 < len(found) and joined[j]:
            j += 1
        groups.append((found[i], found[j]))
        i = j + 1
    return groups


def head_position(g):
    """(x, y) of a tagged notehead group, from its first translated child."""
    inner = g.find(NS + 'g')
    if inner is None:
        return None
    v = re.findall(r'[-\d.]+', inner.get('transform', ''))
    return (float(v[0]), float(v[1])) if len(v) >= 2 else None


def layout(groups, heads):
    """Decide which system each notehead belongs to and where each system's crop begins and ends.

    groups: [(upper, lower)] staves per system; heads: [(beat, x, y)].
    Returns (owner, bounds): owner[k] is the system index of heads[k]; bounds[i] = (y0, y1).

    A head on or near its staves goes to that system. A head far up or down on ledger lines can sit
    closer to the neighbouring system, so it goes to whichever neighbour plays at its moment in time.
    Crops are cut halfway between systems unless that would slice through a system's notes; then the
    cut moves into the free space between the lowest note of one system and the highest of the next.
    """
    centers = [(up[0] + low[-1]) / 2 for up, low in groups]
    near = lambda y: min(range(len(groups)), key=lambda i: abs(y - centers[i]))
    core = lambda y, i: groups[i][0][0] - 1 <= y <= groups[i][1][-1] + 1
    owner = [near(y) for _, _, y in heads]
    span = {}
    for (beat, _, y), i in zip(heads, owner):
        if core(y, i):
            lo, hi = span.get(i, (beat, beat))
            span[i] = (min(lo, beat), max(hi, beat))
    for k, (beat, _, y) in enumerate(heads):
        i = owner[k]
        if core(y, i):
            continue
        # Between which two systems does this head sit?
        j = i - 1 if y < centers[i] else i + 1
        if 0 <= j < len(groups) and j in span and span[j][0] <= beat <= span[j][1] and not (i in span and span[i][0] <= beat <= span[i][1]):
            owner[k] = j
    lowest = {}; highest = {}
    for (_, _, y), i in zip(heads, owner):
        lowest[i] = max(lowest.get(i, y), y); highest[i] = min(highest.get(i, y), y)
    cuts = []
    for i in range(len(groups) - 1):
        cut = (centers[i] + centers[i + 1]) / 2
        a, b = lowest.get(i, groups[i][1][-1]) + 1.5, highest.get(i + 1, groups[i + 1][0][0]) - 1.5
        if not a <= cut <= b and a < b:
            cut = (a + b) / 2
        # Never cut through a staff.
        cuts.append(max(groups[i][1][-1] + 1, min(groups[i + 1][0][0] - 1, cut)))
    bounds = []
    for i in range(len(groups)):
        y0 = cuts[i - 1] if i else min(centers[i] - 19, highest.get(i, centers[i]) - 4)
        y1 = cuts[i] if i + 1 < len(groups) else max(centers[i] + 19, lowest.get(i, centers[i]) + 4)
        bounds.append((y0, y1))
    return owner, bounds


def note_key(g):
    """Identifies a tagged notehead group within its page."""
    inner = g.find(NS + 'g')
    return (g.get('data-beat'), g.get('data-midi'), inner.get('transform') if inner is not None else None)


def crop(tree, left, right, y0, y1, notes=None, extents=None):
    """A copy of the page showing the system drawn in the band y0..y1, and that band grown to hold it.

    Returns (svg, y0, y1). Elements are kept or dropped whole, by where their drawing is centred: a
    bar line or a slur hangs from a point that can lie in the neighbouring band, so its anchor alone
    would put it in the wrong system. The band then grows (by at most 6 staff spaces) so that stems,
    beams, slurs and marks reaching past the cut are not sliced off.

    notes: keys (note_key) of this system's noteheads; they are always kept and every other
    system's noteheads dropped, so a note on ledger lines near the cut never shows up twice.
    extents: page_extents(tree), when several systems are cut from the same page."""
    extents = extents if extents is not None else page_extents(tree)
    cropped = copy.copy(tree)
    for child in list(cropped):
        cropped.remove(child)
    drawn = []
    for child, ext in zip(tree, extents):
        if notes is not None and child.get('class') == 'score-note':
            keep = note_key(child) in notes
        elif ext is not None:
            keep = y0 <= (ext[0] + ext[1]) / 2 <= y1
        else:
            transforms = [e.get('transform', '') for e in child.iter() if 'translate' in e.get('transform', '')]
            keep = not transforms or y0 - 1 <= float(re.findall(r'[-\d.]+', transforms[0])[1]) <= y1 + 1
        if keep:
            cropped.append(copy.deepcopy(child))
            if ext is not None:
                drawn.append(ext)
    y0, y1 = widen(y0, y1, drawn and (min(a for a, _ in drawn), max(b for _, b in drawn)), y0 - 6, y1 + 6, .3)
    cropped.set('viewBox', f'{left} {y0} {right - left} {y1 - y0}')
    return ET.tostring(cropped, encoding='unicode'), y0, y1


def page_extents(tree):
    """(top, bottom) of each top-level element of a page, or None for one that draws nothing."""
    defs = defs_of(tree)
    return [extent(child, defs) for child in tree]


def split_page(tree, heads, page):
    """Cut a tagged page into systems.

    heads: [(beat, x, y, key)] for every notehead on the page (beats already final; key from note_key).
    Returns systems without 'end' (the caller sets it from the next system's start).
    """
    edges = staff_lines(tree)
    found = staves(edges)
    assert found, f'page {page + 1}: no staves found'
    groups = systems_of(tree, found)
    owner, bounds = layout(groups, [h[:3] for h in heads])
    systems, extents = [], page_extents(tree)
    for i, (upper, lower) in enumerate(groups):
        bucket = [h for h, o in zip(heads, owner) if o == i]
        if not bucket:
            continue
        y0, y1 = bounds[i]
        left = min(edges[upper[0]][0], edges[lower[0]][0])
        right = max(edges[upper[0]][1], edges[lower[0]][1])
        positions = {}
        for beat, x, *_ in bucket:
            positions[beat] = min(positions.get(beat, 999), x - left)
        notes = {h[3] for h in bucket} if all(len(h) > 3 for h in bucket) else None
        svg, y0, y1 = crop(tree, left, right, y0, y1, notes, extents)
        systems.append({'svg': svg, 'page': page, 'y': y0, 'height': y1 - y0,
                        'staffTop': upper[0] - y0, 'staffGap': lower[-1] - upper[0], 'start': min(positions),
                        'positions': sorted([[b, x] for b, x in positions.items()]), 'width': right - left})
    return systems
