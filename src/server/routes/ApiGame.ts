import { Router, Request, Response } from 'express';
import { GameLoader } from '../database/GameLoader';
import { Game } from '../Game';
import { Board } from '../Board';
import { Player } from '../Player';
import { Color } from '../../common/Color';
import { generateGameId, generatePlayerId, isGameId, PlayerId } from '../../common/Types';
import { HexCoordinate } from '../../common/HexCoordinate';

const router = Router();

// Hardcoded start positions for up to 5 players on the 11×10 square grid (q=col-1, r=row-A)
const START_POSITIONS: [number, number][] = [
  [1, 1],   // B2 – top-left (near Science Lab)
  [9, 8],   // I10 – bottom-right (near Library)
  [9, 1],   // B10 – top-right (near Cafeteria)
  [1, 8],   // I2 – bottom-left
  [5, 4],   // E6 – centre
];

router.post('/api/game', (req: Request, res: Response) => {
  const body = req.body as { players?: Array<{ name: string; color: Color }>; settings?: { firstCardFreeNightDraft?: boolean } };
  if (!body.players || body.players.length < 1 || body.players.length > 5) {
    res.status(400).json({ error: 'Provide 1–5 players' });
    return;
  }

  const gameId = generateGameId();
  const board = new Board();
  const players: Player[] = body.players.map((pd, i) => {
    const pos = START_POSITIONS[i];
    return new Player(
      generatePlayerId(),
      pd.name,
      pd.color,
      new HexCoordinate(pos[0], pos[1]),
    );
  });

  const game = new Game(gameId, board, players);
  if (body.settings?.firstCardFreeNightDraft) game.settings.firstCardFreeNightDraft = true;
  GameLoader.addGame(game);

  const playerUrls = players.map(p => ({
    name: p.name,
    playerId: p.id,
    url: `/game/${gameId}?player=${p.id}`,
  }));

  res.status(201).json({
    gameId,
    playerUrls,
    spectatorUrl: `/spectator/${gameId}`,
  });
});

router.get('/api/game/:gameId', (req: Request, res: Response) => {
  const { gameId } = req.params;
  if (!gameId || !isGameId(gameId)) {
    res.status(400).json({ error: 'Invalid gameId' });
    return;
  }
  const game = GameLoader.getInstance(gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return;
  }
  res.json(game.toModel('' as PlayerId));
});

export default router;
