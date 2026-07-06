import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import * as path from 'path';
import * as http from 'http';
import * as fs from 'fs';
import apiGamesRouter from './routes/ApiGames';
import apiGameRouter from './routes/ApiGame';
import apiPlayerRouter from './routes/ApiPlayer';
import apiPlayerInputRouter from './routes/ApiPlayerInput';
import apiSpectatorRouter from './routes/ApiSpectator';
import apiHeroesRouter from './routes/ApiHeroes';
import { WebSocketManager } from './WebSocketManager';

function resolveProjectRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(__dirname, '../../'),
    path.resolve(__dirname, '../../../'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  return process.cwd();
}

const projectRoot = resolveProjectRoot();

// Ensure db directory exists on startup
const dbDir = process.env['DB_PATH'] ?? path.join(projectRoot, 'db');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const app = express();
app.use(express.json());

// Serve static client assets
const clientDir = path.join(projectRoot, 'dist/client');
app.use(express.static(clientDir));
app.use(express.static(path.join(projectRoot, 'public')));

// Health check
app.get('/api/ping', (_req, res) => {
  res.json({ status: 'ok', game: 'zombie-high' });
});

// Game API routes
app.use(apiGamesRouter);
app.use(apiGameRouter);
app.use(apiPlayerRouter);
app.use(apiPlayerInputRouter);
app.use(apiSpectatorRouter);
app.use(apiHeroesRouter);

// Fallback: serve index.html for all non-API routes (SPA routing)
// Uses public/index.html before first client build, dist/client/index.html after
app.get('*', (_req, res) => {
  const indexFromBuild = path.join(clientDir, 'index.html');
  const indexFromPublic = path.join(projectRoot, 'public/index.html');
  const indexPath = fs.existsSync(indexFromBuild) ? indexFromBuild : indexFromPublic;
  res.sendFile(indexPath);
});

const port = Number(process.env.PORT ?? 8080);
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`Zombie High server running on http://localhost:${port}`);
  WebSocketManager.attach(server);
});

export { server, app };
