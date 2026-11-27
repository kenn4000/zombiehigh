'use strict';

// Desktop-only HTTP boundary. The existing Express routes and game engine are
// reused unchanged. No listening socket is exposed to the LAN or internet.
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

async function startLocalServer(root) {
  const dist = path.join(root, 'dist');
  const index = path.join(dist, 'index.html');
  if (!fs.existsSync(index)) throw new Error('Missing compiled frontend: ' + index);
  // The existing server resolves public assets relative to the working directory.
  process.chdir(root);
  const express = require(path.join(root, 'node_modules', 'express'));
  const runtime = require(path.join(root, 'build', 'server', 'server', 'server.js'));
  runtime.app.use(express.static(dist, { index: false }));
  runtime.app.get(['/', '/game/:gameId', '/spectator/:gameId'], (_req, res) => {
    res.sendFile(index);
  });

  let origin;
  function allowed(req) {
    return Boolean(origin)
      && req.headers.host === new URL(origin).host
      && (!req.headers.origin || req.headers.origin === origin)
      && (!req.headers['sec-fetch-site']
        || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']));
  }
  const listener = http.createServer((req, res) => {
    if (!allowed(req)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'", "script-src 'self'",
      "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
      "font-src 'self' data:", "media-src 'self' blob: data:",
      "connect-src 'self' " + origin.replace('http:', 'ws:'),
      "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"
    ].join('; '));
    runtime.app(req, res);
  });
  listener.on('upgrade', (req, socket, head) => {
    if (!allowed(req)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    // Reuse the original server's WebSocket upgrade handler and registry.
    runtime.server.emit('upgrade', req, socket, head);
  });
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      listener.removeListener('error', reject);
      origin = 'http://127.0.0.1:' + listener.address().port;
      resolve();
    });
  });

  return {
    origin,
    unregisterGame: runtime.unregisterGameRuntime,
    async close() {
      for (const client of runtime.wss.clients) client.terminate();
      runtime.wss.close();
      await new Promise(resolve => {
        listener.close(resolve);
        listener.closeAllConnections?.();
      });
    }
  };
}

module.exports = { startLocalServer };
