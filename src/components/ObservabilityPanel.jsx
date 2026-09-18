import { useState, useEffect, useRef } from 'react';
import './ObservabilityPanel.css';
import { tracedFetch } from '../utils/telemetry';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  UploadCloud,
  FileImage,
  Layers,
  Flame,
  Bug,
  RefreshCw,
  Zap,
  Database,
  BarChart3,
  Copy,
  Check,
} from 'lucide-react';

export default function ObservabilityPanel({ user }) {
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [simulationMode, setSimulationMode] = useState('normal'); // 'normal' | 'slow' | 'error'
  const [slowDelayMs, setSlowDelayMs] = useState(2500);

  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(-1);
  const [result, setResult] = useState(null);
  const [errorResult, setErrorResult] = useState(null);
  const [copiedTrace, setCopiedTrace] = useState(false);

  // Backend Health State
  const [backendHealth, setBackendHealth] = useState({ status: 'checking', db: 'unknown' });
  const [recentAssets, setRecentAssets] = useState([]);
  const fileInputRef = useRef(null);

  const steps = [
    { id: 'validate', title: '1. Validate Upload', desc: 'Inspect MIME type, buffer magic bytes, size limits' },
    { id: 'process', title: '2. Process & Resize', desc: 'Sharp lanczos resizing & WebP compression' },
    { id: 'metadata', title: '3. Extract Metadata', desc: 'Read EXIF channels & compute dominant color palette' },
    { id: 'persist', title: '4. Persist to DB', desc: 'Store record in PostgreSQL via parameterized SQL' },
    { id: 'audit', title: '5. Audit Summary', desc: 'Generate response & register completion metrics' },
  ];

  // Fetch backend health and recent assets
  const fetchHealthAndAssets = async () => {
    try {
      const res = await fetch('/health');
      if (res.ok) {
        const data = await res.json();
        setBackendHealth({ status: data.status, db: data.database });
      } else {
        setBackendHealth({ status: 'offline', db: 'unreachable' });
      }
    } catch {
      setBackendHealth({ status: 'offline', db: 'unreachable' });
    }

    try {
      const assetRes = await fetch('/api/pipeline/assets');
      if (assetRes.ok) {
        const assetData = await assetRes.json();
        setRecentAssets(assetData.assets || []);
      }
    } catch {
      // Ignore background asset fetch failure
    }
  };

  useEffect(() => {
    fetchHealthAndAssets();
    const interval = setInterval(fetchHealthAndAssets, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setErrorResult(null);
      setResult(null);
      if (selected.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => setFilePreview(event.target.result);
        reader.readAsDataURL(selected);
      } else {
        setFilePreview(null);
      }
    }
  };

  // Trigger default demo image if user has no image file handy
  const loadDefaultSample = async () => {
    try {
      // Create a canvas-generated image blob
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      // Create gradient background
      const grad = ctx.createLinearGradient(0, 0, 400, 400);
      grad.addColorStop(0, '#6366f1');
      grad.addColorStop(0.5, '#ec4899');
      grad.addColorStop(1, '#3b82f6');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 400);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Observability Demo', 200, 190);
      ctx.font = '16px sans-serif';
      ctx.fillText('Traced Asset Pipeline', 200, 230);

      canvas.toBlob((blob) => {
        const sampleFile = new File([blob], 'demo-artwork.png', { type: 'image/png' });
        setFile(sampleFile);
        setFilePreview(canvas.toDataURL());
        setErrorResult(null);
        setResult(null);
      }, 'image/png');
    } catch (err) {
      console.error('Failed to create sample canvas image:', err);
    }
  };

  const executePipeline = async () => {
    if (!file) return;

    setIsProcessing(true);
    setErrorResult(null);
    setResult(null);
    setActiveStepIndex(0);

    // Progressive step simulation for UI feedback while request runs
    const stepInterval = setInterval(() => {
      setActiveStepIndex((prev) => (prev < 4 ? prev + 1 : prev));
    }, simulationMode === 'slow' ? 600 : 70);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', user?.id || 'demo-user');

    let url = '/api/pipeline/upload';
    if (simulationMode === 'slow') {
      url += `?simulate=slow&delay=${slowDelayMs}`;
    } else if (simulationMode === 'error') {
      url += '?simulate=error';
    }

    try {
      const { response, traceId } = await tracedFetch(
        url,
        {
          method: 'POST',
          body: formData,
        },
        { userId: user?.id || 'demo-user' }
      );

      clearInterval(stepInterval);
      const data = await response.json();

      if (response.ok && data.success) {
        setActiveStepIndex(4);
        setResult(data);
        fetchHealthAndAssets();
      } else {
        setErrorResult({
          message: data.error?.message || 'Pipeline execution encountered an error',
          step: data.error?.step || 'unknown',
          statusCode: data.error?.statusCode || response.status,
          traceId: data.error?.traceId || traceId,
          jaegerUrl: data.error?.jaegerUrl || `http://localhost:16686/trace/${traceId}`,
        });
      }
    } catch (err) {
      clearInterval(stepInterval);
      setErrorResult({
        message: err.message || 'Network communication error',
        step: 'client_fetch',
        statusCode: 0,
        traceId: 'unpropagated',
        jaegerUrl: 'http://localhost:16686',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const copyTraceId = (id) => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopiedTrace(true);
    setTimeout(() => setCopiedTrace(false), 2000);
  };

  return (
    <div className="obs-container">
      {/* Top Banner: Observability Stack Status & Quick Links */}
      <div className="obs-header">
        <div className="obs-header-left">
          <div className="obs-badge">
            <Activity className="obs-pulse-icon" size={16} />
            <span>Telemetry & Distributed Tracing</span>
          </div>
          <h2 className="obs-title">Full-Stack Observability Lab</h2>
          <p className="obs-subtitle">
            OpenTelemetry W3C distributed traces, Pino structured logs, Prometheus metrics, and Jaeger timeline analysis.
          </p>
        </div>

        <div className="obs-status-chips">
          <div className={`obs-chip ${backendHealth.status === 'healthy' ? 'chip-green' : backendHealth.status === 'degraded' ? 'chip-yellow' : 'chip-red'}`}>
            <span className="dot" />
            <span>Backend: {backendHealth.status}</span>
          </div>
          <div className={`obs-chip ${backendHealth.db === 'connected' ? 'chip-green' : 'chip-neutral'}`}>
            <Database size={13} />
            <span>Postgres: {backendHealth.db}</span>
          </div>
        </div>
      </div>

      {/* Tool Links Bar */}
      <div className="obs-links-grid">
        <a href="http://localhost:16686" target="_blank" rel="noreferrer" className="obs-link-card link-jaeger">
          <div className="link-card-content">
            <div className="link-title-row">
              <Zap size={18} className="link-icon" />
              <span className="link-name">Jaeger UI</span>
              <ExternalLink size={14} className="external-arrow" />
            </div>
            <p className="link-desc">View distributed trace waterfalls, span timelines & latency bottlenecks.</p>
            <span className="link-port">:16686</span>
          </div>
        </a>

        <a href="http://localhost:3000" target="_blank" rel="noreferrer" className="obs-link-card link-grafana">
          <div className="link-card-content">
            <div className="link-title-row">
              <BarChart3 size={18} className="link-icon" />
              <span className="link-name">Grafana Dashboard</span>
              <ExternalLink size={14} className="external-arrow" />
            </div>
            <p className="link-desc">Pre-provisioned graphs for RPS, p50/p95/p99 latency, and error rates.</p>
            <span className="link-port">:3000</span>
          </div>
        </a>

        <a href="http://localhost:9090" target="_blank" rel="noreferrer" className="obs-link-card link-prometheus">
          <div className="link-card-content">
            <div className="link-title-row">
              <Layers size={18} className="link-icon" />
              <span className="link-name">Prometheus Server</span>
              <ExternalLink size={14} className="external-arrow" />
            </div>
            <p className="link-desc">Scrapes metrics every 5s from the Express /metrics registry.</p>
            <span className="link-port">:9090</span>
          </div>
        </a>
      </div>

      {/* Main Interactive Pipeline Section */}
      <div className="obs-main-grid">
        {/* Left Column: Upload & Demo Simulator */}
        <div className="obs-card">
          <div className="obs-card-header">
            <div className="card-header-icon">
              <UploadCloud size={20} />
            </div>
            <div>
              <h3 className="card-heading">Traced Media Pipeline</h3>
              <p className="card-sub">Upload an image to trigger all 5 traced backend steps.</p>
            </div>
          </div>

          {/* File Upload Zone */}
          <div
            className={`obs-dropzone ${file ? 'has-file' : ''}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
            />
            {filePreview ? (
              <div className="preview-box">
                <img src={filePreview} alt="Upload preview" className="preview-img" />
                <div className="preview-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-meta">{(file.size / 1024).toFixed(1)} KB • {file.type}</span>
                </div>
              </div>
            ) : (
              <div className="dropzone-empty">
                <FileImage size={36} className="empty-icon" />
                <p className="drop-title">Click to select an image or photo</p>
                <p className="drop-hint">Supports PNG, JPEG, WebP (Max 15MB)</p>
              </div>
            )}
          </div>

          <div className="sample-btn-row">
            <button
              type="button"
              className="obs-sample-btn"
              onClick={(e) => {
                e.stopPropagation();
                loadDefaultSample();
              }}
            >
              <Zap size={14} />
              <span>Use Auto-Generated Demo Artwork</span>
            </button>
          </div>

          {/* Demo Scenario Selectors */}
          <div className="obs-scenarios">
            <label className="scenario-label">Demo Scenario Simulation:</label>
            <div className="scenario-options">
              <button
                type="button"
                className={`scenario-btn ${simulationMode === 'normal' ? 'active-normal' : ''}`}
                onClick={() => setSimulationMode('normal')}
              >
                <Zap size={15} />
                <span>Normal</span>
              </button>

              <button
                type="button"
                className={`scenario-btn ${simulationMode === 'slow' ? 'active-slow' : ''}`}
                onClick={() => setSimulationMode('slow')}
              >
                <Clock size={15} />
                <span>Simulate Delay (2.5s)</span>
              </button>

              <button
                type="button"
                className={`scenario-btn ${simulationMode === 'error' ? 'active-error' : ''}`}
                onClick={() => setSimulationMode('error')}
              >
                <Bug size={15} />
                <span>Simulate Error</span>
              </button>
            </div>
            {simulationMode === 'slow' && (
              <div className="slow-slider-row">
                <span>Injected Latency:</span>
                <input
                  type="range"
                  min="1000"
                  max="5000"
                  step="500"
                  value={slowDelayMs}
                  onChange={(e) => setSlowDelayMs(Number(e.target.value))}
                />
                <span className="slider-val">{(slowDelayMs / 1000).toFixed(1)}s</span>
              </div>
            )}
          </div>

          <button
            className={`obs-submit-btn ${isProcessing ? 'loading' : ''}`}
            onClick={executePipeline}
            disabled={!file || isProcessing}
          >
            {isProcessing ? (
              <>
                <RefreshCw size={18} className="spinner" />
                <span>Executing Pipeline & Tracing...</span>
              </>
            ) : (
              <>
                <Flame size={18} />
                <span>Run Traced Pipeline</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Execution Status & Waterfall Link */}
        <div className="obs-card">
          <div className="obs-card-header">
            <div className="card-header-icon">
              <Layers size={20} />
            </div>
            <div>
              <h3 className="card-heading">Pipeline Step Traces</h3>
              <p className="card-sub">Individual OpenTelemetry spans executed on the server.</p>
            </div>
          </div>

          {/* Sequential Steps Display */}
          <div className="obs-steps-list">
            {steps.map((step, idx) => {
              const isCompleted = result && !isProcessing;
              const isCurrent = isProcessing && activeStepIndex === idx;
              const isPassed = isProcessing && activeStepIndex > idx;
              const isErrorStep = errorResult && errorResult.step === (
                idx === 0 ? 'validate_upload' :
                idx === 1 ? 'process_and_resize' :
                idx === 2 ? 'extract_metadata' :
                idx === 3 ? 'persist_db_record' : 'build_audit_summary'
              );

              return (
                <div
                  key={step.id}
                  className={`obs-step-row ${
                    isErrorStep
                      ? 'step-error'
                      : isCompleted || isPassed
                      ? 'step-complete'
                      : isCurrent
                      ? 'step-active'
                      : 'step-idle'
                  }`}
                >
                  <div className="step-icon-col">
                    {isErrorStep ? (
                      <AlertTriangle size={18} className="text-red" />
                    ) : isCompleted || isPassed ? (
                      <CheckCircle2 size={18} className="text-green" />
                    ) : isCurrent ? (
                      <RefreshCw size={18} className="spinner text-blue" />
                    ) : (
                      <span className="step-number">{idx + 1}</span>
                    )}
                  </div>
                  <div className="step-details">
                    <div className="step-title-line">
                      <span className="step-name">{step.title}</span>
                      {isCurrent && <span className="step-badge-running">Tracing</span>}
                      {isErrorStep && <span className="step-badge-failed">Exception Thrown</span>}
                    </div>
                    <span className="step-description">{step.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Success Outcome View */}
          {result && (
            <div className="obs-result-box success-box">
              <div className="result-header">
                <CheckCircle2 size={20} className="text-green" />
                <div className="result-title-block">
                  <h4>Pipeline Succeeded</h4>
                  <p>Completed in {result.data?.metrics?.totalDurationMs}ms with 5 active spans</p>
                </div>
              </div>

              {/* Trace ID Banner */}
              <div className="trace-id-bar">
                <span className="trace-label">W3C Trace ID:</span>
                <code className="trace-code">{result.traceId}</code>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyTraceId(result.traceId)}
                  title="Copy Trace ID"
                >
                  {copiedTrace ? <Check size={14} className="text-green" /> : <Copy size={14} />}
                </button>
              </div>

              {/* Extracted Metrics */}
              <div className="asset-stats-grid">
                <div className="stat-pill">
                  <span className="label">Resolution</span>
                  <span className="value">{result.data?.dimensions}</span>
                </div>
                <div className="stat-pill">
                  <span className="label">Compression</span>
                  <span className="value">{result.data?.compressionRatio}</span>
                </div>
                <div className="stat-pill">
                  <span className="label">WebP Size</span>
                  <span className="value">{(result.data?.processedSizeBytes / 1024).toFixed(1)} KB</span>
                </div>
              </div>

              {/* Extracted Color Palette */}
              {result.data?.colorPalette && (
                <div className="palette-row">
                  <span className="palette-label">Dominant Palette:</span>
                  <div className="swatches">
                    {result.data.colorPalette.map((c, i) => (
                      <div
                        key={i}
                        className="swatch"
                        style={{ backgroundColor: c.hex }}
                        title={c.hex}
                      />
                    ))}
                  </div>
                </div>
              )}

              <a
                href={result.jaegerUrl}
                target="_blank"
                rel="noreferrer"
                className="jaeger-action-btn"
              >
                <span>View Full Waterfall in Jaeger</span>
                <ExternalLink size={16} />
              </a>
            </div>
          )}

          {/* Error Outcome View */}
          {errorResult && (
            <div className="obs-result-box error-box">
              <div className="result-header">
                <AlertTriangle size={22} className="text-red" />
                <div className="result-title-block">
                  <h4>Pipeline Error Detected (HTTP {errorResult.statusCode})</h4>
                  <p className="error-step-info">Failed at step: <code>{errorResult.step}</code></p>
                </div>
              </div>

              <p className="error-message-text">{errorResult.message}</p>

              <div className="trace-id-bar">
                <span className="trace-label">Error Trace ID:</span>
                <code className="trace-code">{errorResult.traceId}</code>
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => copyTraceId(errorResult.traceId)}
                  title="Copy Trace ID"
                >
                  {copiedTrace ? <Check size={14} className="text-green" /> : <Copy size={14} />}
                </button>
              </div>

              <a
                href={errorResult.jaegerUrl}
                target="_blank"
                rel="noreferrer"
                className="jaeger-action-btn error-jaeger-btn"
              >
                <span>Inspect Exception & Stack in Jaeger</span>
                <ExternalLink size={16} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Recent Processed Assets Section */}
      {recentAssets.length > 0 && (
        <div className="obs-card recent-assets-card">
          <div className="obs-card-header">
            <div className="card-header-icon">
              <Database size={20} />
            </div>
            <div>
              <h3 className="card-heading">PostgreSQL Stored Attachments</h3>
              <p className="card-sub">Recent records persisted with duration and trace IDs.</p>
            </div>
          </div>

          <div className="table-responsive">
            <table className="obs-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>File</th>
                  <th>Dimensions</th>
                  <th>Size</th>
                  <th>Duration</th>
                  <th>Trace ID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentAssets.map((asset) => (
                  <tr key={asset.id}>
                    <td>#{asset.id}</td>
                    <td className="font-semibold">{asset.filename}</td>
                    <td>{asset.width ? `${asset.width}x${asset.height}` : 'N/A'}</td>
                    <td>{(asset.processed_size_bytes / 1024).toFixed(1)} KB</td>
                    <td>{Math.round(asset.processing_duration_ms || 0)}ms</td>
                    <td>
                      <code className="trace-cell">{asset.trace_id?.slice(0, 16)}...</code>
                    </td>
                    <td>
                      <a
                        href={`http://localhost:16686/trace/${asset.trace_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="table-link"
                      >
                        Trace ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
