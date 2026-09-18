/**
 * W3C Distributed Tracing utilities for frontend fetch calls
 * Formats according to W3C Trace Context Specification:
 * version-traceId-parentId-traceFlags
 */

export function generateTraceId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateSpanId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates W3C traceparent header value
 */
export function createTraceparent(traceId = generateTraceId(), spanId = generateSpanId()) {
  return {
    traceparent: `00-${traceId}-${spanId}-01`,
    traceId,
    spanId,
  };
}

/**
 * Traced HTTP fetch wrapper that automatically propagates W3C Traceparent
 * and user identity to the backend
 */
export async function tracedFetch(url, options = {}, userContext = {}) {
  const { traceparent, traceId, spanId } = createTraceparent();

  const headers = new Headers(options.headers || {});
  headers.set('traceparent', traceparent);
  if (userContext.userId) {
    headers.set('x-user-id', userContext.userId);
  }

  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const duration = performance.now() - startTime;
    const serverTraceId = response.headers.get('x-trace-id') || traceId;

    return {
      response,
      traceId: serverTraceId,
      durationMs: Math.round(duration),
    };
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[TracedFetch Error] Request to ${url} failed [TraceID: ${traceId}]:`, error);
    throw error;
  }
}
