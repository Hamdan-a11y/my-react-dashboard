import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, context } from '@opentelemetry/api';

const serviceName = process.env.OTEL_SERVICE_NAME || 'dashboard-backend';
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

const traceExporter = new OTLPTraceExporter({
  url: `${otlpEndpoint}/v1/traces`,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Prevent overwhelming filesystem noise
      },
    }),
  ],
});

try {
  sdk.start();
  console.log(`[OpenTelemetry] Tracer initialized successfully. Exporting to ${otlpEndpoint}/v1/traces`);
} catch (err) {
  console.error('[OpenTelemetry] Failed to initialize OpenTelemetry SDK:', err);
}

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('[OpenTelemetry] SDK terminated'))
    .catch((error) => console.error('[OpenTelemetry] Error terminating SDK', error))
    .finally(() => process.exit(0));
});

export const tracer = trace.getTracer(serviceName, '1.0.0');
export { trace, context };
