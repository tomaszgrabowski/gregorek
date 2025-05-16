const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testImageUpload() {
  try {
    console.log('Starting test image upload');
    
    // Find sample image in uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
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
    
    // Create form data with the image
    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath));
    
    // Send request to the server
    console.log('Sending request to server...');
    const response = await fetch('http://localhost:3000/api/read-plate', {
      method: 'POST',
      body: form
    });
    
    // Parse and log the response
    const result = await response.json();
    console.log('Server response:', JSON.stringify(result, null, 2));
    
    console.log('Test completed');
  } catch (error) {
    console.error('Error during test:', error);
  }
}

testImageUpload(); 