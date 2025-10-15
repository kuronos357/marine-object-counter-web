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
  duration: number;
}

/**
 * Gets the image data for a single frame at a specific time.
 * @param videoFile The video file to process.
 * @param time The time in seconds to seek to.
 * @returns A promise that resolves with the original and binarized ImageData.
 */
export const getFrameForDisplay = async (
  videoFile: File,
  time: number
): Promise<{ original: ImageData; binarized: ImageData }> => {
  const cv = (window as any).cv;
  if (typeof cv === 'undefined') {
    return Promise.reject(new Error('OpenCV.js is not ready.'));
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const videoUrl = URL.createObjectURL(videoFile);
    video.src = videoUrl;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      return reject(new Error('Canvas contextを取得できませんでした。'));
    }

    video.onloadedmetadata = async () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      video.currentTime = Math.min(Math.max(0, time), video.duration);

      await new Promise<void>(r => { video.onseeked = () => r(); });

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const binary = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.threshold(gray, binary, THRESHOLD, 255, cv.THRESH_BINARY);

      // Draw the binarized image back to the canvas to get its ImageData
      cv.imshow(canvas, binary);
      const binarizedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      src.delete();
      gray.delete();
      binary.delete();
      URL.revokeObjectURL(videoUrl);

      resolve({ original: originalImageData, binarized: binarizedImageData });
    };

    video.onerror = () => {
      reject(new Error('動画の読み込みに失敗しました。'));
      URL.revokeObjectURL(videoUrl);
    };
  });
};

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
  scale: number, // New parameter: sampling interval in meters
  onProgress: (progress: number) => void
): Promise<ProcessResult> => {
  // Use window.cv to access the globally loaded OpenCV object
  const cv = (window as any).cv;
  if (typeof cv === 'undefined') {
    return Promise.reject(new Error('OpenCV.js is not ready.'));
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const videoUrl = URL.createObjectURL(videoFile);
    video.src = videoUrl;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      return reject(new Error('Canvas contextを取得できませんでした。'));
    }

    const results: FrameData[] = [];

    video.onloadedmetadata = async () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // New calculation logic based on `scale` as sampling interval
      const totalSamples = depth / scale;
      if (totalSamples <= 0) {
        return reject(new Error('深度とスケールの設定では、サンプル数が0以下になります。'));
      }
      const timeInterval = video.duration / totalSamples;

      if (timeInterval <= 0) {
        return reject(new Error('動画の長さが0か、設定値が不正です。'));
      }

      onProgress(0);

      for (let currentTime = 0; currentTime < video.duration; currentTime += timeInterval) {
        video.currentTime = currentTime;
        await new Promise<void>(r => { video.onseeked = () => r(); });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const binary = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        cv.threshold(gray, binary, THRESHOLD, 255, cv.THRESH_BINARY);

        const totalPixels = binary.rows * binary.cols;
        const whitePixels = cv.countNonZero(binary) + TRIM;
        const whiteRatio = totalPixels > 0 ? whitePixels / totalPixels : 0;

        results.push({ ratio: whiteRatio, depth: (currentTime / video.duration) * depth });

        src.delete();
        gray.delete();
        binary.delete();

        onProgress(currentTime / video.duration);
      }

      onProgress(1);
      URL.revokeObjectURL(videoUrl);
      resolve({ ratios: results, duration: video.duration });
    };

    video.onerror = () => {
      reject(new Error('動画の読み込みに失敗しました。'));
      URL.revokeObjectURL(videoUrl);
    };
  });
};