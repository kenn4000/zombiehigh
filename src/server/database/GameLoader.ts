import * as path from 'path';
import { Game } from '../Game';
import { GameId, PlayerId } from '../../common/Types';
import { FileDatabase } from './FileDatabase';

export class GameLoader {
  private static readonly cache = new Map<GameId, Game>();
  private static readonly playerIndex = new Map<PlayerId, GameId>();

  static getDbDir(): string {
    return process.env['DB_PATH'] ?? path.join(__dirname, '../../../db');
  }

  static getInstance(gameId: GameId): Game | undefined {
    if (this.cache.has(gameId)) return this.cache.get(gameId);
    const game = FileDatabase.load(gameId, this.getDbDir());
    if (game) {
      this.cache.set(game.id, game);
      for (const p of game.players) {
        this.playerIndex.set(p.id, game.id);
      }
    }
    return game;
  }

  static addGame(game: Game): void {
    this.cache.set(game.id, game);
    for (const p of game.players) {
      this.playerIndex.set(p.id, game.id);
    }
    FileDatabase.save(game, this.getDbDir());
  }

  static saveGame(game: Game): void {
    this.cache.set(game.id, game);
    FileDatabase.save(game, this.getDbDir());
  }

  static getGameForPlayer(playerId: PlayerId): Game | undefined {
    const gameId = this.playerIndex.get(playerId);
    if (gameId) return this.getInstance(gameId);

    // Scan disk on cache miss (startup recovery)
    const ids = FileDatabase.listGameIds(this.getDbDir());
    for (const id of ids) {
      const game = this.getInstance(id);
      if (game && game.players.some(p => p.id === playerId)) {
        return game;
      }
    }
    return undefined;
  }

  static listAll(): Game[] {
    const ids = FileDatabase.listGameIds(this.getDbDir());
    const games: Game[] = [];
    for (const id of ids) {
      const g = this.getInstance(id);
      if (g) games.push(g);
    }
    return games;
  }
}
