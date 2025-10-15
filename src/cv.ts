interface Cv {
  imread(canvas: HTMLCanvasElement): any; // Mat
  cvtColor(src: any, dst: any, code: number, dstCn?: number): void;
  threshold(src: any, dst: any, thresh: number, maxval: number, type: number): void;
  countNonZero(src: any): number;
  imshow(canvas: HTMLCanvasElement, mat: any): void;
  Mat: new () => any;
  COLOR_RGBA2GRAY: number;
  THRESH_BINARY: number;
}

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
 * Processes a video file in the browser to calculate the white pixel ratio per frame.
 * @param videoFile The video file to process.
 * @param depth The total depth, used to calculate frame intervals.
 * @param scale The sampling interval in meters.
 * @param threshold The binarization threshold.
 * @param trim The value to add to the white pixel count.
 * @param onProgress A callback function to report progress (0 to 1).
 * @returns A promise that resolves with the processing results.
 */
export const processVideoInBrowser = async (
  videoFile: File,
  depth: number,
  scale: number,
  threshold: number,
  trim: number,
  onProgress: (progress: number) => void
): Promise<ProcessResult> => {
  const cv = (window as unknown as { cv: Cv }).cv;
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
        cv.threshold(gray, binary, threshold, 255, cv.THRESH_BINARY);

        const totalPixels = binary.rows * binary.cols;
        const whitePixels = cv.countNonZero(binary) + trim;
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

/**
 * Gets the image data for a single frame at a specific time.
 * @param videoFile The video file to process.
 * @param time The time in seconds to seek to.
 * @param threshold The binarization threshold.
 * @returns A promise that resolves with the original and binarized ImageData.
 */
export const getFrameForDisplay = async (
  videoFile: File,
  time: number,
  threshold: number
): Promise<{ original: ImageData; binarized: ImageData }> => {
  const cv = (window as unknown as { cv: Cv }).cv;
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
      cv.threshold(gray, binary, threshold, 255, cv.THRESH_BINARY);

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
