import cv from '@techstark/opencv-js';

// --- Constants based on the original Python script ---
const SCALE = 5; // フレーム抽出の細かさ (original: scale)
const THRESHOLD = 50; // 二値化の閾値 (original: threshold)
const TRIM = 0; // トリムの値 (original: trim)

// --- Type definitions ---
export interface FrameData {
  ratio: number;
  depth: number;
}

export interface ProcessResult {
  ratios: FrameData[];
  // In the future, we can add extracted frames for the viewer here
}

/**
 * Processes a video file in the browser to calculate the white pixel ratio per frame.
 * @param videoFile The video file to process.
 * @param depth The total depth, used to calculate frame intervals.
 * @param onProgress A callback function to report progress (0 to 1).
 * @returns A promise that resolves with the processing results.
 */
export const processVideoInBrowser = async (
  videoFile: File,
  depth: number,
  onProgress: (progress: number) => void
): Promise<ProcessResult> => {
  return new Promise((resolve, reject) => {
    // 1. Create a video element to play the video in memory
    const video = document.createElement('video');
    const videoUrl = URL.createObjectURL(videoFile);
    video.src = videoUrl;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      return reject(new Error('Could not get canvas context'));
    }

    const results: FrameData[] = [];

    video.onloadedmetadata = async () => {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Calculate interval based on the Python script's logic
      // We need to estimate total frames. A common (but not always accurate) FPS is 30.
      const estimatedFps = 30;
      const totalFrames = video.duration * estimatedFps;
      const frameInterval = Math.max(1, Math.floor(totalFrames / (depth * SCALE)));
      const timeInterval = frameInterval / estimatedFps;

      if (timeInterval <= 0) {
        return reject(new Error('Invalid depth or video length, processing interval is zero.'));
      }

      onProgress(0);

      // 2. Loop through the video at the calculated time interval
      for (let currentTime = 0; currentTime < video.duration; currentTime += timeInterval) {
        video.currentTime = currentTime;

        // Wait for the video to seek to the correct frame
        await new Promise<void>(r => { video.onseeked = () => r(); });

        // 3. Draw the frame to the canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const binary = new cv.Mat();

        // 4. Process the frame using OpenCV.js
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.threshold(gray, binary, THRESHOLD, 255, cv.THRESH_BINARY);

        // 5. Calculate white pixel ratio
        const totalPixels = binary.rows * binary.cols;
        const whitePixels = cv.countNonZero(binary) + TRIM;
        const whiteRatio = totalPixels > 0 ? whitePixels / totalPixels : 0;

        results.push({ ratio: whiteRatio, depth: (currentTime / video.duration) * depth });

        // Clean up memory
        src.delete();
        gray.delete();
        binary.delete();

        onProgress(currentTime / video.duration);
      }

      onProgress(1);
      URL.revokeObjectURL(videoUrl); // Clean up the object URL
      resolve({ ratios: results });
    };

    video.onerror = () => {
      reject(new Error('Failed to load video.'));
      URL.revokeObjectURL(videoUrl);
    };
  });
};
