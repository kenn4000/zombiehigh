/**
 * Phase 5: Typed card definitions for all game cards.
 * Each entry replaces the regex-parsed JSON data with structured Behavior and Requirement objects.
 * Exported as an array; CardRegistry builds the lookup map from this.
 */

import { CardName } from '../../common/CardName';
import { CardType } from '../../common/models/CardModel';
import { GenericCard } from './GenericCard';
import { ICard } from './ICard';
import { CardRequirementDescriptor, Behavior } from './CardBehavior';

const I = CardType.INSTANT;
const P = CardType.PASSIVE;
const A = CardType.ACTION;

function card(
  name: CardName,
  cost: number,
  type: CardType,
  reqs: CardRequirementDescriptor[],
  behavior?: Behavior,
): ICard {
  return new GenericCard(name, cost, type, reqs, behavior);
}

// Shorthand requirement helpers
const sp = (op: '>=' | '<=' | '>' | '<' | '==', v: number): CardRequirementDescriptor => ({ stat: 'SP', operator: op, value: v });
const hp = (op: '>=' | '<=' | '>' | '<' | '==', v: number): CardRequirementDescriptor => ({ stat: 'HP', operator: op, value: v });
const cp = (op: '>=' | '<=' | '>' | '<' | '==', v: number): CardRequirementDescriptor => ({ stat: 'CP', operator: op, value: v });
const niceP = (op: '>=' | '<=' | '>' | '<' | '==', v: number): CardRequirementDescriptor => ({ stat: 'NiceP', operator: op, value: v });
const adjPlayer: CardRequirementDescriptor = { adjacentToPlayer: true };
const adjZombie: CardRequirementDescriptor = { adjacentToZombie: true };
const minBarricades = (n: number): CardRequirementDescriptor => ({ minBarricadesOnBoard: n });
const minOwnTraps = (n: number): CardRequirementDescriptor => ({ minOwnTraps: n });
const maxOwnTraps = (n: number): CardRequirementDescriptor => ({ maxOwnTraps: n });
const minTraps = (n: number): CardRequirementDescriptor => ({ minTrapsOnBoard: n });
const minBaits = (n: number): CardRequirementDescriptor => ({ minBaitsOnBoard: n });
const hand = (op: '<=' | '>=' | '==', n: number): CardRequirementDescriptor => ({ handSize: n, operator: op });
const played = (n: number): CardRequirementDescriptor => ({ cardsPlayed: n, operator: '>=' });
const special = (s: import('./CardBehavior').SpecialRequirement): CardRequirementDescriptor => ({ special: s });
const and = (...ds: CardRequirementDescriptor[]): CardRequirementDescriptor => ({ and: ds });
const or = (...ds: CardRequirementDescriptor[]): CardRequirementDescriptor => ({ or: ds });
// Room / structure helpers
const inRoom = (r: string): CardRequirementDescriptor => ({ inRoom: r });
const notInRoom = (r: string): CardRequirementDescriptor => ({ notInRoom: r });
const minOwnBarricades = (n: number): CardRequirementDescriptor => ({ minOwnBarricades: n });
const allPlayersMinTraps = (n: number): CardRequirementDescriptor => ({ allPlayersMinTraps: n });
const allPlayersMinBarricades = (n: number): CardRequirementDescriptor => ({ allPlayersMinBarricades: n });
const adjacentOpponentMinGold = (n: number): CardRequirementDescriptor => ({ adjacentOpponentMinGold: n });
const noOpponentInRoom = (r: string): CardRequirementDescriptor => ({ noOpponentInRoom: r });
const trapInRoom = (r: string): CardRequirementDescriptor => ({ trapInRoom: r });
const barricadeInRoom = (r: string): CardRequirementDescriptor => ({ barricadeInRoom: r });
const baitsInRoom = (room: string, min: number): CardRequirementDescriptor => ({ baitsInRoom: { room, min } });
const zombiesInRoom = (room: string, min: number): CardRequirementDescriptor => ({ zombiesInRoom: { room, min } });
const minBarricadesInRoom = (room: string, min: number): CardRequirementDescriptor => ({ minBarricadesInRoom: { room, min } });

export const ALL_CARD_DEFINITIONS: ICard[] = [
  // ── # / A ──────────────────────────────────────────────────────────────────
  card(CardName.NOT_COOL_BRO, 4, P, [allPlayersMinTraps(3)], { gain: { sp: 1, cp: 1 }, passive: { allTrapEffectiveness: -1 } }),
  card(CardName.PRINTED_WALLS, 6, A, [niceP('>=', 8)], { gain: { np: 1, sp: -1, gold: -4 }, placeFree: { barricade: true } }),
  card(CardName.RANDOM_TEN_DOLLAR, 0, I, [sp('>=', 25)], { gain: { gold: 10 } }),
  card(CardName.A_PLUS_STUDENT, 8, P, [sp('>=', 20)], { gain: { np: 1 }, passive: { cardCostReduction: 1 } }),
  card(CardName.ABANDONED_LOCKER, 2, I, [], { drawCards: 2 }),
  card(CardName.ALLERGIES, 5, I, [cp('>=', 5), special('opponentBaitExists')], { gain: { cp: 2 }, destroy: { opponentBait: true } }),
  card(CardName.AMBUSHED, 2, I, [cp('>=', 4)], { gain: { sp: 1, cp: 1 }, spawnZombies: 2 }),
  card(CardName.ANNOUNCEMENT, 4, I, [], { gain: { sp: 1 }, conditionalDrawKeepInRoom: { room: 'principals-office', draw: 2, keep: 1 } }),
  card(CardName.AREA_SABOTAGE, 9, I, [special('onBarricadeEdge')], { gain: { cp: 3 }, destroy: { allBarricadesInRoom: true } }),
  card(CardName.ATM, 1, I, [and(sp('<=', 20), special('hasGP'))], { gain: { gold: 12, gp: -1 } }),
  card(CardName.ATTENDANCE_SHEET, 4, I, [and(inRoom('principals-office'), or(niceP('==', 0), cp('==', 0)))], { gain: { sp: 1, gp: 1 } }),

  // ── B ──────────────────────────────────────────────────────────────────────
  card(CardName.BACKPACK_SEARCH, 5, I, [cp('>=', 8)], { gain: { cp: 2 }, discardAndDraw: { discard: 1, draw: 3 } }),
  card(CardName.BACKPACK_SUPPLIES, 5, I, [sp('>=', 17)], { gain: { sp: 1, gold: 10 } }),
  card(CardName.BAIT_LAUNCHER, 18, A, [sp('>=', 20)], { purchaseGain: { sp: 1 }, placeFree: { bait: true } }),
  card(CardName.BANNED_BOOK, 4, I, [inRoom('library')], { gain: { cp: 3 } }),
  card(CardName.BATHROOM_TRAP, 1, I, [trapInRoom('restrooms')], { gain: { sp: 1 } }),
  card(CardName.BLIND_JUMP, 3, I, [special('jumpOverAnyTargetExists')], { drawCards: 1, jumpOverAny: true }),
  card(CardName.BOOBY_TRAPS, 2, I, [barricadeInRoom('janitors-closet')], { gain: { gp: 1 } }),
  card(CardName.BOOK_BARRIERS, 5, I, [minBarricadesInRoom('library', 2)], { gain: { sp: 2 } }),
  card(CardName.BOOK_RETURN_SLOT, 10, I, [inRoom('library')], { gain: { gold: 10 }, teleportToRoom: { room: 'science-lab' } }),
  card(CardName.BOOKMARK, 8, I, [inRoom('library')], { gain: { sp: 2 }, drawPerZombieInCurrentRoom: true }),
  card(CardName.BRASS_KNUCKLES, 19, P, [], { gain: { sp: 1, cp: 1 }, passive: { meleeEffectivenessBonus: 1 } }),
  card(CardName.BROOM_HANDLE, 2, I, [inRoom('janitors-closet')], { gain: { np: 3, cp: 3, sp: -1 } }),
  card(CardName.BROWN_BAG_NEGOTIATION, 6, I, [special('opponentBaitExists')], { gain: { cp: 2 }, replaceOpponentBait: true }),

  // ── C ──────────────────────────────────────────────────────────────────────
  card(CardName.CHANGE_IN_CHARACTER, 2, I, [and(niceP('>=', 4), cp('>=', 2))], { gain: { sp: 1, np: 1, cp: -2 } }),
  card(CardName.CHEAT_SHEET, 4, I, [], { drawKeepFromTemp: { draw: 4, keep: 2 } }),
  card(CardName.CHECK_ITS_POCKETS, 7, P, [], { gain: { gp: 1 }, passive: { meleeOnKillDraw: 1 } }),
  card(CardName.CHICKEN_DINNER, 4, I, [special('playerHighestSP')], { gain: { sp: 2, np: 1 } }),
  card(CardName.CLAIRVOYANCE, 6, I, [hand('==', 1)], { gain: { sp: 1 }, drawCards: 4 }),
  card(CardName.CLASS_CLOWN, 3, I, [cp('>=', 3)], { gain: { cp: 2 } }),
  card(CardName.CLASS_CURVE, 3, I, [], { gain: { np: 1 }, allPlayersGain: { gold: 3 } }),
  card(CardName.CLASSIC_FICTION, 4, I, [inRoom('library')], { gain: { np: 3 } }),
  card(CardName.CONFIDENT_FIRST_STEP, 6, A, [minOwnBarricades(2)], { gain: { sp: 1 }, freeMovesIgnoreBarricades: 1 }),
  card(CardName.COPIED_NOTES, 3, I, [minOwnTraps(1)], { gain: { sp: 1 } }),
  card(CardName.CPR_CLASS, 4, I, [special('playerInSameRoomExists')], { gain: { np: 3 }, healOtherPlayer: 1 }),
  card(CardName.CRAM_SESSION, 2, I, [], { drawKeepFromTemp: { draw: 3, keep: 1 } }),
  card(CardName.CROWDED_HALLS, 6, I, [], { gain: { np: 1, cp: 1 }, moveSteps: 2, conditionalGold: { goldPerAdjacentOccupant: 2 } }),
  card(CardName.CRUSTY_BAND_AID, 11, I, [], { gain: { hp: 1 }, drawCards: 1 }),

  // ── D ──────────────────────────────────────────────────────────────────────
  card(CardName.DAREDEVIL, 5, I, [hp('==', 1)], { gain: { cp: 5 } }),
  card(CardName.DARK_RITUAL, 13, I, [sp('>=', 20)], { drawFromLockerDiscard: 3 }),
  card(CardName.DARK_ROOM_DEVELOPMENTS, 2, I, [], { drawKeepFromTemp: { draw: 3, keep: 2 } }),
  card(CardName.DEATH_SCENT, 9, I, [notInRoom('gymnasium')], { gain: { np: 1, cp: 1 }, gainGoldPerZombieInCurrentRoom: { perZombie: 5 } }),
  card(CardName.DEMERIT_SLIP, 3, I, [cp('>=', 3)], { gain: { cp: 1 }, drawCards: 1 }),
  card(CardName.DETENTION_SLIP, 3, I, [and(cp('>=', 5), inRoom('principals-office'))], { gain: { cp: 4 } }),
  card(CardName.DIRTY_HALL_MONITOR, 1, I, [and(cp('>=', 3), niceP('>=', 3))], { gain: { cp: 3, np: -2 } }),
  card(CardName.DIRTY_WORK, 4, I, [or(inRoom('restrooms'), inRoom('janitors-closet'))], { gain: { sp: 1, gold: 8 } }),
  card(CardName.DISGUSTING_MESS, 5, I, [and(cp('>=', 5), inRoom('restrooms'))], { gain: { cp: 4 } }),
  card(CardName.DISTRACTION, 10, I, [special('zombieAdjacentToOpponent')], { gain: { sp: 1, np: 2 }, killZombie: { count: 1, requireAdjacentPlayer: true } }),
  card(CardName.DROPPED_CASH, 1, I, [], { gain: { gold: 8 } }),
  card(CardName.DROPPING_A_COURSE, 6, I, [niceP('>=', 6)], { gain: { np: 4 }, discardAllDrawSame: true }),
  card(CardName.DUMPSTER_DIVING, 6, I, [hand('>=', 5)], { gain: { sp: 1 }, discardAndDraw: { discard: 1, draw: 2 } }),

  // ── E ──────────────────────────────────────────────────────────────────────
  card(CardName.EMBARRASSMENT, 2, I, [and(niceP('>=', 3), cp('>=', 3))], { gain: { np: 3, cp: -2 } }),
  card(CardName.EMERGENCY_RETREAT, 9, P, [], { gain: { sp: 1 }, passive: { onEscapeMove: { moveSteps: 2 } } }),
  card(CardName.ENGINEERING_CLUB, 12, P, [and(sp('>=', 25), maxOwnTraps(0))], { gain: { sp: 2 }, passive: { trapEffectivenessBonus: 1, trapCostBonus: 2 } }),
  card(CardName.ENGINEERING_EXAM_KEY, 6, P, [cp('>=', 5)], { gain: { cp: 2 }, passive: { trapCostReduction: 1 } }),
  card(CardName.EXPERIMENT, 2, I, [and(sp('<=', 25), inRoom('science-lab'))], { gain: { sp: 1, gold: 8 } }),
  card(CardName.EXTRA_MOVEMENT, 1, I, [], { moveSteps: 2 }),

  // ── F ──────────────────────────────────────────────────────────────────────
  card(CardName.VISITING_FACULTY_ID, 6, P, [played(6)], { gain: { np: 2, cp: 2, sp: -2 }, passive: { cardPlayCostReduction: 2 } }),
  card(CardName.FIRST_AID_KIT, 13, I, [], { gain: { sp: 1, hp: 1 } }),
  card(CardName.FOOD_FIGHT, 13, I, [and(sp('>=', 20), inRoom('cafeteria'))], { gain: { sp: 3 }, gainGoldPerZombieInCurrentRoom: { perZombie: 4 } }),
  card(CardName.FREE_TRAP_PIECES, 9, I, [sp('<=', 20)], { placeFree: { trap: true } }),

  // ── G ──────────────────────────────────────────────────────────────────────
  card(CardName.GOOD_SCIENCE, 6, I, [inRoom('science-lab')], { gain: { np: 3 } }),
  card(CardName.GRAFFITI, 3, I, [inRoom('restrooms')], { gain: { sp: 1, cp: 1, np: 1 } }),
  card(CardName.GRAVE_ROBBER, 4, I, [special('atLeastOnePlayerDead')], { gain: { sp: 1 }, drawCards: 2 }),
  card(CardName.GYM_CLASS_HERO, 6, I, [niceP('>=', 6), special('jumpOverAnyTargetExists')], { gain: { np: 2 }, jumpOverAny: true }),
  card(CardName.ATHLETIC_FOOTWEAR, 8, P, [and(sp('>=', 20), inRoom('gymnasium'))], { gain: { sp: 1 }, passive: { movementCostInRoom: { room: 'gymnasium', reduction: 1 } } }),
  card(CardName.GYMNASTICS_TRAINING, 10, A, [sp('>=', 20)], { gain: { sp: 1, gold: 2 }, jumpOver: true }),

  // ── H ──────────────────────────────────────────────────────────────────────
  card(CardName.HALLWAY_HUSTLER, 8, P, [], { gain: { sp: 1 }, passive: { onBaitPlaced: { gold: 1 } } }),
  card(CardName.HALO_EFFECT, 10, P, [special('cpGtNp')], { gain: { cp: 1 }, passive: { onCPGainedOptional: { goldCost: 2, gain: { np: 1 } } } }),
  card(CardName.HEARTY_LUNCH, 2, I, [inRoom('cafeteria')], { gain: { np: 2 } }),
  card(CardName.HIDDEN_REPORT_CARD, 0, I, [], { discardForGold: { gold: 7 } }),
  card(CardName.HIRED_MUSCLE, 6, I, [sp('<=', 20), minTraps(1)], { gain: { sp: 1 }, trapRelocation: true }),
  card(CardName.HOLE_IN_THE_CEILING, 6, I, [cp('>=', 10)], { gain: { sp: 1, cp: 2 }, spawnZombiesPlayerChoice: 1 }),
  card(CardName.HOMERUN_BAT, 5, I, [adjZombie], { gain: { sp: 2 }, killZombie: { count: 1, requireAdjacentZombie: true } }),
  card(CardName.HONOR_ROLL, 8, I, [niceP('>=', 5)], { gain: { np: 4 } }),
  card(CardName.HYPNOTISM, 9, I, [special('noOwnTrapsOrBarricades')], { gain: { sp: 3 }, moveAnyZombieOneStep: true }),

  // ── I ──────────────────────────────────────────────────────────────────────
  card(CardName.IDENTITY_CRISIS, 4, I, [sp('>=', 25)], { removeAllOwnStructuresChoiceNPCP: true }),
  card(CardName.IN_MEMORY_OF, 1, I, [sp('>=', 25), notInRoom('gymnasium')], { roomKillAllZombies: { hpCost: 1, spPerKill: 1 } }),
  card(CardName.INFLUENCER, 5, P, [allPlayersMinBarricades(4)], { gain: { sp: 1 }, passive: { barricadeCrossRefund: 2 } }),
  card(CardName.IRON_WELDING, 12, P, [and(special('hasGP'), allPlayersMinBarricades(4))], { gain: { sp: 1, gp: -2 }, passive: { barricadeEffectivenessBonus: 1 } }),

  // ── L ──────────────────────────────────────────────────────────────────────
  card(CardName.LAB_ACCIDENT, 3, I, [inRoom('science-lab')], { gain: { cp: 2 } }),
  card(CardName.LAST_MEAL, 18, I, [hp('<=', 2)], { gain: { sp: 1, np: 1, cp: 1, hp: 1 } }),
  card(CardName.LATE_PAPER, 0, I, [niceP('>=', 4)], { gain: { sp: 1, np: -2 } }),
  card(CardName.LEFTOVER_LUNCH_TRAY, 6, I, [], { gain: { gp: 1 }, placeFree: { bait: true } }),
  card(CardName.WORN_LIBRARY_CARD, 5, P, [sp('<=', 20)], { gain: { np: 1, cp: 1, sp: -1 }, passive: { cardPlayCostReduction: 1 } }),
  card(CardName.LONG_JUMP, 10, I, [], { gain: { gp: 1 }, teleport: { radius: 3 } }),
  card(CardName.LOUDSPEAKER_ANNOUNCEMENT, 3, I, [trapInRoom('lobby')], { gain: { sp: 1, cp: 1, np: 1 } }),
  card(CardName.LUNCH_FROM_HOME, 7, I, [hp('<=', 3)], { gain: { hp: 1 } }),
  card(CardName.LUNCH_MONEY, 1, I, [adjacentOpponentMinGold(5)], { gain: { cp: 1 }, stealGoldFromAdjacent: { amount: 5 } }),
  card(CardName.LUNCH_TRAY, 4, I, [inRoom('cafeteria')], { gain: { np: 2, cp: 2 } }),

  // ── M ──────────────────────────────────────────────────────────────────────
  card(CardName.MAD_DASH, 5, I, [], { gain: { sp: 1 }, moveSteps: 3, moveStepsPayBarricades: true }),
  card(CardName.MAILROOM_CART, 12, I, [inRoom('lobby')], { gain: { sp: 1, gp: 1 }, teleportToRoom: { room: 'restrooms' } }),
  card(CardName.MENTAL_PREPARATION, 4, I, [adjZombie], { gain: { sp: 1, np: 1 } }),
  card(CardName.MERCY, 5, I, [], { gain: { np: 2 }, drawAndGiveToPlayer: { draw: 2, give: 2 } }),
  card(CardName.MISSING_HALLPASS, 7, I, [adjZombie], { gain: { sp: 1 }, moveAdjacentZombieToRoom: { room: 'principals-office' } }),
  card(CardName.MORNING_JOGGING_CLUB, 9, I, [niceP('>=', 8)], { gain: { np: 2 }, allPlayersGain: { hp: 1 } }),
  card(CardName.MOUTH_GUARD, 14, P, [], { gain: { sp: 1, np: 1 }, passive: { meleeCostReduction: 2 } }),
  card(CardName.MR_CLEAN, 2, I, [and(inRoom('janitors-closet'), niceP('>=', 5))], { gain: { np: 4 } }),
  card(CardName.MYSTERY_MEAT, 5, P, [minBaits(1)], { passive: { baitCostReduction: 2 } }),

  // ── N ──────────────────────────────────────────────────────────────────────
  card(CardName.NEWSPAPER_INTERVIEW, 12, I, [], { gain: { sp: 2 }, conditionalGold: { goldPerAdjacentPlayer: 8 } }),
  card(CardName.NICE_GUYS_FINISH_LAST, 6, I, [cp('>=', 4)], { gain: { sp: 1, cp: 1, np: -1 } }),
  card(CardName.NICE_REMOVAL, 6, I, [], { gain: { np: 2 }, killZombie: { count: 1 } }),
  card(CardName.NOBODY_SAW_THAT, 0, I, [cp('>=', 4)], { gain: { sp: 1, cp: -2 } }),
  card(CardName.NURSES_STATION, 14, I, [], { gain: { sp: 1, hp: 1 } }),

  // ── O ──────────────────────────────────────────────────────────────────────
  card(CardName.OLD_SANDWICH, 12, I, [hp('==', 1)], { gain: { sp: 2, hp: 1 } }),
  card(CardName.ONE_VS_ONE, 4, I, [and(inRoom('gymnasium'), noOpponentInRoom('gymnasium'))], { gain: { sp: 3 }, spawnZombies: 1 }),
  card(CardName.OOPS, 3, I, [cp('>=', 5), minTraps(1)], { gain: { cp: 2 }, destroy: { anyTrap: true } }),

  // ── P ──────────────────────────────────────────────────────────────────────
  card(CardName.PANIC_RUN, 6, I, [adjZombie], { gain: { sp: 1 }, moveSteps: 3 }),
  card(CardName.PARAMEDIC_KIT, 12, I, [], { gain: { hp: 1 }, drawCards: 2 }),
  card(CardName.PASSED_NOTE, 3, I, [], { drawCards: 3 }),
  card(CardName.PASSED_SHOP_CLASS, 10, P, [minOwnTraps(1)], { gain: { sp: 1, np: 1, cp: 1 }, passive: { trapCostReduction: 2 } }),
  card(CardName.PE_SHORTS, 4, I, [sp('<=', 15)], { gain: { sp: 1 }, drawCards: 1 }),
  card(CardName.PERMISSION_SLIP, 6, I, [and(niceP('>=', 5), inRoom('principals-office'))], { gain: { np: 4 } }),
  card(CardName.PHYSICAL_EXERCISE, 5, I, [sp('>=', 20)], { gain: { np: 2, cp: 2 }, drawCards: 1 }),
  card(CardName.PLAGIARISM, 10, I, [special('opponentBarricadeExists')], { gain: { cp: 3 }, replaceOpponentBarricade: true }),
  card(CardName.POCKET_TRAP, 10, I, [sp('<=', 17)], { placeFree: { trap: true } }),
  card(CardName.POPULARITY, 8, P, [], { gain: { cp: 1 }, passive: { barricadeCrossCostReduction: 1 } }),
  card(CardName.PRACTICAL_JOKE, 6, I, [and(cp('>=', 8), hp('==', 1), special('adjacentOpponentMinHP2'))], { gain: { cp: 3 }, stealHPFromAdjacent: true }),
  card(CardName.PRINCIPALS_SECRET, 16, I, [inRoom('principals-office')], { gain: { np: 2, cp: 2 }, teleportToRoom: { room: 'cafeteria' } }),
  card(CardName.PROTECTION_MONEY, 5, I, [cp('>=', 2)], { gain: { cp: 1, gold: 10 } }),

  // ── R ──────────────────────────────────────────────────────────────────────
  card(CardName.RECYCLED_BARRICADE, 2, I, [minOwnBarricades(2)], { gain: { gp: 1 } }),
  card(CardName.RECYCLING_CLUB, 4, I, [sp('<=', 20)], { gain: { np: 1, cp: 1 }, drawKeepFromTemp: { draw: 3, keep: 1 } }),
  card(CardName.REGRET, 4, I, [special('ownActiveTrapOrBarricade')], { gain: { sp: 1 }, destroy: { ownBarricadeOrTrap: true } }),
  card(CardName.RUNNING_JUMP, 3, I, [], { teleport: { radius: 3 } }),

  // ── S ──────────────────────────────────────────────────────────────────────
  card(CardName.SAVED_YOU_A_SEAT, 5, I, [cp('>=', 10)], { gain: { cp: 4 } }),
  card(CardName.SCIENCE_KIT, 3, I, [baitsInRoom('science-lab', 1)], { gain: { sp: 1 } }),
  card(CardName.SECRET_NOTES, 5, I, [inRoom('auditorium')], { gain: { gp: 1 }, drawCards: 3 }),
  card(CardName.SECRET_PASSAGE, 6, I, [inRoom('science-lab')], { gain: { sp: 1 }, teleportToRoom: { room: 'auditorium' } }),
  card(CardName.SELL_A_KIDNEY, 1, I, [], { gain: { gp: 2, sp: -1 } }),
  card(CardName.SELL_OUT, 6, I, [cp('>=', 4)], { gain: { gold: 20, cp: -3 } }),
  card(CardName.SENIOR_PRANK, 4, I, [cp('>=', 9)], { gain: { cp: 2 }, destroy: { anyTrap: true } }),
  card(CardName.SHOP_TEACHERS_PET, 8, P, [minOwnBarricades(3)], { gain: { np: 1 }, passive: { barricadeLimitBonus: 1 } }),
  card(CardName.SHUT_THAT_DOOR, 3, I, [], { placeFree: { barricade: true } }),
  card(CardName.SIDE_HUSTLE, 7, I, [sp('>=', 18)], { gain: { sp: 1, gp: 1 } }),
  card(CardName.SINCERE_THANKS, 5, I, [niceP('>=', 2)], { gain: { np: 1, gold: 10 } }),
  card(CardName.SKATEBOARD_ACCIDENT, 10, I, [cp('>=', 5)], { gain: { sp: 1, cp: 2 }, destroy: { anyBarricade: true } }),
  card(CardName.SKIPPING_LUNCH, 3, I, [], { gain: { np: 2 }, giveGoldToLowestSP: { amount: 5 } }),
  card(CardName.SNACK_TRACK, 8, I, [inRoom('cafeteria')], { gain: { sp: 2, hp: -1 }, teleportToRoom: { room: 'lobby' } }),
  card(CardName.SOCIAL_BLUR, 10, P, [special('npGtCp')], { gain: { np: 1 }, passive: { onNPGainedOptional: { goldCost: 2, gain: { cp: 1 } } } }),
  card(CardName.SPATIAL_SWAP, 8, I, [sp('>=', 22)], { gain: { sp: 2 }, spatialSwap: true }),
  card(CardName.SPLIT_UP, 1, I, [special('allPlayersInDifferentRooms')], { gain: { sp: 2 } }),
  card(CardName.SPOILED_MILK, 3, I, [and(cp('>=', 6), inRoom('cafeteria'))], { gain: { cp: 3 } }),
  card(CardName.SPONSORSHIP, 6, I, [cp('>=', 8)], { gain: { sp: 1, gp: 2 } }),
  card(CardName.SPOTTING_FOR_STRANGER, 3, I, [niceP('>=', 3)], { gain: { np: 1 }, drawCards: 1 }),
  card(CardName.STAYING_AWAKE, 5, I, [], { gain: { sp: 1 }, drawThenDiscard: { draw: 1, discard: 1 } }),
  card(CardName.STEM_CLUB, 12, P, [or(minOwnBarricades(1), minOwnTraps(1))], { gain: { sp: 2 }, passive: { barricadeCostReduction: 2, trapCostReduction: 2 } }),
  card(CardName.STOLEN_WALLET, 6, I, [cp('>=', 10)], { gain: { gold: 16 } }),
  card(CardName.STUDENT_DISCOUNT, 6, P, [niceP('>=', 3)], { gain: { sp: 1 }, passive: { baitCostReduction: 1 } }),
  card(CardName.STUDENT_OF_THE_MONTH, 4, I, [niceP('>=', 3)], { gain: { np: 2 } }),
  card(CardName.STUDY_GROUP, 6, I, [sp('>=', 21)], { gain: { sp: 1 }, drawCards: 2 }),

  // ── T ──────────────────────────────────────────────────────────────────────
  card(CardName.TAKING_A_BRIBE, 2, I, [niceP('>=', 3)], { gain: { gold: 12, np: -2 } }),
  card(CardName.TAKING_A_NAP, 2, I, [minOwnBarricades(2)], { gain: { sp: 2 } }),
  card(CardName.TALENT_SHOW, 8, I, [inRoom('auditorium')], { gain: { sp: 1, gp: 1 }, drawPerTrapInCurrentRoom: true }),
  card(CardName.TEACHERS_PET, 7, I, [niceP('>=', 10)], { gain: { np: 5 } }),
  card(CardName.TERMITE_DAMAGE, 2, P, [cp('>=', 8)], { gain: { cp: 2 }, passive: { opponentBarricadeEffectiveness: -1 } }),
  card(CardName.TERROR_SPRINT, 9, I, [], { teleportSameRowOrColumn: true }),
  card(CardName.THANK_YOU_NOTE, 4, I, [niceP('>=', 8)], { gain: { gold: 12 } }),
  card(CardName.THERAPY_GROUP, 11, P, [], { gain: { sp: 1 }, passive: { onDamageTaken: { sp: 1 } } }),
  card(CardName.THEY_JUST_KEEP_COMING, 12, I, [niceP('>=', 5)], { gain: { np: 1 }, placeFree: { barricade: true, barricadeCount: 2 } }),
  card(CardName.TIME_OUT, 8, I, [], { gain: { cp: 2 }, killZombie: { count: 1 } }),
  card(CardName.TOE_SOCKS, 14, P, [special('aloneInCurrentRoom')], { gain: { sp: 1 }, passive: { movementCostOutsideRoom: { room: 'gymnasium', reduction: 1 } } }),
  card(CardName.TOOLBELT, 7, P, [minOwnBarricades(1)], { gain: { sp: 1 }, passive: { barricadeCostReduction: 1 } }),
  card(CardName.TRANSFUSION, 2, I, [and(niceP('>=', 8), hp('>=', 2), special('adjacentPlayerAt1HP'))], { gain: { np: 3 }, giveHPtoAdjacent: { hpAmount: 1 } }),
  card(CardName.TRAP_FLEX, 6, I, [cp('>=', 6)], { gain: { cp: 2 }, placeFree: { trap: true } }),
  card(CardName.TRIPLE_JUMP, 6, I, [], { gain: { sp: 1 }, moveSteps: 3 }),

  // ── U ──────────────────────────────────────────────────────────────────────
  card(CardName.UNDER_THE_TABLE, 5, P, [special('activeBaitOnBoard')], { gain: { cp: 1 }, passive: { baitCostReduction: 1 } }),
  card(CardName.UNDERGROUND_PASSAGEWAY, 11, I, [inRoom('auditorium')], { gain: { sp: 1, np: 1, cp: 1 }, teleportToRoom: { room: 'janitors-closet' } }),

  // ── V ──────────────────────────────────────────────────────────────────────
  card(CardName.VALEDICTORIANS_NOTEBOOK, 10, P, [minOwnTraps(2)], { gain: { sp: 2 }, passive: { trapCostReduction: 2 } }),
  card(CardName.VENDING_MACHINE_SCAPES, 15, I, [hp('<=', 2)], { gain: { sp: 1, hp: 1 } }),

  // ── W ──────────────────────────────────────────────────────────────────────
  card(CardName.LUNCHLADY_HELPER, 12, P, [minBaits(2)], { gain: { np: 1, cp: 1 }, passive: { baitRadiusBonus: 1 } }),
  card(CardName.WALL_IT_OFF, 3, I, [minOwnBarricades(2)], { placeFree: { barricade: true } }),
  card(CardName.WAS_THAT_LOAD_BEARING, 6, I, [cp('>=', 3)], { gain: { cp: 2 }, destroy: { anyBarricade: true } }),
  card(CardName.WATER_COOLER, 5, I, [inRoom('lobby')], { gain: { hp: 1, sp: 1 } }),
  card(CardName.WELL_WORN_BOOK, 8, I, [inRoom('library')], { gain: { gold: 12 }, drawCards: 2 }),

  // ── Z ──────────────────────────────────────────────────────────────────────
  card(CardName.ZOMBIE_FLUSH, 9, I, [], { gain: { sp: 1 }, killZombie: { count: 1 } }),

  // ── Hero passives ──────────────────────────────────────────────────────────
  card(CardName.HERO_SCHADENFREUDE_PASSIVE, 0, P, [], { passive: { onDamageTaken: { cp: 1, gold: 2 } } }),
  card(CardName.HERO_BARRY_CADE_PASSIVE, 0, P, [], { passive: { allBarricadeEffectiveness: 1 } }),
  card(CardName.HERO_VON_TRAP_PASSIVE, 0, P, [], { passive: { trapLimitBonus: 1, trapCostReduction: 2 } }),
  card(CardName.HERO_BLOODTHIRSTER_PASSIVE, 0, P, [], { passive: {} }),
  card(CardName.HERO_SPOTTER_PASSIVE, 0, P, [], { passive: { movementCostReduction: 1 } }),
  card(CardName.HERO_BUNGLER_PASSIVE, 0, P, [], { passive: { allTrapEffectiveness: -1, allMeleeEffectiveness: -1 } }),
  card(CardName.HERO_ARCHY_TECT_PASSIVE, 0, P, [], { passive: { barricadeLimitBonus: 1, barricadeEffectivenessBonus: 1 } }),
  card(CardName.HERO_LOAN_WOLF_PASSIVE, 0, P, [], { passive: { onAnyDamageTakenGold: 4 } }),
  card(CardName.HERO_GYM_COACH_PASSIVE, 0, P, [], { passive: { allMeleeEffectiveness: 1 } }),

  // ── Locker item passives ────────────────────────────────────────────────────
  card(CardName.LOCKER_SHOES_PASSIVE, 0, P, [], { passive: { movementCostReduction: 1 } }),
  card(CardName.LOCKER_LEATHER_JACKET_PASSIVE, 0, P, [], { passive: { onCPGainedOptional: { goldCost: 0, gain: { gold: 2 } } } }),
  card(CardName.LOCKER_ROLLER_BACKPACK_PASSIVE, 0, P, [], { passive: { onNPGainedOptional: { goldCost: 0, gain: { gold: 2 } } } }),
  card(CardName.LOCKER_DOG_TAGS_PASSIVE, 0, P, [], { passive: { onAnyZombieKilledGold: 2 } }),
  card(CardName.LOCKER_CHILDS_TOOL_SET_PASSIVE, 0, P, [], { passive: { barricadeEffectivenessBonus: -1, onOwnBarricadeDestroyedDraw: 1 } }),
  card(CardName.LOCKER_DIRTY_GYM_SOCKS_PASSIVE, 0, P, [], { passive: { baitRadiusBonus: 2, baitCostBonus: 1 } }),
  card(CardName.LOCKER_SCOUT_TRAINING_PASSIVE, 0, P, [], { passive: { trapLimitBonus: -1, trapEffectivenessBonus: 1 } }),
  card(CardName.LOCKER_QUALITY_OVER_QUANTITY_PASSIVE, 0, P, [], { passive: { barricadeEffectivenessBonus: 1, barricadeLimitBonus: -1 } }),
  card(CardName.LOCKER_SHARPENED_STICK_PASSIVE, 0, P, [], { passive: { meleeEffectivenessBonus: 1 } }),
  card(CardName.LOCKER_GAS_LEAK_PASSIVE, 0, P, [], { passive: { allMeleeEffectiveness: -1 } }),
];
