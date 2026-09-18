// IMPORTANT: Tracer must be initialized before anything else
import './tracer.js';

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import pinoHttp from 'pino-http';

import logger from './logger.js';
import { register, metricsMiddleware } from './metrics.js';
import { testDbConnection, query } from './db.js';
import {
  validateUpload,
  processAndResize,
  extractMetadataAndPalette,
  persistAssetRecord,
  buildAuditSummary,
  PipelineError,
} from './pipeline.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for frontend dev servers
app.use(
  cors({
    origin: true,
    credentials: true,
    exposedHeaders: ['x-trace-id', 'traceparent'],
  })
);

// Configure structured HTTP access logging via Pino
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/metrics' || req.url === '/health',
    },
    customProps: (req) => {
      const activeSpan = trace.getActiveSpan();
      return {
        trace_id: activeSpan?.spanContext()?.traceId || req.headers['traceparent'] || 'none',
        user_id: req.headers['x-user-id'] || 'anonymous',
      };
    },
  })
);

// Prometheus HTTP Metrics Middleware
app.use(metricsMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer in-memory storage for uploaded files
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max limit
  },
});

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  const isDbAlive = await testDbConnection();
  res.json({
    status: isDbAlive ? 'healthy' : 'degraded',
    service: 'dashboard-backend',
    database: isDbAlive ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Prometheus metrics scrape endpoint
 */
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

/**
 * Multi-Step Traced Pipeline Upload
 */
app.post('/api/pipeline/upload', upload.single('file'), async (req, res, next) => {
  const overallStart = Date.now();
  const activeSpan = trace.getActiveSpan();
  const traceId = activeSpan?.spanContext()?.traceId || 'unknown-trace';
  const userId = req.headers['x-user-id'] || req.body.userId || 'anonymous-user';

  // Attach contextual trace tags
  if (activeSpan) {
    activeSpan.setAttribute('app.user_id', userId);
    activeSpan.setAttribute('app.feature', 'media_pipeline');
  }

  // Set trace header in response so frontend can correlate immediately
  res.setHeader('x-trace-id', traceId);

  // Check demo simulation flags from query params or headers
  const simulateSlow =
    req.query.simulate === 'slow' ||
    req.headers['x-demo-simulate'] === 'slow' ||
    req.body.simulateSlow === 'true';

  const simulateError =
    req.query.simulate === 'error' ||
    req.headers['x-demo-simulate'] === 'error' ||
    req.body.simulateError === 'true';

  const simulateDelayMs = req.query.delay || req.headers['x-demo-delay'] || 2500;

  try {
    if (!req.file) {
      throw new PipelineError('No file was uploaded in request', 'validate_upload', 400);
    }

    logger.info(
      { userId, filename: req.file.originalname, size: req.file.size, simulateSlow, simulateError },
      'Received new file for multi-step processing pipeline'
    );

    // Step 1: Validation
    const validation = await validateUpload(req.file);

    // Step 2: Processing & Resizing (Sharp)
    const processed = await processAndResize(req.file.buffer, {
      simulateSlow,
      simulateSlowMs: simulateDelayMs,
    });

    // Step 3: Metadata Extraction & Color Palette
    const metadata = await extractMetadataAndPalette(processed.processedBuffer, {
      simulateError,
    });

    // Step 4: Database Persistence (PostgreSQL)
    const durationMs = Date.now() - overallStart;
    const dbRecord = await persistAssetRecord({
      userId,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      originalSizeBytes: req.file.size,
      processedSizeBytes: processed.processedSizeBytes,
      thumbnailSizeBytes: processed.thumbnailSizeBytes,
      width: metadata.width,
      height: metadata.height,
      colorPalette: metadata.colorPalette,
      durationMs,
      traceId,
    });

    // Step 5: Build Audit Summary
    const summary = buildAuditSummary(dbRecord, {
      totalDurationMs: durationMs,
      stepsCompleted: 5,
    });

    logger.info({ traceId, assetId: dbRecord.id, totalDurationMs: durationMs }, 'Pipeline completed successfully');

    res.status(201).json({
      success: true,
      data: summary,
      traceId,
      jaegerUrl: `http://localhost:16686/trace/${traceId}`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * List recent assets from Postgres
 */
app.get('/api/pipeline/assets', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    let sql = 'SELECT * FROM attachments';
    const params = [];

    if (userId) {
      sql += ' WHERE user_id = $1';
      params.push(userId);
    }

    sql += ' ORDER BY created_at DESC LIMIT 20';
    const result = await query(sql, params);

    res.json({
      success: true,
      count: result.rowCount,
      assets: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Contextual Error Handling Middleware
 * Ensures every error is caught with full context (traceId, user, payload snippet)
 */
app.use((err, req, res, next) => {
  const activeSpan = trace.getActiveSpan();
  const traceId = activeSpan?.spanContext()?.traceId || req.headers['traceparent'] || 'unknown-trace';
  const userId = req.headers['x-user-id'] || req.body?.userId || 'anonymous-user';
  const statusCode = err.statusCode || (err.status >= 400 && err.status < 600 ? err.status : 500);

  // Mark the active OpenTelemetry span with error status and record the full stack
  if (activeSpan) {
    activeSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
    activeSpan.recordException(err);
  }

  // Structured logging with complete context
  logger.error(
    {
      err: {
        message: err.message,
        name: err.name,
        stack: err.stack,
        details: err.details || null,
        step: err.step || 'unassigned',
      },
      trace_id: traceId,
      user_id: userId,
      request: {
        method: req.method,
        url: req.originalUrl,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
        },
      },
      statusCode,
    },
    `[Pipeline Error] Request failed during step '${err.step || 'handler'}': ${err.message}`
  );

  // Set trace ID in response headers for frontend troubleshooting
  res.setHeader('x-trace-id', traceId);

  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message,
      step: err.step || 'pipeline_execution',
      statusCode,
      traceId,
      timestamp: new Date().toISOString(),
      details: err.details || undefined,
      jaegerUrl: `http://localhost:16686/trace/${traceId}`,
    },
  });
});

// Start the Express server
app.listen(PORT, () => {
  logger.info(`Dashboard Observability Server running on port ${PORT}`);
  logger.info(`Prometheus Metrics available at http://localhost:${PORT}/metrics`);
  testDbConnection();
});
