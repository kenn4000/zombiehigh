import { GameModel } from '../common/models/GameModel';

export type HeroAbility = { type: string; effect: string };

export type HeroApiData = {
  id: string;
  name: string;
  initHealth: number;
  startGold: number;
  startSP: number;
  startGP: number;
  startingAction: string;
  abilities?: HeroAbility[];
  description: string;
};

export type LockerApiData = {
  id: string;
  name: string;
  abilities?: HeroAbility[];
  nonGoldBonus: string;
  bonusGold: number;
  startingAction?: string;
  description: string;
};

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${url} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function getGameState(playerId: string): Promise<GameModel> {
  return apiGet<GameModel>(`/api/player/${playerId}`);
}

export async function getSpectatorState(gameId: string): Promise<GameModel> {
  return apiGet<GameModel>(`/api/spectator/${gameId}`);
}

export async function sendPlayerInput(playerId: string, input: unknown): Promise<GameModel> {
  return apiPost<GameModel>(`/api/player-input/${playerId}`, input);
}

export async function getHeroes(): Promise<HeroApiData[]> {
  return apiGet<HeroApiData[]>('/api/heroes');
}

export async function getLockers(): Promise<LockerApiData[]> {
  return apiGet<LockerApiData[]>('/api/lockers');
}
