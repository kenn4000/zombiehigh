import { Router, Request, Response } from 'express';
import { GameLoader } from '../database/GameLoader';
import { isPlayerId, PlayerId } from '../../common/Types';

const router = Router();

router.get('/api/player/:playerId', (req: Request, res: Response) => {
  const { playerId } = req.params;
  if (!playerId || !isPlayerId(playerId)) {
    res.status(400).json({ error: 'Invalid playerId' });
    return;
  }
  const game = GameLoader.getGameForPlayer(playerId as PlayerId);
  if (!game) {
    res.status(404).json({ error: 'Game not found for this player' });
    return;
  }
  res.json(game.toModel(playerId as PlayerId));
});

export default router;
