"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const licensePlateDetector_1 = require("./licensePlateDetector");
const textRecognizer_1 = require("./textRecognizer");
const fs_1 = require("fs");
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Set up storage for uploaded images
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max size
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path_1.default.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only JPEG, JPG, and PNG images are allowed'));
    }
});
// Function to save recognition results to data directory
async function saveRecognitionResult(originalImagePath, plateText, plateImageBuffer) {
    try {
        console.log('Starting to save recognition result...');
        console.log('Original image path:', originalImagePath);
        console.log('Plate text:', plateText);
        console.log('Plate image buffer length:', plateImageBuffer.length);
        // Create a timestamp-based directory name for this recognition
        const timestamp = Date.now();
        const resultDir = path_1.default.join('data', `result_${timestamp}`);
        console.log('Creating directory:', resultDir);
        // Create the directory
        await fs_1.promises.mkdir(resultDir, { recursive: true });
        // Save the results
        const metadata = {
            originalImage: originalImagePath,
            timestamp,
            recognizedText: plateText,
            processingDate: new Date().toISOString()
        };
        console.log('Saving metadata to:', path_1.default.join(resultDir, 'metadata.json'));
        // Save metadata as JSON
        await fs_1.promises.writeFile(path_1.default.join(resultDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
        console.log('Saving plate image to:', path_1.default.join(resultDir, 'plate.jpg'));
        // Save plate image
        await fs_1.promises.writeFile(path_1.default.join(resultDir, 'plate.jpg'), plateImageBuffer);
        console.log('Copying original image to:', path_1.default.join(resultDir, 'original.jpg'));
        // Copy original image
        await fs_1.promises.copyFile(originalImagePath, path_1.default.join(resultDir, 'original.jpg'));
        console.log(`Recognition results saved to ${resultDir}`);
        return resultDir;
    }
    catch (error) {
        console.error('Error saving recognition results:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
        return null;
    }
}
// Serve static files from the public directory
app.use(express_1.default.static('public'));
// Define routes
app.post('/api/read-plate', upload.single('image'), async (req, res, next) => {
    try {
        console.log('Received upload request');
        if (!req.file) {
            console.log('No file uploaded');
            res.status(400).json({ error: 'No image uploaded' });
            return;
        }
        console.log('File uploaded successfully:', req.file.path);
        const imagePath = req.file.path;
        // Save a copy of original image to debug directory
        const debugOriginal = path_1.default.join('debug', `original_${Date.now()}.jpg`);
        await fs_1.promises.copyFile(imagePath, debugOriginal);
        console.log(`Saved copy of original image to: ${debugOriginal}`);
        // Step 1: Detect license plate in the image
        console.log('Detecting license plate in image:', imagePath);
        const plateRegion = await (0, licensePlateDetector_1.detectLicensePlate)(imagePath);
        if (!plateRegion) {
            console.log('No license plate detected in the image');
            res.status(404).json({ error: 'No license plate detected in the image' });
            return;
        }
        // Save the detected plate to debug directory
        const debugPlate = path_1.default.join('debug', `plate_${Date.now()}.jpg`);
        await fs_1.promises.writeFile(debugPlate, plateRegion);
        console.log(`Saved detected plate to: ${debugPlate}`);
        console.log('License plate region detected, buffer length:', plateRegion.length);
        // Step 2: Recognize text from the plate region
        console.log('Recognizing text from plate region');
        const plateText = await (0, textRecognizer_1.recognizeText)(plateRegion);
        console.log('Text recognized:', plateText);
        // Step 3: Save the results to data directory
        console.log('Saving recognition results to data directory');
        const resultDir = await saveRecognitionResult(imagePath, plateText, plateRegion);
        console.log('Sending response to client');
        res.json({
            success: true,
            plateText,
            plateImage: plateRegion.toString('base64'),
            resultDir: resultDir ? path_1.default.relative(process.cwd(), resultDir) : null
        });
    }
    catch (error) {
        console.error('Error processing image:', error);
        console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack available');
        res.status(500).json({ error: 'Failed to process the image' });
    }
});
// Create necessary directories if they don't exist
(async () => {
    try {
        await fs_1.promises.mkdir('uploads', { recursive: true });
        await fs_1.promises.mkdir('public', { recursive: true });
        await fs_1.promises.mkdir('data', { recursive: true });
        await fs_1.promises.mkdir('debug', { recursive: true });
        console.log('Created uploads, public, data, and debug directories');
    }
    catch (err) {
        console.error('Error creating directories:', err);
    }
})();
// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
