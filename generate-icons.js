import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * Build a real multi-size ICO file containing PNG images (supported by Windows Vista+).
 * electron-builder rejects PNG data that is merely renamed to .ico.
 */
function buildIcoFromPngs(pngEntries) {
  // pngEntries: Array<{ size: number, data: Buffer }>
  const count = pngEntries.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = headerSize + dirEntrySize * count;

  let offset = dirSize;
  const entries = pngEntries.map(({ size, data }) => {
    const entry = {
      width: size >= 256 ? 0 : size, // 0 means 256 in ICO format
      height: size >= 256 ? 0 : size,
      data,
      offset,
    };
    offset += data.length;
    return entry;
  });

  const totalSize = offset;
  const buf = Buffer.alloc(totalSize);

  // ICONDIR header
  buf.writeUInt16LE(0, 0); // reserved
  buf.writeUInt16LE(1, 2); // type = 1 (icon)
  buf.writeUInt16LE(count, 4); // number of images

  entries.forEach((entry, i) => {
    const pos = headerSize + i * dirEntrySize;
    buf.writeUInt8(entry.width, pos); // width
    buf.writeUInt8(entry.height, pos + 1); // height
    buf.writeUInt8(0, pos + 2); // color palette
    buf.writeUInt8(0, pos + 3); // reserved
    buf.writeUInt16LE(1, pos + 4); // color planes
    buf.writeUInt16LE(32, pos + 6); // bits per pixel
    buf.writeUInt32LE(entry.data.length, pos + 8); // size of image data
    buf.writeUInt32LE(entry.offset, pos + 12); // offset of image data
    entry.data.copy(buf, entry.offset);
  });

  return buf;
}

async function buildIcons() {
  const rootDir = process.cwd();
  const publicDir = path.join(rootDir, 'public');
  const assetsDir = path.join(rootDir, 'assets');
  const buildDir = path.join(rootDir, 'build');
  const androidResDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');

  [publicDir, assetsDir, buildDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Prefer PNG master logo (icon.png), fallback to icon.svg
  const pngPath = path.join(rootDir, 'icon.png');
  const svgPath = path.join(rootDir, 'icon.svg');
  let sourceBuffer;
  if (fs.existsSync(pngPath)) {
    sourceBuffer = fs.readFileSync(pngPath);
    console.log('Using icon.png as logo source');
  } else if (fs.existsSync(svgPath)) {
    sourceBuffer = fs.readFileSync(svgPath);
    console.log('Using icon.svg as logo source');
  } else {
    console.warn('No icon.png or icon.svg found in root');
    return;
  }

  const svgBuffer = sourceBuffer; // keep var name for rest of script

  // 1. Web Public Icons
  if (fs.existsSync(svgPath)) {
    fs.writeFileSync(path.join(publicDir, 'icon.svg'), fs.readFileSync(svgPath));
  }
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await sharp(svgBuffer).resize(64, 64).png().toFile(path.join(publicDir, 'favicon.png'));

  // Proper small favicon.ico (16 + 32)
  const fav16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer();
  const fav32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  fs.writeFileSync(
    path.join(publicDir, 'favicon.ico'),
    buildIcoFromPngs([
      { size: 16, data: fav16 },
      { size: 32, data: fav32 },
    ])
  );

  // 2. Capacitor & Electron Assets
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon.png'));
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-only.png'));
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-foreground.png'));
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-background.png'));

  // Electron builder icon (PNG) – also used as fallback
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(buildDir, 'icon.png'));
  await sharp(svgBuffer).resize(256, 256).png().toFile(path.join(buildDir, 'icon-256.png'));

  // Real multi-size ICO for Windows (16, 32, 48, 64, 128, 256)
  const icoSizes = [16, 32, 48, 64, 128, 256];
  const icoPngs = [];
  for (const size of icoSizes) {
    const data = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    icoPngs.push({ size, data });
  }
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), buildIcoFromPngs(icoPngs));

  // 3. Android Native Mipmap Icons (If android res folder exists)
  if (fs.existsSync(androidResDir)) {
    const mipmaps = [
      { folder: 'mipmap-mdpi', iconSize: 48, foreSize: 108 },
      { folder: 'mipmap-hdpi', iconSize: 72, foreSize: 162 },
      { folder: 'mipmap-xhdpi', iconSize: 96, foreSize: 216 },
      { folder: 'mipmap-xxhdpi', iconSize: 144, foreSize: 324 },
      { folder: 'mipmap-xxxhdpi', iconSize: 192, foreSize: 432 },
    ];

    for (const m of mipmaps) {
      const targetFolder = path.join(androidResDir, m.folder);
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }
      await sharp(svgBuffer).resize(m.iconSize, m.iconSize).png().toFile(path.join(targetFolder, 'ic_launcher.png'));
      await sharp(svgBuffer).resize(m.iconSize, m.iconSize).png().toFile(path.join(targetFolder, 'ic_launcher_round.png'));
      await sharp(svgBuffer).resize(m.foreSize, m.foreSize).png().toFile(path.join(targetFolder, 'ic_launcher_foreground.png'));
    }
    console.log('Android mipmap icons generated in android/app/src/main/res/');
  }

  console.log('App icons generated successfully across web, assets, and android resources!');
}

buildIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
