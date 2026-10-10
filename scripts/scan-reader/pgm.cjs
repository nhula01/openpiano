// Binary PGM (P5) images: the format the degradation script writes, read without dependencies.
const fs = require('fs');
function readPGM(f) {
  const b = fs.readFileSync(f); let i = 0;
  const tok = () => { while (/\s/.test(String.fromCharCode(b[i]))) i++; if (b[i] === 35) { while (b[i] !== 10) i++; return tok(); } let s = ''; while (!/\s/.test(String.fromCharCode(b[i]))) s += String.fromCharCode(b[i++]); return s; };
  if (tok() !== 'P5') throw new Error('not a binary PGM: ' + f);
  const w = +tok(), h = +tok(); tok(); i++;
  return { w, h, g: new Uint8Array(b.buffer, b.byteOffset + i, w * h).slice() };
}
module.exports = { readPGM };
