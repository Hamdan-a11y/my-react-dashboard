-- Initialize schema for Observability Pipeline Demo

CREATE TABLE IF NOT EXISTS attachments (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    original_size_bytes INTEGER NOT NULL,
    processed_size_bytes INTEGER NOT NULL,
    thumbnail_size_bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    color_palette JSONB,
    processing_duration_ms DOUBLE PRECISION,
    trace_id VARCHAR(64),
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_trace_id ON attachments(trace_id);
CREATE INDEX IF NOT EXISTS idx_attachments_created_at ON attachments(created_at DESC);
