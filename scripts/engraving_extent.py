"""How far an engraved SVG element really reaches, vertically.

A staff-system crop must show everything drawn for that system: stems, beams, slurs, octave lines,
pedal marks and tempo or expression text reach well beyond the noteheads. This walks an element's
drawing (paths, lines, rectangles, polygons, ellipses, text and referenced glyphs), applying every
transform, and returns the vertical range it covers in the coordinates of the given root.
"""
import math, re

NS = '{http://www.w3.org/2000/svg}'
XLINK = '{http://www.w3.org/1999/xlink}href'
_NUM = re.compile(r'[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')


def _mul(a, b):
    """Affine a then b, as (a, b, c, d, e, f) like SVG matrix()."""
    return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5])


ID = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def transform_of(text):
    m = ID
    for name, args in re.findall(r'(\w+)\s*\(([^)]*)\)', text or ''):
        v = [float(x) for x in _NUM.findall(args)]
        if name == 'translate': t = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == 'scale': t = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == 'matrix' and len(v) == 6: t = tuple(v)
        elif name == 'rotate':
            r = math.radians(v[0]); c, s = math.cos(r), math.sin(r); t = (c, s, -s, c, 0, 0)
            if len(v) == 3: t = _mul(_mul((1, 0, 0, 1, -v[1], -v[2]), t), (1, 0, 0, 1, v[1], v[2]))
        else: continue
        m = _mul(t, m)
    return m


def _bez(p0, p1, p2, p3, n=12):
    out = []
    for k in range(1, n + 1):
        t = k / n; u = 1 - t
        out.append((u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]))
    return out


def _path_points(d):
    """Points along a path: end points, and curves sampled along their length (control points of a
    slur lie well outside the drawn curve, so they would over-state its reach)."""
    pts, x, y, sx, sy = [], 0.0, 0.0, 0.0, 0.0
    last_c = None  # previous cubic/quadratic control point, for S and T
    last_kind = ''
    for cmd, args in re.findall(r'([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)', d or ''):
        v = [float(n) for n in _NUM.findall(args)]
        rel = cmd.islower(); c = cmd.upper()
        if c == 'Z': x, y = sx, sy; last_kind = ''; continue
        step = {'M': 2, 'L': 2, 'T': 2, 'H': 1, 'V': 1, 'C': 6, 'S': 4, 'Q': 4, 'A': 7}[c]
        for i in range(0, len(v) - step + 1, step):
            a = v[i:i + step]
            ox, oy = (x, y) if rel else (0.0, 0.0)
            P = lambda j: (a[j] + ox, a[j + 1] + oy)
            if c == 'H': x = a[0] + (x if rel else 0); pts.append((x, y)); last_kind = ''; continue
            if c == 'V': y = a[0] + (y if rel else 0); pts.append((x, y)); last_kind = ''; continue
            if c == 'A':
                nx, ny = a[5] + ox, a[6] + oy
                r = max(abs(a[0]), abs(a[1]))
                pts += [(x, y), (nx, ny), ((x + nx) / 2, (y + ny) / 2 - r), ((x + nx) / 2, (y + ny) / 2 + r)]
                x, y = nx, ny; last_kind = ''; continue
            if c in ('M', 'L'):
                x, y = P(0); pts.append((x, y))
                if c == 'M' and i == 0: sx, sy = x, y
                last_kind = ''; continue
            if c == 'C': c1, c2, e = P(0), P(2), P(4)
            elif c == 'S':
                c1 = (2 * x - last_c[0], 2 * y - last_c[1]) if last_kind == 'C' else (x, y); c2, e = P(0), P(2)
            elif c == 'Q':
                q, e = P(0), P(2)
                c1, c2 = (x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y)), (e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1]))
            else:  # T
                q = (2 * x - last_c[0], 2 * y - last_c[1]) if last_kind == 'Q' else (x, y); e = P(0)
                c1, c2 = (x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y)), (e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1]))
            pts += _bez((x, y), c1, c2, e)
            if c in ('Q', 'T'): last_c, last_kind = q, 'Q'
            else: last_c, last_kind = c2, 'C'
            x, y = e
    return pts


def _local_points(el):
    tag = el.tag.split('}')[-1]
    f = lambda k, d=0.0: float(_NUM.findall(el.get(k) or str(d))[0]) if _NUM.findall(el.get(k) or str(d)) else d
    if tag == 'path': return _path_points(el.get('d'))
    if tag == 'line': return [(f('x1'), f('y1')), (f('x2'), f('y2'))]
    if tag == 'rect': x, y = f('x'), f('y'); return [(x, y), (x + f('width'), y + f('height'))]
    if tag in ('polygon', 'polyline'):
        v = [float(n) for n in _NUM.findall(el.get('points') or '')]; return list(zip(v[0::2], v[1::2]))
    if tag in ('circle', 'ellipse'):
        cx, cy = f('cx'), f('cy'); rx = f('r') if tag == 'circle' else f('rx'); ry = f('r') if tag == 'circle' else f('ry')
        return [(cx - rx, cy - ry), (cx + rx, cy + ry)]
    if tag == 'text':
        if not ''.join(el.itertext()).strip(): return []
        size = _font_size(el)
        x, y = f('x'), f('y')
        return [(x, y - size * 0.9), (x, y + size * 0.3)] if size else [(x, y)]
    return []


def _font_size(el):
    """Largest font size used in a text element. Verovio puts font-size="0px" on <text> and the sizes
    on its tspans (a tempo mark mixes words with a larger metronome-note glyph)."""
    sizes = [float(m[0]) for e in el.iter() if (m := _NUM.findall(e.get('font-size') or ''))]
    return max(sizes, default=0.0)


def extent(el, defs, m=ID, skip=None, depth=0):
    """(top, bottom) of everything drawn by el under transform m, or None. `defs` maps ids to elements."""
    if depth > 40: return None
    tag = el.tag.split('}')[-1]
    if tag in ('defs', 'style', 'title', 'desc', 'clipPath', 'mask', 'symbol'): return None
    if skip and skip(el): return None
    m = _mul(transform_of(el.get('transform')), m)
    ys = []
    if tag == 'use':
        ref = defs.get((el.get(XLINK) or el.get('href') or '').lstrip('#'))
        if ref is not None:
            x, y = float(el.get('x') or 0), float(el.get('y') or 0)
            r = extent(ref, defs, _mul((1, 0, 0, 1, x, y), m), skip, depth + 1)
            if r: ys += list(r)
    elif tag == 'text':
        ys += [p[0] * m[1] + p[1] * m[3] + m[5] for p in _local_points(el)]
    else:
        ys += [p[0] * m[1] + p[1] * m[3] + m[5] for p in _local_points(el)]
        for child in el:
            r = extent(child, defs, m, skip, depth + 1)
            if r: ys += list(r)
    return (min(ys), max(ys)) if ys else None


def defs_of(root):
    return {e.get('id'): e for e in root.iter() if e.get('id')}


PAGE_FURNITURE = ('pgHead', 'pgFoot', 'pgHead2', 'pgFoot2')


def furniture(el):
    """Verovio's page header and footer (title, composer, page number) belong to the page, not a system."""
    return (el.get('class') or '').split(' ')[0] in PAGE_FURNITURE


def ink(root, skip=furniture):
    """(top, bottom) of everything drawn in an SVG, in its viewBox coordinates, or None."""
    defs = defs_of(root)
    ys = [r for c in root if (r := extent(c, defs, skip=skip))]
    return (min(a for a, _ in ys), max(b for _, b in ys)) if ys else None


def widen(y0, y1, drawn, lo, hi, pad):
    """Grow the band y0..y1 to hold what is drawn in it, but never past lo (above) or hi (below).

    A crop is cut between neighbouring systems, but stems, beams, slurs, octave lines, pedal marks
    and tempo or expression text often reach past that line; the crop must not slice them off.
    The limits keep a stray mark far from its staff from stretching the line; they are fixed
    points (not distances from the band), so widening an already widened crop changes nothing."""
    if not drawn:
        return y0, y1
    top, bottom = drawn
    return min(y0, max(top - pad, lo)), max(y1, min(bottom + pad, hi))


def verovio_space(svg):
    """Staff space of a Verovio drawing in its own units (180 by default): the gap between the first
    two lines of the first staff. (Stems and bar lines are paths too, so not just any line.)"""
    m = re.search(r'class="staff"><path d="M[-\d.]+ ([-\d.]+) L[^"]*"[^>]*/?>(?:</path>)?<path d="M[-\d.]+ ([-\d.]+) L', svg)
    gap = abs(float(m[2]) - float(m[1])) if m else 0
    return gap if gap > 0 else 180.0
