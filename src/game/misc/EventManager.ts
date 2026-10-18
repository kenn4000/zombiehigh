// src/game/misc/EventManager.ts

import { BoardCell } from '../board/BoardCell';
import { Player } from '../core/Player';
export interface CardPlayedEvent {
  player: Player;
  cardId: string;
  cardName: string;
  cost: number;
  spGained?: number;
  goldGained?: number;
  cpGained?: number;
  npGained?: number;
}
export type EventType = 
  | 'structureDestroyed'
  | 'structurePlaced'
  | 'zombieKilled'
  | 'trapTriggered'
  | 'barricadeHeld'
  | 'barricadeDestroyed'
  | 'cardPlayed'
  | 'playerDamaged'
  | 'nightStarted'
  | 'nightEnded';

export interface StructureDestroyedEvent {
  cell: BoardCell;
  roomId: string;
  owner: Player | null;
  type: 'trap' | 'barricade' | 'bait';
  x: number;
  y: number;
}
export interface PlayerDamagedEvent {
  player: Player;
  roomId: string;
  x: number;
  y: number;
}

export interface StructurePlacedEvent {
  cell: BoardCell;
  roomId: string;
  owner: Player;
  type: 'trap' | 'barricade' | 'bait';
  x: number;
  y: number;
}

export interface ZombieKilledEvent {
  cell: BoardCell;
  roomId: string;
  killedBy: Player;
  method: 'trap' | 'melee';
  x: number;
  y: number;
}

export class EventManager {
  private static instance: EventManager;
  private listeners: Map<EventType, Array<(data: any) => void>> = new Map();
  
  static getInstance(): EventManager {
    if (!EventManager.instance) {
      EventManager.instance = new EventManager();
    }
    return EventManager.instance;
  }
  
  on(event: EventType, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }
  
  off(event: EventType, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event)!;
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }
  
  emit(event: EventType, data: any): void {
    if (!this.listeners.has(event)) return;
    for (const callback of this.listeners.get(event)!) {
      callback(data);
    }
  }
  
  clear(): void {
    this.listeners.clear();
  }
}