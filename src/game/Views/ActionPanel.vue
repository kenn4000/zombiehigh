<template>
  <div class="action-panel" v-if="phase === 'player_turn' || phase === 'placement'">
    <div v-if="combinedCards.length" class="combined-card-list">
      <div
        v-for="(card, index) in combinedCards"
        :key="card.id"
        class="card-slot"
        :class="{
          'card-slot--playable': card.type === 'special' || card.type === 'playable',
          'card-slot--unplayable': card.type === 'unplayable',
          'card-slot--selected': card.type === 'special' ? actionMode === card.actionId : selectedCardId === card.id,
        }"
        @click="onCombinedCardClick(card)"
      >
        <CardView
          :card="card"
          :compact="true"
          :selected="card.type === 'special' ? actionMode === card.actionId : selectedCardId === card.id"
          :is-playable="card.type !== 'unplayable'"
          :card-play-discount="cardPlayDiscount"
          :hover-edge="index === 0 ? 'left' : index === combinedCards.length - 1 ? 'right' : 'center'"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CardView from './CardView.vue';

const props = defineProps<{
  phase: string;
  isMyTurn: boolean;
  actionsRemaining: number;
  specialActions: any[];
  actionMode: string;
  playableCards?: any[];
  unplayableCards?: any[];
  cardPlayDiscount?: number;
  selectedCardId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'action-clicked', actionId: string, params?: any): void;
  (e: 'use-action'): void;
  (e: 'play-card', cardId: string): void;
  (e: 'card-selection-changed', cardId: string | null): void;
}>();

const selectedCardId = computed<string | null>({
  get: () => props.selectedCardId ?? null,
  set: (value: string | null) => emit('card-selection-changed', value),
});

const specialActionCards = computed(() => {
  return (props.specialActions || []).flatMap((action: any) => {
    if (action?.__kind === 'special-action' || action?._specialActionId) {
      return [{
        ...action,
        actionId: action._specialActionId ?? action.actionId,
        optionIndex: action._specialOptionIndex ?? action.optionIndex ?? 0,
        type: action.isPlayable === false ? 'unplayable' : 'special',
      }];
    }

    const options = Array.isArray(action.options) && action.options.length > 0 ? action.options : [null];
    return options.map((option: any, index: number) => {
      const actionName = action?.name || 'Special Action';
      const optionName = option?.name || actionName;
      const derivedBase = actionName
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)[0] || 'Special';

      return {
        id: `${action.id}__opt${index}`,
        cardId: `${action.id}__opt${index}`,
        name: optionName,
        description: option?.description || action?.description || '',
        cost: option?.goldCost ?? 0,
        image: option?.image || action?.image,
        targetType: option?.targetType || 'none',
        actionId: action.id,
        optionIndex: index,
        type: option?.isPlayable === false || action?.isPlayable === false ? 'unplayable' : 'special',
      };
    });
  });
});

const combinedCards = computed(() => {
  const cards: any[] = [];
  const seen = new Set<string>();

  for (const card of specialActionCards.value) {
    const key = `${card.actionId ?? card.id ?? 'special'}:${card.optionIndex ?? 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ ...card, isPlayable: card.isPlayable !== false });
  }

  for (const card of props.playableCards || []) {
    if (card?.__kind === 'special-action' || card?._specialActionId) continue;
    const key = `playable:${card.id ?? card.cardId ?? `${card.name ?? 'card'}:${Math.random()}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ ...card, type: 'playable', isPlayable: true });
  }

  for (const card of props.unplayableCards || []) {
    if (card?.__kind === 'special-action' || card?._specialActionId) continue;
    const key = `unplayable:${card.id ?? card.cardId ?? `${card.name ?? 'card'}:${Math.random()}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ ...card, type: 'unplayable', isPlayable: false });
  }

  return cards;
});

watch(() => combinedCards.value, (cards) => {
  if (!cards.some((card: any) => card.id === selectedCardId.value)) {
    selectedCardId.value = null;
  }
}, { deep: true });

function onPlayableCardClick(card: any): void {
  if (!props.isMyTurn) return;
  selectedCardId.value = card.id;
}

function onUnplayableCardClick(_card: any): void {
  selectedCardId.value = null;
}

function onCombinedCardClick(card: any): void {
  if (!card || props.phase !== 'player_turn' || !props.isMyTurn) return;

  if (card.type === 'unplayable') {
    onUnplayableCardClick(card);
    return;
  }

  if (card.type === 'special') {
    onSpecialActionCard(card);
    return;
  }

  onPlayableCardClick(card);
}

function onSpecialActionCard(card: any): void {
  if (!props.isMyTurn) return;
  selectedCardId.value = card.id;
}
</script>

<style scoped>
.action-panel {
  background: rgba(13, 13, 26, 0.9);
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding: 8px 12px 10px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.combined-card-list {
  display: flex;
  align-items: stretch;
  gap: 10px;
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 2px 8px;
  scrollbar-width: thin;
}

.card-slot {
  position: relative;
  z-index: 1;
  cursor: pointer;
  transition: transform 0.15s;
  flex: 0 0 auto;
}

.card-slot--playable:hover {
  transform: translateY(-2px);
}

.card-slot--unplayable {
  opacity: 0.55;
  cursor: not-allowed;
  filter: grayscale(0.6);
}

.card-slot .card {
  transform-origin: center bottom;
}

.play-card-bar {
  display: flex;
  justify-content: flex-end;
  padding-top: 2px;
}

.play-card-btn {
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid rgba(96, 165, 250, 0.8);
  background: linear-gradient(135deg, #1d4ed8, #7c3aed);
  color: white;
  font-weight: 700;
  font-size: 11px;
  cursor: pointer;
}

.play-card-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.card-slot .card--compact {
  width: 110px;
  min-width: 110px;
  font-size: 9px;
}

.card-slot .card--compact .card__cost-badge {
  width: 18px;
  height: 18px;
  font-size: 10px;
}

.card-slot .card--compact .card__name {
  font-size: 8px;
  padding: 1px 4px;
}

.card-slot .card--compact .card__rew-pill {
  font-size: 7px;
  padding: 1px 3px;
}
</style>