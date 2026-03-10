import * as WebSocket from 'ws';
import * as http from 'http';
import * as url from 'url';
import { Game } from './Game';
import { GameLoader } from './database/GameLoader';
import { PlayerId, GameId } from '../common/Types';
import { GameModel } from '../common/models/GameModel';

interface PlayerConnection {
  ws: WebSocket.WebSocket;
  playerId: PlayerId | undefined;
  gameId: GameId | undefined;
  isSpectator: boolean;
}

/**
 * Phase 8: WebSocket push manager.
 * Tracks all open connections by playerId / gameId.
 * After any player action, call broadcastToGame(game) to push updated GameModel to all connected players.
 */
export class WebSocketManager {
  private static wss: WebSocket.WebSocketServer | null = null;

  /** Connections keyed by gameId → list of connections in that game. */
  private static readonly gameConnections = new Map<GameId, Set<PlayerConnection>>();

  static attach(server: http.Server): void {
    this.wss = new WebSocket.WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket.WebSocket, req: http.IncomingMessage) => {
      const parsed = url.parse(req.url ?? '', true);
      const playerIdRaw = parsed.query['playerId'] as string | undefined;
      const spectatorGameIdRaw = parsed.query['spectator'] as string | undefined;

      const conn: PlayerConnection = {
        ws,
        playerId: playerIdRaw as PlayerId | undefined,
        gameId: undefined,
        isSpectator: !!spectatorGameIdRaw,
      };

      let game: Game | undefined;
      if (playerIdRaw) {
        game = GameLoader.getGameForPlayer(playerIdRaw as PlayerId);
      } else if (spectatorGameIdRaw) {
        game = GameLoader.getInstance(spectatorGameIdRaw as GameId);
      }

      if (!game) {
        ws.close(1008, 'Game not found');
        return;
      }

      conn.gameId = game.id;

      // Register
      if (!this.gameConnections.has(game.id)) {
        this.gameConnections.set(game.id, new Set());
      }
      this.gameConnections.get(game.id)!.add(conn);

      // Send current state immediately
      const model: GameModel = game.toModel(conn.playerId ?? '' as PlayerId);
      ws.send(JSON.stringify({ type: 'game_update', data: model }));

      ws.on('close', () => {
        const conns = this.gameConnections.get(game!.id);
        if (conns) {
          conns.delete(conn);
          if (conns.size === 0) this.gameConnections.delete(game!.id);
        }
      });

      ws.on('error', () => ws.terminate());
    });
  }

  /**
   * Broadcast updated GameModel to all connected players in this game.
   * Each player gets a model tailored to their perspective (hidden opponent hands etc).
   */
  static broadcastToGame(game: Game): void {
    const conns = this.gameConnections.get(game.id);
    if (!conns || conns.size === 0) return;

    for (const conn of conns) {
      if (conn.ws.readyState !== WebSocket.WebSocket.OPEN) continue;
      const model: GameModel = game.toModel(conn.playerId ?? '' as PlayerId);
      conn.ws.send(JSON.stringify({ type: 'game_update', data: model }));
    }
  }
}
