import pg from 'pg';
import logger from './logger.js';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://appuser:apppassword@localhost:5432/observability_db';

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

// In-memory fallback storage for when Postgres container is not running yet
const memoryStore = [];
let nextId = 1;

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug({ text, duration, rows: res.rowCount }, 'Executed PostgreSQL query');
    return res;
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.message?.includes('connect ECONNREFUSED') || err.message?.includes('timeout')) {
      logger.warn({ err: err.message }, 'PostgreSQL offline or unreachable; using in-memory demo fallback storage');

      if (text.includes('INSERT INTO attachments')) {
        const fallbackRecord = {
          id: nextId++,
          user_id: params[0],
          filename: params[1],
          mime_type: params[2],
          original_size_bytes: params[3],
          processed_size_bytes: params[4],
          thumbnail_size_bytes: params[5],
          width: params[6],
          height: params[7],
          color_palette: typeof params[8] === 'string' ? JSON.parse(params[8]) : params[8],
          processing_duration_ms: params[9],
          trace_id: params[10],
          status: params[11] || 'completed',
          created_at: new Date().toISOString(),
          _storage: 'in-memory-fallback',
        };
        memoryStore.unshift(fallbackRecord);
        return { rows: [fallbackRecord], rowCount: 1 };
      }

      if (text.includes('SELECT * FROM attachments')) {
        return { rows: memoryStore, rowCount: memoryStore.length };
      }
    }
    throw err;
  }
};

export const testDbConnection = async () => {
  try {
    const client = await pool.connect();
    logger.info('Connected to PostgreSQL successfully');
    client.release();
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'PostgreSQL connection not ready yet; in-memory fallback store active');
    return false;
  }
};

export default { pool, query, testDbConnection };
