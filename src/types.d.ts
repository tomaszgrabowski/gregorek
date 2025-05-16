declare module './licensePlateDetector' {
  export function detectLicensePlate(imagePath: string): Promise<Buffer | null>;
}

declare module './textRecognizer' {
  export function recognizeText(imageBuffer: Buffer): Promise<string>;
  export function terminateWorker(): Promise<void>;
} 