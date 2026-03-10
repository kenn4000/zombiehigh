import { LegacyCard } from './cards/LegacyCard';
import { Player } from './Player';
import { Board } from './Board';
import { HexCoordinate } from '../common/HexCoordinate';

/**
 * LegacyCardProcessor: bridges Phase 3/4 by providing basic card
 * requirement checks and bonus parsing from the Java string-based system.
 * Phase 5 replaces this entirely with typed BehaviorExecutor + RequirementEvaluator.
 */
export class LegacyCardProcessor {
  constructor(
    private readonly board: Board,
    private readonly players: Player[],
    private readonly zombies: { position: HexCoordinate; isAlive: boolean }[],
  ) { }

  canCardBePlayedNow(p: Player, card: LegacyCard): boolean {
    if (p.gold < card.playCost) return false;
    return this.meetsRequirement(p, card);
  }

  meetsRequirement(p: Player, card: LegacyCard): boolean {
    const req = (card.requirement ?? '').trim();
    if (!req || req === 'None' || req === 'none') return true;

    const lower = req.toLowerCase();

    // SP comparisons
    if (/sp\s*>\s*(\d+)/i.test(req)) {
      const m = req.match(/sp\s*>\s*(\d+)/i);
      return m ? p.survivalPoints > parseInt(m[1]) : true;
    }
    if (/sp\s*>=\s*(\d+)/i.test(req)) {
      const m = req.match(/sp\s*>=\s*(\d+)/i);
      return m ? p.survivalPoints >= parseInt(m[1]) : true;
    }
    if (/sp\s*<\s*(\d+)/i.test(req)) {
      const m = req.match(/sp\s*<\s*(\d+)/i);
      return m ? p.survivalPoints < parseInt(m[1]) : true;
    }
    if (/sp\s*<=\s*(\d+)/i.test(req)) {
      const m = req.match(/sp\s*<=\s*(\d+)/i);
      return m ? p.survivalPoints <= parseInt(m[1]) : true;
    }

    // HP comparisons
    if (/hp\s*>=\s*(\d+)/i.test(req)) {
      const m = req.match(/hp\s*>=\s*(\d+)/i);
      return m ? p.hitPoints >= parseInt(m[1]) : true;
    }
    if (/hp\s*<=\s*(\d+)/i.test(req)) {
      const m = req.match(/hp\s*<=\s*(\d+)/i);
      return m ? p.hitPoints <= parseInt(m[1]) : true;
    }
    if (/hp\s*>\s*(\d+)/i.test(req)) {
      const m = req.match(/hp\s*>\s*(\d+)/i);
      return m ? p.hitPoints > parseInt(m[1]) : true;
    }
    if (/have\s+1\s+health|exactly\s+1\s+health/i.test(req)) {
      return p.hitPoints === 1;
    }

    // VP comparisons
    if (/vp\s*>=\s*(\d+)/i.test(req)) {
      const m = req.match(/vp\s*>=\s*(\d+)/i);
      return m ? p.coolPoints >= parseInt(m[1]) : true;
    }
    if (/vp\s*>\s*(\d+)/i.test(req)) {
      const m = req.match(/vp\s*>\s*(\d+)/i);
      return m ? p.coolPoints > parseInt(m[1]) : true;
    }

    // Hand size
    if (/hand\s*<=\s*(\d+)|(\d+)\s*cards?\s*in\s*hand/i.test(req)) {
      const m = req.match(/(?:hand\s*<=\s*|^)(\d+)/i);
      return m ? p.cardsInHand.length <= parseInt(m[1]) : true;
    }
    if (/0\s*cards?\s*in\s*hand/i.test(req)) return p.cardsInHand.length === 0;

    // Board checks
    if (lower.includes('zombie adjacent') || lower.includes('zombie in adjacent')) {
      const neighbors = this.board.getNeighbors(p.position);
      return neighbors.some(n => this.zombies.some(z => z.isAlive && z.position.equals(n)));
    }
    if (lower.includes('adjacent to player')) {
      const neighbors = this.board.getNeighbors(p.position);
      return neighbors.some(n => this.players.some(other => other.id !== p.id && other.isAlive && other.position.equals(n)));
    }
    if (/(\d+)\+?\s*active\s*barricades?/i.test(req)) {
      const m = req.match(/(\d+)\+?\s*active\s*barricades?/i);
      const count = this.board.getBarricades().size;
      return m ? count >= parseInt(m[1]) : true;
    }
    if (/(\d+)\+?\s*board\s*barricades?/i.test(req)) {
      const m = req.match(/(\d+)\+?\s*board\s*barricades?/i);
      const count = this.board.getBarricades().size;
      return m ? count >= parseInt(m[1]) : true;
    }
    if (/(\d+)\+?\s*active\s*traps?/i.test(req)) {
      const m = req.match(/(\d+)\+?\s*active\s*traps?/i);
      const count = this.board.getTraps().size;
      return m ? count >= parseInt(m[1]) : true;
    }
    if (lower.includes('active bait')) {
      return this.board.getBaits().size > 0;
    }
    if (lower.includes('opponent bait')) {
      for (const [, ownerId] of this.board.getBaits()) {
        if (ownerId !== p.id) return true;
      }
      return false;
    }
    if (lower.includes('opponent barricade')) {
      for (const [, bar] of this.board.getBarricades()) {
        if (bar.ownerId !== p.id) return true;
      }
      return false;
    }
    if (lower.includes('at least one player dead')) {
      return this.players.some(other => !other.isAlive);
    }
    if (lower.includes('player lowest sp')) {
      const aliveSPs = this.players.filter(pl => pl.isAlive).map(pl => pl.survivalPoints);
      return p.survivalPoints === Math.min(...aliveSPs);
    }
    if (lower.includes('hp > vp')) {
      return p.hitPoints > p.coolPoints;
    }
    if (lower.includes('vp > hp')) {
      return p.coolPoints > p.hitPoints;
    }

    // Default: assume met
    return true;
  }

  /**
   * Play a card: deducts cost, applies bonus.
   * Returns true if played successfully.
   */
  playCard(p: Player, card: LegacyCard, log: (msg: string) => void): boolean {
    if (!this.canCardBePlayedNow(p, card)) return false;

    p.spendGold(card.playCost);
    this.parseAndApplyBonus(p, card.bonus);

    // Move card from hand to appropriate list based on type
    const eff = (card.effect ?? '').toLowerCase();
    p.cardsInHand = p.cardsInHand.filter(c => c !== card);

    if (eff.startsWith('passive:')) {
      p.activePassives.push(card);
    } else if (eff.startsWith('action:')) {
      p.activeActions.push(card);
    } else {
      p.playedCards.push(card);
      // Effect execution is stubbed here; Phase 5 will handle this fully.
      this.executeEffect(p, card, log);
    }

    return true;
  }

  parseAndApplyBonus(p: Player, bonus: string): void {
    if (!bonus || bonus === 'None' || bonus === 'none') return;

    // Handle multiple bonuses separated by commas or semicolons
    const parts = bonus.split(/[,;]/);
    for (const part of parts) {
      this.applyOneBonusToken(p, part.trim());
    }
  }

  private applyOneBonusToken(p: Player, token: string): void {
    if (!token) return;

    // Gold
    const goldMatch = token.match(/([+-]?\d+)\s*gold/i);
    if (goldMatch) { p.addGold(parseInt(goldMatch[1])); return; }

    // +N SP / -N SP
    const spMatch = token.match(/([+-]?\d+)\s*SP/i);
    if (spMatch) { p.addSurvivalPoints(parseInt(spMatch[1])); return; }

    // +N HP / -N HP
    const hpMatch = token.match(/([+-]?\d+)\s*HP/i);
    if (hpMatch) { p.addHealth(parseInt(hpMatch[1])); return; }

    // +N VP / -N VP
    const vpMatch = token.match(/([+-]?\d+)\s*VP/i);
    if (vpMatch) { p.addCoolPoints(parseInt(vpMatch[1])); return; }

    // +N GP / -N GP
    const gpMatch = token.match(/([+-]?\d+)\s*GP/i);
    if (gpMatch) { p.goldProduction += parseInt(gpMatch[1]); return; }
  }

  private executeEffect(_p: Player, card: LegacyCard, log: (msg: string) => void): void {
    // Stub: Phase 5 will provide full typed execution.
    const eff = (card.effect ?? '').trim();
    if (eff && eff !== 'None') {
      log(`[Stub] Effect not yet fully implemented: ${eff}`);
    }
  }
}
