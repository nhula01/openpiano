// node scripts/scan-reader/render.mjs <ids.json> <outdir> <count> <seed> [pages]  (run in the work directory;
// NODE_PATH is not used by ES modules, so link node_modules there: ln -s <repo>/node_modules .)
import fs from 'fs';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';
const [, , idsFile, outDir, count = '40', seed = '1', pagesArg = '1'] = process.argv;
let s = Number(seed); const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const ids = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
const pick = []; const pool = ids.slice();
while (pick.length < Number(count) && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
const fonts = ['Leipzig', 'Bravura', 'Leland', 'Petaluma', 'Gootville'];
const VerovioModule = await createVerovioModule();
fs.mkdirSync(outDir, { recursive: true });
const meta = [];
for (const id of pick) {
  const xml = fs.readFileSync(`corpus/xml/${id}.xml`, 'utf8');
  const font = fonts[Math.floor(rnd() * (fonts.length - (process.env.NOPETA ? 2 : 0)))];
  const scale = 30 + Math.floor(rnd() * 22);
  const tk = new VerovioToolkit(VerovioModule);
  tk.setOptions({ pageHeight: 2970, pageWidth: 2100, scale, font, adjustPageHeight: false, footer: 'none', header: rnd() < 0.5 ? 'auto' : 'none', breaks: 'auto', mnumInterval: 0 });
  if (!tk.loadData(xml)) { console.error('fail', id); continue; }
  const n = Math.min(Number(pagesArg), tk.getPageCount());
  for (let p = 1; p <= n; p++) {
    const svg = tk.renderToSVG(p);
    const name = `${id}__${font}__p${p}`;
    fs.writeFileSync(`${outDir}/${name}.svg`, svg);
    meta.push({ name, id, font, scale, page: p, pages: tk.getPageCount() });
  }
}
fs.writeFileSync(`${outDir}/meta.json`, JSON.stringify(meta, null, 1));
console.log(meta.length);
