const fs = require('fs');
const path = require('path');
const { detectLicensePlate } = require('./dist/licensePlateDetector');
const { recognizeText } = require('./dist/textRecognizer');
const fsPromises = fs.promises;

async function testUploadAndSave() {
  try {
    console.log('Testing the full upload and save process');
    
    // 1. Find a sample image
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
    
    // 2. Detect license plate (simulate the upload handler)
    console.log('Detecting license plate...');
    const plateRegion = await detectLicensePlate(imagePath);
    
    if (!plateRegion) {
      console.error('No license plate detected (null returned)');
      return;
    }
    
    console.log('License plate detected! Buffer length:', plateRegion.length);
    
    // 3. Recognize text
    console.log('Recognizing text from plate region...');
    const plateText = await recognizeText(plateRegion);
    console.log('Text recognized:', plateText);
    
    // 4. Save the results to data directory
    console.log('Saving recognition results...');
    const resultDir = await saveRecognitionResult(imagePath, plateText, plateRegion);
    
    if (resultDir) {
      console.log('Results saved successfully to:', resultDir);
      
      // 5. Verify the results
      const resultDirContents = await fsPromises.readdir(resultDir);
      console.log(`Contents of ${resultDir}:`, resultDirContents);
    } else {
      console.error('Failed to save results');
    }
    
    console.log('Test completed');
  } catch (error) {
    console.error('Error during test:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
  }
}

// Copy of the saveRecognitionResult function from index.ts
async function saveRecognitionResult(originalImagePath, plateText, plateImageBuffer) {
  try {
    console.log('Starting to save recognition result...');
    console.log('Original image path:', originalImagePath);
    console.log('Plate text:', plateText);
    console.log('Plate image buffer length:', plateImageBuffer.length);
    
    // Create a timestamp-based directory name for this recognition
    const timestamp = Date.now();
    const resultDir = path.join('data', `result_${timestamp}`);
    
    console.log('Creating directory:', resultDir);
    // Create the directory
    await fsPromises.mkdir(resultDir, { recursive: true });
    
    // Save the results
    const metadata = {
      originalImage: originalImagePath,
      timestamp,
      recognizedText: plateText,
      processingDate: new Date().toISOString()
    };
    
    console.log('Saving metadata to:', path.join(resultDir, 'metadata.json'));
    // Save metadata as JSON
    await fsPromises.writeFile(path.join(resultDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    
    console.log('Saving plate image to:', path.join(resultDir, 'plate.jpg'));
    // Save plate image
    await fsPromises.writeFile(path.join(resultDir, 'plate.jpg'), plateImageBuffer);
    
    console.log('Copying original image to:', path.join(resultDir, 'original.jpg'));
    // Copy original image
    await fsPromises.copyFile(originalImagePath, path.join(resultDir, 'original.jpg'));
    
    console.log(`Recognition results saved to ${resultDir}`);
    return resultDir;
  } catch (error) {
    console.error('Error saving recognition results:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
    return null;
  }
}

testUploadAndSave(); 