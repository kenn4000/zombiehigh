<template>
  <div class="action-bar">

    <!-- ACTION phase: square button grid -->
    <template v-if="phase === 'action' && isMyTurn">
      <div class="sq-grid">
        <!-- Core mode buttons -->
        <button
          v-for="mode in actionModes"
          :key="mode.value"
          :class="['sq-btn', actionMode === mode.value ? 'sq-btn--active' : '', mode.disabled ? 'sq-btn--dim' : '']"
          :title="mode.label + (mode.cost != null ? ' (' + mode.cost + 'g)' : '')"
          @click="$emit('mode-changed', mode.value)"
        >
          <span class="sq-label">{{ mode.label }}</span>
          <span v-if="mode.cost != null" class="sq-cost">{{ mode.cost }}g</span>
        </button>

        <!-- Divider before action cards -->
        <div v-if="activeActions.length > 0" class="sq-divider"></div>

        <!-- Hero / locker action cards -->
        <button
          v-for="card in activeActions"
          :key="card.name"
          :class="['sq-btn', actionCardClass(card)]"
          :title="cardTitle(card)"
          @click="onActionCardClick(card.name)"
        >
          <span class="sq-label">{{ stripTag(card.name) }}</span>
          <span v-if="card.adjustedCost > 0" class="sq-cost">{{ card.adjustedCost }}g</span>
          <span v-if="isCardUsed(card)" class="sq-used-tag">Used</span>
        </button>
      </div>

      <!-- Control buttons (right-aligned) -->
      <div class="bar-controls">
        <button
          v-if="actionsRemaining === 1"
          class="ctrl-btn ctrl-btn--defer"
          @click="$emit('confirm-action', { type: 'defer' })"
        >Defer</button>
        <button class="ctrl-btn ctrl-btn--pass" @click="$emit('confirm-action', { type: 'confirm' })">Pass Turn</button>
      </div>
    </template>

    <!-- ESCAPE phase -->
    <template v-else-if="phase === 'escape' && isMyTurn">
      <span class="phase-label escape">ESCAPE — click a highlighted hex to flee!</span>
    </template>

    <!-- PLACEMENT phase -->
    <template v-else-if="phase === 'placement' && isMyTurn">
      <div class="placement-prompt">
        <span class="placement-icon">📍</span>
        <span class="placement-text">Pick your starting position — click a highlighted tile on the board</span>
      </div>
    </template>

    <!-- SETUP phase -->
    <template v-else-if="phase === 'setup' && isMyTurn">
      <button class="ctrl-btn" @click="$emit('confirm-action', { type: 'confirm' })">Confirm Selection</button>
      <button class="ctrl-btn ctrl-btn--start" @click="$emit('confirm-action', { type: 'start_game' })">Start Game</button>
    </template>

    <!-- DRAFTING phase -->
    <template v-else-if="phase === 'drafting' && isMyTurn">
      <button class="ctrl-btn" @click="$emit('confirm-action', { type: 'confirm' })">Confirm Draft</button>
      <button class="ctrl-btn ctrl-btn--skip" @click="$emit('confirm-action', { type: 'or_options', index: 0 })">Skip</button>
    </template>

    <!-- Waiting / spectator -->
    <template v-else>
      <span class="phase-label waiting">
        {{ phase === 'game_over' ? 'GAME OVER' : 'Waiting for other players...' }}
      </span>
    </template>

  </div>
</template>

<script lang="ts">
import Vue, { PropType } from 'vue';
import { CardModel } from '../../common/models/CardModel';

export default Vue.extend({
  name: 'ActionBar',
  props: {
    phase: { type: String, required: true },
    isMyTurn: { type: Boolean, default: false },
    actionMode: { type: String, default: 'NONE' },
    actionsRemaining: { type: Number, default: 3 },
    hasAdjacentZombie: { type: Boolean, default: false },
    trapCost: { type: Number, default: 16 },
    baitCost: { type: Number, default: 5 },
    barricadeCost: { type: Number, default: 10 },
    meleeCost: { type: Number, default: 1 },
    moveCost: { type: Number, default: 3 },
    activeActions: { type: Array as PropType<CardModel[]>, default: () => [] },
    usedActionNames: { type: Array as PropType<string[]>, default: () => [] },
    hasStartingAction: { type: Boolean, default: false },
  },
  computed: {
    actionModes(): Array<{ value: string; label: string; cost: number | null; disabled: boolean }> {
      return [
        { value: 'M', label: 'Move',      cost: this.moveCost,       disabled: false },
        { value: 'T', label: 'Trap',      cost: this.trapCost,       disabled: false },
        { value: 'B', label: 'Bait',      cost: this.baitCost,       disabled: false },
        { value: 'W', label: 'Barricade', cost: this.barricadeCost,  disabled: false },
        { value: 'A', label: 'Melee',     cost: this.meleeCost,      disabled: !this.hasAdjacentZombie },
      ];
    },
  },
  methods: {
    stripTag(name: string): string {
      return name
        .replace(/\s*\(Starting Action\)\s*$/, ' ★')
        .replace(/\s*\[N\]\s*$/, ' (N)')
        .replace(/\s*\[C\]\s*$/, ' (C)');
    },
    cardTitle(card: CardModel): string {
      const req = card.requirementText && card.requirementText !== 'None' ? card.requirementText + '\n' : '';
      return req + card.effectText;
    },
    isCardUsed(card: CardModel): boolean {
      const used = (this.usedActionNames as string[]).includes(card.name);
      const blockedByStart = !card.name.includes('(Starting Action)') && (this.hasStartingAction as boolean);
      return used || blockedByStart;
    },
    actionCardClass(card: CardModel): Record<string, boolean> {
      const used = this.isCardUsed(card);
      return {
        'sq-btn--used':     used,
        'sq-btn--starting': card.name.includes('(Starting Action)'),
        'sq-btn--n':        card.name.endsWith(' [N]'),
        'sq-btn--c':        card.name.endsWith(' [C]'),
      };
    },
    onActionCardClick(cardName: string): void {
      const card = (this.activeActions as CardModel[]).find(c => c.name === cardName);
      if (!card || this.isCardUsed(card)) return;
      this.$emit('activate-action', cardName);
    },
  },
});
</script>

<style scoped>
.action-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #16213e;
  border-top: 1px solid #333;
  flex-wrap: wrap;
  min-height: 58px;
}

/* Square button grid */
.sq-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  flex: 1;
}
.sq-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 70px;
  height: 60px;
  border: 1px solid #555;
  background: #2a2a4a;
  color: #e0e0e0;
  cursor: pointer;
  border-radius: 6px;
  font-size: 12px;
  transition: background 0.15s, opacity 0.15s;
  gap: 3px;
  padding: 4px;
  flex-shrink: 0;
}
.sq-btn:hover:not(.sq-btn--dim):not(.sq-btn--used) { background: #3a3a6a; }
.sq-btn--active { background: #4a4a8a; border-color: #a78bfa; color: #a78bfa; }
.sq-btn--dim { opacity: 0.3; cursor: not-allowed; }
.sq-btn--used { opacity: 0.22; cursor: default; pointer-events: none; }
.sq-btn--n  { border-color: #7eb8f7; }
.sq-btn--c  { border-color: #f77eb8; }
.sq-btn--starting { border-color: #7ef7a8; background: #1a2e1a; }

.sq-label {
  font-size: 12px;
  line-height: 1.2;
  text-align: center;
  word-break: break-word;
  max-width: 100%;
}
.sq-cost {
  font-size: 11px;
  color: #f0c040;
  font-weight: bold;
  line-height: 1;
}
.sq-btn--active .sq-label { color: #c4b0fa; }
.sq-btn--active .sq-cost  { color: #f0e060; }
.sq-used-tag {
  font-size: 9px;
  color: #666;
  margin-top: 1px;
}

.sq-divider {
  width: 1px;
  height: 48px;
  background: #444;
  margin: 0 3px;
  flex-shrink: 0;
}

/* Control buttons (Defer / Pass Turn etc.) */
.bar-controls {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}
.ctrl-btn {
  padding: 8px 14px;
  border: 1px solid #555;
  background: #2a2a4a;
  color: #e0e0e0;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  transition: background 0.15s;
  white-space: nowrap;
}
.ctrl-btn:hover { background: #3a3a6a; }
.ctrl-btn--defer { border-color: #f39c12; color: #f39c12; }
.ctrl-btn--defer:hover { background: #3d2a0f; }
.ctrl-btn--pass { border-color: #e74c3c; color: #e74c3c; }
.ctrl-btn--pass:hover { background: #3d1f1f; }
.ctrl-btn--start { border-color: #4caf50; color: #4caf50; }
.ctrl-btn--start:hover { background: #1f3d1f; }
.ctrl-btn--skip { border-color: #f39c12; color: #f39c12; }

/* Phase labels */
.phase-label { color: #888; font-size: 14px; }
.phase-label.escape { color: #e74c3c; font-weight: bold; }
.phase-label.waiting { color: #888; }

/* Placement prompt */
.placement-prompt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  background: #1a3a2a;
  border: 1px solid #4caf50;
  border-radius: 6px;
  animation: pulse-border 1.5s ease-in-out infinite;
}
.placement-icon { font-size: 22px; }
.placement-text {
  color: #7de8a0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
}
@keyframes pulse-border {
  0%, 100% { border-color: #4caf50; box-shadow: 0 0 0 0 rgba(76,175,80,0); }
  50%       { border-color: #81c784; box-shadow: 0 0 8px 2px rgba(76,175,80,0.35); }
}
</style>
