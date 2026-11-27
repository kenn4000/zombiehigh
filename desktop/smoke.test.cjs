'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const WebSocket = require('ws');
const { startLocalServer } = require('./local-server.cjs');

test('desktop serves compiled UI, assets, existing game API and WebSocket state', { timeout: 30000 }, async () => {
  const root = path.resolve(__dirname, '..');
  const local = await startLocalServer(root);
  let gameId, socket;
  try {
    const get = route => fetch(local.origin + route);
    const landing = await get('/');
    assert.equal(landing.status, 200);
    const html = await landing.text();
    assert.match(html, /Zombie High/);
    const bundle = html.match(/src="([^"]+\.js)"/);
    assert.ok(bundle, 'compiled HTML includes a JS bundle');
    const script = await get(new URL(bundle[1], local.origin).pathname);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
    await script.arrayBuffer();
    const board = await get('/boardoverlay.png');
    assert.equal(board.status, 200);
    await board.arrayBuffer();
    const hero = await get('/card-art/herocard_assets/anita.jpg');
    assert.equal(hero.status, 200);
    await hero.arrayBuffer();
    assert.equal((await get('/api/not-a-route')).status, 404);
    assert.equal((await get('/missing-image.png')).status, 404);
    const forbidden = await fetch(local.origin + '/api/games', { headers: { Origin: 'https://not-local.example' } });
    assert.equal(forbidden.status, 403);
    const created = await fetch(local.origin + '/api/game', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ players: [{ name: 'Desktop One', color: 'red' }, { name: 'Desktop Two', color: 'blue' }] })
    });
    assert.equal(created.status, 200);
    const game = await created.json();
    gameId = game.gameId;
    assert.equal(game.playerUrls.length, 2);
    const player = game.playerUrls[0];
    assert.equal((await get(player.url)).status, 200);
    const current = await get('/api/game/current?gameId=' + encodeURIComponent(gameId));
    assert.equal(current.status, 200);
    assert.ok((await current.json()).game);
    socket = new WebSocket(local.origin.replace('http:', 'ws:') + '/game-ws?gameId=' + encodeURIComponent(gameId) + '&playerId=' + encodeURIComponent(player.playerId), { origin: local.origin });
    const message = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket state timeout')), 5000);
      socket.once('message', data => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
      socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
    assert.equal(message.type, 'gameState');
    assert.ok(message.game);
  } finally {
    if (socket) socket.terminate();
    if (gameId) local.unregisterGame(gameId);
    await local.close();
  }
});
