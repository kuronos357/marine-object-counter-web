import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { CSVLink } from 'react-csv';
import cv from '@techstark/opencv-js';
import { processVideoInBrowser } from './cv';
import type { FrameData } from './cv';
import './App.css';

function App() {
  const [isCvReady, setIsCvReady] = useState<boolean>(false);
  const [depth, setDepth] = useState<number>(100);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>('OpenCVを初期化しています...');
  const [progress, setProgress] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [results, setResults] = useState<FrameData[]>([]);

  useEffect(() => {
    // OpenCV.js has an onRuntimeInitialized callback that fires when it's ready.
    cv.onRuntimeInitialized = () => {
      setIsCvReady(true);
      setStatus('動画ファイルを選択してください...');
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
      const result = await processVideoInBrowser(videoFile, depth, (p) => {
        setProgress(p);
        setStatus(`処理中... ${(p * 100).toFixed(0)}%`);
      });
      setResults(result.ratios);
      setStatus('処理が完了しました！');
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラーが発生しました。';
      setStatus(`エラー: ${message}`);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>海中浮遊物カウンター (Web版)</h1>
      </header>
      <main>
        <div className="controls">
          <div className="control-item">
            <label htmlFor="video-input">1. 動画ファイルを選択</label>
            <input
              id="video-input"
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              disabled={!isCvReady || isProcessing}
            />
          </div>
          <div className="control-item">
            <label htmlFor="depth-input">2. 深度(m)を入力</label>
            <input
              id="depth-input"
              type="number"
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value, 10))}
              min="1"
              disabled={!isCvReady || isProcessing}
            />
          </div>
          <div className="control-item">
            <button onClick={handleProcessVideo} disabled={!isCvReady || !videoFile || isProcessing}>
              {isProcessing ? '処理中...' : '3. 動画を処理'}
            </button>
          </div>
        </div>

        <div className="status">
          <p>ステータス: {status}</p>
          {isProcessing && (
            <progress value={progress} max="1" style={{ width: '100%', maxWidth: '400px' }}></progress>
          )}
        </div>

        <div className="results">
          {results.length > 0 && (
            <div className="chart-container">
              <h2>処理結果グラフ</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={results}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="depth" 
                    type="number"
                    name="深度"
                    unit="m"
                    domain={['dataMin', 'dataMax']}
                  />
                  <YAxis 
                    name="白ピクセル率"
                    domain={[0, 'auto']}
                  />
                  <Tooltip formatter={(value: number) => value.toFixed(5)} />
                  <Legend />
                  <Line type="monotone" dataKey="ratio" stroke="#88e1fc" name="白ピクセル率" />
                </LineChart>
              </ResponsiveContainer>
              <CSVLink
                data={results}
                filename={`${videoFile?.name.replace(/\.[^/.]+$/, "")}__results.csv`}
                className="csv-download-link"
              >
                CSVをダウンロード
              </CSVLink>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
