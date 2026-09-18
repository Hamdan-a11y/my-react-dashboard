import pino from 'pino';
import { trace } from '@opentelemetry/api';

const serviceName = process.env.OTEL_SERVICE_NAME || 'dashboard-backend';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { severity: label.toUpperCase(), level: label };
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: {
    service_name: serviceName,
    env: process.env.NODE_ENV || 'development',
  },
  mixin() {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      return {
        trace_id: spanContext.traceId,
        span_id: spanContext.spanId,
        trace_flags: spanContext.traceFlags,
      };
    }
    return {};
  },
});

export default logger;
