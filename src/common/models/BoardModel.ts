import { PlayerId } from '../Types';
import { Color } from '../Color';

export type TileWalls = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

export type TileModel = {
  key: string;
  q: number;
  r: number;
  tileId: number;
  walls: TileWalls;
};

export type TrapModel = {
  hexKey: string;
  ownerId: PlayerId;
  ownerColor: Color;
};

export type BaitModel = {
  hexKey: string;
  ownerId: PlayerId;
  ownerColor: Color;
};

export type BarricadeModel = {
  edgeKey: string;
  ownerId: PlayerId;
  ownerColor: Color;
  // The two hex keys that make up this edge
  hexKeyA: string;
  hexKeyB: string;
};

export type ZombieModel = {
  id: number;
  hexKey: string;
  q: number;
  r: number;
};

export type PlayerPositionModel = {
  id: PlayerId;
  name: string;
  color: Color;
  hexKey: string;
  q: number;
  r: number;
};

export type BoardModel = {
  tiles: ReadonlyArray<TileModel>;
  traps: ReadonlyArray<TrapModel>;
  baits: ReadonlyArray<BaitModel>;
  barricades: ReadonlyArray<BarricadeModel>;
  zombies: ReadonlyArray<ZombieModel>;
  players: ReadonlyArray<PlayerPositionModel>;
  highlightedHexKeys: ReadonlyArray<string>;
  zombieTrailHexKeys: ReadonlyArray<string>;
  zombieTrailMoves: ReadonlyArray<{ fromKey: string; toKey: string }>;
};
