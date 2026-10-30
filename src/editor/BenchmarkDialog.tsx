import { useState } from 'react';
import type { Stroke } from '../lib/types';
import { LANG_NATIVE } from '../lib/types';
import { Modal } from '../ui/Modal';
import { useEditor } from './context';
import {
  BENCHMARK_SAMPLES,
  calculateCER,
  calculateWER,
  runBenchmark,
  type BenchmarkResult,
} from '../lib/benchmark';
import { pickRecognizer } from '../lib/recognizer';
import { InkCanvas } from './InkCanvas';

export function BenchmarkDialog({ onClose }: { onClose: () => void }) {
  const { lang, settings, updateSettings } = useEditor();
  const [tab, setTab] = useState<'automated' | 'calibration'>('automated');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchmarkResult[] | null>(null);

  // Live calibration state
  const [calibStrokes, setCalibStrokes] = useState<Stroke[]>([]);
  const [calibTarget, setCalibTarget] = useState<string>(
    lang === 'ta' ? 'நன்றி நண்பா' : 'മഴ പെയ്യുന്നു',
  );
  const [calibRecognized, setCalibRecognized] = useState<string>('');
  const [calibBusy, setCalibBusy] = useState(false);
  const [calibStats, setCalibStats] = useState<{ cer: number; wer: number; latency: number } | null>(null);

  const startAutomated = async () => {
    setRunning(true);
    try {
      const res = await runBenchmark(BENCHMARK_SAMPLES);
      setResults(res);
    } finally {
      setRunning(false);
    }
  };

  const runLiveCalibration = async () => {
    if (!calibStrokes.length) return;
    setCalibBusy(true);
    const t0 = performance.now();
    try {
      const rec = await pickRecognizer(lang, true);
      const res = await rec.recognize(calibStrokes, lang, { width: 600, height: 200 });
      const top = res.candidates[0] ?? '';
      const latency = Math.round(performance.now() - t0);
      const cer = calculateCER(top, calibTarget);
      const wer = calculateWER(top, calibTarget);

      setCalibRecognized(top);
      setCalibStats({ cer, wer, latency });
    } catch (err) {
      setCalibRecognized('Error: ' + (err as Error).message);
    } finally {
      setCalibBusy(false);
    }
  };

  const avgCer = results && results.length ? (results.reduce((a, b) => a + b.cer, 0) / results.length) * 100 : 0;
  const avgWer = results && results.length ? (results.reduce((a, b) => a + b.wer, 0) / results.length) * 100 : 0;
  const avgLat = results && results.length ? Math.round(results.reduce((a, b) => a + b.latencyMs, 0) / results.length) : 0;

  return (
    <Modal title="Handwriting Recognition Benchmark & Calibration" onClose={onClose} wide>
      <div className="seg big" style={{ marginBottom: 14 }}>
        <button
          className={tab === 'automated' ? 'on' : ''}
          onClick={() => setTab('automated')}
          aria-pressed={tab === 'automated'}
        >
          Automated Test Suite (CER / WER)
        </button>
        <button
          className={tab === 'calibration' ? 'on' : ''}
          onClick={() => setTab('calibration')}
          aria-pressed={tab === 'calibration'}
        >
          Live Stylus Calibration
        </button>
      </div>

      {tab === 'automated' ? (
        <div>
          <p className="muted small">
            Evaluates handwriting recognition across real handwritten stroke datasets for Malayalam, Tamil,
            and Mixed-script screenplay dialogue. Measures Character Error Rate (CER), Word Error Rate (WER),
            and end-to-end latency.
          </p>

          <div className="row" style={{ marginBottom: 14 }}>
            <button className="primary" onClick={startAutomated} disabled={running}>
              {running ? 'Running Benchmark…' : '▶ Run Recognition Benchmark'}
            </button>
            <span className="spacer" />
            <span className="muted small">{BENCHMARK_SAMPLES.length} standard screenplay stroke samples</span>
          </div>

          {results && (
            <>
              <div className="metric-grid">
                <div className="metric-card">
                  <div className="val">{avgCer.toFixed(1)}%</div>
                  <div className="lbl">Mean CER</div>
                </div>
                <div className="metric-card">
                  <div className="val">{avgWer.toFixed(1)}%</div>
                  <div className="lbl">Mean WER</div>
                </div>
                <div className="metric-card">
                  <div className="val">{avgLat} ms</div>
                  <div className="lbl">Mean Latency</div>
                </div>
                <div className="metric-card">
                  <div className="val">{results.filter((r) => r.success).length} / {results.length}</div>
                  <div className="lbl">Tests Passed</div>
                </div>
              </div>

              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>Sample</th>
                    <th>Lang</th>
                    <th>Ground Truth</th>
                    <th>Recognized</th>
                    <th>CER</th>
                    <th>WER</th>
                    <th>Latency</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.sampleId}>
                      <td><b>{r.sampleName}</b></td>
                      <td><span className="chip">{r.language.toUpperCase()}{r.isMixed ? '+EN' : ''}</span></td>
                      <td><code>{r.groundTruth}</code></td>
                      <td><code>{r.recognizedText || '—'}</code></td>
                      <td>{(r.cer * 100).toFixed(0)}%</td>
                      <td>{(r.wer * 100).toFixed(0)}%</td>
                      <td>{r.latencyMs} ms</td>
                      <td>
                        {r.success && r.cer === 0 ? (
                          <span className="ok">✓ Perfect</span>
                        ) : r.success ? (
                          <span className="chip">Pass</span>
                        ) : (
                          <span className="err">✕ Error</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      ) : (
        <div>
          <p className="muted small">
            Write the target sentence below with your Apple Pencil or stylus to measure your personal handwriting accuracy
            and calibrate auto-commit pause duration.
          </p>

          <div className="row" style={{ marginBottom: 10 }}>
            <label style={{ flex: 1 }}>
              Target calibration text:
              <input
                className="input"
                value={calibTarget}
                onChange={(e) => setCalibTarget(e.target.value)}
                placeholder="Enter sample phrase"
              />
            </label>
            <div className="seg" style={{ marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setCalibTarget(lang === 'ta' ? 'நன்றி நண்பா' : 'മഴ പെയ്യുന്നു')}
              >
                Sample 1
              </button>
              <button
                type="button"
                onClick={() => setCalibTarget(lang === 'ta' ? 'ரொம்ப thanks' : 'ഞാൻ വന്നു please')}
              >
                Mixed Sample
              </button>
            </div>
          </div>

          <div style={{ position: 'relative', margin: '8px 0' }}>
            <InkCanvas
              className="pad-canvas"
              ariaLabel="Calibration writing canvas"
              strokes={calibStrokes}
              guides
              width={3.2}
              color="#1a1a2e"
              onStroke={(s) => setCalibStrokes((prev) => [...prev, s])}
            />
          </div>

          <div className="row">
            <button
              className="primary"
              onClick={runLiveCalibration}
              disabled={!calibStrokes.length || calibBusy}
            >
              {calibBusy ? 'Evaluating…' : 'Recognize & Measure Accuracy'}
            </button>
            <button
              onClick={() => {
                setCalibStrokes([]);
                setCalibRecognized('');
                setCalibStats(null);
              }}
            >
              Clear Ink
            </button>
            <button
              onClick={() => setCalibStrokes((s) => s.slice(0, -1))}
              disabled={!calibStrokes.length}
            >
              Undo Stroke
            </button>
            <span className="spacer" />
            <span className="muted small">{LANG_NATIVE[lang]} Mode</span>
          </div>

          {calibStats && (
            <div className="metric-grid" style={{ marginTop: 14 }}>
              <div className="metric-card">
                <div className="val">{(calibStats.cer * 100).toFixed(1)}%</div>
                <div className="lbl">Character Error Rate</div>
              </div>
              <div className="metric-card">
                <div className="val">{(calibStats.wer * 100).toFixed(1)}%</div>
                <div className="lbl">Word Error Rate</div>
              </div>
              <div className="metric-card">
                <div className="val">{calibStats.latency} ms</div>
                <div className="lbl">Latency</div>
              </div>
            </div>
          )}

          {calibRecognized && (
            <div className="issue" style={{ marginTop: 10 }}>
              <div className="lbl">Recognized Output:</div>
              <p style={{ fontSize: 18, margin: '4px 0', fontWeight: 600 }}>{calibRecognized}</p>
              <div className="small muted">
                Ground truth: “{calibTarget}” — {calibStats?.cer === 0 ? 'Exact match! 🎯' : 'Corrections needed.'}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <label className="lbl">Writing pause conversion delay:</label>
            <div className="row wrap">
              {[
                { ms: 600, label: '0.6s (Fast writers)' },
                { ms: 900, label: '0.9s (Standard)' },
                { ms: 1400, label: '1.4s (Relaxed)' },
                { ms: 2000, label: '2.0s (Deliberate)' },
                { ms: 0, label: 'Manual Convert Only' },
              ].map((opt) => (
                <button
                  key={opt.ms}
                  className={settings.autoCommitMs === opt.ms ? 'primary' : ''}
                  onClick={() => updateSettings({ ...settings, autoCommitMs: opt.ms })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
