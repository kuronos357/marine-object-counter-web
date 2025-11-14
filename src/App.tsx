import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CSVLink } from 'react-csv';
import { processVideoInBrowser, getFrameForDisplay } from './cv';
import type { FrameData } from './cv';
import './App.css';

// 使用するOpenCVの機能に関する最小限のインターフェース
interface Cv {
  onRuntimeInitialized?: () => void;
  imread?: (canvas: HTMLCanvasElement) => any; // Mat
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
    const checkCv = () => {
      const cv = (window as unknown as { cv?: Cv }).cv;
      if (cv && cv.imread) {
        setIsCvReady(true);
        setStatus('動画ファイルを選択してください...');
      } else if (cv) {
        cv.onRuntimeInitialized = () => {
          setIsCvReady(true);
          setStatus('動画ファイルを選択してください...');
        };
      } else {
        setTimeout(checkCv, 100);
      }
    };
    checkCv();
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
      <header className="App-header"><h1>海中浮遊物カウンター (vercel・Web旧版)</h1></header><br />
      <p><a href="https://kuronos357.github.io/marine-object-counter-web/" target="_blank" rel="noopener noreferrer">新版はこちら</a></p><br />

      <main>
        <div className="controls">
          <div className="control-item"><label htmlFor="video-input">1. 動画ファイルを選択</label><input id="video-input" type="file" accept="video/*" onChange={handleFileChange} disabled={!isCvReady || isProcessing}/></div>
          <div className="control-item"><label htmlFor="depth-input">2. 総深度(m)を入力</label><input id="depth-input" type="number" value={depth} onChange={(e) => setDepth(parseInt(e.target.value, 10))} min="1" disabled={!isCvReady || isProcessing}/></div>
          
          <details className="settings-details">
            <summary>詳細設定</summary>
            <div className="settings-content">
              <div className="control-item"><label htmlFor="scale-input">サンプリング間隔(m)</label><input id="scale-input" type="number" value={scale} onChange={(e) => setScale(parseFloat(e.target.value))} min="0.1" step="0.1" disabled={!isCvReady || isProcessing}/></div>
              <div className="control-item"><label htmlFor="threshold-input">二値化の閾値 (0-255)</label><input id="threshold-input" type="number" value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value, 10))} min="0" max="255" disabled={!isCvReady || isProcessing}/></div>
              <div className="control-item"><label htmlFor="trim-input">トリム値</label><input id="trim-input" type="number" value={trim} onChange={(e) => setTrim(parseInt(e.target.value, 10))} disabled={!isCvReady || isProcessing}/></div>
            </div>
          </details>

          <div className="control-item"><button onClick={handleProcessVideo} disabled={!isCvReady || !videoFile || isProcessing}>{isProcessing ? '処理中...' : '3. 動画を処理'}</button></div>
        </div>
        <div className="status"><p>ステータス: {status}</p>{isProcessing && (<progress value={progress} max="1" style={{ width: '100%', maxWidth: '400px' }}></progress>)}</div>
        <div className="results">
          {results.length > 0 && (<div className="chart-container"><h2>処理結果グラフ</h2><ResponsiveContainer width="100%" height={400}><LineChart data={results}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="depth" type="number" name="深度" unit="m" domain={['dataMin', 'dataMax']}/><YAxis name="白ピクセル率" domain={[0, 'auto']}/><Tooltip formatter={(value: number) => value.toFixed(5)} /><Legend /><Line type="monotone" dataKey="ratio" stroke="#88e1fc" name="白ピクセル率" /></LineChart></ResponsiveContainer><CSVLink data={results} filename={`${videoFile?.name.replace(/\.[^/.]+$/, "")}__results.csv`} className="csv-download-link">CSVをダウンロード</CSVLink></div>)}
          {results.length > 0 && (<div className="frame-viewer-container"><h2>フレームビューア</h2><div className="viewer-controls"><div className="control-item"><label>表示方法を選択</label><div className="radio-group"><label><input type="radio" name="viewer-mode" value="depth" checked={viewerMode === 'depth'} onChange={(e) => setViewerMode(e.target.value)} />深度 (m)</label><label><input type="radio" name="viewer-mode" value="frame" checked={viewerMode === 'frame'} onChange={(e) => setViewerMode(e.target.value)} />フレーム番号</label><label><input type="radio" name="viewer-mode" value="seconds" checked={viewerMode === 'seconds'} onChange={(e) => setViewerMode(e.target.value)} />秒数 (s)</label></div></div><div className="control-item"><label htmlFor="viewer-input">値を入力</label><input id="viewer-input" type="number" min="0" value={viewerValue} onChange={(e) => setViewerValue(parseFloat(e.target.value))} /></div><div className="control-item"><button onClick={handleShowImage}>画像を表示</button></div></div><div className="viewer-canvases"><div><h3>元画像</h3><canvas id="original-canvas" /></div><div><h3>二値化画像</h3><canvas id="binary-canvas" /></div></div></div>)}
        </div>
      </main>
      <footer className="App-footer">
        <p>
          作成： <a href="https://github.com/kuronos357" target="_blank" rel="noopener noreferrer">kuronos357</a>/奥平和哲<br />
          このコードのリポジトリは<a href="https://github.com/kuronos357/marine-object-counter-web" target="_blank" rel="noopener noreferrer">ここ</a>で公開しています。
          {' '}元のPython版は<a href="https://github.com/kuronos357/marine-object-counter" target="_blank" rel="noopener noreferrer">ここ</a>で公開しています。
        </p>
      </footer>
    </div>
  );
}

export default App;