

export { Game } from './core/Game';
export { GameManager } from './core/GameManager';
export { Player } from './core/Player';
export { Board } from './board/Board';
export { BoardCell } from './board/BoardCell';
export type { OccupantType } from './board/BoardCell';
export { setupNewBoard } from './board/BoardSetup';
export { CardProcessor } from './cards/CardProcessor';
export type { TargetType, CardEffect } from './cards/CardProcessor';
export { CardDrawer } from './cards/CardDrawer';
export { sp, cp, np, health, countZombiesInRoom, countBarricadesOnBoard, countTrapsInRoom } from './cards/CardUtils';
export { LOCKER_DECK, getLockerData, applyLockerPassive } from './cards/CardIndex/LockerDeck';
export { ActionProcessor, ActionManager } from './actions/ActionProcessor';
export type { ActionEffect, ActionOption, ActionTargetType } from './actions/ActionProcessor';
export { ActionHandlers } from './actions/ActionHandler';
export { AllSpecialActions, HeroActions, LockerActions, GameDeckActions } from './actions/SpecialActions';
export { HERO_DECK, getHeroData, applyHeroPassive, getHeroDisplayName, getHeroTitle, getHeroImage, HeroId } from './misc/HeroId';
export { ZombieManager } from './misc/ZombieManager';
export { ZombieSpawner } from './misc/ZombieSpawner';
export { StructurePlacement } from './actions/StructurePlacement';
export { MovementUtil } from './actions/MovementUtilities';
export { BoardEvaluator } from './board/BoardEvaluator';
export { AIController } from './core/AIController';
export { GameConstants } from './misc/GameConstants';
export { CardHelper } from './cards/CardRegistrationHelper';
export * from './misc/EventManager';

