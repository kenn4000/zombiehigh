<template>
  <div class="game-board-3d" ref="containerRef">
    <div v-if="boardInitError" class="board-error">
      <div>⚠️ Board failed to load</div>
      <div style="font-size:10px;opacity:0.6;">{{ boardInitError }}</div>
    </div>

    <div v-else-if="!isLoaded" class="loading-overlay">
      <div class="loading-spinner">Loading 3D Board...</div>
    </div>
    
    <!-- Controls -->
    <div class="controls-overlay">
      <div class="control-hint">
        <span>🖱️ Drag to rotate · Scroll to zoom · Right-click to pan</span>
      </div>
      <div class="view-controls">
        <button @click="resetView" class="view-btn" title="Reset View">⟲</button>
        <button @click="toggleTopDown" class="view-btn" title="Toggle Top-Down">◉</button>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Board, BoardCell, Player } from '../index';
import { BLOCKED_BOARD_PAIRS, WALL_OPENINGS } from '../board/Board';
import { resolveBoardCellTarget } from '../board/cellTargetResolver';
import { normalizeRoomKey, getRoomLabel } from '../board/roomLabelUtils';

// ===== PROPS =====
const props = defineProps<{
  board: any;
  isClickable?: boolean;
  isWallMode?: boolean;
  showZombiePath?: boolean;
  highlightTargets?: { x: number; y: number }[];
  playerColors?: Map<string, string>;
  nightSteps?: number;
}>();

// ===== EMITS =====
const emit = defineEmits<{
  (e: 'cell-clicked', cell: { x: number; y: number }): void;
  (e: 'edge-clicked', edge: { x1: number; y1: number; x2: number; y2: number }): void;
}>();

// ===== STATE =====
const containerRef = ref<HTMLDivElement | null>(null);
const isLoaded = ref(false);

// Three.js objects
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let labelRenderer: CSS2DRenderer | null = null;
let controls: OrbitControls | null = null;
let animationFrameId: number | null = null;
let boardGroup: THREE.Group | null = null;
let boardFloorTexture: THREE.Texture | null = null;
const cellMeshes = new Map<string, THREE.Mesh>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// Constants
const TILE_SIZE = 1.1;
const TILE_GAP = 0.12;
const TILE_STEP = TILE_SIZE + TILE_GAP;
const TILE_HEIGHT = 0.3;
const BOARD_OVERLAY_SCALE = 0.95;

// Player colors
const DEFAULT_PLAYER_COLORS = [
  '#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf', 
  '#ff8a5c', '#6c5ce7', '#fd79a8', '#00b894'
];

// Room colors
const ROOM_COLORS: Record<string, string> = {
  'Science Lab': '#6c5ce7',
  'Cafeteria': '#fdcb6e',
  'Auditorium': '#e17055',
  'Library': '#74b9ff',
  'Front Desk': '#fd79a8',
  "Principal's Office": '#00b894',
  "Janitor's Closet": '#8b5a2b',
  'Restroom': '#00cec9',
  'Tunnel': '#d63031',
  'Gymnasium': '#a29bfe',
  'Hallway': '#8a8f98',
};

function getRoomColor(roomId: string | null | undefined): string {
  const key = normalizeRoomKey(roomId);
  return ROOM_COLORS[key] || '#2d2d4a';
}

function getPlayerColor(player: Player): string {
  if (props.playerColors?.has(player.id)) {
    return props.playerColors.get(player.id)!;
  }
  if (player.color) return player.color;
  const index = Math.abs(hashString(player.id)) % DEFAULT_PLAYER_COLORS.length;
  return DEFAULT_PLAYER_COLORS[index];
}

function getPlayerMarkerColor(player: Player | null): string {
  if (!player) return '#ffffff';
  const directColor = getPlayerColor(player);
  if (directColor.startsWith('#')) return directColor;

  const namedColors: Record<string, string> = {
    red: '#ef4444',
    blue: '#3b82f6',
    green: '#22c55e',
    yellow: '#facc15',
    cyan: '#22d3ee',
    magenta: '#e879f9',
    orange: '#f97316',
    purple: '#a78bfa',
    white: '#ffffff',
    black: '#111827',
    default: '#ffffff',
  };

  return namedColors[directColor.toLowerCase()] || directColor || '#ffffff';
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

// ===== COMPUTED =====
const boardDimensions = computed(() => {
  const rows = props.board?.cells?.length || 0;
  const cols = props.board?.cells?.[0]?.length || 0;
  return { rows, cols };
});

// ===== THREE.JS FUNCTIONS =====
function initThreeJS(): void {
  if (!containerRef.value) return;

  const container = containerRef.value;
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d1a);
  boardFloorTexture = new THREE.TextureLoader().load('/boardoverlay.png');
  boardFloorTexture.colorSpace = THREE.SRGBColorSpace;
  boardFloorTexture.center.set(0.5, 0.5);
  boardFloorTexture.repeat.set(BOARD_OVERLAY_SCALE, BOARD_OVERLAY_SCALE);

  // Camera
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  const { rows, cols } = boardDimensions.value;
  const centerX = 0;
  const centerZ = 0;
  const boardSpan = Math.max(cols, rows) * TILE_STEP;
  const dist = Math.max(22, boardSpan * 1.15);
  camera.position.set(0, dist, 0.01);
  camera.lookAt(centerX, 0, centerZ);

  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  // Label Renderer
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(width, height);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 50;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.target.set(0, 0, 0);
  controls.update();

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffeedd, 1.5);
  directionalLight.position.set(10, 20, 10);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -20;
  directionalLight.shadow.camera.right = 20;
  directionalLight.shadow.camera.top = 20;
  directionalLight.shadow.camera.bottom = -20;
  scene.add(directionalLight);

  const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
  fillLight.position.set(-10, 5, -10);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
  rimLight.position.set(0, 5, -15);
  scene.add(rimLight);

  // Build the board
  boardGroup = new THREE.Group();
  scene.add(boardGroup);
  buildBoard();

  // Resize handler
  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onBoardPointerDown);

  // Start render loop
  animate();
}

function onBoardPointerDown(event: PointerEvent): void {
  if (!props.board || !renderer || !camera || !props.isClickable) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const hitTargets = Array.from(cellMeshes.values());
  const intersects = raycaster.intersectObjects(hitTargets, false);
  for (const hit of intersects) {
    const resolved = resolveBoardCellTarget(hit.object ?? hit);
    if (resolved) {
      emit('cell-clicked', resolved);
      return;
    }
  }

  // Fallback to a world-plane projection if the hit list is empty or the board has not yet generated mesh metadata.
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hitPoint = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(plane, hitPoint);

  if (!hit) return;

  const { rows, cols } = boardDimensions.value;
  const offsetX = cols / 2;
  const offsetZ = rows / 2;
  const cellX = Math.round(hitPoint.x / TILE_STEP + offsetX - 0.5);
  const cellY = Math.round(hitPoint.z / TILE_STEP + offsetZ - 0.5);
  const cell = props.board.getCell(cellX, cellY);

  if (cell) {
    emit('cell-clicked', { x: cell.x, y: cell.y });
  }
}

function buildBoard(): void {
  if (!boardGroup || !props.board?.cells) return;

  // Clear existing
  while (boardGroup.children.length > 0) {
    const child = boardGroup.children[0];
    boardGroup.remove(child);
    if (child instanceof THREE.Mesh) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    } else if (child instanceof THREE.Line) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    } else if (child instanceof THREE.LineSegments) {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }
  }
  cellMeshes.clear();

  const board = props.board;
  const rows = board.cells.length;
  const cols = board.cells[0]?.length || 0;
  const offsetX = cols / 2;
  const offsetZ = rows / 2;

  if (boardFloorTexture) {
    const floorGeometry = new THREE.PlaneGeometry(cols * TILE_STEP, rows * TILE_STEP);
    const floorMaterial = new THREE.MeshBasicMaterial({
      map: boardFloorTexture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -TILE_HEIGHT / 2 - 0.02;
    boardGroup.add(floor);
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = board.getCell(x, y);
      if (!cell) continue;

      const posX = (x - offsetX + 0.5) * TILE_STEP;
      const posZ = (y - offsetZ + 0.5) * TILE_STEP;
      const posY = 0;

      // Skip holes and internal hallway tiles
      if (cell.isHole) {
        const holeGeometry = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT * 0.3, TILE_SIZE);
        const holeMaterial = new THREE.MeshStandardMaterial({
          color: 0x020304,
          transparent: true,
          opacity: 0.95,
          roughness: 0.9,
        });
        const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);
        holeMesh.position.set(posX, posY - 0.1, posZ);
        boardGroup.add(holeMesh);
        continue;
      }

      // Determine tile color
      const roomColor = getRoomColor(cell.roomId);
      const color = new THREE.Color(roomColor);

      // Check if highlighted
      const isHighlighted = props.highlightTargets?.some(
        h => h.x === cell.x && h.y === cell.y
      ) || false;

      // Create tile
      const tileGeometry = new THREE.BoxGeometry(TILE_SIZE, TILE_HEIGHT, TILE_SIZE);
      const material = new THREE.MeshBasicMaterial({
        color: isHighlighted ? color.clone().multiplyScalar(1.5) : 0xffffff,
        transparent: true,
        opacity: isHighlighted ? 0.4 : 0,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(tileGeometry, material);
      mesh.position.set(posX, posY, posZ);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      
      mesh.userData = { x: cell.x, y: cell.y };

      boardGroup.add(mesh);
      cellMeshes.set(`${cell.x},${cell.y}`, mesh);

      // Add structures (barricades, traps, bait)
      addStructures(cell, posX, posY, posZ);

      // Add occupants (players, zombies)
      addOccupants(cell, posX, posY, posZ);
    }
  }

  addBoardWalls();

  // Add room labels
  addRoomLabels();

  // Add zombie path
  if (props.showZombiePath) {
    nextTick(() => updateZombiePath());
  }
}

function addBoardWalls(): void {
  if (!boardGroup || !props.board) return;

  const board = props.board;
  const rows = board.cells.length;
  const cols = board.cells[0]?.length || 0;
  const offsetX = cols / 2;
  const offsetZ = rows / 2;
  const wallHeight = 0.7;
  const wallThickness = 0.12;
  const seamOffset = TILE_STEP / 2;
  const seen = new Set<string>();

  const pairKeyFor = (ax: number, ay: number, bx: number, by: number): string => {
    const sorted = [[ax, ay], [bx, by]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return `${sorted[0][0]},${sorted[0][1]}|${sorted[1][0]},${sorted[1][1]}`;
  };

  const addEdgeWall = (cellX: number, cellY: number, side: 'north' | 'south' | 'east' | 'west'): void => {
    const cellCenterX = (cellX - offsetX + 0.5) * TILE_STEP;
    const cellCenterZ = (cellY - offsetZ + 0.5) * TILE_STEP;
    const material = new THREE.MeshStandardMaterial({
      color: 0x8a8f98,
      roughness: 0.9,
      metalness: 0.1,
    });

    let wall: THREE.Mesh;
    if (side === 'east' || side === 'west') {
      wall = new THREE.Mesh(
        new THREE.BoxGeometry(wallThickness, wallHeight, TILE_SIZE + TILE_GAP),
        material
      );
      const x = side === 'east' ? cellCenterX + seamOffset : cellCenterX - seamOffset;
      wall.position.set(x, wallHeight / 2, cellCenterZ);
    } else {
      wall = new THREE.Mesh(
        new THREE.BoxGeometry(TILE_SIZE + TILE_GAP, wallHeight, wallThickness),
        material
      );
      const z = side === 'south' ? cellCenterZ + seamOffset : cellCenterZ - seamOffset;
      wall.position.set(cellCenterX, wallHeight / 2, z);
    }

    wall.castShadow = true;
    wall.receiveShadow = true;
    boardGroup.add(wall);
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = board.getCell(x, y);
      if (!cell || cell.isHole) continue;

      const directions: Array<{ dx: number; dy: number; side: 'north' | 'south' | 'east' | 'west' }> = [
        { dx: 0, dy: -1, side: 'north' },
        { dx: 1, dy: 0, side: 'east' },
        { dx: 0, dy: 1, side: 'south' },
        { dx: -1, dy: 0, side: 'west' },
      ];

      for (const { dx, dy, side } of directions) {
        const nx = x + dx;
        const ny = y + dy;
        const pairKey = nx >= 0 && ny >= 0 && nx < cols && ny < rows ? pairKeyFor(x, y, nx, ny) : null;

        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
          const edgeKey = `${x},${y}|${side}`;
          if (!seen.has(edgeKey)) {
            seen.add(edgeKey);
            addEdgeWall(x, y, side);
          }
          continue;
        }

        const neighbor = board.getCell(nx, ny);
        const isExplicitOpening = pairKey !== null && WALL_OPENINGS.has(pairKey);
        if (!isExplicitOpening && (!neighbor || neighbor.isHole || BLOCKED_BOARD_PAIRS.has(pairKey!))) {
          const wallKey = pairKey ?? `${x},${y}|${side}`;
          if (!seen.has(wallKey)) {
            seen.add(wallKey);
            addEdgeWall(x, y, side);
          }
        }
      }
    }
  }

}

function addStructures(cell: BoardCell, posX: number, posY: number, posZ: number): void {
  if (!boardGroup) return;

  const ownerColor = getPlayerMarkerColor(cell.structureOwner);

  // Barricade (Hazard-Striped Wall)
  if (cell.hasBarricade) {
    const barricadeDiv = document.createElement('div');
    barricadeDiv.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24" style="display: block;">
        <rect x="2" y="3" width="20" height="18" rx="2" fill="#111827" stroke="${ownerColor}" stroke-width="2"/>
        <path d="M2 9L9 2H12L2 12V9Z" fill="${ownerColor}"/>
        <path d="M2 17L17 2H20L2 20V17Z" fill="${ownerColor}"/>
        <path d="M10 22L22 10V13L13 22H10Z" fill="${ownerColor}"/>
      </svg>
    `;
    barricadeDiv.style.width = '24px';
    barricadeDiv.style.height = '24px';
    
    const barricadeLabel = new CSS2DObject(barricadeDiv);
    barricadeLabel.position.set(posX, posY + 0.55, posZ);
    boardGroup.add(barricadeLabel);
    
    // Add health indicator
    if (cell.structureData?.health !== undefined) {
      const healthDiv = document.createElement('div');
      healthDiv.textContent = `${cell.structureData.health}`;
      healthDiv.style.color = ownerColor;
      healthDiv.style.fontSize = '10px';
      healthDiv.style.fontWeight = 'bold';
      healthDiv.style.textShadow = '0 0 10px rgba(0,0,0,0.8)';
      healthDiv.style.background = 'rgba(0,0,0,0.6)';
      healthDiv.style.padding = '1px 4px';
      healthDiv.style.borderRadius = '2px';
      healthDiv.style.border = `1px solid ${ownerColor}`;
      const healthLabel = new CSS2DObject(healthDiv);
      healthLabel.position.set(posX, posY + 0.12, posZ);
      boardGroup.add(healthLabel);
    }
  }

  // Trap (Bear Trap / Jaw Trap)
  if (cell.hasTrap) {
    const trapDiv = document.createElement('div');
    trapDiv.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" style="stroke: ${ownerColor}; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; display: block;">
        <circle cx="12" cy="12" r="3" fill="${ownerColor}" opacity="0.4" stroke-width="1"/>
        <path d="M12 3V5 M12 19V21 M3 12H5 M19 12H21 M5.6 5.6L7 7 M17 17L18.4 18.4 M5.6 18.4L7 17 M17 7L18.4 5.6"/>
      </svg>
    `;
    trapDiv.style.position = 'relative';
    trapDiv.style.width = '26px';
    trapDiv.style.height = '26px';
    trapDiv.style.background = 'rgba(17, 24, 39, 0.92)';
    trapDiv.style.border = `1px solid ${ownerColor}`;
    trapDiv.style.borderRadius = '50%';
    trapDiv.style.boxShadow = `0 0 8px ${ownerColor}66`;
    const trapSvg = trapDiv.querySelector('svg');
    if (trapSvg) {
      trapSvg.style.position = 'absolute';
      trapSvg.style.left = '50%';
      trapSvg.style.top = '50%';
      trapSvg.style.transform = 'translate(-50%, -50%)';
    }
    
    const trapLabel = new CSS2DObject(trapDiv);
    trapLabel.position.set(posX, posY + 0.45, posZ);
    boardGroup.add(trapLabel);
  }

  // Bait (Fish Skeleton)
  if (cell.hasBait) {
    const baitDiv = document.createElement('div');
    baitDiv.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" style="stroke: ${ownerColor}; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; display: block;">
        <line x1="3" y1="12" x2="21" y2="12"/>
        <path d="M19 8l3 4-3 4V8z" fill="${ownerColor}"/>
        <path d="M3 8L1 12l2 4V8z" fill="${ownerColor}"/>
        <line x1="7" y1="9" x2="7" y2="15"/>
        <line x1="11" y1="8" x2="11" y2="16"/>
        <line x1="15" y1="9" x2="15" y2="15"/>
      </svg>
    `;
    baitDiv.style.position = 'relative';
    baitDiv.style.width = '26px';
    baitDiv.style.height = '26px';
    baitDiv.style.background = 'rgba(17, 24, 39, 0.92)';
    baitDiv.style.border = `1px solid ${ownerColor}`;
    baitDiv.style.borderRadius = '50%';
    baitDiv.style.boxShadow = `0 0 8px ${ownerColor}66`;
    const baitSvg = baitDiv.querySelector('svg');
    if (baitSvg) {
      baitSvg.style.position = 'absolute';
      baitSvg.style.left = '50%';
      baitSvg.style.top = '50%';
      baitSvg.style.transform = 'translate(-50%, -50%)';
    }
    
    const baitLabel = new CSS2DObject(baitDiv);
    baitLabel.position.set(posX, posY + 0.45, posZ);
    boardGroup.add(baitLabel);
  }
}

function addOccupants(cell: BoardCell, posX: number, posY: number, posZ: number): void {
  if (!boardGroup) return;

  const labelHeight = 0.6;

  // Player
  if (cell.hasPlayer && cell.structureOwner) {
    const player = cell.structureOwner;
    const playerColor = getPlayerColor(player);
    const labelDiv = document.createElement('div');
    labelDiv.innerHTML = `
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" style="display: block; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); fill: ${playerColor};">
        <circle cx="12" cy="7" r="3.5"/>
        <path d="M5 21c.5-4.5 2.8-7 7-7s6.5 2.5 7 7H5z"/>
      </svg>
    `;
    labelDiv.style.background = '#000';
    labelDiv.style.width = '28px';
    labelDiv.style.height = '28px';
    labelDiv.style.lineHeight = '1';
    labelDiv.style.padding = '0';
    labelDiv.style.boxSizing = 'border-box';
    labelDiv.style.verticalAlign = 'middle';
    labelDiv.style.borderRadius = '50%';
    labelDiv.style.display = 'flex';
    labelDiv.style.alignItems = 'center';
    labelDiv.style.justifyContent = 'center';
    labelDiv.style.border = `2px solid ${playerColor}`;
    labelDiv.style.boxShadow = `0 0 15px ${playerColor}66`;
    labelDiv.style.transform = 'translate(-50%, -50%)';
    labelDiv.style.position = 'relative';
    
    const label = new CSS2DObject(labelDiv);
    label.position.set(posX, posY + labelHeight, posZ);
    boardGroup.add(label);
  }

  // Zombie
  if (cell.hasZombie) {
    const labelDiv = document.createElement('div');
    labelDiv.textContent = '🧟';
    labelDiv.style.color = '#f8fafc';
    labelDiv.style.fontSize = '20px';
    labelDiv.style.fontWeight = 'bold';
    labelDiv.style.textAlign = 'center';
    labelDiv.style.textShadow = '0 0 10px rgba(15, 23, 42, 0.8)';
    labelDiv.style.background = 'transparent';
    labelDiv.style.width = '28px';
    labelDiv.style.height = '28px';
    labelDiv.style.lineHeight = '1';
    labelDiv.style.padding = '0';
    labelDiv.style.boxSizing = 'border-box';
    labelDiv.style.verticalAlign = 'middle';
    labelDiv.style.borderRadius = '0';
    labelDiv.style.display = 'flex';
    labelDiv.style.alignItems = 'center';
    labelDiv.style.justifyContent = 'center';
    labelDiv.style.border = 'none';
    labelDiv.style.boxShadow = 'none';
    labelDiv.style.transform = 'translate(-50%, -50%)';
    labelDiv.style.position = 'relative';
    
    const label = new CSS2DObject(labelDiv);
    label.position.set(posX, posY + labelHeight + 0.2, posZ);
    boardGroup.add(label);
  }
}

function addRoomLabels(): void {
  if (!boardGroup || !props.board) return;

  const board = props.board;
  const rows = board.cells.length;
  const cols = board.cells[0]?.length || 0;
  const offsetX = cols / 2;
  const offsetZ = rows / 2;

  const roomCells = new Map<string, { cells: BoardCell[], sumX: number, sumY: number }>();
  
  for (const cell of board.getAllCells()) {
    if (cell.roomId && !cell.isHole) {
      if (cell.roomId === 'Hallway') continue;
      if (!roomCells.has(cell.roomId)) {
        roomCells.set(cell.roomId, { cells: [], sumX: 0, sumY: 0 });
      }
      const room = roomCells.get(cell.roomId)!;
      room.cells.push(cell);
      room.sumX += cell.x;
      room.sumY += cell.y;
    }
  }

  for (const [roomId, data] of roomCells) {
    if (roomId === 'Hallway' || data.cells.length < 3) continue;
    
    const centerX = data.sumX / data.cells.length;
    const centerY = data.sumY / data.cells.length;
    
    const posX = (centerX - offsetX + 0.5) * TILE_STEP;
    const posZ = (centerY - offsetZ + 0.5) * TILE_STEP;

    const labelDiv = document.createElement('div');
    labelDiv.textContent = getRoomLabel(roomId);
    labelDiv.style.color = 'rgba(255,255,255,0.3)';
    labelDiv.style.fontSize = '10px';
    labelDiv.style.fontWeight = '600';
    labelDiv.style.textTransform = 'uppercase';
    labelDiv.style.letterSpacing = '1px';
    labelDiv.style.textShadow = '0 0 10px rgba(0,0,0,0.8)';
    labelDiv.style.background = 'rgba(0,0,0,0.2)';
    labelDiv.style.padding = '2px 8px';
    labelDiv.style.borderRadius = '4px';
    labelDiv.style.backdropFilter = 'blur(2px)';
    labelDiv.style.pointerEvents = 'none';
    
    const label = new CSS2DObject(labelDiv);
    label.position.set(posX, 0.8, posZ);
    boardGroup.add(label);
  }
}

function getZombiePreviewTarget(zombie: BoardCell): BoardCell | null {
  if (!props.board || !zombie) return null;

  const board = props.board;
  const baitTargets = board.getAllBaits().filter((baitCell: BoardCell) => {
    const owner = baitCell.baitOwner;
    if (!owner) return false;
    const baitRadius = owner.getBaitRadius ? owner.getBaitRadius() : 3;
    const dist = Math.abs(zombie.x - baitCell.x) + Math.abs(zombie.y - baitCell.y);
    return dist <= baitRadius;
  });

  let bestTarget: BoardCell | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const compareTarget = (candidate: BoardCell | null, type: 'bait' | 'player') => {
    if (!candidate) return;
    const dist = Math.abs(zombie.x - candidate.x) + Math.abs(zombie.y - candidate.y);
    const adjusted = type === 'player' ? dist - 1 : dist;
    if (adjusted < bestScore) {
      bestScore = adjusted;
      bestTarget = candidate;
    }
  };

  for (const baitCell of baitTargets) {
    compareTarget(baitCell, 'bait');
  }

  if (bestTarget) {
    return bestTarget;
  }

  for (const player of board.getAllPlayers()) {
    const position = board.getPlayerPosition(player);
    if (position) {
      compareTarget(position, 'player');
    }
  }

  return bestTarget;
}

function updateZombiePath(): void {
  if (!boardGroup || !props.board?.cells) return;

  const pathLines = boardGroup.children.filter((child: any) => child?.userData?.isPathLine);
  for (const item of pathLines) {
    boardGroup.remove(item);
    if (item instanceof THREE.Line) {
      item.geometry?.dispose();
      if (Array.isArray(item.material)) {
        item.material.forEach(material => material.dispose());
      } else {
        item.material?.dispose();
      }
    }
  }

  if (!props.showZombiePath) return;

  const board = props.board;
  const rows = board.cells.length;
  const cols = board.cells[0]?.length || 0;
  const offsetX = cols / 2;
  const offsetZ = rows / 2;

  const zombieCells = board.getAllZombies().filter((cell: BoardCell) => cell.hasZombie);

  for (const cell of zombieCells) {
    const target = cell.zombieTarget ?? getZombiePreviewTarget(cell);
    const path = target ? board.findShortestPathZombie(cell.x, cell.y, target.x, target.y) : null;
    const route = path && path.length > 1 ? path : null;
    if (!route) continue;

    const maxSteps = Math.max(1, Number.isFinite(props.nightSteps) ? Number(props.nightSteps) : (cell.zombieStepsLeft ?? 1));
    const cappedRoute = route.length > maxSteps + 1 ? route.slice(0, maxSteps + 1) : route;
    if (cappedRoute.length < 2) continue;

    const pathPoints: THREE.Vector3[] = cappedRoute.map(step => {
      const x = (step.x - offsetX + 0.5) * TILE_STEP;
      const z = (step.y - offsetZ + 0.5) * TILE_STEP;
      return new THREE.Vector3(x, 0.18, z);
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
    const material = new THREE.LineBasicMaterial({
      color: 0x7ef2a5,
      transparent: true,
      opacity: 0.9,
      linewidth: 2,
    });
    const line = new THREE.Line(geometry, material);
    (line as any).userData = { ...((line as any).userData || {}), isPathLine: true };
    boardGroup.add(line);

    const arrowStart = pathPoints[pathPoints.length - 2];
    const arrowEnd = pathPoints[pathPoints.length - 1];
    const arrowDirection = arrowEnd.clone().sub(arrowStart).normalize();
    const arrowLength = Math.max(0.45, arrowStart.distanceTo(arrowEnd));
    const arrow = new THREE.ArrowHelper(
      arrowDirection,
      arrowStart.clone(),
      arrowLength,
      0x7ef2a5,
      0.28,
      0.14
    );
    (arrow as any).userData = { ...((arrow as any).userData || {}), isPathLine: true };
    boardGroup.add(arrow);

    const glowGeometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
    const glowMaterial = new THREE.LineBasicMaterial({
      color: 0x7ef2a5,
      transparent: true,
      opacity: 0.2,
      linewidth: 4,
    });
    const glowLine = new THREE.Line(glowGeometry, glowMaterial);
    glowLine.position.y = -0.05;
    (glowLine as any).userData = { ...((glowLine as any).userData || {}), isPathLine: true };
    boardGroup.add(glowLine);
  }
}

function updateHighlights(): void {
  if (!boardGroup) return;

  for (const [key, mesh] of cellMeshes) {
    const [x, y] = key.split(',').map(Number);
    const cell = props.board?.getCell?.(x, y);
    if (!cell) continue;

    const isHighlighted = props.highlightTargets?.some(
      h => h.x === cell.x && h.y === cell.y
    ) || false;

    const roomColor = getRoomColor(cell.roomId);
    const color = new THREE.Color(roomColor);
    
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.color.set(isHighlighted ? color.clone().multiplyScalar(1.5) : 0xffffff);
    material.opacity = isHighlighted ? 0.4 : 0;
  }
}

function animate(): void {
  if (!renderer || !scene || !camera || !controls || !labelRenderer) return;

  animationFrameId = requestAnimationFrame(animate);
  
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function onResize(): void {
  if (!containerRef.value || !camera || !renderer || !labelRenderer) return;
  
  const container = containerRef.value;
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  renderer.setSize(width, height);
  labelRenderer.setSize(width, height);
}

function resetView(): void {
  if (!controls || !camera) return;

  const { rows, cols } = boardDimensions.value;
  const centerX = 0;
  const centerZ = 0;
  const dist = Math.max(22, Math.max(cols, rows) * TILE_STEP * 1.15);

  camera.position.set(0, dist, 0.01);
  controls.target.set(centerX, 0, centerZ);
  controls.update();
}

function toggleTopDown(): void {
  if (!controls || !camera) return;

  const { rows, cols } = boardDimensions.value;
  const dist = Math.max(22, Math.max(cols, rows) * TILE_STEP * 1.15);
  const target = controls.target;
  const offset = camera.position.clone().sub(target);
  const isTopDown = Math.abs(offset.x) < dist * 0.05 && Math.abs(offset.z) < dist * 0.05;

  if (isTopDown) {
    const angledOffset = new THREE.Vector3(0.55, 0.72, 0.42).normalize().multiplyScalar(dist);
    camera.position.copy(target).add(angledOffset);
  } else {
    camera.position.set(target.x, target.y + dist, target.z + 0.01);
  }
  controls.update();
}

// ===== CLEANUP =====
function cleanupThreeJS(): void {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onBoardPointerDown);
    try {
      renderer.dispose();
    } catch (e) {
      console.warn('Error disposing renderer:', e);
    }
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer = null;
  }
  
  if (labelRenderer) {
    if (labelRenderer.domElement && labelRenderer.domElement.parentNode) {
      labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
    }
    labelRenderer = null;
  }
  
  window.removeEventListener('resize', onResize);
  
  if (scene) {
    while (scene.children.length > 0) {
      const child = scene.children[0];
      scene.remove(child);
      
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material?.dispose();
        }
      } else if (child instanceof THREE.Line || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        child.material?.dispose();
      } else if (child instanceof THREE.Group) {
        child.children.forEach(grandChild => {
          if (grandChild instanceof THREE.Mesh) {
            grandChild.geometry?.dispose();
            if (Array.isArray(grandChild.material)) {
              grandChild.material.forEach(m => m.dispose());
            } else {
              grandChild.material?.dispose();
            }
          }
        });
      }
    }
    scene = null;
  }
  
  camera = null;
  controls = null;
  boardGroup = null;
  cellMeshes.clear();
  boardFloorTexture?.dispose();
  boardFloorTexture = null;
}

// ===== LIFECYCLE =====
const boardInitError = ref<string | null>(null);

onMounted(async () => {
  await nextTick();
  if (!containerRef.value) return;
  const w = containerRef.value.clientWidth;
  const h = containerRef.value.clientHeight;
  if (w < 10 || h < 10) {
    // dimensions not ready yet — retry after a frame
    requestAnimationFrame(() => {
      try {
        initThreeJS();
        isLoaded.value = true;
      } catch (err) {
        boardInitError.value = err instanceof Error ? err.message : String(err);
        console.error('[GameBoard] init failed on retry:', err);
      }
    });
    return;
  }
  try {
    initThreeJS();
    isLoaded.value = true;
  } catch (err) {
    boardInitError.value = err instanceof Error ? err.message : String(err);
    console.error('[GameBoard] Three.js init failed:', err);
  }
});

onBeforeUnmount(() => {
  cleanupThreeJS();
});

// ===== WATCHERS =====
watch(() => props.board, () => {
  if (isLoaded.value) {
    buildBoard();
  }
}, { deep: true });

watch(() => props.showZombiePath, () => {
  if (isLoaded.value) {
    updateZombiePath();
  }
});

watch(() => props.highlightTargets, () => {
  if (isLoaded.value) {
    updateHighlights();
  }
}, { deep: true });

// ===== EXPOSE =====
defineExpose({
  resetView,
  toggleTopDown,
  buildBoard,
  updateZombiePath,
  updateHighlights,
});
</script>

<style scoped>
.game-board-3d {
  width: 100%;
  height: 100%;
  position: relative;
  background: #0d0d1a;
  border-radius: 8px;
  overflow: hidden;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 13, 26, 0.8);
  z-index: 10;
}

.loading-spinner {
  color: #a78bfa;
  font-size: 18px;
  font-weight: bold;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.controls-overlay {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  gap: 12px;
  align-items: center;
  background: rgba(13, 13, 26, 0.7);
  backdrop-filter: blur(10px);
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #2a2a4a;
  pointer-events: none;
}

.control-hint {
  color: rgba(255,255,255,0.5);
  font-size: 12px;
  pointer-events: none;
}

.view-controls {
  display: flex;
  gap: 6px;
  pointer-events: auto;
}

.view-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid #3a3a5a;
  color: #a78bfa;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.view-btn:hover {
  background: rgba(167, 139, 250, 0.2);
  border-color: #a78bfa;
}

@media (max-width: 480px) {
  .controls-overlay {
    top: 8px;
    padding: 4px;
  }

  .control-hint {
    display: none;
  }
}

</style>