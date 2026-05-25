import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

const S = 32;
const raw = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a = 255) {
  const i = (y * S + x) * 4;
  raw[i] = r; raw[i+1] = g; raw[i+2] = b; raw[i+3] = a;
}

// Shield shape
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const cx = x / S, cy = y / S;
    const inShield =
      cy >= 0.1 && cy <= 0.9 &&
      cx >= 0.15 + (cy - 0.1) * 0.08 &&
      cx <= 0.85 - (cy - 0.1) * 0.08;
    if (inShield) {
      set(x, y, 99, 102, 241);
    } else {
      set(x, y, 11, 14, 26);
    }
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
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const filtered = Buffer.alloc(S * (1 + S * 4));
for (let y = 0; y < S; y++) {
  filtered[y * (1 + S * 4)] = 0;
  raw.copy(filtered, y * (1 + S * 4) + 1, y * S * 4, (y + 1) * S * 4);
}

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(filtered)),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync('favicon.png', png);
console.log('favicon.png generated');
