<template>
  <div
    class="card"
    :class="[
      `card--${card.cardType}`,
      card.cardType === 'action' ? `card--${rewardCategory}` : '',
      card.isPlayable ? 'card--playable' : (card.requirementsMet ? 'card--cant-afford' : 'card--unplayable'),
      selected ? 'card--selected' : '',
    ]"
    :title="tooltipText"
    @click="$emit('card-clicked', card.name)"
  >
    <!-- Cost badge -->
    <div class="card__cost-badge">
      <span v-if="card.adjustedCost !== card.playCost" class="card__cost--adjusted">{{ card.adjustedCost }}</span>
      <span v-else>{{ card.playCost }}</span>
    </div>

    <!-- Type badge -->
    <div class="card__type-badge" :class="card.cardType === 'action' ? `badge--${rewardCategory}` : `badge--${card.cardType}`">
      {{ card.cardType.toUpperCase() }}
    </div>

    <!-- Card name (below badges) -->
    <div class="card__name">{{ formatName(card.name) }}</div>

    <!-- Reward icons (replaces art pane) -->
    <div class="card__rewards">
      <template v-if="rewardTokens.length">
        <span
          v-for="(rew, i) in rewardTokens"
          :key="i"
          class="card__rew-pill"
          :class="rew.cls"
        >{{ rew.label }}</span>
      </template>
      <span v-else class="card__rew-effect">{{ card.effectText }}</span>
    </div>

    <!-- Requirement at bottom in red -->
    <div v-if="card.requirementText" class="card__requirement" :class="card.isPlayable ? '' : 'card__requirement--unmet'">
      Req: {{ card.requirementText }}
    </div>
  </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import { CardModel } from '../../common/models/CardModel';

interface RewardToken { label: string; cls: string; }

export default Vue.extend({
  name: 'CardView',
  props: {
    card: { type: Object as PropType<CardModel>, required: true },
    selected: { type: Boolean, default: false },
  },
  computed: {
    tooltipText(): string {
      const parts: string[] = [];
      if (this.card.description) parts.push(this.card.description);
      if (this.card.bonusText) parts.push(`Bonus: ${this.card.bonusText}`);
      return parts.join('\n') || this.card.effectText;
    },
    rewardCategory(): string {
      const text = String(this.card.effectText || '').toUpperCase();
      if (text.includes(' CP') || text.includes(' VP') || text.includes('VILLAIN') || text.includes('COOL')) return 'cool';
      if (text.includes(' NP') || text.includes(' HP') || text.includes('HEAL') || text.includes('HEALTH') || text.includes('NICE')) return 'nice';
      return 'basic';
    },
    rewardTokens(): RewardToken[] {
      const tokens: RewardToken[] = [];
      const clsMap: Record<string, string> = {
        SP: 'rew--sp', NP: 'rew--np', CP: 'rew--cp',
        HP: 'rew--hp', GP: 'rew--gp',
      };

      const parseBonus = (raw: string) => {
        for (const part of raw.split(/[,;]/)) {
          const t = part.trim();
          if (!t || t.toLowerCase() === 'none') continue;

          // "N gold" / "+N gold"
          const goldM = t.match(/^([+-]?\d+)\s*gold$/i);
          if (goldM) {
            const n = parseInt(goldM[1]);
            tokens.push({ label: (n > 0 ? '+' : '') + n + ' gold', cls: 'rew--gold' });
            continue;
          }
          // "N GP" → GP matches above
          // Stat token: "N SP / NP / CP / HP / Health / GP"
          const statM = t.match(/^([+-]?\d+)\s*(SP|NP|CP|HP|HEALTH|GP)$/i);
          if (statM) {
            const n = parseInt(statM[1]);
            const stat = statM[2].toUpperCase().replace('HEALTH', 'HP');
            tokens.push({ label: (n > 0 ? '+' : '') + n + ' ' + stat, cls: clsMap[stat] || 'rew--misc' });
            continue;
          }
          // Fallback token (e.g. "Draw 2", "+2 Card")
          tokens.push({ label: t, cls: 'rew--misc' });
        }
      };

      parseBonus(String(this.card.bonusText || ''));

      // Also pick out patterns from effectText when bonus is absent
      if (!tokens.length) {
        const eff = String(this.card.effectText || '').toLowerCase();
        const drawM = eff.match(/draw\s+(\d+)\s+card/);
        if (drawM) tokens.push({ label: `Draw ${drawM[1]}`, cls: 'rew--draw' });
        const gainGoldM = eff.match(/gain\s+(\d+)\s+gold/);
        if (gainGoldM) tokens.push({ label: `+${gainGoldM[1]} gold`, cls: 'rew--gold' });
        const gainCpM = eff.match(/gain\s+(\d+)\s+cp/);
        if (gainCpM) tokens.push({ label: `+${gainCpM[1]} CP`, cls: 'rew--cp' });
        const gainNpM = eff.match(/gain\s+(\d+)\s+np/);
        if (gainNpM) tokens.push({ label: `+${gainNpM[1]} NP`, cls: 'rew--np' });
        const gainSpM = eff.match(/gain\s+(\d+)\s+sp/);
        if (gainSpM) tokens.push({ label: `+${gainSpM[1]} SP`, cls: 'rew--sp' });
        // "pay N gold to turn X SP into Y NP/CP" → show cost + conversion pills
        const convM = eff.match(/turn\s+(\d+)\s+(sp|np|cp)\s+into\s+(\d+)\s+(sp|np|cp|gold)/);
        if (convM) {
          const statLabel = (s: string) => s.toUpperCase();
          tokens.push({ label: `-${convM[1]} ${statLabel(convM[2])}`, cls: convM[2] === 'sp' ? 'rew--sp' : convM[2] === 'np' ? 'rew--np' : 'rew--cp' });
          tokens.push({ label: `+${convM[3]} ${statLabel(convM[4])}`, cls: convM[4] === 'sp' ? 'rew--sp' : convM[4] === 'np' ? 'rew--np' : convM[4] === 'cp' ? 'rew--cp' : 'rew--gold' });
          const payM = eff.match(/pay\s+(\d+)\s+gold/);
          if (payM) tokens.unshift({ label: `-${payM[1]} gold`, cls: 'rew--gold' });
        }
      }

      return tokens;
    },
  },
  methods: {
    formatName(name: string): string {
      return name
        .split('_')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    },
  },
});
</script>

<style scoped>
.card {
  position: relative;
  width: 165px;
  min-width: 165px;
  background: #1e1e2e;
  border: 1px solid #444;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.1s, box-shadow 0.1s, border-color 0.1s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-size: 11px;
  user-select: none;
  padding-top: 28px; /* room for absolute badges */
}
.card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.card--playable { border-color: #6a6a9a; }
.card--playable:hover {
  border-color: #a78bfa;
  box-shadow: 0 4px 12px rgba(167, 139, 250, 0.3);
}
.card--cant-afford { border-color: #6a6a9a; opacity: 0.72; cursor: not-allowed; }
.card--cant-afford .card__cost-badge { color: #ff7744; }
.card--cant-afford:hover { transform: none; box-shadow: none; }
.card--unplayable { opacity: 0.62; cursor: not-allowed; }
.card--unplayable:hover { transform: none; box-shadow: none; }
.card--selected {
  border-color: #4caf50 !important;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.5) !important;
  opacity: 1 !important;
}

/* Type-specific accent colors */
.card--instant              { border-top: 3px solid #39a05a; }
.card--action.card--nice    { border-top: 3px solid #c03030; }
.card--action.card--cool    { border-top: 3px solid #3060cc; }
.card--action.card--basic   { border-top: 3px solid #a0a0a0; }
.card--passive              { border-top: 3px solid #8e44ad; }

/* Cost badge */
.card__cost-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(0,0,0,0.7);
  color: #f0c060;
  font-weight: bold;
  font-size: 13px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
.card__cost--adjusted { color: #80ff80; }

/* Type badge */
.card__type-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 8px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: bold;
  z-index: 2;
}
.badge--instant     { background: #1a3a1a; color: #60c060; }
.badge--nice        { background: #3a1010; color: #e06060; }
.badge--cool        { background: #10103a; color: #6068e0; }
.badge--basic       { background: #2a2a2a; color: #c0c0c0; }
.badge--passive     { background: #4a1a6a; color: #c880f0; }

/* Card name */
.card__name {
  padding: 2px 6px 2px;
  font-weight: bold;
  font-size: 10px;
  color: #e0e0e0;
  line-height: 1.2;
  border-bottom: 1px solid #333;
  white-space: normal;
  word-break: break-word;
}

/* Reward icon area (replaces art pane) */
.card__rewards {
  padding: 5px 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  flex: 1;
}
.card__rew-pill {
  font-size: 9px;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: bold;
  white-space: nowrap;
}
.rew--sp   { background: #1a3a1a; color: #70c070; }
.rew--np   { background: #3a1010; color: #ff6677; }
.rew--cp   { background: #10103a; color: #5599ff; }
.rew--hp   { background: #3a1a1a; color: #ffbbcc; }
.rew--gp   { background: #2a2a00; color: #cccc22; }
.rew--gold { background: #3a2a00; color: #ffd700; }
.rew--draw { background: #082a3a; color: #aaddff; }
.rew--misc { background: #2a2a2a; color: #aaaaaa; font-style: italic; font-weight: normal; }
/* Fallback when no bonus tokens: show effect description */
.card__rew-effect {
  font-size: 8px;
  color: #888;
  line-height: 1.3;
  text-align: center;
  padding: 2px;
}

/* Requirement at bottom in red */
.card__requirement {
  padding: 2px 6px 5px;
  font-size: 9px;
  color: #c04040;
  font-style: italic;
  font-weight: bold;
  line-height: 1.2;
  border-top: 1px solid #2a2a2a;
}
.card__requirement--unmet { color: #ff4444; }
</style>
