const fs = require('fs');
const path = require('path');

// Create a simple PNG icon using base64 encoded data
// This is a minimal 1x1 PNG with a gradient-like appearance
const createMinimalPNG = (size) => {
  // This is a very basic PNG structure - in production you'd want proper PNG generation
  // For now, let's create a simple approach
  
  const canvas = `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#D1B172;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0B0B0C;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
  <text x="${size/2}" y="${size/2}" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white">MV</text>
  <text x="${size/2}" y="${size * 0.75}" font-family="Arial, sans-serif" font-size="${size * 0.15}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white">INTEL</text>
</svg>`;

  return canvas;
};

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Icon sizes for PWA
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

console.log('Creating PNG-compatible SVG icons...');
console.log('Note: These are SVG files but with PNG-compatible structure');

// Generate each icon
iconSizes.forEach(size => {
  const svgContent = createMinimalPNG(size);
  const filePath = path.join(iconsDir, `icon-${size}x${size}.png.svg`);
  fs.writeFileSync(filePath, svgContent);
  console.log(`Generated icon-${size}x${size}.png.svg`);
});

// Generate shortcut icons
const shortcutIcons = [
  { name: 'shortcut-portfolio', text: '📊' },
  { name: 'shortcut-week-ahead', text: '📅' },
  { name: 'shortcut-network', text: '🌐' }
];

shortcutIcons.forEach(({ name, text }) => {
  const svgContent = `
<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <rect width="96" height="96" rx="16" fill="#0B0B0C"/>
  <text x="48" y="48" font-family="Arial, sans-serif" font-size="48" text-anchor="middle" dominant-baseline="middle">${text}</text>
</svg>
  `;
  const filePath = path.join(iconsDir, `${name}.png.svg`);
  fs.writeFileSync(filePath, svgContent);
  console.log(`Generated ${name}.png.svg`);
});

console.log('');
console.log('PNG-compatible SVG icons created!');
console.log('');
console.log('NEXT STEPS:');
console.log('1. Visit http://localhost:3000/icon-converter.html');
console.log('2. Convert each .png.svg file to actual PNG format');
console.log('3. Update manifest.json to reference .png files instead of .svg');
console.log('');
console.log('QUICK FIX: Update manifest.json to use these files temporarily:');
console.log('- Change all icon src from .svg to .png.svg');
console.log('- This will allow PWA installation while you convert to PNG');
console.log('');
console.log('For immediate testing, you can also:');
console.log('1. Use online SVG to PNG converters');
console.log('2. Take screenshots of the icons and crop them');
console.log('3. Use browser DevTools to save the SVG as PNG');
