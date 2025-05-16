"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLicensePlate = detectLicensePlate;
const tf = __importStar(require("@tensorflow/tfjs-node"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
// Use a basic approach instead of Jimp
const loadImageFromFile = async (filePath) => {
    return await fs_1.promises.readFile(filePath);
};
// Path to the pre-trained model (we'll need to download or train this)
const MODEL_PATH = path.join(__dirname, '../models/license_plate_detector');
// Load the model or initialize a placeholder
let model = null;
// Load the model if available, otherwise we'll create a mock implementation
async function loadModel() {
    try {
        // Check if model directory exists
        if (fs.existsSync(MODEL_PATH)) {
            console.log('Loading license plate detection model...');
            model = await tf.loadGraphModel(`file://${MODEL_PATH}/model.json`);
            console.log('Model loaded successfully');
        }
        else {
            console.warn('No model found at', MODEL_PATH);
            console.warn('Using image processing-based detection instead');
        }
    }
    catch (error) {
        console.error('Error loading model:', error);
    }
}
// Initialize the model
loadModel();
// Function to preprocess the image
async function preprocessImage(imagePath) {
    // Read image directly using TensorFlow
    const imageBuffer = await loadImageFromFile(imagePath);
    // Convert to tensor
    const decodedImage = tf.node.decodeImage(imageBuffer);
    // Resize to expected input size (300x300 is common for SSD models)
    const resizedImage = tf.image.resizeBilinear(decodedImage, [300, 300]);
    // Expand dimensions to get a batch of 1 and normalize
    const expandedImage = resizedImage.expandDims(0);
    const normalizedImage = expandedImage.div(255);
    // Cleanup intermediate tensors
    decodedImage.dispose();
    resizedImage.dispose();
    return normalizedImage;
}
// Function to detect edges in an image with improved preprocessing
function detectEdges(imageTensor) {
    // Convert to grayscale if it's RGB
    const grayscale = imageTensor.shape[2] > 1
        ? tf.image.rgbToGrayscale(imageTensor)
        : imageTensor;
    // Enhance contrast to make edges more visible
    const mean = tf.mean(grayscale);
    const adjustedContrast = tf.sub(grayscale, mean).mul(tf.scalar(1.5)).add(mean).clipByValue(0, 1);
    // Apply Gaussian blur to reduce noise
    const gaussianKernel = tf.tensor2d([
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1]
    ], [3, 3]).div(tf.scalar(16)); // Normalize
    const expandedKernel = gaussianKernel.expandDims(2).expandDims(3);
    const expandedImage = adjustedContrast.expandDims(0);
    const blurred = tf.conv2d(expandedImage, expandedKernel, 1, 'same');
    // Apply Sobel filter for edge detection
    // Horizontal edges
    const sobelX = tf.tensor2d([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], [3, 3]);
    // Vertical edges
    const sobelY = tf.tensor2d([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], [3, 3]);
    // Expand dimensions for convolution
    const expandedX = sobelX.expandDims(2).expandDims(3);
    const expandedY = sobelY.expandDims(2).expandDims(3);
    // Apply the filters to the blurred image
    const edgesX = tf.conv2d(blurred, expandedX, 1, 'same');
    const edgesY = tf.conv2d(blurred, expandedY, 1, 'same');
    // Combine the edges and enhance
    const edgesMagnitude = tf.sqrt(tf.add(tf.square(edgesX), tf.square(edgesY)));
    // Normalize edge magnitude
    const maxEdge = tf.max(edgesMagnitude);
    const normalizedEdges = tf.div(edgesMagnitude, maxEdge);
    // Cleanup
    grayscale.dispose();
    adjustedContrast.dispose();
    gaussianKernel.dispose();
    expandedKernel.dispose();
    expandedImage.dispose();
    blurred.dispose();
    sobelX.dispose();
    sobelY.dispose();
    expandedX.dispose();
    expandedY.dispose();
    edgesX.dispose();
    edgesY.dispose();
    edgesMagnitude.dispose();
    maxEdge.dispose();
    // Return the edges
    return normalizedEdges.squeeze();
}
// Function to directly save debug images for development
async function saveDebugImage(tensor, name) {
    const debugDir = path.join(__dirname, '../debug');
    if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
    }
    // Ensure tensor is in proper format for saving
    let imageData;
    // If single channel, convert to RGB
    if (tensor.shape[2] === 1) {
        const rgb = tf.tile(tensor, [1, 1, 3]);
        imageData = await tf.node.encodePng(rgb.mul(tf.scalar(255)).cast('int32'));
        rgb.dispose();
    }
    else {
        imageData = await tf.node.encodePng(tensor.mul(tf.scalar(255)).cast('int32'));
    }
    const debugFile = path.join(debugDir, `${name}_${Date.now()}.png`);
    fs.writeFileSync(debugFile, Buffer.from(imageData));
    console.log(`Saved debug image to ${debugFile}`);
}
// Function to find potential license plate regions based on edge density and aspect ratio
async function findPlateRegions(imagePath) {
    try {
        console.log('Starting findPlateRegions for image:', imagePath);
        // Load image
        const imageBuffer = await loadImageFromFile(imagePath);
        const image = tf.node.decodeImage(imageBuffer);
        // Get image dimensions
        const [height, width] = image.shape;
        console.log(`Image dimensions: ${width}x${height}`);
        // Detect edges
        console.log('Detecting edges...');
        const edges = detectEdges(image);
        // Save edge detection result for debugging
        await saveDebugImage(edges, "edges");
        // Try multiple thresholds to find the best one
        const thresholds = [0.1, 0.15, 0.2, 0.25];
        let bestRegions = [];
        let bestThreshold = 0;
        for (const threshold of thresholds) {
            console.log(`Trying threshold: ${threshold}`);
            // Threshold the edges
            const thresholded = edges.greater(tf.scalar(threshold));
            // Save thresholded image for debugging
            await saveDebugImage(thresholded, `threshold_${threshold}`);
            // Use connected components to find potential regions
            // For simplicity, we'll use a custom approach to find high-density regions
            // Typical license plate aspect ratio (width/height) ranges from 2:1 to 4:1
            const MIN_ASPECT_RATIO = 1.5; // Reduced from 2.0 to be more lenient
            const MAX_ASPECT_RATIO = 5.0; // Increased from 4.5 to be more lenient
            // Minimum and maximum size relative to image
            const MIN_PLATE_WIDTH = width * 0.05; // Reduced from 0.1 to detect smaller plates
            const MAX_PLATE_WIDTH = width * 0.9; // At most 90% of image width
            const MIN_PLATE_HEIGHT = height * 0.01; // Reduced from 0.02 to detect smaller plates
            const MAX_PLATE_HEIGHT = height * 0.3; // Increased from 0.2 to be more lenient
            console.log(`Plate size constraints: width ${MIN_PLATE_WIDTH}-${MAX_PLATE_WIDTH}, height ${MIN_PLATE_HEIGHT}-${MAX_PLATE_HEIGHT}`);
            // Convert to array and cast properly
            console.log('Converting threshold data to array...');
            const edgesData = await thresholded.array();
            const plateRegions = [];
            // Scan the image with sliding windows of different sizes
            const windowSizes = [
                // [width, height]
                [width * 0.2, height * 0.05], // 20% width, 5% height
                [width * 0.3, height * 0.08], // 30% width, 8% height
                [width * 0.4, height * 0.1], // 40% width, 10% height
                [width * 0.5, height * 0.12] // 50% width, 12% height
            ];
            console.log('Scanning with window sizes:', windowSizes);
            let totalWindowsChecked = 0;
            let windowsAboveThreshold = 0;
            for (const [windowWidth, windowHeight] of windowSizes) {
                // Use larger step sizes for efficiency but still good coverage
                const stepX = Math.max(4, Math.floor(windowWidth / 12));
                const stepY = Math.max(4, Math.floor(windowHeight / 12));
                console.log(`Scanning with window ${windowWidth}x${windowHeight}, steps ${stepX}x${stepY}`);
                for (let y = 0; y < height - windowHeight; y += stepY) {
                    for (let x = 0; x < width - windowWidth; x += stepX) {
                        totalWindowsChecked++;
                        // Count edge pixels in this window
                        let edgeCount = 0;
                        const windowEndY = Math.min(y + windowHeight, height);
                        const windowEndX = Math.min(x + windowWidth, width);
                        // Use a sampling approach for efficiency
                        const sampleRate = 4; // Check every 4th pixel
                        for (let wy = y; wy < windowEndY; wy += sampleRate) {
                            if (!edgesData[wy])
                                continue; // Skip if row doesn't exist
                            for (let wx = x; wx < windowEndX; wx += sampleRate) {
                                if (edgesData[wy][wx]) {
                                    edgeCount++;
                                }
                            }
                        }
                        // Calculate edge density (adjusted for sampling)
                        const sampledPixels = Math.ceil((windowEndY - y) / sampleRate) * Math.ceil((windowEndX - x) / sampleRate);
                        const edgeDensity = edgeCount / sampledPixels;
                        // Lower the threshold to catch more potential plates
                        const EDGE_DENSITY_THRESHOLD = 0.1; // 10% of pixels should be edges
                        // Check if this region has high edge density and appropriate aspect ratio
                        const aspectRatio = windowWidth / windowHeight;
                        if (edgeDensity > EDGE_DENSITY_THRESHOLD &&
                            aspectRatio >= MIN_ASPECT_RATIO &&
                            aspectRatio <= MAX_ASPECT_RATIO &&
                            windowWidth >= MIN_PLATE_WIDTH &&
                            windowWidth <= MAX_PLATE_WIDTH &&
                            windowHeight >= MIN_PLATE_HEIGHT &&
                            windowHeight <= MAX_PLATE_HEIGHT) {
                            windowsAboveThreshold++;
                            plateRegions.push({
                                x: x,
                                y: y,
                                width: windowWidth,
                                height: windowHeight,
                                score: edgeDensity
                            });
                        }
                    }
                }
            }
            console.log(`Threshold ${threshold}: Found ${plateRegions.length} potential regions`);
            if (plateRegions.length > bestRegions.length) {
                bestRegions = plateRegions;
                bestThreshold = threshold;
            }
            // Cleanup
            thresholded.dispose();
        }
        console.log(`Best threshold was ${bestThreshold} with ${bestRegions.length} regions`);
        // Sort regions by edge density (score)
        bestRegions.sort((a, b) => b.score - a.score);
        // Take top N regions and merge overlapping ones
        const topRegions = bestRegions.slice(0, 5);
        console.log(`Top ${topRegions.length} regions by score:`, topRegions);
        // Clean up
        image.dispose();
        edges.dispose();
        return topRegions;
    }
    catch (error) {
        console.error('Error in findPlateRegions:', error);
        return [];
    }
}
// Function to crop image based on region
async function cropImage(imagePath, region) {
    try {
        console.log('Cropping image region:', region);
        // Load image
        const imageBuffer = await loadImageFromFile(imagePath);
        const image = tf.node.decodeImage(imageBuffer);
        console.log(`Original image dimensions: ${image.shape[1]}x${image.shape[0]}`);
        // Make sure coordinates are integers
        const x = Math.max(0, Math.floor(region.x));
        const y = Math.max(0, Math.floor(region.y));
        const width = Math.min(Math.floor(region.width), image.shape[1] - x);
        const height = Math.min(Math.floor(region.height), image.shape[0] - y);
        console.log(`Cropping region: x=${x}, y=${y}, width=${width}, height=${height}`);
        // Ensure dimensions are valid
        if (width <= 0 || height <= 0) {
            console.error('Invalid crop dimensions. Using original image.');
            return imageBuffer;
        }
        // Add a LARGER margin around the plate (25% on each side)
        const marginX = Math.floor(width * 0.25);
        const marginY = Math.floor(height * 0.25);
        const finalX = Math.max(0, x - marginX);
        const finalY = Math.max(0, y - marginY);
        const finalWidth = Math.min(width + 2 * marginX, image.shape[1] - finalX);
        const finalHeight = Math.min(height + 2 * marginY, image.shape[0] - finalY);
        console.log(`Final crop with margins: x=${finalX}, y=${finalY}, width=${finalWidth}, height=${finalHeight}`);
        // If the resulting crop is too small, use more of the original image
        const MIN_DIMENSION = 100; // Minimum size in pixels
        if (finalWidth < MIN_DIMENSION || finalHeight < MIN_DIMENSION) {
            console.log('Crop region too small, using larger portion of image');
            // Use a region that's at least 30% of the original image
            const safeWidth = Math.max(MIN_DIMENSION, Math.floor(image.shape[1] * 0.3));
            const safeHeight = Math.max(MIN_DIMENSION, Math.floor(image.shape[0] * 0.3));
            // Center it on the detected region if possible
            const safeX = Math.max(0, Math.min(x + width / 2 - safeWidth / 2, image.shape[1] - safeWidth));
            const safeY = Math.max(0, Math.min(y + height / 2 - safeHeight / 2, image.shape[0] - safeHeight));
            console.log(`Using safe crop: x=${safeX}, y=${safeY}, width=${safeWidth}, height=${safeHeight}`);
            // Crop the image
            const cropped = tf.slice(image, [safeY, safeX, 0], [safeHeight, safeWidth, image.shape[2]]);
            // Convert back to buffer
            const croppedBuffer = await tf.node.encodePng(cropped);
            // Clean up tensors
            image.dispose();
            cropped.dispose();
            // Save a debug copy to verify cropping
            const debugDir = path.join(__dirname, '../debug');
            if (!fs.existsSync(debugDir)) {
                fs.mkdirSync(debugDir, { recursive: true });
            }
            const debugFile = path.join(debugDir, `plate_crop_safe_${Date.now()}.png`);
            fs.writeFileSync(debugFile, croppedBuffer);
            console.log(`Saved debug crop to ${debugFile}`);
            return Buffer.from(croppedBuffer);
        }
        // Crop the image
        const cropped = tf.slice(image, [finalY, finalX, 0], [finalHeight, finalWidth, image.shape[2]]);
        // Convert back to buffer
        const croppedBuffer = await tf.node.encodePng(cropped);
        // Clean up tensors
        image.dispose();
        cropped.dispose();
        // Save a debug copy to verify cropping
        const debugDir = path.join(__dirname, '../debug');
        if (!fs.existsSync(debugDir)) {
            fs.mkdirSync(debugDir, { recursive: true });
        }
        const debugFile = path.join(debugDir, `plate_crop_${Date.now()}.png`);
        fs.writeFileSync(debugFile, croppedBuffer);
        console.log(`Saved debug crop to ${debugFile}`);
        return Buffer.from(croppedBuffer);
    }
    catch (error) {
        console.error('Error cropping image:', error);
        return await loadImageFromFile(imagePath); // Return original if cropping fails
    }
}
// Main function to detect license plates in an image
async function detectLicensePlate(imagePath) {
    try {
        console.log('-----------------------------------');
        console.log('Starting license plate detection for:', imagePath);
        // If we have a model, use it
        if (model) {
            console.log('Using trained model for detection');
            const inputTensor = await preprocessImage(imagePath);
            // Run inference
            const result = await model.executeAsync(inputTensor);
            // Process results (format depends on the specific model)
            const boxes = result[0].arraySync();
            const scores = result[1].arraySync();
            // Cleanup tensors
            tf.dispose(result);
            tf.dispose(inputTensor);
            // Filter boxes by confidence threshold
            const CONFIDENCE_THRESHOLD = 0.5;
            const validDetections = scores.findIndex(score => score < CONFIDENCE_THRESHOLD);
            const numDetections = validDetections > 0 ? validDetections : scores.length;
            if (numDetections === 0) {
                console.log('No license plates detected');
                return null;
            }
            // Get the highest confidence detection
            const bestDetection = boxes[0];
            const [y1, x1, y2, x2] = bestDetection;
            // Convert normalized coordinates to actual pixel values
            const imageBuffer = await loadImageFromFile(imagePath);
            const image = tf.node.decodeImage(imageBuffer);
            const [height, width] = image.shape;
            image.dispose();
            const region = {
                x: x1 * width,
                y: y1 * height,
                width: (x2 - x1) * width,
                height: (y2 - y1) * height,
                score: scores[0]
            };
            console.log('Plate region detected by model:', region);
            // Crop the plate region
            return await cropImage(imagePath, region);
        }
        else {
            // Use image processing-based detection
            console.log('Using image processing for plate detection');
            // Find potential plate regions
            const plateRegions = await findPlateRegions(imagePath);
            if (plateRegions.length === 0) {
                console.log('No license plates detected through edge analysis');
                console.log('Falling back to direct plate extraction');
                // Load the image to get dimensions
                const imageBuffer = await loadImageFromFile(imagePath);
                const image = tf.node.decodeImage(imageBuffer);
                const [height, width] = image.shape;
                image.dispose();
                // Get a larger central portion of the image
                // Use 60% of the width and 40% of the height centered in the lower half
                const fallbackRegion = {
                    x: Math.floor(width * 0.2), // Start at 20% from left
                    y: Math.floor(height * 0.4), // Start at 40% from top
                    width: Math.floor(width * 0.6), // 60% of image width
                    height: Math.floor(height * 0.3), // 30% of image height
                    score: 0.5 // Arbitrary score
                };
                console.log('Using fallback region:', fallbackRegion);
                return await cropImage(imagePath, fallbackRegion);
            }
            // Use the top detected region
            const bestRegion = plateRegions[0];
            console.log('Best plate region detected:', bestRegion);
            // Crop the plate region
            const croppedPlate = await cropImage(imagePath, bestRegion);
            console.log(`Cropped plate buffer size: ${croppedPlate.length} bytes`);
            return croppedPlate;
        }
    }
    catch (error) {
        console.error('Error in license plate detection:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
        try {
            // Last resort fallback: use a larger portion of the image
            console.log('Error in detection, using emergency fallback crop');
            const imageBuffer = await loadImageFromFile(imagePath);
            const image = tf.node.decodeImage(imageBuffer);
            const [height, width] = image.shape;
            // Create a larger region (60% of image)
            const regionWidth = Math.floor(width * 0.6);
            const regionHeight = Math.floor(height * 0.4);
            const region = {
                x: Math.floor((width - regionWidth) / 2),
                y: Math.floor(height * 0.5 - regionHeight / 2),
                width: regionWidth,
                height: regionHeight,
                score: 0.1
            };
            console.log('Emergency fallback region:', region);
            image.dispose();
            return await cropImage(imagePath, region);
        }
        catch (secondError) {
            console.error('Error in emergency fallback:', secondError);
            return await loadImageFromFile(imagePath);
        }
    }
}
