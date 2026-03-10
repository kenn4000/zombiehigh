import { Router, Request, Response } from 'express';
import { HEROES_DATA } from '../data/heroesData';
import { LOCKER_DATA } from '../data/lockerData';

const router = Router();

router.get('/api/heroes', (_req: Request, res: Response) => {
  res.json(HEROES_DATA.map(h => ({
    id: h.id,
    name: h.name,
    initHealth: h.initHealth,
    startGold: h.startGold,
    startSP: h.startSP,
    startGP: h.startGP,
    startingAction: h.startingAction ?? '',
    abilities: h.abilities ?? [],
    description: '',
  })));
});

router.get('/api/lockers', (_req: Request, res: Response) => {
  res.json(LOCKER_DATA.map(r => ({
    id: r.id,
    name: r.name,
    bonusGold: r.bonusGold,
    nonGoldBonus: r.nonGoldBonus ?? 'n/a',
    startingAction: r.startingAction,
    abilities: r.abilities ?? [],
    description: '',
  })));
});

export default router;
