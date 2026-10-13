import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CSVLink } from 'react-csv';
import { processVideoInBrowser, getFrameForDisplay } from './cv';
import type { FrameData, Cv } from './cv';
import { APP_VERSION } from './version';
import './App.css';

interface GlobalWithCv {
  cv?: Cv | Promise<Cv>;
}

function App() {
  const [isCvReady, setIsCvReady] = useState<boolean>(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('OpenCVを初期化しています...');
  const [progress, setProgress] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [results, setResults] = useState<FrameData[]>([]);
  const [videoDuration, setVideoDuration] = useState<number>(0);

  // 設定値のState
  const [depth, setDepth] = useState<number>(100);
  const [scale, setScale] = useState<number>(5);
  const [threshold, setThreshold] = useState<number>(50);
  const [trim, setTrim] = useState<number>(0);

  // フレームビューアの状態
  const [viewerMode, setViewerMode] = useState<string>('depth');
  const [viewerValue, setViewerValue] = useState<number>(0);

  useEffect(() => {
    let timeoutId: number;
    let attempts = 0;
    const maxAttempts = 300; // 最大30秒 (100ms * 300)

    const checkCv = () => {
      const globalWindow = window as unknown as GlobalWithCv;
      const cv = globalWindow.cv;

      // 1. すでに実体オブジェクトとして初期化完了している場合
      if (cv && 'imread' in cv && typeof cv.imread === 'function') {
        setIsCvReady(true);
        setStatus('動画ファイルを選択してください...');
        return;
      }

      // 2. cv が Promise の場合（@techstark/opencv-js の仕様）
      if (cv && 'then' in cv && typeof cv.then === 'function') {
        cv.then((resolvedCv: Cv) => {
          globalWindow.cv = resolvedCv;
          setIsCvReady(true);
          setStatus('動画ファイルを選択してください...');
        }).catch((err: unknown) => {
          setStatus(`OpenCVの初期化に失敗しました: ${err}`);
        });
        return;
      }

      // 3. onRuntimeInitialized コールバック待機の場合
      if (cv && 'onRuntimeInitialized' in cv && typeof cv.onRuntimeInitialized !== 'undefined') {
        const prevCallback = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          if (typeof prevCallback === 'function') prevCallback();
          setIsCvReady(true);
          setStatus('動画ファイルを選択してください...');
        };
        return;
      }

      // 4. まだ読み込み中
      attempts++;
      if (attempts >= maxAttempts) {
        setStatus('エラー: OpenCV.jsの読み込みに失敗しました（タイムアウト）。ネットワークまたはCDN制限を確認してください。');
        return;
      }

      timeoutId = window.setTimeout(checkCv, 100);
    };

    checkCv();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setResults([]);
      setStatus(`動画を選択しました: ${file.name}`);
    }
  };

  const handleProcessVideo = async () => {
    if (!videoFile) {
      setStatus('最初に動画ファイルを選択してください。');
      return;
    }
    setIsProcessing(true);
    setResults([]);
    setStatus('動画を処理中...');
    setProgress(0);
    try {
      const result = await processVideoInBrowser(videoFile, depth, scale, threshold, trim, (p) => {
        setProgress(p);
        setStatus(`処理中... ${(p * 100).toFixed(0)}%`);
      });
      setResults(result.ratios);
      setVideoDuration(result.duration);
      setStatus('処理が完了しました！');
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラーが発生しました。';
      setStatus(`エラー: ${message}`);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const handleShowImage = async () => {
    if (!videoFile) return;
    let targetTime = 0;
    const totalSamples = depth / scale;
    switch (viewerMode) {
      case 'depth':
        targetTime = (viewerValue / depth) * videoDuration;
        break;
      case 'frame':
        targetTime = (viewerValue / totalSamples) * videoDuration;
        break;
      case 'seconds':
        targetTime = viewerValue;
        break;
      default: return;
    }
    if (targetTime < 0 || targetTime > videoDuration) {
      setStatus(`エラー: 指定された値が動画の範囲外です (0 - ${videoDuration.toFixed(2)}s)`);
      return;
    }
    setStatus('フレームを生成中...');
    try {
      const frames = await getFrameForDisplay(videoFile, targetTime, threshold);
      const originalCanvas = document.getElementById('original-canvas') as HTMLCanvasElement;
      const binaryCanvas = document.getElementById('binary-canvas') as HTMLCanvasElement;
      if (originalCanvas && binaryCanvas) {
        originalCanvas.width = frames.original.width;
        originalCanvas.height = frames.original.height;
        binaryCanvas.width = frames.binarized.width;
        binaryCanvas.height = frames.binarized.height;
        const originalCtx = originalCanvas.getContext('2d');
        const binaryCtx = binaryCanvas.getContext('2d');
        originalCtx?.putImageData(frames.original, 0, 0);
        binaryCtx?.putImageData(frames.binarized, 0, 0);
        setStatus('フレームを表示しました。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラーが発生しました。';
      setStatus(`エラー: ${message}`);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>
          <img src={`${import.meta.env.BASE_URL}favicon.ico?v=1.1.0`} alt="ロゴ" className="app-logo" />
          海中浮遊物カウンター (Web版)
          <span className="version-tag">v{APP_VERSION}</span>
        </h1>
      </header>
      <main>
        <div className="app-intro">
          <p className="app-lead">
            水中・海中動画から浮遊物（マリンスノー等）を自動認識（二値化）し、深度ごとの密度変化を可視化・集計するWebアプリケーションです。
          </p>
          <div className="privacy-badge">
            <span className="badge-icon">🔒</span>
            <span>完全ローカル処理：動画ファイルは外部サーバーに送信されず、お使いの端末（ブラウザ）ローカル内で高速に解析されます。</span>
          </div>

          <details className="guide-details">
            <summary>💡 はじめての方へ（使い方・設定ガイド）</summary>
            <div className="guide-content">
              <ol>
                <li><strong>1. 動画ファイルを選択</strong>: 計測対象の動画ファイル（mp4等）を選択します。</li>
                <li><strong>2. 総深度(m)を入力</strong>: 撮影開始から最深部（または終了地点）までの水深を入力します。</li>
                <li><strong>詳細設定（任意）</strong>:
                  <ul>
                    <li><em>サンプリング間隔(m)</em>: フレームを抽出する深度ステップ（小さいほど高精度、大きいほど高速）。</li>
                    <li><em>二値化の閾値(0-255)</em>: 浮遊物（白）と海中背景（黒）を分離する感度。</li>
                    <li><em>トリム値</em>: レンズの傷や固定ノイズの白ピクセル数を相殺するための補正値。</li>
                  </ul>
                </li>
                <li><strong>3. 「動画を処理」をクリック</strong>: 解析を開始し、深度別グラフやCSVダウンロード、各深度フレームの確認が可能です。</li>
              </ol>
              <p className="pwa-guide-note">
                📲 <strong>オフライン・PWA対応</strong>: アドレスバーの「インストール」や「ホーム画面に追加」を行うことで、電波の届かない船上・洋上でも単独アプリとして利用可能です。
              </p>
            </div>
          </details>
        </div>

        <div className="controls">
          <div className="control-item">
            <label htmlFor="video-input">1. 動画ファイルを選択</label>
            <input id="video-input" type="file" accept="video/*" onChange={handleFileChange} disabled={!isCvReady || isProcessing}/>
          </div>
          <div className="control-item">
            <label htmlFor="depth-input">
              2. 総深度 (m) <span className="label-hint">（最大潜水深度）</span>
            </label>
            <input id="depth-input" type="number" value={depth} onChange={(e) => setDepth(parseInt(e.target.value, 10))} min="1" disabled={!isCvReady || isProcessing}/>
          </div>
          
          <details className="settings-details">
            <summary>詳細設定（解析パラメータ）</summary>
            <div className="settings-content">
              <div className="control-item">
                <label htmlFor="scale-input">
                  サンプリング間隔 (m) <span className="label-hint">（何mごとに計測するか）</span>
                </label>
                <input id="scale-input" type="number" value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} min="0.1" step="0.1" disabled={!isCvReady || isProcessing}/>
              </div>
              <div className="control-item">
                <label htmlFor="threshold-input">
                  二値化の閾値 (0-255) <span className="label-hint">（白黒分離の境界）</span>
                </label>
                <input id="threshold-input" type="number" value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value, 10))} min="0" max="255" disabled={!isCvReady || isProcessing}/>
              </div>
              <div className="control-item">
                <label htmlFor="trim-input">
                  トリム値 <span className="label-hint">（固定ノイズ補正オフセット）</span>
                </label>
                <input id="trim-input" type="number" value={trim} onChange={(e) => setTrim(parseInt(e.target.value, 10))} disabled={!isCvReady || isProcessing}/>
              </div>
            </div>
          </details>

          <div className="control-item">
            <button onClick={handleProcessVideo} disabled={!isCvReady || !videoFile || isProcessing}>
              {isProcessing ? '処理中...' : '3. 動画を処理'}
            </button>
          </div>
        </div>

        <div className="status">
          <p>ステータス: {status}</p>
          {isProcessing && (<progress value={progress} max="1" style={{ width: '100%', maxWidth: '400px' }}></progress>)}
        </div>

        <div className="results">
          {results.length > 0 && (
            <div className="chart-container">
              <h2>処理結果グラフ</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={results}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="depth" type="number" name="深度" unit="m" domain={['dataMin', 'dataMax']}/>
                  <YAxis name="白ピクセル率" domain={[0, 'auto']}/>
                  <Tooltip formatter={(value: number) => value.toFixed(5)} />
                  <Legend />
                  <Line type="monotone" dataKey="ratio" stroke="#88e1fc" name="白ピクセル率" />
                </LineChart>
              </ResponsiveContainer>
              <CSVLink data={results} filename={`${videoFile?.name.replace(/\.[^/.]+$/, "")}__results.csv`} className="csv-download-link">
                CSVをダウンロード
              </CSVLink>
            </div>
          )}
          {results.length > 0 && (
            <div className="frame-viewer-container">
              <h2>フレームビューア</h2>
              <div className="viewer-controls">
                <div className="control-item">
                  <label>表示方法を選択</label>
                  <div className="radio-group">
                    <label><input type="radio" name="viewer-mode" value="depth" checked={viewerMode === 'depth'} onChange={(e) => setViewerMode(e.target.value)} />深度 (m)</label>
                    <label><input type="radio" name="viewer-mode" value="frame" checked={viewerMode === 'frame'} onChange={(e) => setViewerMode(e.target.value)} />フレーム番号</label>
                    <label><input type="radio" name="viewer-mode" value="seconds" checked={viewerMode === 'seconds'} onChange={(e) => setViewerMode(e.target.value)} />秒数 (s)</label>
                  </div>
                </div>
                <div className="control-item">
                  <label htmlFor="viewer-input">値を入力</label>
                  <input id="viewer-input" type="number" min="0" value={viewerValue} onChange={(e) => setViewerValue(parseFloat(e.target.value))} />
                </div>
                <div className="control-item">
                  <button onClick={handleShowImage}>画像を表示</button>
                </div>
              </div>
              <div className="viewer-canvases">
                <div><h3>元画像</h3><canvas id="original-canvas" /></div>
                <div><h3>二値化画像</h3><canvas id="binary-canvas" /></div>
              </div>
            </div>
          )}
        </div>
      </main>
      <footer className="App-footer">
        <p className="version-info">
          バージョン: v{APP_VERSION} (OpenCV.js: {isCvReady ? '準備完了' : '初期化中...'})
        </p>
        <div className="author-container">
          <span className="author-name">作成： 奥平和哲</span>
          <span className="author-sep">/</span>
          <div className="social-links">
            <a
              href="https://github.com/kuronos357"
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
              title="GitHub (@kuronos357)"
              aria-label="GitHub"
            >
              <svg className="social-svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
            <a
              href="https://x.com/Im_kairos01"
              target="_blank"
              rel="noopener noreferrer"
              className="social-btn"
              title="X / Twitter (@Im_kairos01)"
              aria-label="X (Twitter)"
            >
              <svg className="social-svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          </div>
        </div>
        <p className="footer-links">
          関連リンク: <a href="https://github.com/kuronos357/marine-object-counter-web" target="_blank" rel="noopener noreferrer">Web版リポジトリ</a> |{' '}
          <a href="https://github.com/kuronos357/marine-object-counter" target="_blank" rel="noopener noreferrer">Python版</a> |{' '}
          <a href="https://marine-object-counter-web.vercel.app/" target="_blank" rel="noopener noreferrer">旧版 (Vercel)</a>
        </p>
      </footer>
    </div>
  );
}

export default App;