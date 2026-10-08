import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPresentation, orderedCards } from '../shared/presentation.js';
import type { Trip, TripCard } from '../shared/types.js';
import { fixture } from './fixture.js';

function card(id: string, category: string, placeId = id, tags: string[] = []): TripCard {
  return { ...fixture.cards[0], id, placeId, category, tags, title: id };
}

function tripWith(cards: TripCard[]): Trip {
  return { ...fixture, cards };
}

function diversifiedTrip(): Trip {
  return tripWith([
    ...Array.from({ length: 36 }, (_, i) => card(`food-${i}`, 'food')),
    ...Array.from({ length: 6 }, (_, i) => card(`walk-${i}`, 'walking')),
    ...Array.from({ length: 6 }, (_, i) => card(`museum-${i}`, 'museum')),
  ]);
}

describe('fixed participant presentation', () => {
  it('repeats a seed, varies participant seeds, and preserves every card without mutating canonical content', () => {
    const trip = diversifiedTrip();
    const original = structuredClone(trip);
    const first = createPresentation(trip, 'participant-a');
    expect(createPresentation(trip, 'participant-a')).toEqual(first);
    expect(createPresentation(trip, 'participant-b').cardIds).not.toEqual(first.cardIds);
    expect([...first.cardIds].sort()).toEqual(trip.cards.map(c => c.id).sort());
    expect(new Set(first.cardIds).size).toBe(trip.cards.length);
    expect(first.algorithm).toEqual(expect.any(String));
    expect(trip).toEqual(original);
  });

  it('separates siblings from the same place when other places remain available', () => {
    const trip = tripWith(Array.from({ length: 24 }, (_, i) => card(`card-${i}`, 'activity', `place-${Math.floor(i / 6)}`)));
    const cards = orderedCards(trip, createPresentation(trip, 'place-spread'));
    for (let i = 1; i < cards.length; i++) expect(cards[i].placeId).not.toBe(cards[i - 1].placeId);
  });

  it('separates shared subject tags across unrelated places', () => {
    const trip = tripWith(Array.from({ length: 24 }, (_, i) => card(`card-${i}`, 'activity', `place-${i}`, [`subject-${Math.floor(i / 6)}`])));
    const cards = orderedCards(trip, createPresentation(trip, 'tag-spread'));
    for (let i = 1; i < cards.length; i++) expect(cards[i].tags[0]).not.toBe(cards[i - 1].tags[0]);
  });

  it('spreads minority categories through partial rounds instead of exhausting them before the dominant category', () => {
    const trip = diversifiedTrip();
    for (const seed of ['round-a', 'round-b', 'round-c']) {
      const cards = orderedCards(trip, createPresentation(trip, seed));
      for (let start = 0; start < cards.length; start += 12) {
        const segment = cards.slice(start, start + 12);
        expect(segment.some(c => c.category === 'walking')).toBe(true);
        expect(segment.some(c => c.category === 'museum')).toBe(true);
        expect(segment.filter(c => c.category === 'food').length).toBeLessThanOrEqual(10);
      }
    }
  });

  it('applies stored IDs to translated cards even when the source array has changed order', () => {
    const trip = diversifiedTrip();
    const presentation = createPresentation(trip, 'locale-independent');
    const translated = tripWith([...trip.cards].reverse().map(c => ({ ...c, title: `Translated ${c.id}`, category: 'translated', tags: [] })));
    const cards = orderedCards(translated, presentation);
    expect(cards.map(c => c.id)).toEqual(presentation.cardIds);
    expect(cards.every(c => c.title === `Translated ${c.id}`)).toBe(true);
  });

  it('preserves the canonical array for legacy participants and invalid stored permutations', () => {
    const trip = diversifiedTrip();
    expect(orderedCards(trip)).toBe(trip.cards);
    const presentation = createPresentation(trip, 'invalid-input');
    for (const ids of [presentation.cardIds.slice(1), [...presentation.cardIds, 'unknown'], presentation.cardIds.map(() => presentation.cardIds[0]), presentation.cardIds.map((id, i) => i ? id : 'unknown')]) {
      expect(orderedCards(trip, { ...presentation, cardIds: ids })).toBe(trip.cards);
    }
  });

  it('handles empty trips and unavoidable repeated places without dropping meaningful cards', () => {
    expect(createPresentation(tripWith([]), 'empty').cardIds).toEqual([]);
    const trip = tripWith(Array.from({ length: 7 }, (_, i) => card(`card-${i}`, 'activity', 'same-place', ['same-subject'])));
    expect(orderedCards(trip, createPresentation(trip, 'unavoidable')).map(c => c.id).sort()).toEqual(trip.cards.map(c => c.id).sort());
  });

  it('rejects duplicate canonical IDs rather than persisting an ambiguous presentation', () => {
    expect(() => createPresentation(tripWith([card('same-id', 'food'), card('same-id', 'activity')]), 'duplicate')).toThrow();
  });

  it('keeps the published whole-trip inventory and presents diverse early partial rounds', () => {
    const trip = JSON.parse(readFileSync(new URL('../public/trips/taipei-2026-dec.json', import.meta.url), 'utf8')) as Trip;
    for (const seed of ['published-a', 'published-b']) {
      const cards = orderedCards(trip, createPresentation(trip, seed));
      expect(cards.map(c => c.id).sort()).toEqual(trip.cards.map(c => c.id).sort());
      expect(new Set(cards.slice(0, 12).map(c => c.category)).size).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < cards.length; i++) expect(cards[i].placeId).not.toBe(cards[i - 1].placeId);
    }
  });
});
