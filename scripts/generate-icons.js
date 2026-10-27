const sharp = require('sharp');
const fs = require('fs');

function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + count * entrySize;
  
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4); // count
  
  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(item.width >= 256 ? 0 : item.width, 0);
    entry.writeUInt8(item.height >= 256 ? 0 : item.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buffer.length, 8); // size
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    offset += item.buffer.length;
  }
  
  return Buffer.concat([header, ...entries, ...pngBuffers.map(p => p.buffer)]);
}

function getSvgContent({ size, bg = false, ratio = 0.40 }) {
  const scale = (size * ratio) / 48;
  const offsetX = (size / 2) - (32 * scale);
  const offsetY = (size / 2) - (36 * scale);

  const bgRect = bg ? `  <rect width="${size}" height="${size}" fill="#ffffff"/>\n` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
${bgRect}  <g transform="translate(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}) scale(${scale.toFixed(4)})">
    <path d="M8 52 L32 12 L44 32 Z" fill="url(#g1)"/>
    <path d="M20 60 L40.4 26 L56 52 Z" fill="url(#g2)" style="mix-blend-mode: multiply;"/>
    <defs>
      <linearGradient id="g1" x1="8" y1="12" x2="44" y2="52">
        <stop stop-color="#5c9b7d"/>
        <stop offset="1" stop-color="#245f52"/>
      </linearGradient>
      <linearGradient id="g2" x1="20" y1="26" x2="56" y2="60">
        <stop stop-color="#9570c7"/>
        <stop offset="1" stop-color="#5b3a8c"/>
      </linearGradient>
    </defs>
  </g>
</svg>
`;
}

async function generate() {
  // 1. Generate SVGs
  // public/icon-192.svg (transparent, peaks ~40%) - strictly NO <rect> to satisfy Invariant 11.9
  const svg192 = getSvgContent({ size: 192, bg: false, ratio: 0.40 });
  fs.writeFileSync('public/icon-192.svg', svg192);

  // public/icon-512.svg (transparent, peaks ~40%) - strictly NO <rect> to satisfy Invariant 11.9
  const svg512 = getSvgContent({ size: 512, bg: false, ratio: 0.40 });
  fs.writeFileSync('public/icon-512.svg', svg512);

  // Maskable SVGs (solid #ffffff background, peaks ~40% inside safe zone)
  const svgMask192 = getSvgContent({ size: 192, bg: true, ratio: 0.40 });
  fs.writeFileSync('public/icon-maskable-192.svg', svgMask192);

  const svgMask512 = getSvgContent({ size: 512, bg: true, ratio: 0.40 });
  fs.writeFileSync('public/icon-maskable-512.svg', svgMask512);

  // 2. Render PNGs with 300 DPI supersampling for razor-sharp rendering on high-DPI screens
  await sharp(Buffer.from(svg192), { density: 300 })
    .resize(192, 192, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile('public/icon-192.png');
  console.log('Generated public/icon-192.png');

  await sharp(Buffer.from(svg512), { density: 300 })
    .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile('public/icon-512.png');
  console.log('Generated public/icon-512.png');

  await sharp(Buffer.from(svgMask192), { density: 300 })
    .resize(192, 192, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile('public/icon-maskable-192.png');
  console.log('Generated public/icon-maskable-192.png');

  await sharp(Buffer.from(svgMask512), { density: 300 })
    .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile('public/icon-maskable-512.png');
  console.log('Generated public/icon-maskable-512.png');

  // 3. apple-touch-icon.png (180x180 with solid white background for iOS)
  const svgApple = getSvgContent({ size: 180, bg: true, ratio: 0.40 });
  await sharp(Buffer.from(svgApple), { density: 300 })
    .resize(180, 180, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 })
    .toFile('public/apple-touch-icon.png');
  console.log('Generated public/apple-touch-icon.png');

  // 4. app/favicon.ico from app/icon.svg (browser tab icon preserves prominent ~85% ratio per Invariant 11.11)
  const svgIcon = fs.readFileSync('app/icon.svg');
  const b16 = await sharp(svgIcon, { density: 300 }).resize(16, 16, { kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  const b32 = await sharp(svgIcon, { density: 300 }).resize(32, 32, { kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  const b48 = await sharp(svgIcon, { density: 300 }).resize(48, 48, { kernel: sharp.kernel.lanczos3 }).png().toBuffer();
  const ico = createIco([
    { width: 16, height: 16, buffer: b16 },
    { width: 32, height: 32, buffer: b32 },
    { width: 48, height: 48, buffer: b48 }
  ]);
  fs.writeFileSync('app/favicon.ico', ico);
  console.log('Generated app/favicon.ico');
}

generate().catch(console.error);
