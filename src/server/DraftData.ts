/** Shared data types for hero and locker item definitions. Avoid circular imports. */
import { HeroId } from '../common/HeroId';
import { LockerId } from '../common/LockerId';

export type AbilityData = { type: string; effect: string };

export type HeroData = {
  id: HeroId;
  name: string;
  initHealth: number;
  startGold: number;
  startSP: number;
  startGP: number;
  meleeSuccess?: number;
  startingAction?: string;
  abilities?: AbilityData[];
};

export type LockerData = {
  id: LockerId;
  name: string;
  nonGoldBonus?: string;
  startingAction?: string;
  abilities?: AbilityData[];
  bonusGold: number;
};
