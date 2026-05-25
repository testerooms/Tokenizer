import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

const W = 1200, H = 630;
const raw = Buffer.alloc(W * H * 4);

function setPixel(x, y, r, g, b, a = 255) {
  const i = (y * W + x) * 4;
  raw[i] = r; raw[i+1] = g; raw[i+2] = b; raw[i+3] = a;
}

// Background gradient
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    const r = Math.round(11 + t * 4);
    const g = Math.round(14 + t * 8);
    const b = Math.round(26 + t * 2);
    setPixel(x, y, r, g, b);
  }
}

// Border
const border = (x, y) => x < 40 || x >= W-40 || y < 40 || y >= H-40;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (border(x, y)) setPixel(x, y, 30, 35, 50);
  }
}

// Accent bar
for (let y = 160; y < 168; y++) {
  for (let x = 80; x < 400; x++) {
    const t = (x - 80) / 320;
    const r = Math.round(99 + t * 40);
    const g = Math.round(102 + t * 20);
    const b = Math.round(241 + t * 5);
    setPixel(x, y, r, g, b);
  }
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (c >>> 8) ^ crc32Table[(c ^ buf[n]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crc32Table[i] = c;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([t, data]));
  const c = Buffer.alloc(4); c.writeUInt32BE(crc);
  return Buffer.concat([len, t, data, c]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

// Raw data with filter byte per row
const filtered = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  filtered[y * (1 + W * 4)] = 0; // filter none
  raw.copy(filtered, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}
const compressed = deflateSync(filtered);

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync('og-image.png', png);
console.log('og-image.png generated (1200x630)');
