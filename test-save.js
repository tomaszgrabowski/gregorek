const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

async function testSaveFiles() {
  try {
    console.log('Current directory:', process.cwd());
    
    // Sample data
    const timestamp = Date.now();
    const resultDir = path.join('data', `result_test_${timestamp}`);
    const originalImagePath = path.join('uploads', fs.readdirSync('uploads').find(f => /\.(jpg|jpeg|png)$/i.test(f)));
    const plateText = 'ABC123';
    
    console.log('Using sample image:', originalImagePath);
    
    // Read the image file
    const imageBuffer = await fsPromises.readFile(originalImagePath);
    console.log('Image buffer length:', imageBuffer.length);
    
    // Create the directory
    console.log('Creating directory:', resultDir);
    await fsPromises.mkdir(resultDir, { recursive: true });
    
    // Save metadata
    const metadata = {
      originalImage: originalImagePath,
      timestamp,
      recognizedText: plateText,
      processingDate: new Date().toISOString()
    };
    
    console.log('Saving metadata to:', path.join(resultDir, 'metadata.json'));
    await fsPromises.writeFile(path.join(resultDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    
    // Save plate image
    console.log('Saving plate image to:', path.join(resultDir, 'plate.jpg'));
    await fsPromises.writeFile(path.join(resultDir, 'plate.jpg'), imageBuffer);
    
    // Copy original image
    console.log('Copying original image to:', path.join(resultDir, 'original.jpg'));
    await fsPromises.copyFile(originalImagePath, path.join(resultDir, 'original.jpg'));
    
    // Verify the results
    const dataDir = await fsPromises.readdir('data');
    console.log('Contents of data directory:', dataDir);
    
    const resultDirContents = await fsPromises.readdir(resultDir);
    console.log(`Contents of ${resultDir}:`, resultDirContents);
    
    console.log('Test completed successfully');
  } catch (error) {
    console.error('Error during test:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
  }
}

testSaveFiles(); 