'use strict';

/**
 * Stateless Node.js API.
 *
 * Exposes:
 *   GET /            - basic info
 *   GET /healthz     - liveness probe
 *   GET /readyz      - readiness probe
 *   GET /metrics     - Prometheus metrics
 *
 * All runtime config comes from environment variables so the same image
 * is promoted unchanged across environments (12-factor).
 */

const express = require('express');
const client = require('prom-client');
const pino = require('pino');
const pinoHttp = require('pino-http');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Structured JSON logs -> stdout -> shipped to ELK by Filebeat.
  base: { service: process.env.SERVICE_NAME || 'production-microservice' },
});

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ---- Prometheus metrics -------------------------------------------------
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
register.registerMetric(httpRequestDuration);

app.use(pinoHttp({ logger }));
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status_code: res.statusCode,
    });
  });
  next();
});

// ---- Routes -------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    service: process.env.SERVICE_NAME || 'production-microservice',
    version: process.env.APP_VERSION || 'dev',
    status: 'ok',
  });
});

// Liveness: process is up.
app.get('/healthz', (req, res) => res.status(200).json({ status: 'alive' }));

// Readiness: ready to accept traffic (extend with dependency checks).
app.get('/readyz', (req, res) => res.status(200).json({ status: 'ready' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ---- Lifecycle / graceful shutdown -------------------------------------
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'server listening');
});

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    logger.info('closed remaining connections');
    process.exit(0);
  });
  // Force-exit if connections do not drain in time.
  setTimeout(() => process.exit(1), 10000).unref();
}

['SIGTERM', 'SIGINT'].forEach((s) => process.on(s, () => shutdown(s)));

module.exports = app;
