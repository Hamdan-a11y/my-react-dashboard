import sharp from 'sharp';
import { tracer } from './tracer.js';
import { SpanStatusCode } from '@opentelemetry/api';
import logger from './logger.js';
import { query } from './db.js';
import {
  pipelineStepDurationHistogram,
  pipelineErrorsCounter,
  pipelineProcessedBytesCounter,
} from './metrics.js';

export class PipelineError extends Error {
  constructor(message, step, statusCode = 500, details = {}) {
    super(message);
    this.name = 'PipelineError';
    this.step = step;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Step 1: Validate file buffer, MIME types, and magic bytes
 */
export async function validateUpload(file, options = {}) {
  return tracer.startActiveSpan('pipeline.validate_upload', async (span) => {
    const start = process.hrtime();
    const stepName = 'validate_upload';
    span.setAttribute('pipeline.step', stepName);
    span.setAttribute('file.original_name', file.originalname || 'unknown');
    span.setAttribute('file.size_bytes', file.size || (file.buffer ? file.buffer.length : 0));
    span.setAttribute('file.mimetype', file.mimetype || 'unknown');

    try {
      logger.info({ step: stepName, filename: file.originalname, size: file.size }, 'Starting file validation');

      if (!file || !file.buffer) {
        throw new PipelineError('No file buffer provided for processing', stepName, 400);
      }

      const buffer = file.buffer;
      if (buffer.length < 16) {
        throw new PipelineError('File is too small or empty to be a valid image', stepName, 400);
      }

      // Check magic numbers for PNG, JPEG, WebP, GIF
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
      const isGif = buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
      const isRiffWebp = buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP';

      if (!isPng && !isJpeg && !isGif && !isRiffWebp) {
        throw new PipelineError('Unsupported file signature. Must be PNG, JPEG, WebP, or GIF', stepName, 415, {
          detectedMime: file.mimetype,
        });
      }

      span.setStatus({ code: SpanStatusCode.OK });
      recordStepMetric(stepName, 'success', start);
      return { isValid: true, detectedType: isPng ? 'png' : isJpeg ? 'jpeg' : isGif ? 'gif' : 'webp' };
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      recordStepMetric(stepName, 'error', start, err.name);
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Step 2: Resize image and produce responsive formats via sharp
 */
export async function processAndResize(fileBuffer, options = {}) {
  return tracer.startActiveSpan('pipeline.process_and_resize', async (span) => {
    const start = process.hrtime();
    const stepName = 'process_and_resize';
    span.setAttribute('pipeline.step', stepName);

    try {
      logger.info({ step: stepName, bufferLength: fileBuffer.length }, 'Beginning image processing and thumbnailing');

      // Demo Scenario: Simulate Slow Step
      if (options.simulateSlow) {
        const delayMs = parseInt(options.simulateSlowMs, 10) || 2500;
        span.setAttribute('demo.simulated_slow', true);
        span.setAttribute('demo.delay_ms', delayMs);
        logger.warn({ step: stepName, delayMs }, 'Simulating bottleneck delay in image resizing step');
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Real CPU image processing: Main optimized WebP variant
      const processedBuffer = await sharp(fileBuffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85, effort: 4 })
        .toBuffer();

      // Real CPU image processing: Square thumbnail
      const thumbnailBuffer = await sharp(fileBuffer)
        .resize(200, 200, { fit: 'cover', position: 'center' })
        .webp({ quality: 80, effort: 3 })
        .toBuffer();

      span.setAttribute('processed.size_bytes', processedBuffer.length);
      span.setAttribute('thumbnail.size_bytes', thumbnailBuffer.length);

      pipelineProcessedBytesCounter.inc({ stage: 'original' }, fileBuffer.length);
      pipelineProcessedBytesCounter.inc({ stage: 'processed' }, processedBuffer.length);

      span.setStatus({ code: SpanStatusCode.OK });
      recordStepMetric(stepName, 'success', start);

      return {
        processedBuffer,
        thumbnailBuffer,
        processedSizeBytes: processedBuffer.length,
        thumbnailSizeBytes: thumbnailBuffer.length,
      };
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      recordStepMetric(stepName, 'error', start, err.name);
      throw new PipelineError(`Image processing failed: ${err.message}`, stepName, 500, { originalError: err.message });
    } finally {
      span.end();
    }
  });
}

/**
 * Step 3: Extract technical metadata and compute dominant color palette
 */
export async function extractMetadataAndPalette(processedBuffer, options = {}) {
  return tracer.startActiveSpan('pipeline.extract_metadata', async (span) => {
    const start = process.hrtime();
    const stepName = 'extract_metadata';
    span.setAttribute('pipeline.step', stepName);

    try {
      logger.info({ step: stepName }, 'Extracting image metadata and color palette');

      // Demo Scenario: Simulate Failure Step
      if (options.simulateError) {
        span.setAttribute('demo.simulated_error', true);
        const err = new PipelineError(
          'Simulated pipeline failure: corrupted EXIF chunk and metadata extraction failure',
          stepName,
          500,
          { simulated: true, step: stepName }
        );
        logger.error({ step: stepName, err: err.message }, 'Simulating intentional exception in metadata step');
        throw err;
      }

      const metadata = await sharp(processedBuffer).metadata();

      // Sample a 4x4 raw grid to compute primary colors
      const { data } = await sharp(processedBuffer)
        .resize(4, 4, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const colors = [];
      for (let i = 0; i < data.length && colors.length < 4; i += 12) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        colors.push({ r, g, b, hex });
      }

      span.setAttribute('image.width', metadata.width || 0);
      span.setAttribute('image.height', metadata.height || 0);
      span.setAttribute('image.format', metadata.format || 'unknown');
      span.setAttribute('image.channels', metadata.channels || 0);

      span.setStatus({ code: SpanStatusCode.OK });
      recordStepMetric(stepName, 'success', start);

      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: metadata.format || 'webp',
        channels: metadata.channels || 3,
        colorPalette: colors,
      };
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      recordStepMetric(stepName, 'error', start, err.name);
      if (err instanceof PipelineError) throw err;
      throw new PipelineError(`Metadata extraction failed: ${err.message}`, stepName, 500);
    } finally {
      span.end();
    }
  });
}

/**
 * Step 4: Persist asset record into PostgreSQL with traced query
 */
export async function persistAssetRecord(assetData) {
  return tracer.startActiveSpan('pipeline.persist_db_record', async (span) => {
    const start = process.hrtime();
    const stepName = 'persist_db_record';
    span.setAttribute('pipeline.step', stepName);
    span.setAttribute('db.table', 'attachments');

    try {
      logger.info({ step: stepName, userId: assetData.userId, filename: assetData.filename }, 'Persisting asset to PostgreSQL');

      const sql = `
        INSERT INTO attachments (
          user_id, filename, mime_type, original_size_bytes, 
          processed_size_bytes, thumbnail_size_bytes, width, height, 
          color_palette, processing_duration_ms, trace_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *;
      `;

      const values = [
        assetData.userId || 'anonymous-user',
        assetData.filename,
        assetData.mimeType,
        assetData.originalSizeBytes,
        assetData.processedSizeBytes,
        assetData.thumbnailSizeBytes,
        assetData.width,
        assetData.height,
        JSON.stringify(assetData.colorPalette),
        assetData.durationMs,
        assetData.traceId,
        'completed',
      ];

      const res = await query(sql, values);
      const inserted = res.rows[0];

      span.setAttribute('db.record_id', inserted.id);
      span.setStatus({ code: SpanStatusCode.OK });
      recordStepMetric(stepName, 'success', start);

      return inserted;
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      recordStepMetric(stepName, 'error', start, err.name);
      throw new PipelineError(`Database persistence failed: ${err.message}`, stepName, 500);
    } finally {
      span.end();
    }
  });
}

/**
 * Step 5: Build audit summary payload
 */
export function buildAuditSummary(record, executionMetrics) {
  return tracer.startActiveSpan('pipeline.build_audit_summary', (span) => {
    span.setAttribute('pipeline.step', 'build_audit_summary');
    span.setAttribute('audit.record_id', record.id);

    const summary = {
      id: record.id,
      userId: record.user_id,
      filename: record.filename,
      mimeType: record.mime_type,
      dimensions: `${record.width}x${record.height}`,
      originalSizeBytes: record.original_size_bytes,
      processedSizeBytes: record.processed_size_bytes,
      compressionRatio: `${((1 - record.processed_size_bytes / record.original_size_bytes) * 100).toFixed(1)}%`,
      colorPalette: record.color_palette,
      traceId: record.trace_id,
      createdAt: record.created_at,
      metrics: executionMetrics,
      status: 'success',
    };

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return summary;
  });
}

/**
 * Helper to record step duration and errors into Prometheus
 */
function recordStepMetric(step, status, startHrTime, errorType = null) {
  const diff = process.hrtime(startHrTime);
  const durationSec = diff[0] + diff[1] / 1e9;
  pipelineStepDurationHistogram.observe({ step, status }, durationSec);

  if (status === 'error') {
    pipelineErrorsCounter.inc({ step, error_type: errorType || 'PipelineError' });
  }
}
