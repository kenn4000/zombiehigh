import { CardName } from '../../common/CardName';
import { CardType } from '../../common/models/CardModel';
import { Behavior, CardRequirementDescriptor } from './CardBehavior';

/** Phase 5 typed card interface. */
export interface ICard {
  readonly name: CardName;
  readonly playCost: number;
  readonly cardType: CardType;
  readonly requirements: ReadonlyArray<CardRequirementDescriptor>;
  readonly behavior?: Behavior;
}
