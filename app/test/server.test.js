'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.PORT = '0'; // ephemeral port
const app = require('../src/server.js');

function get(server, path) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

test('health and metrics endpoints', async (t) => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  t.after(() => server.close());

  const health = await get(server, '/healthz');
  assert.strictEqual(health.status, 200);
  assert.match(health.body, /alive/);

  const ready = await get(server, '/readyz');
  assert.strictEqual(ready.status, 200);

  const metrics = await get(server, '/metrics');
  assert.strictEqual(metrics.status, 200);
  assert.match(metrics.body, /http_request_duration_seconds/);
});
