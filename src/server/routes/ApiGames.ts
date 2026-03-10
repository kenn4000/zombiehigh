import { Router, Request, Response } from 'express';
import { GameLoader } from '../database/GameLoader';

const router = Router();

router.get('/api/games', (_req: Request, res: Response) => {
  const games = GameLoader.listAll();
  const summary = games.map(g => ({
    id: g.id,
    phase: g.getPhase(),
    playerCount: g.players.length,
    generation: g.getGenerationCount(),
  }));
  res.json(summary);
});

export default router;
