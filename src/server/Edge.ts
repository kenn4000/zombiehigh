import { HexCoordinate } from '../common/HexCoordinate';

/** Returns the canonical edge key so that edgeKey(a,b) == edgeKey(b,a). */
export function edgeKey(a: HexCoordinate, b: HexCoordinate): string {
  // Sort endpoints by q first, then r
  const [p1, p2] = [a, b].sort((x, y) => x.q !== y.q ? x.q - y.q : x.r - y.r);
  return `${p1.q},${p1.r}|${p2.q},${p2.r}`;
}

export type Edge = {
  a: HexCoordinate;
  b: HexCoordinate;
  key: string;
};

export function createEdge(a: HexCoordinate, b: HexCoordinate): Edge {
  return { a, b, key: edgeKey(a, b) };
}
