<template>
  <div class="action-bar">
    <!-- ACTION phase buttons -->
    <template v-if="phase === 'action' && isMyTurn">
      <button
        v-for="mode in actionModes"
        :key="mode.value"
        :class="['btn', actionMode === mode.value ? 'btn--active' : '', mode.disabled ? 'btn--off' : '']"
        :disabled="mode.disabled"
        @click="$emit('mode-changed', mode.value)"
      >{{ mode.label }}</button>
      <button
        v-if="actionsRemaining === 1"
        class="btn btn--defer"
        @click="$emit('confirm-action', { type: 'defer' })"
      >Defer</button>
      <button class="btn btn--pass" @click="$emit('confirm-action', { type: 'confirm' })">Pass Turn</button>
    </template>

    <!-- ESCAPE phase: no mode needed, just click a hex -->
    <template v-else-if="phase === 'escape' && isMyTurn">
      <span class="phase-label escape">ESCAPE — click a highlighted hex to flee!</span>
    </template>

    <!-- PLACEMENT phase -->
    <template v-else-if="phase === 'placement' && isMyTurn">
      <span class="phase-label">Choose your starting tile — click a highlighted hex on the board.</span>
    </template>

    <!-- SETUP phase buttons -->
    <template v-else-if="phase === 'setup' && isMyTurn">
      <button class="btn" @click="$emit('confirm-action', { type: 'confirm' })">Confirm Selection</button>
      <button class="btn btn--start" @click="$emit('confirm-action', { type: 'start_game' })">Start Game</button>
    </template>

    <!-- DRAFTING phase buttons -->
    <template v-else-if="phase === 'drafting' && isMyTurn">
      <button class="btn" @click="$emit('confirm-action', { type: 'confirm' })">Confirm Draft</button>
      <button class="btn btn--skip" @click="$emit('confirm-action', { type: 'or_options', index: 0 })">Skip</button>
    </template>

    <!-- Waiting or spectator -->
    <template v-else>
      <span class="phase-label waiting">
        {{ phase === 'game_over' ? 'GAME OVER' : 'Waiting for other players...' }}
      </span>
    </template>
  </div>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
  name: 'ActionBar',
  props: {
    phase: { type: String, required: true },
    isMyTurn: { type: Boolean, default: false },
    actionMode: { type: String, default: 'NONE' },
    actionsRemaining: { type: Number, default: 3 },
    hasAdjacentZombie: { type: Boolean, default: false },
  },
  computed: {
    actionModes(): Array<{ value: string; label: string; disabled: boolean }> {
      return [
        { value: 'M', label: 'Move',      disabled: false },
        { value: 'T', label: 'Trap',      disabled: false },
        { value: 'B', label: 'Bait',      disabled: false },
        { value: 'W', label: 'Wall',      disabled: false },
        { value: 'A', label: '⚔ Attack', disabled: !this.hasAdjacentZombie },
      ];
    },
  },
});
</script>

<style scoped>
.action-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 16px;
  background: #16213e;
  border-top: 1px solid #333;
  flex-wrap: wrap;
}
.btn {
  padding: 8px 16px;
  border: 1px solid #555;
  background: #2a2a4a;
  color: #e0e0e0;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  transition: background 0.15s;
}
.btn:hover { background: #3a3a6a; }
.btn--active { background: #4a4a8a; border-color: #a78bfa; color: #a78bfa; }
.btn--off { opacity: 0.35; cursor: not-allowed; }
.btn--off:hover { background: #2a2a4a; }
.btn--defer { border-color: #f39c12; color: #f39c12; }
.btn--defer:hover { background: #3d2a0f; }
.btn--pass { margin-left: auto; border-color: #e74c3c; color: #e74c3c; }
.btn--pass:hover { background: #3d1f1f; }
.btn--start { border-color: #4caf50; color: #4caf50; }
.btn--start:hover { background: #1f3d1f; }
.btn--skip { border-color: #f39c12; color: #f39c12; }
.phase-label { color: #888; font-size: 14px; }
.phase-label.escape { color: #e74c3c; font-weight: bold; }
.phase-label.waiting { color: #888; }
</style>
