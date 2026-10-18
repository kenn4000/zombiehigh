<template>
  <div class="player-stats-panel" v-if="player">
    <div class="stats-row">
      <div class="stat-item stat-health">
        <span class="stat-label">Health</span>
        <span class="stat-value" :class="{ 'health-low': player.currHealth <= 1 }">
          {{ player.currHealth }}/{{ player.maxHealth || 5 }}
        </span>
      </div>

      <div class="stat-item">
        <span class="stat-label">SP</span>
        <span class="stat-value">{{ player.currSP }}</span>
      </div>

      <div class="stat-item">
        <span class="stat-label">Gold</span>
        <span class="stat-value">{{ player.gold }}</span>
      </div>

      <div class="stat-item">
        <span class="stat-label">CP</span>
        <span class="stat-value">{{ player.currCP }}</span>
      </div>

      <div class="stat-item">
        <span class="stat-label">NP</span>
        <span class="stat-value">{{ player.currNP }}</span>
      </div>

      <div class="stat-item" v-if="player.currGP !== undefined">
        <span class="stat-label">GP</span>
        <span class="stat-value">{{ player.currGP }}</span>
      </div>

      <div class="stat-item stat-trap" v-if="player.trapCount !== undefined">
        <span class="stat-label">Traps</span>
        <span class="stat-value">{{ player.trapCount }}</span>
      </div>

      <div class="stat-item stat-wall" v-if="player.wallCount !== undefined">
        <span class="stat-label">Walls</span>
        <span class="stat-value">{{ player.wallCount }}</span>
      </div>

      <div class="stat-item stat-melee" v-if="player.meleeEfficiency !== undefined && player.meleeEfficiency !== 0">
        <span class="stat-label">Melee</span>
        <span class="stat-value">+{{ player.meleeEfficiency }}</span>
      </div>

      <div class="stat-item stat-passives" v-if="passiveSkills.length">
        <span class="stat-label">Passives</span>
        <span class="stat-value passive-list">
          <span v-for="(passive, i) in passiveSkills" :key="i" class="passive-tag">
            {{ passive }}
          </span>
        </span>
      </div>

      <div v-if="standardActions && standardActions.length" class="stats-actions">
        <button
          v-for="action in standardActions"
          :key="action.id"
          class="action-btn"
          :class="{ 'action-btn--active': actionMode === action.id }"
          :disabled="phase !== 'player_turn' || !action.canUse || !isMyTurn"
          @click="$emit('mode-changed', action.id)"
        >
          {{ action.label || action.name }}
        </button>
      </div>

      <button
        v-if="selectedCardId"
        class="action-btn action-btn--primary"
        :disabled="!isMyTurn || phase !== 'player_turn'"
        @click="$emit('play-card', selectedCardId)"
      >
        {{ isCardTargeting ? 'Cancel' : 'Play Card' }}
      </button>

      <div class="stat-item turn-indicator" v-if="turnPrompt" :style="playerColorStyle">
        <span class="blink">▶ {{ turnPrompt }}</span>
        <span class="actions-left" v-if="actionsRemaining !== undefined">{{ actionsRemaining }} left</span>
      </div>

      <button
        v-if="isMyTurn && phase === 'player_turn'"
        class="action-btn action-btn--pass"
        :disabled="!isMyTurn || phase !== 'player_turn'"
        @click="$emit('use-action')"
      >
        Pass
      </button>

      <button
        v-if="isMyTurn && phase === 'player_turn' && actionsRemaining === 1"
        class="action-btn action-btn--defer"
        @click="$emit('defer-turn')"
      >
        Defer
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  player: any;
  phase?: string;
  isMyTurn?: boolean;
  standardActions?: any[];
  actionMode?: string;
  actionsRemaining?: number;
  selectedCardId?: string | null;
  isCardTargeting?: boolean;
  turnPrompt?: string;
}>();

const emit = defineEmits<{
  (e: 'mode-changed', mode: string): void;
  (e: 'use-action'): void;
  (e: 'defer-turn'): void;
  (e: 'play-card', cardId: string): void;
}>();

const passiveSkills = computed(() => {
  if (!props.player?.passiveSkills) return [];
  return props.player.passiveSkills.map((p: any) =>
    typeof p === 'string' ? p : p.name || 'Unknown'
  );
});

const playerColorStyle = computed(() => ({
  '--player-color': props.player?.color || '#a78bfa',
}));
</script>

<style scoped>
.player-stats-panel {
  background: #14142a;
  border-bottom: 2px solid #2a2a4a;
  padding: 6px 16px;
  flex-shrink: 0;
  min-height: 40px;
  display: flex;
  align-items: center;
}

.stats-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  width: 100%;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #ccc;
  white-space: nowrap;
}

.stat-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9aa4bb;
}

.stat-icon {
  font-size: 14px;
  line-height: 1;
}

.stat-value {
  font-weight: 600;
  color: #e0e0e0;
}

.stats-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
}

.action-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #3b3b52;
  background: #1b1b2d;
  color: #dfe4ff;
  font-size: 11px;
  cursor: pointer;
}

.action-btn:hover:not(:disabled) {
  background: #2a2a42;
}

.action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.action-btn--active {
  border-color: #a78bfa;
  background: #2b1d4d;
  color: #d9c8ff;
}

.action-btn--primary {
  border-color: rgba(96, 165, 250, 0.8);
  background: linear-gradient(135deg, #1d4ed8, #7c3aed);
  color: white;
  font-weight: 700;
}

.action-btn--pass {
  border-color: #7a6020;
  color: #f9d57b;
  margin-left: auto;
}

.health-low {
  color: #e74c3c;
  animation: pulse 1s infinite;
}

.stat-trap .stat-value { color: #ff8844; }
.stat-wall .stat-value { color: #88aaff; }
.stat-melee .stat-value { color: #ff6666; }
.stat-passives .stat-value { color: #c084fc; }

.passive-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.passive-tag {
  background: #2a1a3a;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 11px;
  color: #c084fc;
  border: 1px solid #3a2a4a;
}

.turn-indicator {
  margin-left: auto;
  font-weight: bold;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.actions-left {
  font-size: 11px;
  color: var(--player-color);
  background: color-mix(in srgb, var(--player-color) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--player-color) 55%, transparent);
  border-radius: 999px;
  padding: 2px 8px;
}

.blink {
  animation: blink 1s infinite;
  color: #a78bfa;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>