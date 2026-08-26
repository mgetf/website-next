import { describe, expect, it } from 'vitest';
import { displayedElo, sortByDisplayedElo } from './mgeRating';

describe('displayedElo', () => {
  it('uses displayRating when the platform provides one', () => {
    expect(displayedElo({ elo: 1938, displayRating: 1569 })).toBe(1569);
  });

  it('falls back to raw elo when displayRating is missing', () => {
    expect(displayedElo({ elo: 1600 })).toBe(1600);
    expect(displayedElo({ elo: 1600, displayRating: null })).toBe(1600);
  });
});

describe('sortByDisplayedElo', () => {
  it('sorts the live SA-style payload so shown ratings descend', () => {
    const raw = [
      { name: 'DYSINAGA', elo: 1600, displayRating: 1600 },
      { name: 'crudae', elo: 1600, displayRating: 1600 },
      { name: 'maisou', elo: 1938, displayRating: 1569 },
      { name: 'tevez', elo: 1781, displayRating: 1482 },
      { name: 'V1tinho', elo: 1905, displayRating: 1470 },
      { name: 'nezay', elo: 1926, displayRating: 1452 },
    ];
    const normalized = raw.map((e) => ({ ...e, elo: displayedElo(e) }));
    const sorted = sortByDisplayedElo(normalized);

    expect(sorted.map((e) => e.elo)).toEqual([1600, 1600, 1569, 1482, 1470, 1452]);
    expect(sorted.map((e) => e.name)).toEqual([
      'DYSINAGA',
      'crudae',
      'maisou',
      'tevez',
      'V1tinho',
      'nezay',
    ]);
  });
});
