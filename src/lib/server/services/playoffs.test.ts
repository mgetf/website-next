import { describe, expect, it } from 'vitest';
import { parseDivisionPlayoffChoices } from './playoffs';

describe('parseDivisionPlayoffChoices', () => {
  it('accepts a division left unset', () => {
    expect(
      parseDivisionPlayoffChoices(
        JSON.stringify([
          { divisionId: 4, format: 'DOUBLE_ELIM', series: 5, arenaGames: 3 },
          { divisionId: 9, format: null, series: null, arenaGames: null },
        ]),
      ),
    ).toEqual([
      { divisionId: 4, format: 'DOUBLE_ELIM', series: 5, arenaGames: 3 },
      { divisionId: 9, format: null, series: null, arenaGames: null },
    ]);
  });

  it('rejects a repeated division', () => {
    expect(
      parseDivisionPlayoffChoices(
        JSON.stringify([
          { divisionId: 4, format: 'SINGLE_ELIM', series: 3, arenaGames: 3 },
          { divisionId: 4, format: 'DOUBLE_ELIM', series: 3, arenaGames: 7 },
        ]),
      ),
    ).toBeNull();
  });

  it('rejects an unknown format', () => {
    expect(
      parseDivisionPlayoffChoices(
        JSON.stringify([{ divisionId: 4, format: 'ROUND_ROBIN', series: 3, arenaGames: 3 }]),
      ),
    ).toBeNull();
  });

  it('rejects a series that is not 3, 5, or 7', () => {
    expect(
      parseDivisionPlayoffChoices(
        JSON.stringify([{ divisionId: 4, format: 'SINGLE_ELIM', series: 4, arenaGames: 3 }]),
      ),
    ).toBeNull();
  });

  it('rejects an arena length that is not 3, 5, or 7', () => {
    expect(
      parseDivisionPlayoffChoices(
        JSON.stringify([{ divisionId: 4, format: 'SINGLE_ELIM', series: 3, arenaGames: 1 }]),
      ),
    ).toBeNull();
  });

  it('rejects malformed json', () => {
    expect(parseDivisionPlayoffChoices('{')).toBeNull();
  });
});
