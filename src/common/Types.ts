import { v4 as uuid } from 'uuid';

export type PlayerId = string & { _brand: 'PlayerId' };
export type GameId = string & { _brand: 'GameId' };

export function generatePlayerId(): PlayerId {
  return `p-${uuid()}` as PlayerId;
}

export function generateGameId(): GameId {
  return `g-${uuid()}` as GameId;
}

export function isPlayerId(s: string): s is PlayerId {
  return s.startsWith('p-');
}

export function isGameId(s: string): s is GameId {
  return s.startsWith('g-');
}
