import client from 'prom-client';

const register = new client.Registry();

// Enable default metrics collection (memory, CPU, GC, event loop)
client.collectDefaultMetrics({
  register,
  prefix: 'nodejs_',
});

// Custom HTTP metrics
export const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationHistogram = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds for p50/p95/p99 latency calculations',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10],
  registers: [register],
});

// Custom Pipeline metrics
export const pipelineStepDurationHistogram = new client.Histogram({
  name: 'pipeline_step_duration_seconds',
  help: 'Duration of individual pipeline steps in seconds',
  labelNames: ['step', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 2.5, 5],
  registers: [register],
});

export const pipelineErrorsCounter = new client.Counter({
  name: 'pipeline_errors_total',
  help: 'Total number of pipeline step failures and exceptions',
  labelNames: ['step', 'error_type'],
  registers: [register],
});

export const pipelineProcessedBytesCounter = new client.Counter({
  name: 'pipeline_processed_bytes_total',
  help: 'Total bytes processed through the media pipeline',
  labelNames: ['stage'],
  registers: [register],
});

// Express metrics middleware
export const metricsMiddleware = (req, res, next) => {
  const startHrTime = process.hrtime();

  res.on('finish', () => {
    // Exclude /metrics and /health from request statistics to avoid scrape skew
    if (req.route && req.baseUrl + req.route.path === '/metrics') return;

    const diff = process.hrtime(startHrTime);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.baseUrl + (req.route ? req.route.path : req.path);
    const statusCode = res.statusCode ? res.statusCode.toString() : '500';

    httpRequestCounter.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });

    httpRequestDurationHistogram.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      durationInSeconds
    );
  });

  next();
};

export { register };
