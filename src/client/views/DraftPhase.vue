<template>
  <div class="draft-phase">
    <div class="draft-title">Draft Phase — Night {{ generation }}</div>
    <div class="draft-subtitle">
      Select cards to purchase ({{ costPerCard }} gold each{{ firstCardFreeNightDraft ? ', first card free' : '' }}, {{ player.gold }} gold available).
    </div>

    <div class="draft-cards">
      <card-view
        v-for="c in player.temporaryHand"
        :key="c.name"
        :card="c"
        :selected="isSelected(c.name)"
        @card-clicked="toggle($event)"
      />
    </div>

    <div class="draft-footer">
      <div class="draft-cost" :class="canAfford ? 'cost-ok' : 'cost-over'">
        Total: {{ totalCost }} gold
        <span v-if="selectedCount > 0"> ({{ selectedCount }} card{{ selectedCount > 1 ? 's' : '' }})</span>
      </div>
      <button
        class="btn-purchase"
        :disabled="!canAfford"
        @click="$emit('confirm-draft')"
      >
        Purchase &amp; Continue
      </button>
      <button
        class="btn-skip"
        @click="$emit('skip-draft')"
      >
        Skip All
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import CardView from '../components/CardView.vue';
import { PlayerModel } from '../../common/models/PlayerModel';

export default Vue.extend({
  name: 'DraftPhase',
  components: { CardView },
  props: {
    player: { type: Object as PropType<PlayerModel>, required: true },
    generation: { type: Number, default: 1 },
    firstCardFreeNightDraft: { type: Boolean, default: false },
  },
  computed: {
    selectedCount(): number {
      return this.player.selectedDraftCards.length;
    },
    costPerCard(): number {
      return (this.player as any).draftCostPerCard ?? 4;
    },
    totalCost(): number {
      const count = this.player.selectedDraftCards.length;
      const paid = (this as any).firstCardFreeNightDraft ? Math.max(0, count - 1) : count;
      return paid * (this as any).costPerCard;
    },
    canAfford(): boolean {
      return this.player.gold >= (this.totalCost as number);
    },
  },
  methods: {
    isSelected(name: string): boolean {
      return this.player.selectedDraftCards.some(c => c.name === name);
    },
    toggle(name: string): void {
      this.$emit('toggle-draft-card', name);
    },
  },
});
</script>

<style scoped>
.draft-phase {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex: 1;
  color: #e0e0e0;
}
.draft-title {
  font-size: 16px;
  font-weight: bold;
  color: #3498db;
  border-bottom: 1px solid #333;
  padding-bottom: 6px;
}
.draft-subtitle {
  font-size: 12px;
  color: #888;
}
.draft-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.draft-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid #333;
  flex-wrap: wrap;
}
.draft-cost {
  font-size: 14px;
  font-weight: bold;
  min-width: 120px;
}
.cost-ok { color: #4caf50; }
.cost-over { color: #e74c3c; }
.btn-purchase {
  padding: 8px 20px;
  background: #163016;
  border: 1px solid #4caf50;
  color: #4caf50;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}
.btn-purchase:hover:not(:disabled) { background: #22482a; }
.btn-purchase:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-skip {
  padding: 8px 20px;
  background: #2a2a2a;
  border: 1px solid #7a6020;
  color: #f39c12;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}
.btn-skip:hover { background: #3a3020; }
</style>
