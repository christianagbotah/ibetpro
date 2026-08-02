/**
 * Generate PNG icons from the SVG icon for PWA manifest.
 * Chrome requires PNG icons for install eligibility.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, '..', 'public', 'icons', 'icon-192x192.svg');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'icons');

async function generateIcons() {
  const svgBuffer = fs.readFileSync(SVG_PATH);

  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

  for (const size of sizes) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);

    // Resize the SVG and render to PNG
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);

    console.log(`Generated ${outputPath}`);
  }

  // Generate favicon.ico (32x32)
  const favicon32 = await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toBuffer();

  const icoPath = path.join(__dirname, '..', 'public', 'favicon-32x32.png');
  fs.writeFileSync(icoPath, favicon32);
  console.log(`Generated ${icoPath}`);

  // Generate apple-touch-icon (180x180)
  const applePath = path.join(OUTPUT_DIR, 'apple-touch-icon-180x180.png');
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(applePath);
  console.log(`Generated ${applePath}`);

  console.log('\nAll PWA icons generated successfully!');
}

generateIcons().catch(console.error);
