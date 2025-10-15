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

// --- 型定義 ---
export interface FrameData {
  ratio: number;
  depth: number;
}

export interface ProcessResult {
  ratios: FrameData[];
  duration: number;
}

/**
 * ブラウザ上で動画ファイルを処理し、フレームごとの白ピクセル率を計算します。
 * @param videoFile 処理対象の動画ファイル
 * @param depth 総深度。フレームの間隔計算に使用されます。
 * @param scale サンプリング間隔（メートル）
 * @param threshold 二値化の閾値
 * @param trim 白ピクセル数に加算する値
 * @param onProgress 進捗を報告するためのコールバック関数 (0 to 1)
 * @returns 処理結果を含むPromise
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
    return Promise.reject(new Error('OpenCV.jsの準備ができていません。'));
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
 * 指定された時間の単一フレームの画像データを取得します。
 * @param videoFile 処理対象の動画ファイル
 * @param time シークする時間（秒）
 * @param threshold 二値化の閾値
 * @returns 元画像と二値化画像のImageDataを含むPromise
 */
export const getFrameForDisplay = async (
  videoFile: File,
  time: number,
  threshold: number
): Promise<{ original: ImageData; binarized: ImageData }> => {
  const cv = (window as unknown as { cv: Cv }).cv;
  if (typeof cv === 'undefined') {
    return Promise.reject(new Error('OpenCV.jsの準備ができていません。'));
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