import type { Trip, TripCard } from './types.js';

export interface Presentation {
  algorithm: string;
  cardIds: string[];
}

/** Change the version when changing this policy; existing participants retain their saved IDs. */
export const PRESENTATION_POLICY = Object.freeze({
  algorithm: 'balanced-v1',
  recentWindow: 6,
  categoryBalanceWeight: 1,
  recentPlaceWeight: 12,
  recentTagWeight: 3,
  recentCategoryWeight: 2,
  categoryMidpoint: 0.5,
});

// FNV-1a followed by an avalanche mixes similar participant/card IDs without a runtime RNG.
function seededPriority(seed: string, cardId: string): number {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify([seed, cardId])) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function recentPenalty(card: TripCard, recent: TripCard[]): number {
  return recent.reduce((penalty, previous, index) => {
    const recency = (index + 1) / recent.length;
    const sharedTags = new Set(card.tags.filter(tag => previous.tags.includes(tag))).size;
    const tagOverlap = sharedTags / Math.max(card.tags.length, previous.tags.length, 1);
    return penalty + recency * (
      (card.placeId === previous.placeId ? PRESENTATION_POLICY.recentPlaceWeight : 0)
      + tagOverlap * PRESENTATION_POLICY.recentTagWeight
      + (card.category === previous.category ? PRESENTATION_POLICY.recentCategoryWeight : 0)
    );
  }, 0);
}

/**
 * Generate once from canonical content when inviting a participant, never from answers or translations.
 * Each category's next card targets its next evenly spaced midpoint across the whole inventory.
 * This keeps rare categories available for later rounds; recent similarity penalties improve local
 * variety without quotas, removing cards, or claiming a guaranteed gap when alternatives run out.
 */
export function createPresentation(trip: Trip, seed: string): Presentation {
  if (new Set(trip.cards.map(card => card.id)).size !== trip.cards.length) {
    throw new Error('Presentation requires unique canonical card IDs');
  }
  const categoryTotals = new Map<string, number>();
  const categoryUsed = new Map<string, number>();
  for (const card of trip.cards) categoryTotals.set(card.category, (categoryTotals.get(card.category) ?? 0) + 1);
  const remaining = trip.cards.map(card => ({ card, priority: seededPriority(seed, card.id) }));
  const selected: TripCard[] = [];

  while (remaining.length) {
    const recent = selected.slice(-PRESENTATION_POLICY.recentWindow);
    let bestIndex = 0;
    let bestScore = Infinity;
    for (let index = 0; index < remaining.length; index++) {
      const { card, priority } = remaining[index];
      const nextMidpoint = ((categoryUsed.get(card.category) ?? 0) + PRESENTATION_POLICY.categoryMidpoint)
        * trip.cards.length / categoryTotals.get(card.category)!;
      const score = nextMidpoint * PRESENTATION_POLICY.categoryBalanceWeight + recentPenalty(card, recent);
      const best = remaining[bestIndex];
      if (score < bestScore || (score === bestScore && (priority < best.priority || (priority === best.priority && card.id < best.card.id)))) {
        bestIndex = index;
        bestScore = score;
      }
    }
    const [{ card }] = remaining.splice(bestIndex, 1);
    selected.push(card);
    categoryUsed.set(card.category, (categoryUsed.get(card.category) ?? 0) + 1);
  }
  return { algorithm: PRESENTATION_POLICY.algorithm, cardIds: selected.map(card => card.id) };
}

/**
 * Apply a complete saved ID permutation to the current display locale. Legacy or invalid stored
 * data falls back to the exact canonical array, so corrupt/stale data cannot hide or duplicate cards.
 * The algorithm label is provenance; saved IDs remain valid across future policy versions.
 */
export function orderedCards(trip: Trip, presentation?: Presentation): TripCard[] {
  if (!presentation || !Array.isArray(presentation.cardIds) || presentation.cardIds.length !== trip.cards.length) return trip.cards;
  const byId = new Map(trip.cards.map(card => [card.id, card]));
  if (byId.size !== trip.cards.length || new Set(presentation.cardIds).size !== trip.cards.length
    || presentation.cardIds.some(id => !byId.has(id))) return trip.cards;
  return presentation.cardIds.map(id => byId.get(id)!);
}
