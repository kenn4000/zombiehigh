<template>
  <div class="game-setup">
    <div class="setup-banner">{{ setupTitle }}</div>

    <div class="setup-layout">
      <div class="setup-column setup-column--hero" v-if="showHeroSelection">
        <div class="setup-section">
          <div class="option-grid option-grid--hero">
            <CardView
              v-for="(hero, index) in heroOptions"
              :key="hero.id"
              :class="`setup-slot-hero-${index + 1}`"
              :card="{ ...hero, image: hero.image || hero.id + '.png', id: hero.id, name: hero.name, cost: hero.cost || 0 }"
              :selected="selectedHero === hero.id"
              :layout="'landscape'"
              :compact="false"
              @card-clicked="$emit('select-hero', hero.id)"
            />
          </div>
        </div>
      </div>

      <div class="setup-column setup-column--locker" v-if="showLockerSelection">
        <div class="setup-section">
          <div class="option-grid option-grid--locker">
            <CardView
              v-for="(locker, index) in lockerOptions"
              :key="locker.id"
              :class="`setup-slot-locker-${index + 1}`"
              :card="{ ...locker, image: locker.image || locker.id + '.jpg', id: locker.id, name: locker.name, cost: 0 }"
              :selected="isLockerSelected(locker.id)"
              :layout="'portrait'"
              :compact="false"
              @card-clicked="$emit('toggle-locker', locker.id)"
            />
          </div>
        </div>
      </div>

      <div class="setup-column setup-column--cards" v-if="showStartingCards">
        <div class="setup-section">
          <div class="card-option-row">
            <CardView
              v-for="(card, index) in startingCardOptions"
              :key="card.id"
              :class="`setup-slot-card-${index + 1}`"
              :card="card"
              :selected="isCardSelected(card)"
              :layout="'portrait'"
              @card-clicked="$emit('toggle-starting-card', card)"
            />
          </div>
          <div class="setup-actions">
            <button class="btn-confirm" :disabled="!purchaseReady || player.setupLockedIn" @click="$emit('confirm-setup')">
              {{ player.setupLockedIn ? 'Locked In' : 'Lock In Setup' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CardView from './CardView.vue';
import { AllSpecialActions, HeroId, getHeroData } from '../index';

const props = defineProps<{
  player: any;
  allPlayers: any[];
  phase: string;
  heroOptions: any[];
  lockerOptions: any[];
  startingCardOptions: any[];
}>();

const emit = defineEmits([
  'select-hero',
  'toggle-locker',
  'confirm-hero',
  'confirm-locker',
  'toggle-starting-card',
  'confirm-setup',
  'skip-starting-cards'
]);

const selectedHero = computed(() => {
  const player = props.player as any;
  return player?.tempHeroId ?? player?.heroId ?? null;
});
const selectedLockers = computed(() => {
  const player = props.player as any;
  return player?.tempSelectedLockers ?? player?._selectedLockers ?? [];
});
const selectedCards = computed(() => (props.player as any)._selectedStartingCards || (props.player as any).tempSelectedStartingCards || []);

const canConfirmHero = computed(() => !!selectedHero.value);
const canConfirmLocker = computed(() => selectedLockers.value.length === 1);
const showHeroSelection = computed(() => ['hero_selection', 'locker_selection', 'card_purchase'].includes(props.phase));
const showLockerSelection = computed(() => ['hero_selection', 'locker_selection', 'card_purchase'].includes(props.phase));
const showStartingCards = computed(() => ['hero_selection', 'locker_selection', 'card_purchase'].includes(props.phase));

const setupTitle = computed(() => {
  return `Select 1 Hero, 1 Locker Card, and your Starting Cards (Gold Remaining: ${previewGold.value}G)`;
});

const previewHeroGold = computed(() => {
  const player = props.player as any;
  const heroId = selectedHero.value ?? player?.heroId;
  if (!heroId) return 0;
  const hero = getHeroData(heroId as HeroId);
  return hero?.startingGold ?? player?.gold ?? 0;
});

const previewLockerGold = computed(() => {
  const player = props.player as any;
  if (!player) return 0;
  const validIds = selectedLockers.value;
  if (!validIds.length) return 0;
  const sourceList = player.availableLockers || [];
  return validIds.reduce((total: number, lockerId: string) => {
    const locker = sourceList.find((entry: any) => entry.id === lockerId);
    return total + (locker?.startingBonus?.gold ?? 0);
  }, 0);
});

const previewGoldBase = computed(() => {
  const player = props.player as any;
  if (!player) return 0;
  return previewHeroGold.value + previewLockerGold.value || player.gold || 0;
});

const totalCost = computed(() => {
  const player = props.player as any;
  const heroId = selectedHero.value ?? player?.heroId;
  if (heroId === HeroId.DOROTHY_DECKARD || heroId === 'card_shark') return 0;
  return selectedCards.value.length * 4;
});

const previewGold = computed(() => {
  const player = props.player as any;
  if (!player) return 0;
  return previewGoldBase.value - totalCost.value;
});

const canAfford = computed(() => {
  const player = props.player as any;
  if (!player) return false;
  const heroId = selectedHero.value ?? player?.heroId;
  if (heroId === HeroId.DOROTHY_DECKARD || heroId === 'card_shark') return true;
  return previewGoldBase.value >= totalCost.value;
});

const purchaseReady = computed(() => {
  const player = props.player as any;
  if (!player) return false;
  const heroChosen = !!selectedHero.value || !!player.heroId;
  const lockerChosen = selectedLockers.value.length === 1;
  return heroChosen && lockerChosen && canAfford.value;
});

function isLockerSelected(id: string): boolean {
  return selectedLockers.value.includes(id);
}

function isCardSelected(card: any): boolean {
  return selectedCards.value.some((c: any) => c.id === card.id);
}

function getActionName(actionId: string): string {
  const action = AllSpecialActions[actionId];
  return action ? action.name : actionId;
}
</script>

<style scoped>
.game-setup { padding: 16px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; flex: 1 1 auto; height: 100%; min-height: 100%; color: #e0e0e0; }
.setup-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 10px 18px;
  border-bottom: 1px solid #333;
  color: #dfe7ff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  text-transform: none;
}
.setup-layout {
  display: grid;
  grid-template-columns: minmax(280px, 1.2fr) minmax(300px, 1.35fr) minmax(280px, 1.2fr);
  gap: 18px;
  align-items: start;
  min-height: 100%;
  height: 100%;
}
.setup-column { min-width: 0; }
.setup-section { display: flex; flex-direction: column; gap: 10px; }
.option-grid { display: flex; gap: 12px; }
.option-grid--hero { flex-direction: column; align-items: flex-start; }
.option-grid--locker { display: grid; grid-template-columns: 1fr; gap: 12px; justify-items: start; }
.card-option-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(104px, 1fr));
  gap: 12px;
  align-items: start;
  justify-items: start;
  padding: 4px 8px 8px;
  margin-left: 2px;
}

.card-option-row > .card {
  margin-right: 0;
}
.setup-actions { display: flex; gap: 10px; align-items: center; padding-top: 8px; border-top: 1px solid #333; flex-wrap: wrap; }
.btn-confirm { padding: 10px 24px; background: #2a2a6a; border: 1px solid #a78bfa; color: #a78bfa; border-radius: 4px; cursor: pointer; font-size: 14px; transition: background 0.15s; }
.btn-confirm:hover:not(:disabled) { background: #3a3a8a; }
.btn-confirm:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-skip { padding: 10px 24px; background: #2a2a2a; border: 1px solid #7a6020; color: #f39c12; border-radius: 4px; cursor: pointer; font-size: 14px; }
.cost-preview { font-size: 12px; font-style: italic; }
.cost-ok { color: #4caf50; }
.cost-over { color: #e74c3c; }
</style>