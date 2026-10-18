<template>
  <div
    class="card"
    :class="[
      compact ? 'card--compact' : '',
      layout === 'landscape' ? 'card--landscape' : 'card--portrait',
      selected ? 'card--selected' : '',
      hoverEdge ? `card--edge-${hoverEdge}` : '',
      isPlayable === undefined ? '' : (isPlayable ? 'card--playable' : 'card--unplayable'),
      cardDetails.image ? 'card--has-image' : '',
    ]"
    @click="$emit('card-clicked', cardDetails.id)"
  >
    <!-- Card Image -->
    <div v-if="cardDetails.image && !imageErrored" class="card__art">
      <img 
        class="card__art-img" 
        :src="resolvedImage" 
        :alt="cardDetails.name || cardDetails.id"
        loading="lazy"
        @error="onImageError"
      />
    </div>

    <!-- Fallback if no image or image fails -->
    <div v-else class="card__fallback">
      <div class="card__name">{{ formatName(cardDetails.name || cardDetails.id) }}</div>
      <div class="card__cost">💰 {{ cardDetails.cost }}</div>
      <div v-if="cardDetails.targetType" class="card__type">{{ cardDetails.targetType }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { resolveAssetPath } from '../../client/assetPaths';
import { CardProcessor } from '../cards/CardProcessor';

const props = defineProps<{
  card: any;
  selected?: boolean;
  compact?: boolean;
  isPlayable?: boolean;
  cardPlayDiscount?: number;
  layout?: 'portrait' | 'landscape';
  hoverEdge?: 'left' | 'center' | 'right';
}>();

const emit = defineEmits<{
  (e: 'card-clicked', cardId: string): void;
}>();

const imageErrored = ref(false);

const cardDetails = computed(() => {
  const rawCard = props.card;
  const instanceId = typeof rawCard === 'string' ? rawCard : rawCard?.id ?? rawCard?.cardId ?? '';
  const cardId = typeof rawCard === 'object' && rawCard?.cardId
    ? rawCard.cardId
    : String(instanceId).replace(/-\d+$/, '');
  const definition = cardId ? CardProcessor.get(cardId) : undefined;

  return {
    id: instanceId,
    name: (typeof rawCard === 'object' ? rawCard?.name : undefined) || definition?.name || cardId,
    cost: (typeof rawCard === 'object' ? rawCard?.cost : undefined) ?? definition?.cost ?? 0,
    image: (typeof rawCard === 'object' ? rawCard?.image : undefined) ?? definition?.image,
    targetType: (typeof rawCard === 'object' ? rawCard?.targetType : undefined) ?? definition?.targetType,
  };
});

const HERO_IMAGE_NAMES = 'anita|barry|phil|elsa|brock|cia|al|archy|lola|richard|dorothy|mike|nurse|football|janitor|cheerleader|bully|runner|bungler|loanwolf|principalrich|cardshark|gymcoach';
const LOCKER_IMAGE_NAMES = 'charityfund|childtool|coolsale|gymsocks|dogtag|freehugs|freshdress|gasleak|grappling|leatherjacket|longsleeve|nicesale|ouija|parttime|permrecord|pyramid|quality|roller|scouttrain|sharpstick|shoes|vitamins|wallinbox';

const isHeroOrLockerCard = computed(() => {
  if (!props.card.image) return false;
  const isHero = new RegExp(`^(${HERO_IMAGE_NAMES})\\.(png|jpg|jpeg)$`, 'i').test(props.card.image);
  const isLocker = new RegExp(`^(${LOCKER_IMAGE_NAMES})\\.(png|jpg|jpeg)$`, 'i').test(props.card.image);
  return isHero || isLocker;
});

const resolvedImage = computed(() => {
  if (!cardDetails.value.image) return '';
  if (props.card?._specialActionId || props.card?.__kind === 'special-action') {
    return resolveAssetPath(cardDetails.value.image, props.card?.imageKind ?? 'action');
  }
  const isHero = new RegExp(`^(${HERO_IMAGE_NAMES})\\.(png|jpg|jpeg)$`, 'i').test(cardDetails.value.image);
  const isLocker = new RegExp(`^(${LOCKER_IMAGE_NAMES})\\.(png|jpg|jpeg)$`, 'i').test(cardDetails.value.image);

  if (isHero) return resolveAssetPath(cardDetails.value.image, 'hero');
  if (isLocker) return resolveAssetPath(cardDetails.value.image, 'locker');
  return resolveAssetPath(cardDetails.value.image, 'game', props.cardPlayDiscount ?? 0);
});

function onImageError(): void {
  imageErrored.value = true;
}

function formatName(name: string): string {
  if (!name) return 'Card';
  return name
    .split('_')
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
</script>

<style scoped>
.card {
  --zoom-origin-x: center;
  --zoom-origin-y: bottom;
  --hover-scale: 1.9;
  --selected-scale: 1.15;
  position: relative;
  background: #1e1e2e;
  border: 2px solid #444;
  border-radius: 8px;
  cursor: pointer;
  overflow: visible;
  opacity: 0.8;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), 
              box-shadow 0.25s ease, 
              border-color 0.25s ease, 
              opacity 0.25s ease;
  user-select: none;
  isolation: isolate;
  transform-origin: var(--zoom-origin-x) var(--zoom-origin-y);
  transform-box: fill-box;
  will-change: transform;
  z-index: 1;
}

.card--portrait {
  width: 120px;
  min-width: 120px;
  height: 168px;
}

.card--landscape {
  width: 180px;
  min-width: 180px;
  height: 168px;
}

.card--compact {
  width: 130px;
  min-width: 130px;
}

.card--has-image {
  background: #0d0d1a;
}

/* --- MAIN HOVER ZOOM --- */
.card:hover {
  transform: scale(var(--hover-scale)) !important;
  transform-origin: center bottom !important;
  z-index: 100 !important;
  border-color: #888 !important;
  opacity: 1 !important;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9) !important;
}

/* --- POSITION-BASED TRANSFORM ORIGIN FOR DRAFT CARDS --- */
.card:nth-child(1):hover,
.card:nth-child(3n+1):hover {
  transform-origin: left bottom !important;
}

.card:nth-child(3n+2):hover {
  transform-origin: center bottom !important;
}

.card:nth-child(3n+3):hover {
  transform-origin: right bottom !important;
}

.card:last-child:hover {
  transform-origin: right bottom !important;
}

.card.card--edge-left:hover,
.card.card--edge-left.card--selected:hover {
  transform-origin: left bottom !important;
}

.card.card--edge-center:hover,
.card.card--edge-center.card--selected:hover {
  transform-origin: center bottom !important;
}

.card.card--edge-right:hover,
.card.card--edge-right.card--selected:hover {
  transform-origin: right bottom !important;
}

/* --- SETUP PHASE ZOOM (keeps your existing behavior) --- */
.setup-slot-hero-1,
.setup-slot-card-1,
.setup-slot-card-4,
.setup-slot-card-7 {
  --zoom-origin-x: left;
  --zoom-origin-y: bottom;
}

.setup-slot-hero-2,
.setup-slot-card-2,
.setup-slot-card-5,
.setup-slot-card-8 {
  --zoom-origin-x: center;
  --zoom-origin-y: bottom;
}

.setup-slot-hero-3,
.setup-slot-card-3,
.setup-slot-card-6,
.setup-slot-card-9 {
  --zoom-origin-x: right;
  --zoom-origin-y: bottom;
}

.setup-slot-locker-1 {
  --zoom-origin-x: left;
  --zoom-origin-y: top;
}

.setup-slot-locker-2 {
  --zoom-origin-x: center;
  --zoom-origin-y: top;
}

.setup-slot-locker-3 {
  --zoom-origin-x: right;
  --zoom-origin-y: top;
}

.setup-slot-hero-1:hover,
.setup-slot-card-1:hover,
.setup-slot-card-4:hover,
.setup-slot-card-7:hover,
.setup-slot-locker-1:hover,
.setup-slot-hero-2:hover,
.setup-slot-card-2:hover,
.setup-slot-card-5:hover,
.setup-slot-card-8:hover,
.setup-slot-locker-2:hover,
.setup-slot-hero-3:hover,
.setup-slot-card-3:hover,
.setup-slot-card-6:hover,
.setup-slot-card-9:hover,
.setup-slot-locker-3:hover {
  transform: scale(1.9) !important;
  transform-origin: var(--zoom-origin-x, center) var(--zoom-origin-y, bottom) !important;
  z-index: 500 !important;
}

/* --- SELECTED CARD STATE --- */
.card--selected {
  transform: scale(var(--selected-scale)) !important;
  border-color: #ffd166 !important;
  outline: 3px solid #ffd166 !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(255, 209, 102, 0.45),
              0 0 30px rgba(255, 209, 102, 0.4) !important;
  opacity: 1 !important;
  z-index: 20 !important;
}

.card--selected:hover {
  transform: scale(var(--hover-scale)) !important;
  transform-origin: center bottom !important;
  border-color: #fbbf24 !important;
  box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.4),
              0 20px 50px rgba(0, 0, 0, 0.9) !important;
}

/* --- PLAYABLE/UNPLAYABLE STATES --- */
.card--playable {
  border-color: #6a6a9a;
}

.card--playable:hover {
  border-color: #a78bfa !important;
  box-shadow: 0 8px 24px rgba(167, 139, 250, 0.3) !important;
}

.card--unplayable {
  opacity: 0.5;
  cursor: pointer;
  filter: grayscale(0.3);
}

.card--unplayable:hover {
  transform: scale(var(--hover-scale)) !important;
  transform-origin: center bottom !important;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9) !important;
  border-color: #666 !important;
  z-index: 20 !important;
  opacity: 1 !important;
}

/* --- CARD ART --- */
.card--portrait .card__art {
  aspect-ratio: 5 / 7;
}

.card--landscape .card__art {
  aspect-ratio: 16 / 10;
}

.card__art {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #111;
  border-radius: 6px;
}

.card__art-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #111;
  transition: transform 0.3s ease;
}

.card:hover .card__art-img {
  transform: scale(1);
}

/* --- FALLBACK --- */
.card__fallback {
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 200px;
  background: #1a1a2e;
}

.card__name {
  font-weight: bold;
  font-size: 14px;
  color: #e0e0e0;
  text-align: center;
}

.card__cost {
  font-size: 12px;
  color: #f0c060;
}

.card__type {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
  background: #2a2a4a;
  padding: 2px 8px;
  border-radius: 4px;
}

/* --- RESPONSIVE --- */
@media (max-width: 768px) {
  .card {
    width: 120px;
    min-width: 120px;
  }
  .card--compact {
    width: 100px;
    min-width: 100px;
  }
}
</style>