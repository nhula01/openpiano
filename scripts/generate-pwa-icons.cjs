'use strict';

// Dependency-free PNG generator for OpenPiano's install icons.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'site', 'icons');
const COLORS = {
  ink: [36, 33, 43, 255],
  ivory: [255, 253, 247, 255],
  felt: [163, 38, 59, 255],
  brass: [227, 166, 59, 255],
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function render(size) {
  const aa = 4;
  const dim = size * aa;
  const pixels = Buffer.alloc(dim * dim * 4);
  const put = (x, y, color) => {
    const i = (y * dim + x) * 4;
    pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = color[3];
  };
  const rect = (x, y, w, h, color) => {
    for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) put(px, py, color);
  };
  const roundRect = (x, y, w, h, radius, color) => {
    const right = x + w - 1, bottom = y + h - 1;
    for (let py = y; py <= bottom; py += 1) for (let px = x; px <= right; px += 1) {
      const cx = Math.max(x + radius, Math.min(px, right - radius));
      const cy = Math.max(y + radius, Math.min(py, bottom - radius));
      if ((px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2) put(px, py, color);
    }
  };
  const s = n => Math.round(n / 512 * dim);

  rect(0, 0, dim, dim, COLORS.ink);
  roundRect(s(74), s(117), s(364), s(278), s(49), COLORS.brass);
  roundRect(s(86), s(129), s(340), s(254), s(36), COLORS.ivory);
  rect(s(86), s(166), s(340), s(18), COLORS.felt);
  [150, 220, 292, 362].forEach(x => rect(s(x - 4), s(175), s(9), s(208), COLORS.ink));
  [126, 196, 338].forEach(x => rect(s(x), s(175), s(48), s(126), COLORS.ink));

  const output = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const total = [0, 0, 0, 0];
    for (let sy = 0; sy < aa; sy += 1) for (let sx = 0; sx < aa; sx += 1) {
      const i = (((y * aa + sy) * dim) + x * aa + sx) * 4;
      for (let c = 0; c < 4; c += 1) total[c] += pixels[i + c];
    }
    const out = (y * size + x) * 4;
    for (let c = 0; c < 4; c += 1) output[out + c] = Math.round(total[c] / (aa * aa));
  }
  return encodePng(size, size, output);
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [180, 192, 512]) {
  fs.writeFileSync(path.join(OUT, `openpiano-${size}.png`), render(size));
}
console.log('Generated OpenPiano PWA icons.');
