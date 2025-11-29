const fs = require('fs');
const path = require('path');

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Simple SVG icon template
const createSVGIcon = (size, text) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#D1B172;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0B0B0C;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>
  <text x="${size/2}" y="${size/2}" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white">${text}</text>
  <text x="${size/2}" y="${size * 0.75}" font-family="Arial, sans-serif" font-size="${size * 0.15}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="white">INTEL</text>
</svg>
`;

// Icon sizes for PWA
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Generate each icon
iconSizes.forEach(size => {
  const svgContent = createSVGIcon(size, 'MV');
  const filePath = path.join(iconsDir, `icon-${size}x${size}.svg`);
  fs.writeFileSync(filePath, svgContent);
  console.log(`Generated icon-${size}x${size}.svg`);
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
  const filePath = path.join(iconsDir, `${name}.svg`);
  fs.writeFileSync(filePath, svgContent);
  console.log(`Generated ${name}.svg`);
});

console.log('All PWA icons generated successfully as SVG files!');
console.log('Note: These are SVG icons. For production, convert them to PNG using an online converter or image editing software.');
