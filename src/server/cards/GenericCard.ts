import { CardName } from '../../common/CardName';
import { CardType } from '../../common/models/CardModel';
import { Behavior, CardRequirementDescriptor } from './CardBehavior';
import { ICard } from './ICard';

/**
 * Phase 5: Simple card implementation backed by typed CardDefinition data.
 * Used for all cards that don't require a custom override class.
 */
export class GenericCard implements ICard {
  constructor(
    readonly name: CardName,
    readonly playCost: number,
    readonly cardType: CardType,
    readonly requirements: ReadonlyArray<CardRequirementDescriptor>,
    readonly behavior?: Behavior,
  ) {}
}
