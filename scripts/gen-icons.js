// Generate PWA icons using SVG-based approach
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Generate simple SVG-based icons (no canvas dependency needed)
for (const size of [192, 512]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0f1117" rx="${size * 0.15}"/>
  <rect x="${size * 0.08}" y="${size * 0.08}" width="${size * 0.84}" height="${size * 0.84}" fill="#10b981" rx="${size * 0.12}"/>
  <text x="${size / 2}" y="${size / 2 + size * 0.02}" font-family="sans-serif" font-weight="bold" font-size="${size * 0.3}" fill="#0f1117" text-anchor="middle" dominant-baseline="middle">iB</text>
</svg>`;
  
  fs.writeFileSync(path.join(outDir, `icon-${size}x${size}.svg`), svg);
  console.log(`Created icon-${size}x${size}.svg`);
}

// Also create a favicon
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#0f1117" rx="5"/>
  <rect x="2" y="2" width="28" height="28" fill="#10b981" rx="4"/>
  <text x="16" y="16" font-family="sans-serif" font-weight="bold" font-size="11" fill="#0f1117" text-anchor="middle" dominant-baseline="middle">iB</text>
</svg>`;
fs.writeFileSync(path.join(outDir, '..', 'favicon.svg'), faviconSvg);
console.log('Created favicon.svg');
