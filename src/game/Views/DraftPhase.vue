<!-- DraftPhase.vue -->
<template>
  <div class="draft-phase" :class="compact ? 'draft-phase--compact' : 'draft-phase--full'" :style="rootStyle">
    <div class="draft-header">
      <div class="draft-title">Draft — Night {{ generation }}</div>
      <div class="draft-gold">{{ player.gold }}G available</div>
    </div>

    <div class="draft-body">
      <div class="draft-cards">
        <card-view
          v-for="card in draftCards"
          :key="card.id"
          :card="card"
          :selected="isSelected(card)"
          :compact="false"
          @card-clicked="toggle(card)"
        />
      </div>

      <div class="draft-footer">
        <div class="draft-cost" :class="canAfford ? 'cost-ok' : 'cost-over'">
          Total: {{ totalCost }} gold
          <span v-if="selectedCount > 0"> ({{ selectedCount }} card{{ selectedCount > 1 ? 's' : '' }})</span>
        </div>
        <button class="btn-purchase" :disabled="!canAfford" @click="$emit('confirm-draft')">
          Purchase ({{ selectedCount }})
        </button>
        <button class="btn-skip" @click="$emit('skip-draft')">
          Skip All
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import CardView from './CardView.vue';

const props = defineProps<{
  player: any;
  generation: number;
  draftCards: any[];
  costPerCard?: number;
  firstCardFree?: boolean;
  compact?: boolean;
}>();

const rootStyle = computed(() => props.compact
  ? {
      width: 'min(980px, calc(100vw - 24px))',
      maxWidth: '980px',
    }
  : {
      width: 'min(1280px, calc(100vw - 48px))',
      maxHeight: 'min(84vh, 860px)',
      overflow: 'auto',
    });

const emit = defineEmits<{
  (e: 'toggle-draft-card', card: any): void;
  (e: 'confirm-draft'): void;
  (e: 'skip-draft'): void;
}>();

const selectedCards = ref<any[]>([]);

const selectedCount = computed(() => selectedCards.value.length);

const totalCost = computed(() => {
  const count = selectedCards.value.length;
  const paid = props.firstCardFree ? Math.max(0, count - 1) : count;
  return paid * (props.costPerCard ?? 4);
});

const canAfford = computed(() => {
  return props.player.gold >= totalCost.value;
});

function isSelected(card: any): boolean {
  return selectedCards.value.some((c: any) => c.id === card.id);
}

function toggle(card: any): void {
  const idx = selectedCards.value.findIndex((c: any) => c.id === card.id);
  if (idx > -1) {
    selectedCards.value.splice(idx, 1);
  } else {
    selectedCards.value.push(card);
  }
  emit('toggle-draft-card', card);
}
</script>

<style scoped>
.draft-phase {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 12px;
  min-height: 120px;
  color: #e0e0e0;
  background: rgba(13, 13, 26, 0.96);
  border: 1px solid rgba(96, 165, 250, 0.5);
  border-radius: 10px 10px 0 0;
  box-shadow: 0 -10px 24px rgba(0, 0, 0, 0.4);
}

.draft-phase--full {
  width: min(1280px, calc(100vw - 48px));
  max-height: min(84vh, 860px);
  overflow: auto;
}

.draft-phase--compact {
  width: min(980px, calc(100vw - 24px));
  max-width: 980px;
}

.draft-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
  padding-bottom: 6px;
}

.draft-title {
  font-size: 14px;
  font-weight: bold;
  color: #3498db;
}

.draft-gold {
  font-size: 13px;
  color: #ffd700;
  font-weight: bold;
}

.draft-body {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.draft-cards {
  display: flex;
  flex: 1 1 auto;
  gap: 10px;
  justify-content: center;
  align-items: center;
  min-height: 70px;
  overflow: visible;
}

.draft-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.draft-cost {
  font-size: 13px;
  font-weight: bold;
  min-width: 110px;
  text-align: right;
}
.cost-ok { color: #4caf50; }
.cost-over { color: #e74c3c; }

.btn-purchase {
  padding: 6px 12px;
  background: #163016;
  border: 1px solid #4caf50;
  color: #4caf50;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}
.btn-purchase:hover:not(:disabled) { background: #22482a; }
.btn-purchase:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-skip {
  padding: 6px 12px;
  background: #2a2a2a;
  border: 1px solid #7a6020;
  color: #f39c12;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}
.btn-skip:hover { background: #3a3020; }
</style>