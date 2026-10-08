"""Set ?v=<sha256[:12]> on every local script and stylesheet link in site/*.html."""
import hashlib, re
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / 'site'

def stamp(match):
    attr, name = match.group(1), match.group(2)
    path = SITE / name
    if not path.is_file():
        return match.group(0)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    return f'{attr}="{name}?v={digest}"'

for page in SITE.glob('*.html'):
    text = page.read_text(encoding='utf-8')
    new = re.sub(r'(src|href)="([\w./-]+\.(?:js|css))(?:\?v=[^"]*)?"', stamp, text)
    if new != text:
        page.write_text(new, encoding='utf-8')
        print('stamped', page.name)
