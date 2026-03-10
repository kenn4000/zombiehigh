/**
 * LegacyCard: mirrors the Java Card class with string-based fields.
 * Used as the card type through Phases 3 & 4.
 * Phase 5 replaces this with fully-typed ICard implementations.
 */
export class LegacyCard {
  constructor(
    readonly name: string,
    readonly effect: string,
    readonly requirement: string,
    readonly bonus: string,
    readonly playCost: number,
    readonly description: string,
  ) {}
}
