const fs = require('fs');
const path = require('path');

// Since we don't have canvas installed, let's create a simple HTML file
// that can be used to convert SVG to PNG manually

const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <title>SVG to PNG Converter</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .icon-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .icon-item { text-align: center; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
        .icon-item img { border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; }
        .download-btn { 
            background: #007bff; color: white; border: none; padding: 8px 16px; 
            border-radius: 4px; cursor: pointer; margin: 5px;
        }
        .download-btn:hover { background: #0056b3; }
    </style>
</head>
<body>
    <h1>MV Intelligence PWA Icons - SVG to PNG Converter</h1>
    <p>Right-click on each icon and "Save image as..." to download as PNG</p>
    
    <div class="icon-grid">
        <div class="icon-item">
            <h3>Icon 72x72</h3>
            <img src="/icons/icon-72x72.svg" width="72" height="72" alt="72x72">
            <br>
            <button class="download-btn" onclick="downloadIcon('icon-72x72.svg', 72)">Download PNG</button>
        </div>
        
        <div class="icon-item">
            <h3>Icon 96x96</h3>
            <img src="/icons/icon-96x96.svg" width="96" height="96" alt="96x96">
            <br>
            <button class="download-btn" onclick="downloadIcon('icon-96x96.svg', 96)">Download PNG</button>
        </div>
        
        <div class="icon-item">
            <h3>Icon 128x128</h3>
            <img src="/icons/icon-128x128.svg" width="128" height="128" alt="128x128">
            <br>
            <button class="download-btn" onclick="downloadIcon('icon-128x128.svg', 128)">Download PNG</button>
        </div>
        
        <div class="icon-item">
            <h3>Icon 144x144</h3>
            <img src="/icons/icon-144x144.svg" width="144" height="144" alt="144x144">
            <br>
            <button class="download-btn" onclick="downloadIcon('icon-144x144.svg', 144)">Download PNG</button>
        </div>
        
        <div class="icon-item">
            <h3>Icon 152x152</h3>
            <img src="/icons/icon-152x152.svg" width="152" height="152" alt="152x152">
            <br>
            <button class="download-btn" onclick="downloadIcon('icon-152x152.svg', 152)">Download PNG</button>
        </div>
        
        <div class="icon-item">
            <h3>Icon 192x192</h3>
            <img src="/icons/icon-192x192.svg" width="192" height="192" alt="192x192">
            <br>
            <button class="download-btn" onclick="downloadIcon('icon-192x192.svg', 192)">Download PNG</button>
        </div>
        
        <div class="icon-item">
            <h3>Icon 384x384</h3>
            <img src="/icons/icon-384x384.svg" width="384" height="384" alt="384x384">
            <br>
            <button class="download-btn" onclick="downloadIcon('icon-384x384.svg', 384)">Download PNG</button>
        </div>
        
        <div class="icon-item">
            <h3>Icon 512x512</h3>
            <img src="/icons/icon-512x512.svg" width="512" height="512" alt="512x512">
            <br>
            <button class="download-btn" onclick="downloadIcon('icon-512x512.svg', 512)">Download PNG</button>
        </div>
    </div>
    
    <script>
        function downloadIcon(svgPath, size) {
            // Create a canvas to convert SVG to PNG
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = size;
            canvas.height = size;
            
            // Create an image element
            const img = new Image();
            img.onload = function() {
                // Draw the image on canvas
                ctx.drawImage(img, 0, 0, size, size);
                
                // Convert to PNG and download
                canvas.toBlob(function(blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = svgPath.replace('.svg', '.png');
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                });
            };
            img.src = svgPath;
        }
    </script>
</body>
</html>
`;

// Write the HTML file
const htmlPath = path.join(__dirname, '../public/icon-converter.html');
fs.writeFileSync(htmlPath, htmlTemplate);

console.log('Icon converter HTML file created at: public/icon-converter.html');
console.log('');
console.log('INSTRUCTIONS:');
console.log('1. Visit http://localhost:3000/icon-converter.html');
console.log('2. Click "Download PNG" for each icon size');
console.log('3. Save the PNG files to public/icons/');
console.log('4. Update manifest.json to use PNG instead of SVG');
console.log('');
console.log('Alternative: Use online SVG to PNG converters like:');
console.log('- https://convertio.co/svg-png/');
console.log('- https://cloudconvert.com/svg-to-png');
console.log('- https://www.icoconverter.com/');
