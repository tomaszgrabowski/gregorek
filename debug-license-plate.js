// Direct test of license plate detector
const fs = require('fs');
const path = require('path');
const { detectLicensePlate } = require('./dist/licensePlateDetector');

async function testLicensePlateDetector() {
  try {
    console.log('Testing license plate detector directly');
    
    // Find a sample image
    const uploadsDir = 'uploads';
    const files = fs.readdirSync(uploadsDir);
    
    if (files.length === 0) {
      console.error('No sample images found in uploads directory');
      return;
    }
    
    // Use the first image file found
    const sampleImage = files.find(file => /\.(jpg|jpeg|png)$/i.test(file));
    
    if (!sampleImage) {
      console.error('No JPG or PNG images found in uploads directory');
      return;
    }
    
    const imagePath = path.join(uploadsDir, sampleImage);
    console.log('Using sample image:', imagePath);
    
    // Call the license plate detector directly
    console.log('Calling detectLicensePlate...');
    const plateRegion = await detectLicensePlate(imagePath);
    
    // Log the result
    if (plateRegion) {
      console.log('License plate detected!');
      console.log('Plate region buffer length:', plateRegion.length);
      
      // Save the result for inspection
      const debugDir = 'debug';
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir);
      }
      
      fs.writeFileSync(path.join(debugDir, 'plate.jpg'), plateRegion);
      console.log('Saved plate region to debug/plate.jpg');
    } else {
      console.error('No license plate detected (null returned)');
    }
    
    console.log('Test completed');
  } catch (error) {
    console.error('Error testing license plate detector:', error);
  }
}

testLicensePlateDetector(); 