# License Plate Reader

A Node.js application that uses computer vision and OCR to detect and read license plates from images.

## Features

- Upload images containing vehicles with license plates
- Automatic license plate detection
- Optical Character Recognition (OCR) for license plate text extraction
- Simple web interface for easy use

## Technologies Used

- Node.js and Express for the backend server
- TypeScript for type-safe code
- TensorFlow.js for license plate detection
- Tesseract.js for OCR text recognition
- Jimp for image processing
- HTML/CSS/JavaScript for the frontend interface

## Setup and Installation

1. **Clone the repository**
   ```
   git clone <repository-url>
   cd license-plate-reader
   ```

2. **Install dependencies**
   ```
   npm install
   ```

3. **Build the application**
   ```
   npm run build
   ```

4. **Run the application**
   ```
   npm start
   ```
   
   For development with auto-reload:
   ```
   npm run dev
   ```

5. **Access the application**
   
   Open your browser and go to http://localhost:3000

## Usage

1. Open the web interface in your browser
2. Upload an image containing a vehicle with a license plate
   - Either drag and drop an image or click the "Select Image" button
3. Wait for the processing to complete
4. View the detected license plate and the extracted text

## Notes on License Plate Detection Model

This application includes a placeholder for a license plate detection model. For optimal results:

1. Download or train a license plate detection model (TensorFlow.js format)
2. Place the model files in the `models/license_plate_detector` directory
3. Restart the application

Without a model present, the application will use a fallback method that treats the entire image as the license plate region.

## License

ISC # gregorek
# gregorek
