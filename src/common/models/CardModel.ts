import { CardName } from '../CardName';

export enum CardType {
  INSTANT = 'instant',
  ACTION = 'action',
  PASSIVE = 'passive',
}

export enum CardSubtype {
  GAME_DECK = 'game_deck',
  HERO = 'hero',
  LOCKER = 'locker',
}

export type CardModel = {
  name: CardName;
  playCost: number;
  adjustedCost: number;
  isPlayable: boolean;
  requirementsMet: boolean;
  cardType: CardType;
  cardSubtype: CardSubtype;
  requirementText: string;
  effectText: string;
  bonusText: string;
  description: string;
};
