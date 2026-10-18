// BoardCell.ts
import { Player } from '../index';

export function normalizeBoardRoomId(roomId: string): string {
  const raw = (roomId ?? '').toString().trim();
  if (!raw) return '';

  const aliases: Record<string, string> = {
    gymnasium: 'Gymnasium',
    gym: 'Gymnasium',
    hallway: 'Hallway',
    hallways: 'Hallway',
    lobby: 'Front Desk',
    'front desk': 'Front Desk',
    'front-desk': 'Front Desk',
    frontdesk: 'Front Desk',
    bathroom: 'Restroom',
    restroom: 'Restroom',
    restrooms: 'Restroom',
    closet: "Janitor's Closet",
    janitorcloset: "Janitor's Closet",
    janitorscloset: "Janitor's Closet",
    janitorscloset1: "Janitor's Closet",
    library: 'Library',
    cafeteria: 'Cafeteria',
    auditorium: 'Auditorium',
    office: "Principal's Office",
    principalsoffice: "Principal's Office",
    sciencelab: 'Science Lab',
    'science lab': 'Science Lab',
    'science-lab': 'Science Lab',
    tunnel: 'Tunnel',
  };

  const normalized = raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return aliases[normalized] ?? raw;
}

export type OccupantType = 'empty' | 'zombie' | 'hole';
export type StructureType = 'player' | 'barricade' | 'trap' | 'bait' | null;

export class BoardCell {
  // ===== IDENTITY =====
  public readonly id: string;
  public readonly x: number;
  public readonly y: number;
  private readonly _roomId: string;
  public readonly spawnId: string;
  public readonly isHole: boolean;
  public occupantType: OccupantType = 'empty';

  // ===== ZOMBIE OCCUPANT =====
  public zombieId: string | null = null;
  public zombieStepsLeft: number | null = null;
  public zombieTarget: BoardCell | null = null;

  // ===== PLAYER-OWNED STRUCTURE =====
  public structureType: StructureType = null;
  public structureOwner: Player | null = null;
  public structureData: {
    health?: number;         // for players
    effectiveness?: number;  // for barricades, traps
    radius?: number;         // for bait
  } = {};

  constructor(id: string, x: number, y: number, roomId: string, spawnId: string, isHole: boolean = false) {
    this.id = id;
    this.x = x;
    this.y = y;
    this._roomId = roomId;
    this.spawnId = spawnId;
    this.isHole = isHole;
  }

  public get roomId(): string {
    return normalizeBoardRoomId(this._roomId);
  }

  // ===== STRUCTURE CHECKS =====

  get isEmpty(): boolean {
    return !this.isHole && this.structureType === null && this.zombieId === null;
  }

  get hasPlayer(): boolean {
    return this.structureType === 'player' && this.structureOwner !== null;
  }

  get hasZombie(): boolean {
    return this.zombieId !== null;
  }

  get hasBarricade(): boolean {
    return this.structureType === 'barricade';
  }

  get hasTrap(): boolean {
    return this.structureType === 'trap';
  }

  get hasBait(): boolean {
    return this.structureType === 'bait';
  }

  get hasStructure(): boolean {
    return this.structureType !== null;
  }

  get isOccupied(): boolean {
    return this.isHole || this.hasZombie || this.hasStructure;
  }
 

  get canZombieStep(): boolean {
    return !this.isHole && !this.hasZombie;
  }

  get owner(): Player | null {
    return this.structureOwner;
  }

  get trapOwner(): Player | null {
    return this.structureType === 'trap' ? this.structureOwner : null;
  }

  set trapOwner(owner: Player | null) {
    if (owner) {
      this.structureType = 'trap';
      this.structureOwner = owner;
    } else {
      this.removeStructure();
    }
  }

  get baitOwner(): Player | null {
    return this.structureType === 'bait' ? this.structureOwner : null;
  }

  set baitOwner(owner: Player | null) {
    if (owner) {
      this.structureType = 'bait';
      this.structureOwner = owner;
    } else {
      this.removeStructure();
    }
  }

  get player(): Player | null {
    return this.hasPlayer ? this.structureOwner : null;
  }

  set player(player: Player | null) {
    if (player) {
      this.setPlayer(player);
    } else {
      this.removePlayer();
    }
  }

  // ===== SETTERS =====

  setPlayer(player: Player): void {
    if (this.isHole) return;
    this.clear();
    this.structureType = 'player';
    this.structureOwner = player;
    this.structureData = { health: player.currHealth };
    this.occupantType = 'empty';
  }

  setZombie(id: string, speed: number): void {
    if (this.isHole) return;
    this.clear();
    this.zombieId = id;
    this.zombieStepsLeft = speed;
    this.zombieTarget = null;
    this.occupantType = 'zombie';
  }

  setStructure(type: StructureType, owner: Player, data: any = {}): void {
    if (this.isHole || type === null) return;
    
    if (this.hasPlayer || this.hasZombie) return;
    
    // Trap, barricade, and bait cells can be replaced by the same structure family.
    if (this.hasStructure && this.structureType !== 'trap' && this.structureType !== 'barricade' && this.structureType !== 'bait') {
      return;
    }
    
    this.removeStructure();
    
    this.structureType = type;
    this.structureOwner = owner;
    this.structureData = data;
  }

  setTrap(owner: Player): void {
    this.setStructure('trap', owner, { 
      effectiveness: owner.getTrapEffectiveness() 
    });
  }

  setBait(owner: Player): void {
    this.setStructure('bait', owner, { 
      radius: owner.getBaitRadius() 
    });
  }

  setBarricade(owner: Player): void {
    this.setStructure('barricade', owner);
  }

  removeStructure(): void {
    this.structureType = null;
    this.structureOwner = null;
    this.structureData = {};
  }

  clear(): void {
    if (this.isHole) return;
    this.zombieId = null;
    this.zombieStepsLeft = null;
    this.zombieTarget = null;
    this.occupantType = 'empty';
    this.removeStructure();
  }

  
  removePlayer(): Player | null {
    if (!this.hasPlayer) return null;
    const player = this.structureOwner;
    this.removeStructure();
    return player;
  }

 get isWalkable(): boolean { 
    return !this.isHole && 
           !this.hasZombie && 
           !this.hasStructure;
  }


  toJSON(): any {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      roomId: this.roomId,
      spawnId: this.spawnId,
      isHole: this.isHole,
      hasZombie: this.hasZombie,
      zombieId: this.zombieId,
      zombieStepsLeft: this.zombieStepsLeft,
      structureType: this.structureType,
      structureOwnerId: this.structureOwner?.id || null,
      structureData: this.structureData,
      ownerId: this.owner?.id || null,
    };
  }
}