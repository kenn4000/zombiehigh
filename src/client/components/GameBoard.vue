<template>
  <svg :width="svgWidth" :height="svgHeight" :viewBox="`0 0 ${svgWidth} ${svgHeight}`">

    <!-- Board background (void) -->
    <rect x="0" y="0" :width="svgWidth" :height="svgHeight" fill="#111118" />

    <!-- Layer 1: Square tiles (background, room-color coded) -->
    <rect
      v-for="tile in tiles"
      :key="tile.key"
      :x="tile.cx - HALF"
      :y="tile.cy - HALF"
      :width="TILE_SIZE"
      :height="TILE_SIZE"
      :fill="isHighlighted(tile.key) ? '#3a3a5c' : roomBaseColor(tile.key)"
      :stroke="isHighlighted(tile.key) ? '#6068c0' : roomBorderColor(tile.key)"
      stroke-width="1"
    />

    <!-- Layer 1a: Room color overlay (at room opacity so base dark stays visible) -->
    <rect
      v-for="tile in tilesWithRoom"
      :key="'room-' + tile.key"
      :x="tile.cx - HALF + 1"
      :y="tile.cy - HALF + 1"
      :width="TILE_SIZE - 2"
      :height="TILE_SIZE - 2"
      :fill="tile.roomColor"
      pointer-events="none"
    />

    <!-- Layer 1b2: Zombie ooze trails — one continuous polyline per zombie path -->
    <!-- Outer dark glow -->
    <polyline
      v-for="(chain, i) in trailChains"
      :key="'zchain-glow-' + i"
      :points="chain.points"
      fill="none"
      stroke="#1a6b1a"
      stroke-width="18"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-opacity="0.50"
      pointer-events="none"
    />
    <!-- Bright ooze core -->
    <polyline
      v-for="(chain, i) in trailChains"
      :key="'zchain-core-' + i"
      :points="chain.points"
      fill="none"
      stroke="#4ade80"
      stroke-width="8"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-opacity="0.65"
      pointer-events="none"
    />
    <!-- Directional arrowheads at midpoint of each move segment -->
    <polygon
      v-for="(arrow, i) in trailArrows"
      :key="'zarrow-' + i"
      :points="arrow.points"
      fill="#4ade80"
      opacity="0.80"
      pointer-events="none"
    />

    <!-- Layer 1c: Tile numbers on unoccupied tiles -->
    <text
      v-for="tile in unoccupiedTiles"
      :key="'tnum-' + tile.key"
      :x="tile.cx"
      :y="tile.cy + 4"
      text-anchor="middle"
      fill="#555"
      font-size="10"
      font-weight="normal"
      pointer-events="none"
    >{{ tile.tileId }}</text>

    <!-- Layer 2: Baits (fish skeleton icon) -->
    <g
      v-for="bait in baitData"
      :key="'bait-' + bait.hexKey"
      opacity="0.9"
      pointer-events="none"
    >
      <!-- Spine -->
      <line :x1="bait.cx - 9" :y1="bait.cy" :x2="bait.cx + 6" :y2="bait.cy" :stroke="bait.ownerColor" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Head ellipse -->
      <ellipse :cx="bait.cx + 9" :cy="bait.cy" rx="3.5" ry="3" fill="none" :stroke="bait.ownerColor" stroke-width="1.5"/>
      <!-- Eye -->
      <circle :cx="bait.cx + 10" :cy="bait.cy - 1" r="0.8" :fill="bait.ownerColor"/>
      <!-- Tail top -->
      <line :x1="bait.cx - 9" :y1="bait.cy" :x2="bait.cx - 13" :y2="bait.cy - 6" :stroke="bait.ownerColor" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Tail bottom -->
      <line :x1="bait.cx - 9" :y1="bait.cy" :x2="bait.cx - 13" :y2="bait.cy + 6" :stroke="bait.ownerColor" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Tail connector -->
      <line :x1="bait.cx - 13" :y1="bait.cy - 6" :x2="bait.cx - 13" :y2="bait.cy + 6" :stroke="bait.ownerColor" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Rib 1 -->
      <line :x1="bait.cx - 6" :y1="bait.cy" :x2="bait.cx - 5" :y2="bait.cy - 5" :stroke="bait.ownerColor" stroke-width="1" stroke-linecap="round"/>
      <line :x1="bait.cx - 6" :y1="bait.cy" :x2="bait.cx - 5" :y2="bait.cy + 5" :stroke="bait.ownerColor" stroke-width="1" stroke-linecap="round"/>
      <!-- Rib 2 -->
      <line :x1="bait.cx - 2" :y1="bait.cy" :x2="bait.cx - 2" :y2="bait.cy - 5" :stroke="bait.ownerColor" stroke-width="1" stroke-linecap="round"/>
      <line :x1="bait.cx - 2" :y1="bait.cy" :x2="bait.cx - 2" :y2="bait.cy + 5" :stroke="bait.ownerColor" stroke-width="1" stroke-linecap="round"/>
      <!-- Rib 3 -->
      <line :x1="bait.cx + 2" :y1="bait.cy" :x2="bait.cx + 2" :y2="bait.cy - 4" :stroke="bait.ownerColor" stroke-width="1" stroke-linecap="round"/>
      <line :x1="bait.cx + 2" :y1="bait.cy" :x2="bait.cx + 2" :y2="bait.cy + 4" :stroke="bait.ownerColor" stroke-width="1" stroke-linecap="round"/>
    </g>

    <!-- Layer 3: Traps (bear trap jaws) -->
    <g
      v-for="trap in trapData"
      :key="'trap-' + trap.hexKey"
      opacity="0.85"
      pointer-events="none"
    >
      <!-- Left jaw: C-curve opening right -->
      <path
        :d="`M ${trap.cx - 8},${trap.cy - 7} Q ${trap.cx - 15},${trap.cy} ${trap.cx - 8},${trap.cy + 7}`"
        :stroke="trap.ownerColor" stroke-width="2" fill="none" stroke-linecap="round"
      />
      <!-- Left jaw teeth pointing inward -->
      <line :x1="trap.cx - 8" :y1="trap.cy - 3" :x2="trap.cx - 4" :y2="trap.cy - 1" :stroke="trap.ownerColor" stroke-width="1.5" stroke-linecap="round"/>
      <line :x1="trap.cx - 8" :y1="trap.cy + 3" :x2="trap.cx - 4" :y2="trap.cy + 1" :stroke="trap.ownerColor" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Right jaw: C-curve opening left -->
      <path
        :d="`M ${trap.cx + 8},${trap.cy - 7} Q ${trap.cx + 15},${trap.cy} ${trap.cx + 8},${trap.cy + 7}`"
        :stroke="trap.ownerColor" stroke-width="2" fill="none" stroke-linecap="round"
      />
      <!-- Right jaw teeth pointing inward -->
      <line :x1="trap.cx + 8" :y1="trap.cy - 3" :x2="trap.cx + 4" :y2="trap.cy - 1" :stroke="trap.ownerColor" stroke-width="1.5" stroke-linecap="round"/>
      <line :x1="trap.cx + 8" :y1="trap.cy + 3" :x2="trap.cx + 4" :y2="trap.cy + 1" :stroke="trap.ownerColor" stroke-width="1.5" stroke-linecap="round"/>
      <!-- Center pin -->
      <circle :cx="trap.cx" :cy="trap.cy" r="2.5" :fill="trap.ownerColor"/>
    </g>

    <!-- Layer 4: Barricades (colored line on shared tile edge) -->
    <line
      v-for="b in barricadeData"
      :key="'bar-' + b.edgeKey"
      :x1="b.x1"
      :y1="b.y1"
      :x2="b.x2"
      :y2="b.y2"
      :stroke="b.ownerColor"
      stroke-width="6"
      stroke-linecap="round"
    />

    <!-- Layer 5: Zombies -->
    <g v-for="z in zombieData" :key="'z-' + z.id">
      <circle :cx="z.cx" :cy="z.cy" r="14" fill="#2d6a2d" stroke="#4caf50" stroke-width="2" />
      <text :x="z.cx" :y="z.cy + 5" text-anchor="middle" fill="#4caf50" font-size="13" font-weight="bold">Z</text>
    </g>

    <!-- Layer 6: Players -->
    <g v-for="p in playerData" :key="'p-' + p.id">
      <circle :cx="p.cx" :cy="p.cy" r="16" :fill="p.color" stroke="#fff" stroke-width="2" />
      <text :x="p.cx" :y="p.cy + 5" text-anchor="middle" fill="#fff" font-size="12" font-weight="bold">
        {{ p.name.charAt(0).toUpperCase() }}
      </text>
    </g>

    <!-- Layer 6b: Hard walls (drawn above pieces so they read clearly) -->
    <line
      v-for="(w, i) in wallLines"
      :key="'wall-' + i"
      :x1="w.x1"
      :y1="w.y1"
      :x2="w.x2"
      :y2="w.y2"
      stroke="#c0c0d0"
      stroke-width="3"
      stroke-linecap="square"
      pointer-events="none"
    />

    <!-- Layer 7: Tile click overlay (disabled in wall mode) -->
    <rect
      v-for="tile in tiles"
      :key="'click-' + tile.key"
      :x="tile.cx - HALF"
      :y="tile.cy - HALF"
      :width="TILE_SIZE"
      :height="TILE_SIZE"
      fill="transparent"
      :style="{ cursor: (isClickable && !isWallMode && (!highlightActive || isHighlighted(tile.key))) ? 'pointer' : 'default' }"
      @click="onHexClick(tile.q, tile.r)"
    />

    <!-- Layer 8: Edge click zones (wall / barricade placement mode) -->
    <template v-if="isWallMode">
      <!-- Visible highlight lines for available edges -->
      <line
        v-for="(zone, i) in edgeZones"
        :key="'ev-' + i"
        :x1="zone.x1"
        :y1="zone.y1"
        :x2="zone.x2"
        :y2="zone.y2"
        stroke="#a78bfa"
        stroke-width="3"
        stroke-linecap="round"
        opacity="0.45"
        pointer-events="none"
      />
      <!-- Fat transparent hit zones -->
      <line
        v-for="(zone, i) in edgeZones"
        :key="'eh-' + i"
        :x1="zone.x1"
        :y1="zone.y1"
        :x2="zone.x2"
        :y2="zone.y2"
        stroke="transparent"
        stroke-width="18"
        stroke-linecap="round"
        style="cursor: pointer"
        @click="onEdgeClick(zone.q1, zone.r1, zone.q2, zone.r2)"
      />
    </template>
    <!-- Layer 9: Room name labels (centred, subtle, rendered above everything except click zones) -->
    <text
      v-for="label in roomLabels"
      :key="'rlabel-' + label.room"
      :x="label.x"
      :y="label.y"
      text-anchor="middle"
      dominant-baseline="middle"
      :fill="label.color"
      font-size="9"
      font-weight="600"
      letter-spacing="0.5"
      opacity="0.55"
      pointer-events="none"
      style="text-transform: uppercase; user-select: none;"
    >{{ label.text }}</text>

  </svg>
</template>

<script lang="ts">
import Vue from 'vue';
import { BoardModel, TileModel, TrapModel, BaitModel, BarricadeModel, ZombieModel, PlayerPositionModel } from '../../common/models/BoardModel';

const TILE_SIZE = 52;
const HALF = TILE_SIZE / 2; // 26
const PADDING = 20;
const COLS = 11; // columns 0-10
const ROWS = 10; // rows 0-9
const SVG_W = PADDING + COLS * TILE_SIZE + PADDING; // 612
const SVG_H = PADDING + ROWS * TILE_SIZE + PADDING; // 560

// Two "forward" directions covering all unique edges once.
// right = +q, down = +r
const FORWARD_DIRS: [number, number][] = [[1, 0], [0, 1]];

// ---- Room colour map  (q,r) key → rgba fill ----
// Row letters A-J = r 0-9; column numbers 1-11 = q 0-10
type RoomEntry = { fill: string; border: string; label: string };

const ROOMS: Record<string, RoomEntry> = {
  'science-lab':        { fill: 'rgba(180,130,230,0.38)', border: 'rgba(200,160,255,0.6)', label: 'Science Lab' },
  'cafeteria':          { fill: 'rgba(240,210,50,0.38)',  border: 'rgba(255,230,80,0.6)',  label: 'Cafeteria' },
  'auditorium':         { fill: 'rgba(240,100,150,0.38)', border: 'rgba(255,130,170,0.6)', label: 'Auditorium' },
  'library':            { fill: 'rgba(60,160,240,0.38)',  border: 'rgba(80,190,255,0.6)',  label: 'Library' },
  'lobby':              { fill: 'rgba(255,155,50,0.38)',  border: 'rgba(255,185,80,0.6)',  label: 'Lobby' },
  'principals-office':  { fill: 'rgba(80,200,110,0.38)', border: 'rgba(100,230,130,0.6)', label: "Principal's" },
  'janitors-closet':    { fill: 'rgba(160,155,150,0.38)',border: 'rgba(190,185,180,0.6)', label: "Janitor's" },
  'restrooms':          { fill: 'rgba(50,200,190,0.38)', border: 'rgba(70,230,220,0.6)',  label: 'Restrooms' },
  'tunnel':             { fill: 'rgba(160,110,65,0.45)', border: 'rgba(200,145,90,0.7)',  label: 'Tunnel' },
  'gymnasium':          { fill: 'rgba(210,230,185,0.28)',border: 'rgba(170,210,130,0.45)',label: 'Gym' },
};

// Map each tile key "q,r" → room id
const TILE_ROOM: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const assign = (room: string, tiles: [number,number][]) => {
    for (const [q, r] of tiles) m.set(`${q},${r}`, room);
  };

  // Science Lab  (A3-A4, B1-B4, C1-C4)
  assign('science-lab', [[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2]]);

  // Cafeteria  (A8-A10, B8-B11, C8, C11)
  assign('cafeteria', [[7,0],[8,0],[9,0],[7,1],[8,1],[9,1],[10,1],[7,2],[10,2]]);

  // Auditorium  (D10-D11, E10-E11, F10-F11)
  assign('auditorium', [[9,3],[10,3],[9,4],[10,4],[9,5],[10,5]]);

  // Library  (I8-I11, J8-J10)
  assign('library', [[7,8],[8,8],[9,8],[10,8],[7,9],[8,9],[9,9]]);

  // Lobby  (I5-I7, J5-J7)
  assign('lobby', [[4,8],[5,8],[6,8],[4,9],[5,9],[6,9]]);

  // Principal's Office  (I1-I4, J2-J3)
  assign('principals-office', [[0,8],[1,8],[2,8],[3,8],[1,9],[2,9]]);

  // Janitor's Closet  (G1-G2, H1-H2)
  assign('janitors-closet', [[0,6],[1,6],[0,7],[1,7]]);

  // Restrooms  (E1, E2, F1-F2)
  assign('restrooms', [[0,4],[1,4],[0,5],[1,5]]);

  // Tunnel entrances  (D1, A5-A7, G11, H11)
  assign('tunnel', [[0,3],[4,0],[5,0],[6,0],[10,6],[10,7]]);

  // Gymnasium = every remaining accessible tile (handled as fallback)
  // Pre-assign the tiles we know are in D-H rows:
  assign('gymnasium', [
    // Row D
    [3,3],[4,3],[6,3],[7,3],
    // Row E
    [3,4],[4,4],[5,4],[6,4],
    // Row F
    [2,5],[3,5],[4,5],[5,5],[6,5],[7,5],[8,5],
    // Row G
    [2,6],[4,6],[5,6],[6,6],[7,6],[8,6],
    // Row H
    [4,7],[5,7],[7,7],[8,7],
  ]);

  return m;
})();

function tileCx(q: number): number {
  return PADDING + q * TILE_SIZE + HALF;
}

function tileCy(r: number): number {
  return PADDING + r * TILE_SIZE + HALF;
}

function parseKey(key: string): [number, number] {
  const parts = key.split(',');
  return [parseInt(parts[0], 10), parseInt(parts[1], 10)];
}

type TileRender  = TileModel & { cx: number; cy: number };
type TrapRender  = TrapModel & { cx: number; cy: number };
type BaitRender  = BaitModel & { cx: number; cy: number };
type BarricadeRender = { edgeKey: string; ownerColor: string; x1: number; y1: number; x2: number; y2: number };
type WallLine    = { x1: number; y1: number; x2: number; y2: number };
type ZombieRender  = ZombieModel & { cx: number; cy: number };
type PlayerRender  = PlayerPositionModel & { cx: number; cy: number };
type EdgeZone    = { q1: number; r1: number; q2: number; r2: number; x1: number; y1: number; x2: number; y2: number };

export default Vue.extend({
  name: 'GameBoard',
  props: {
    board:       { type: Object as () => BoardModel, required: true },
    isClickable: { type: Boolean, default: false },
    isWallMode:  { type: Boolean, default: false },
  },
  data() {
    return {
      svgWidth:  SVG_W,
      svgHeight: SVG_H,
      TILE_SIZE,
      HALF,
    };
  },
  computed: {
    tiles(): TileRender[] {
      return (this.board.tiles as ReadonlyArray<TileModel>).map(t => ({
        ...t,
        cx: tileCx(t.q),
        cy: tileCy(t.r),
      }));
    },
    tileByKey(): Map<string, TileModel> {
      const m = new Map<string, TileModel>();
      for (const t of this.board.tiles as ReadonlyArray<TileModel>) {
        m.set(t.key, t);
      }
      return m;
    },
    tilesWithRoom(): Array<TileRender & { roomColor: string }> {
      return (this.tiles as TileRender[]).map(t => ({
        ...t,
        roomColor: ROOMS[TILE_ROOM.get(t.key) ?? 'gymnasium']?.fill ?? ROOMS['gymnasium'].fill,
      }));
    },
    trapData(): TrapRender[] {
      return (this.board.traps as ReadonlyArray<TrapModel>).map(t => {
        const [q, r] = parseKey(t.hexKey);
        return { ...t, cx: tileCx(q), cy: tileCy(r) };
      });
    },
    baitData(): BaitRender[] {
      return (this.board.baits as ReadonlyArray<BaitModel>).map(b => {
        const [q, r] = parseKey(b.hexKey);
        return { ...b, cx: tileCx(q), cy: tileCy(r) };
      });
    },
    barricadeData(): BarricadeRender[] {
      return (this.board.barricades as ReadonlyArray<BarricadeModel>).map(b => {
        const [qa, ra] = parseKey(b.hexKeyA);
        const [qb, rb] = parseKey(b.hexKeyB);
        const cxa = tileCx(qa); const cya = tileCy(ra);
        const cxb = tileCx(qb); const cyb = tileCy(rb);
        const midX = (cxa + cxb) / 2;
        const midY = (cya + cyb) / 2;
        const PAD = 3;
        let x1: number, y1: number, x2: number, y2: number;
        if (qa !== qb) {
          // Vertical shared edge
          x1 = midX; y1 = Math.min(cya, cyb) + PAD;
          x2 = midX; y2 = Math.max(cya, cyb) - PAD + TILE_SIZE;
          // Both have same r, so cya===cyb; draw vertical line at edge
          y1 = cya - HALF + PAD;
          y2 = cya + HALF - PAD;
        } else {
          // Horizontal shared edge
          x1 = cxa - HALF + PAD; y1 = midY;
          x2 = cxa + HALF - PAD; y2 = midY;
        }
        return {
          edgeKey: b.edgeKey,
          ownerColor: b.ownerColor as string,
          x1, y1, x2, y2,
        };
      });
    },
    zombieData(): ZombieRender[] {
      return (this.board.zombies as ReadonlyArray<ZombieModel>).map(z => ({
        ...z,
        cx: tileCx(z.q),
        cy: tileCy(z.r),
      }));
    },
    playerData(): PlayerRender[] {
      return (this.board.players as ReadonlyArray<PlayerPositionModel>).map(p => ({
        ...p,
        cx: tileCx(p.q),
        cy: tileCy(p.r),
      }));
    },
    occupiedKeys(): Set<string> {
      const s = new Set<string>();
      for (const p of this.board.players as ReadonlyArray<PlayerPositionModel>) s.add(p.hexKey);
      for (const z of this.board.zombies as ReadonlyArray<ZombieModel>) s.add(z.hexKey);
      return s;
    },
    unoccupiedTiles(): TileRender[] {
      const occ = this.occupiedKeys as Set<string>;
      return (this.tiles as TileRender[]).filter(t => !occ.has(t.key));
    },
    trailData(): Array<{ key: string; cx: number; cy: number }> {
      const occ = this.occupiedKeys as Set<string>;
      return ((this.board.zombieTrailHexKeys ?? []) as ReadonlyArray<string>)
        .filter(k => !occ.has(k))
        .map(k => {
          const [q, r] = parseKey(k);
          return { key: k, cx: tileCx(q), cy: tileCy(r) };
        });
    },
    /** Directional arrowhead triangles — one per zombie move segment, pointing from→to. */
    trailArrows(): Array<{ points: string }> {
      const moves = (this.board.zombieTrailMoves ?? []) as ReadonlyArray<{ fromKey: string; toKey: string }>;
      return moves.map(m => {
        const [fq, fr] = parseKey(m.fromKey);
        const [tq, tr] = parseKey(m.toKey);
        const fx = tileCx(fq), fy = tileCy(fr);
        const tx = tileCx(tq), ty = tileCy(tr);
        const mx = (fx + tx) / 2, my = (fy + ty) / 2;
        const angle = Math.atan2(ty - fy, tx - fx);
        const L = 10; // half-length of arrowhead along direction
        const W = 7;  // half-width of arrowhead base
        const tipX = mx + L * Math.cos(angle);
        const tipY = my + L * Math.sin(angle);
        const baseX = mx - L * Math.cos(angle);
        const baseY = my - L * Math.sin(angle);
        const px = Math.cos(angle + Math.PI / 2);
        const py = Math.sin(angle + Math.PI / 2);
        const p1 = `${(baseX + W * px).toFixed(1)},${(baseY + W * py).toFixed(1)}`;
        const p2 = `${(baseX - W * px).toFixed(1)},${(baseY - W * py).toFixed(1)}`;
        return { points: `${tipX.toFixed(1)},${tipY.toFixed(1)} ${p1} ${p2}` };
      });
    },
    /**
     * Groups consecutive zombie move segments into per-zombie polylines.
     * A chain starts at any fromKey that is not another move's toKey.
     * Multi-step zombies produce a single continuous polyline; single-step
     * zombies produce a two-point polyline (identical to before, just blobby).
     */
    trailChains(): Array<{ points: string }> {
      const moves = (this.board.zombieTrailMoves ?? []) as ReadonlyArray<{ fromKey: string; toKey: string }>;
      if (moves.length === 0) return [];

      // Build fromKey → move lookup (one-to-one since no two zombies share a tile)
      const fromMap = new Map<string, { fromKey: string; toKey: string }>();
      for (const m of moves) fromMap.set(m.fromKey, m);

      // Chain starts: fromKeys that never appear as a toKey
      const toKeySet = new Set(moves.map(m => m.toKey));
      const consumed = new Set<string>();
      const chains: Array<{ points: string }> = [];

      for (const m of moves) {
        if (consumed.has(m.fromKey)) continue;
        if (toKeySet.has(m.fromKey)) continue; // mid-chain, not a start

        const pts: string[] = [];
        const addPt = (key: string) => {
          const [q, r] = parseKey(key);
          pts.push(`${tileCx(q)},${tileCy(r)}`);
        };

        // Start at midpoint of first segment (trims the "original tile" half; arrow stays in the same place)
        {
          const [fq0, fr0] = parseKey(m.fromKey);
          const [tq0, tr0] = parseKey(m.toKey);
          pts.push(`${((tileCx(fq0) + tileCx(tq0)) / 2).toFixed(1)},${((tileCy(fr0) + tileCy(tr0)) / 2).toFixed(1)}`);
        }
        let cur: { fromKey: string; toKey: string } | undefined = m;
        while (cur) {
          consumed.add(cur.fromKey);
          addPt(cur.toKey);
          cur = fromMap.get(cur.toKey);
          if (cur && consumed.has(cur.fromKey)) break;
        }

        if (pts.length >= 2) chains.push({ points: pts.join(' ') });
      }

      // Catch any isolated moves not yet consumed (edge-case safety)
      for (const m of moves) {
        if (!consumed.has(m.fromKey)) {
          const [fq, fr] = parseKey(m.fromKey);
          const [tq, tr] = parseKey(m.toKey);
          // Also start at midpoint for isolated single-step moves
          chains.push({ points: `${((tileCx(fq) + tileCx(tq)) / 2).toFixed(1)},${((tileCy(fr) + tileCy(tr)) / 2).toFixed(1)} ${tileCx(tq)},${tileCy(tr)}` });
        }
      }

      return chains;
    },
    highlightActive(): boolean {
      return (this.board.highlightedHexKeys as ReadonlyArray<string>).length > 0;
    },
    roomLabels(): Array<{ room: string; text: string; x: number; y: number; color: string }> {
      // One label per room, positioned at the average cx/cy of its tiles
      const roomTiles = new Map<string, TileRender[]>();
      for (const tile of this.tiles as TileRender[]) {
        const room = TILE_ROOM.get(tile.key);
        if (!room) continue;
        if (!roomTiles.has(room)) roomTiles.set(room, []);
        roomTiles.get(room)!.push(tile);
      }
      const labels: Array<{ room: string; text: string; x: number; y: number; color: string }> = [];
      for (const [room, tiles] of roomTiles) {
        const entry = ROOMS[room];
        if (!entry) continue;
        const x = tiles.reduce((s, t) => s + t.cx, 0) / tiles.length;
        const y = tiles.reduce((s, t) => s + t.cy, 0) / tiles.length;
        labels.push({ room, text: entry.label, x, y, color: entry.border });
      }
      return labels;
    },
    wallLines(): WallLine[] {
      const out: WallLine[] = [];
      const seen = new Set<string>();
      for (const tile of this.board.tiles as ReadonlyArray<TileModel>) {
        const cx = tileCx(tile.q);
        const cy = tileCy(tile.r);
        const addWall = (key: string, x1: number, y1: number, x2: number, y2: number) => {
          if (!seen.has(key)) { seen.add(key); out.push({ x1, y1, x2, y2 }); }
        };
        if (tile.walls.top)
          addWall(`T${tile.q},${tile.r}`, cx - HALF, cy - HALF, cx + HALF, cy - HALF);
        if (tile.walls.right)
          addWall(`R${tile.q},${tile.r}`, cx + HALF, cy - HALF, cx + HALF, cy + HALF);
        if (tile.walls.bottom)
          addWall(`B${tile.q},${tile.r}`, cx - HALF, cy + HALF, cx + HALF, cy + HALF);
        if (tile.walls.left)
          addWall(`L${tile.q},${tile.r}`, cx - HALF, cy - HALF, cx - HALF, cy + HALF);
      }
      return out;
    },
    /** Edge zones for barricade placement: edges between accessible tile pairs with no hard wall. */
    edgeZones(): EdgeZone[] {
      const zones: EdgeZone[] = [];
      const tileMap = this.tileByKey as Map<string, TileModel>;
      for (const tile of this.board.tiles as ReadonlyArray<TileModel>) {
        for (const [dq, dr] of FORWARD_DIRS) {
          const nKey = `${tile.q + dq},${tile.r + dr}`;
          const neighbor = tileMap.get(nKey);
          if (!neighbor) continue;
          // Check hard walls block this edge
          if (dq === 1) {
            // Right edge: tile.walls.right or neighbor.walls.left
            if (tile.walls.right || neighbor.walls.left) continue;
          } else {
            // Bottom edge: tile.walls.bottom or neighbor.walls.top
            if (tile.walls.bottom || neighbor.walls.top) continue;
          }
          const cxa = tileCx(tile.q); const cya = tileCy(tile.r);
          const PAD = 4;
          let x1: number, y1: number, x2: number, y2: number;
          if (dq === 1) {
            // Vertical edge between tile and right neighbor
            const ex = cxa + HALF;
            x1 = ex; y1 = cya - HALF + PAD;
            x2 = ex; y2 = cya + HALF - PAD;
          } else {
            // Horizontal edge between tile and bottom neighbor
            const ey = cya + HALF;
            x1 = cxa - HALF + PAD; y1 = ey;
            x2 = cxa + HALF - PAD; y2 = ey;
          }
          zones.push({ q1: tile.q, r1: tile.r, q2: tile.q + dq, r2: tile.r + dr, x1, y1, x2, y2 });
        }
      }
      return zones;
    },
  },
  methods: {
    roomBaseColor(key: string): string {
      // The rect behind the overlay — keep dark so walls/grid lines read well
      return '#1e1e2e';
    },
    roomBorderColor(key: string): string {
      const room = TILE_ROOM.get(key);
      return room ? ROOMS[room]?.border ?? '#333' : '#333';
    },
    isHighlighted(key: string): boolean {
      return (this.board.highlightedHexKeys as ReadonlyArray<string>).includes(key);
    },
    onHexClick(q: number, r: number): void {
      if (this.isClickable && !this.isWallMode) {
        const key = `${q},${r}`;
        if ((this.highlightActive as boolean) && !(this.isHighlighted(key))) return;
        this.$emit('hex-clicked', { q, r });
      }
    },
    onEdgeClick(q1: number, r1: number, q2: number, r2: number): void {
      this.$emit('edge-clicked', { q1, r1, q2, r2 });
    },
  },
});
</script>
