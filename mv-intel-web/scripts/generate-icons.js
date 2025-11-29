const fs = require('fs');
const { createCanvas } = require('canvas');

// Icon sizes for PWA
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Create icons directory if it doesn't exist
const iconsDir = './public/icons';
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate each icon size
iconSizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background gradient
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  gradient.addColorStop(0, '#D1B172');
  gradient.addColorStop(1, '#0B0B0C');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  
  // Add MV text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${size * 0.4}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MV', size/2, size/2);
  
  // Add Intelligence text below
  ctx.font = `bold ${size * 0.15}px Inter, Arial, sans-serif`;
  ctx.fillText('INTEL', size/2, size/2 + size * 0.3);
  
  // Save the icon
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`${iconsDir}/icon-${size}x${size}.png`, buffer);
  
  console.log(`Generated icon-${size}x${size}.png`);
});

// Generate shortcut icons
const shortcutIcons = [
  { name: 'shortcut-portfolio', text: '📊' },
  { name: 'shortcut-week-ahead', text: '📅' },
  { name: 'shortcut-network', text: '🌐' }
];

shortcutIcons.forEach(({ name, text }) => {
  const canvas = createCanvas(96, 96);
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#0B0B0C';
  ctx.fillRect(0, 0, 96, 96);
  
  // Icon emoji
  ctx.font = '48px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 48, 48);
  
  // Save the shortcut icon
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(`${iconsDir}/${name}.png`, buffer);
  
  console.log(`Generated ${name}.png`);
});

console.log('All PWA icons generated successfully!');
