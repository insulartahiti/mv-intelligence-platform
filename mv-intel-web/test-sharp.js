const sharp = require('sharp');
const fs = require('fs');

async function test() {
  console.log('Testing sharp PDF support...');
  try {
    // Create a minimal PDF buffer (empty page)
    // Actually hard to make valid PDF buffer manually. 
    // We'll just check sharp metadata.
    const formats = await sharp.format();
    console.log('PDF support:', formats.pdf);
  } catch (e) {
    console.error(e);
  }
}

test();
