import { Router, Request, Response } from 'express';
import { GameLoader } from '../database/GameLoader';
import { isGameId, PlayerId } from '../../common/Types';

const router = Router();

router.get('/api/spectator/:gameId', (req: Request, res: Response) => {
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
  // Empty string → no player's hand is revealed (spectator sees board state only)
  res.json(game.toModel('' as PlayerId));
});

export default router;
