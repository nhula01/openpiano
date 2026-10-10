# python3 raster.py <dir> [dpi_min dpi_max]  -> <name>.png (grayscale) + <name>.json labels (pixel boxes)
import sys, json, random, pathlib  # needs: pip install playwright (Chromium), Pillow
from playwright.sync_api import sync_playwright
d = pathlib.Path(sys.argv[1]); lo, hi = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (200, 300)
meta = json.load(open(d / 'meta.json')); random.seed(11)
JS = r"""() => {
 const out = [];
 const cls = e => { const c = []; for (let p = e; p && p.tagName !== 'svg'; p = p.parentNode) if (p.getAttribute && p.getAttribute('class')) c.push(p.getAttribute('class').split(' ')[0]); return c; };
 const add = (e, kind) => { const r = e.getBoundingClientRect(); if (r.width === 0 && r.height === 0) return; const href = e.getAttribute('xlink:href') || e.getAttribute('href') || ''; out.push({ k: kind, c: cls(e).slice(0, 4), g: (href.match(/#(E[0-9A-F]{3})/) || [])[1] || null, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, t: e.tagName === 'text' || e.tagName === 'tspan' ? e.textContent : undefined }); };
 for (const e of document.querySelectorAll('g.system use')) add(e, 'use');
 for (const e of document.querySelectorAll('g.system ellipse')) add(e, 'ellipse');
 for (const e of document.querySelectorAll('g.system polygon')) add(e, 'polygon');
 for (const e of document.querySelectorAll('g.system path')) add(e, 'path');
 for (const e of document.querySelectorAll('g.system rect')) add(e, 'rect');
 for (const e of document.querySelectorAll('svg text')) add(e, 'text');
 return out;
}"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for m in meta:
        dpi = random.randint(lo, hi); W = round(8.27 * dpi); H = round(11.69 * dpi)
        svg = (d / (m['name'] + '.svg')).read_text()
        pg.set_viewport_size({'width': W, 'height': H})
        pg.set_content(f'<html><body style="margin:0;background:#fff"><div id=s style="width:{W}px;height:{H}px">{svg}</div></body></html>')
        pg.evaluate(f"() => {{ const s = document.querySelector('#s > svg'); s.setAttribute('width', '{W}px'); s.setAttribute('height', '{H}px'); s.style.color = '#000'; }}")
        labels = pg.evaluate(JS)
        pg.screenshot(path=str(d / (m['name'] + '.png')), full_page=False)
        m['dpi'] = dpi; m['W'] = W; m['H'] = H
        m['measures'] = svg.count('class="measure')  # measures drawn on the page (for scoring)
        json.dump(labels, open(d / (m['name'] + '.json'), 'w'))
    b.close()
json.dump(meta, open(d / 'meta.json', 'w'), indent=1)
from PIL import Image
for m in meta:
    f = d / (m['name'] + '.png'); Image.open(f).convert('L').save(f)
print('done', len(meta))
