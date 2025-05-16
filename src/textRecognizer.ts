import { createWorker, Worker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as tf from '@tensorflow/tfjs-node';

// Configuration for text recognition
const OCR_LANGUAGE = 'eng'; // Default language is English
const OCR_CONFIG = {
  lang: OCR_LANGUAGE,
  oem: 1, // LSTM only
  psm: 7  // Single line of text - changed from 8 (single word)
};

// Create a temporary directory for processing images
const TEMP_DIR = path.join(os.tmpdir(), 'license-plate-reader');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Initialize the OCR worker
let worker: Worker | null = null;

// Initialize the Tesseract worker
async function initWorker() {
  if (!worker) {
    worker = await createWorker(OCR_LANGUAGE);
    await worker.setParameters(OCR_CONFIG);
    console.log('OCR worker initialized');
  }
  return worker;
}

// Image preprocessing to improve OCR results
async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Convert the buffer to a tensor
    const tfImage = tf.node.decodeImage(imageBuffer, 3) as tf.Tensor3D;
    
    // Convert to grayscale
    const grayscale = tf.image.rgbToGrayscale(tfImage);
    
    // Apply Gaussian blur to reduce noise
    const gaussianKernel = tf.tensor2d(
      [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
      ],
      [3, 3]
    ).div(tf.scalar(16)); // Normalize
    
    const expandedKernel = gaussianKernel.expandDims(2).expandDims(3);
    const expandedGray = grayscale.expandDims(0) as unknown as tf.Tensor4D;
    
    const blurred = tf.conv2d(
      expandedGray,
      expandedKernel as unknown as tf.Tensor4D,
      1,
      'same'
    );
    
    // Adjust contrast - normalize the image (sharper contrast)
    const normalized = blurred.squeeze()
      .sub(tf.scalar(0.5))
      .mul(tf.scalar(2.0))
      .add(tf.scalar(0.5))
      .clipByValue(0, 1);
    
    // Apply adaptive thresholding to create a binary image
    // This is good for text recognition
    const mean = tf.pool(
      normalized.expandDims(0) as unknown as tf.Tensor4D,
      [15, 15],
      'avg',
      'same'
    ).squeeze();
    
    // Threshold the image (pixel > local mean - small offset)
    const offset = 0.05; // Small offset to avoid losing too much information
    const binary = normalized.greater(mean.sub(tf.scalar(offset)));
    
    // Resize if needed (keeping aspect ratio)
    let processed = binary;
    const [height, width] = binary.shape;
    
    // Always ensure the image is large enough for OCR
    const MIN_OCR_WIDTH = 300;
    if (width < MIN_OCR_WIDTH) {
      const scale = MIN_OCR_WIDTH / width;
      processed = tf.image.resizeBilinear(binary as unknown as tf.Tensor3D, [
        Math.round(height * scale),
        MIN_OCR_WIDTH
      ]) as unknown as tf.Tensor;
    }
    
    // Dilate to connect nearby text features
    const dilationKernel = tf.ones([2, 2, 1]);
    const dilated = tf.pool(
      processed.expandDims(0).expandDims(3) as unknown as tf.Tensor4D,
      [2, 2],
      'max',
      'same'
    ).squeeze();
    
    // Convert back to a buffer (convert from binary to grayscale)
    const finalImage = dilated.mul(tf.scalar(255)).cast('int32') as unknown as tf.Tensor3D;
    const processedUint8Array = await tf.node.encodePng(finalImage);
    const processedBuffer = Buffer.from(processedUint8Array);
    
    // Clean up tensors
    tfImage.dispose();
    grayscale.dispose();
    gaussianKernel.dispose();
    expandedKernel.dispose();
    expandedGray.dispose();
    blurred.dispose();
    normalized.dispose();
    mean.dispose();
    binary.dispose();
    if (processed !== binary) {
      processed.dispose();
    }
    dilated.dispose();
    
    return processedBuffer;
  } catch (error) {
    console.error('Error preprocessing image:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
    
    // If preprocessing fails, just use the original image
    console.log('Returning original image due to preprocessing error');
    return imageBuffer; 
  }
}

// Post-process license plate text for better accuracy
function postProcessText(text: string): string {
  if (!text || text.trim().length === 0) {
    return '';
  }

  console.log('Post-processing raw text:', text);
  
  // Remove special characters and extra spaces
  let processed = text.replace(/[^A-Z0-9\s]/gi, '').trim();
  
  // Convert to uppercase
  processed = processed.toUpperCase();
  
  // Replace common OCR errors only for 0-9 and similar looking letters
  processed = processed
    .replace(/O(?=\d)/g, '0')    // O followed by digits is likely 0
    .replace(/(?<=\d)O/g, '0')   // O preceded by digits is likely 0
    .replace(/I(?=\d)/g, '1')    // I before a number is likely 1
    .replace(/(?<=\d)I/g, '1')   // I after a number is likely 1
    .replace(/Z(?=\d)/g, '2')    // Z before number is likely 2
    .replace(/S(?=\d)/g, '5')    // S before number is likely 5
    .replace(/B(?=\d)/g, '8')    // B before number is likely 8
  
  // Handle common spacing issues
  // - Add space between letters and numbers if missing
  if (processed.length > 2 && !/\s/.test(processed)) {
    // Look for transitions from letters to numbers or vice versa
    const letterNumberBoundary = processed.match(/([A-Z]+)(\d+)/);
    const numberLetterBoundary = processed.match(/(\d+)([A-Z]+)/);
    
    if (letterNumberBoundary) {
      processed = letterNumberBoundary[1] + ' ' + letterNumberBoundary[2];
    } else if (numberLetterBoundary) {
      processed = numberLetterBoundary[1] + ' ' + numberLetterBoundary[2];
    }
  }
  
  // Look for common license plate patterns
  
  // Pattern 1: 2 letters + space + 3-4 digits + optional 1-2 letters (e.g. "AB 1234" or "AB 123C")
  const pattern1 = /^([A-Z]{2})\s*(\d{3,4})([A-Z]{0,2})$/;
  
  // Pattern 2: 1-2 letters + 2-5 digits (e.g. "A12345" or "AB12345")
  const pattern2 = /^([A-Z]{1,2})(\d{2,5})$/;
  
  // Pattern 3: 3 letters + 3 digits (e.g. "ABC123")
  const pattern3 = /^([A-Z]{3})(\d{3})$/;
  
  // Pattern 4: 1-3 digits + 3 letters (e.g. "123ABC")
  const pattern4 = /^(\d{1,3})([A-Z]{3})$/;
  
  if (pattern1.test(processed)) {
    const match = processed.match(pattern1);
    if (match) {
      processed = `${match[1]} ${match[2]}${match[3]}`;
    }
  } else if (pattern2.test(processed)) {
    const match = processed.match(pattern2);
    if (match) {
      processed = `${match[1]} ${match[2]}`;
    }
  } else if (pattern3.test(processed)) {
    const match = processed.match(pattern3);
    if (match) {
      processed = `${match[1]} ${match[2]}`;
    }
  } else if (pattern4.test(processed)) {
    const match = processed.match(pattern4);
    if (match) {
      processed = `${match[1]} ${match[2]}`;
    }
  }
  
  // Remove any dangling single characters (likely OCR errors)
  processed = processed.replace(/\b[A-Z0-9]\b/g, '').trim();
  
  console.log('Post-processed result:', processed);
  
  return processed;
}

// Function to recognize text from an image buffer
export async function recognizeText(imageBuffer: Buffer): Promise<string> {
  try {
    // Initialize the OCR worker if needed
    const ocrWorker = await initWorker();
    
    // Preprocess the image to improve OCR results
    console.log('Preprocessing image for OCR...');
    const processedImageBuffer = await preprocessImage(imageBuffer);
    
    // Save the processed buffer to a temporary file
    const tempImage = path.join(TEMP_DIR, `plate_${Date.now()}.png`);
    fs.writeFileSync(tempImage, processedImageBuffer);
    
    // Also save a debug copy
    const debugDir = path.join(__dirname, '../debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    const debugFile = path.join(debugDir, `ocr_input_${Date.now()}.png`);
    fs.writeFileSync(debugFile, processedImageBuffer);
    console.log(`Saved OCR input image to ${debugFile}`);
    
    console.log('Recognizing text from image...');
    
    // Try multiple PSM modes to get the best result
    // PSM 6: Assume a single uniform block of text
    // PSM 7: Treat the image as a single line of text
    // PSM 8: Treat the image as a single word
    // PSM 11: Sparse text - find as much text as possible
    // PSM 13: Raw line - treat the image as a single text line
    const modes = [7, 6, 8, 11, 13];
    let bestText = '';
    let highestConfidence = 0;
    
    for (const psm of modes) {
      // Set PSM mode
      await ocrWorker.setParameters({ ...OCR_CONFIG, psm });
      
      // Recognize text in the image
      const { data } = await ocrWorker.recognize(tempImage);
      
      console.log(`PSM ${psm} result:`, data.text.trim(), 'confidence:', data.confidence);
      
      // Keep the result with highest confidence
      if (data.confidence > highestConfidence) {
        highestConfidence = data.confidence;
        bestText = data.text.trim();
      }
      
      // If confidence is high enough, don't try other modes
      if (data.confidence > 85) {
        break;
      }
    }
    
    // If confidence is still very low, try with various image adjustments
    if (highestConfidence < 40 && bestText.length < 3) {
      console.log('Low confidence result, trying image adjustments');
      
      // Load the image and try different preprocessing techniques
      const tfImage = tf.node.decodeImage(processedImageBuffer, 3) as tf.Tensor3D;
      
      // Try different contrast levels
      const contrastLevels = [1.5, 2.0, 2.5];
      
      for (const contrast of contrastLevels) {
        // Adjust contrast 
        const adjusted = tfImage.sub(tf.scalar(0.5)).mul(tf.scalar(contrast)).add(tf.scalar(0.5)).clipByValue(0, 1);
        
        // Convert back to buffer and save
        const adjustedBuffer = await tf.node.encodePng(adjusted as unknown as tf.Tensor3D);
        const adjustedTempFile = path.join(TEMP_DIR, `adjusted_${contrast}_${Date.now()}.png`);
        fs.writeFileSync(adjustedTempFile, adjustedBuffer);
        
        // Save debug copy
        const debugAdjusted = path.join(debugDir, `ocr_adjusted_${contrast}_${Date.now()}.png`);
        fs.writeFileSync(debugAdjusted, adjustedBuffer);
        
        // Try OCR on adjusted image
        await ocrWorker.setParameters({ ...OCR_CONFIG, psm: 7 }); // Line of text
        const { data } = await ocrWorker.recognize(adjustedTempFile);
        
        console.log(`Contrast ${contrast} result:`, data.text.trim(), 'confidence:', data.confidence);
        
        if (data.confidence > highestConfidence) {
          highestConfidence = data.confidence;
          bestText = data.text.trim();
        }
        
        // Clean up
        fs.unlinkSync(adjustedTempFile);
        adjusted.dispose();
      }
      
      tfImage.dispose();
    }
    
    // Clean up the temporary file
    fs.unlinkSync(tempImage);
    
    // Apply post-processing to clean up the text
    const processedText = postProcessText(bestText);
    
    console.log('Original recognized text:', bestText);
    console.log('Processed text:', processedText);
    
    return processedText;
  } catch (error) {
    console.error('Error in text recognition:', error);
    return '';
  }
}

// Function to properly terminate the worker when the application exits
export async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
    console.log('OCR worker terminated');
  }
}

// Set up process hooks to ensure proper cleanup
process.on('exit', () => {
  if (worker) {
    // Since this is synchronous, we can't use the async function directly
    console.log('Process exiting, terminating OCR worker');
  }
});

// Handle async cleanup for other termination signals
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, async () => {
    await terminateWorker();
    process.exit(0);
  });
}); 