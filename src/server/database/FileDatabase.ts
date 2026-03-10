import * as fs from 'fs';
import * as path from 'path';
import { Game } from '../Game';
import { GameId } from '../../common/Types';

export class FileDatabase {
  static save(game: Game, dbDir: string): void {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const filePath = path.join(dbDir, `${game.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(game.serialize(), null, 2), 'utf8');
  }

  static load(gameId: GameId, dbDir: string): Game | undefined {
    const filePath = path.join(dbDir, `${gameId}.json`);
    if (!fs.existsSync(filePath)) return undefined;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return Game.deserialize(JSON.parse(raw));
    } catch {
      return undefined;
    }
  }

  static listGameIds(dbDir: string): GameId[] {
    if (!fs.existsSync(dbDir)) return [];
    return fs.readdirSync(dbDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, '') as GameId);
  }
}
