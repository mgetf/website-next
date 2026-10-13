import { describe, expect, it } from 'vitest';
import { parseDivisionPlayoffChoices } from './playoffs';

describe('parseDivisionPlayoffChoices', () => {
  it('accepts a division left unset', () => {
    expect(
      parseDivisionPlayoffChoices(
        JSON.stringify([
          { divisionId: 4, format: 'DOUBLE_ELIM' },
          { divisionId: 9, format: null },
        ]),
      ),
    ).toEqual([
      { divisionId: 4, format: 'DOUBLE_ELIM' },
      { divisionId: 9, format: null },
    ]);
  });

  it('rejects a repeated division', () => {
    expect(
      parseDivisionPlayoffChoices(
        JSON.stringify([
          { divisionId: 4, format: 'SINGLE_ELIM' },
          { divisionId: 4, format: 'DOUBLE_ELIM' },
        ]),
      ),
    ).toBeNull();
  });

  it('rejects an unknown format', () => {
    expect(
      parseDivisionPlayoffChoices(JSON.stringify([{ divisionId: 4, format: 'ROUND_ROBIN' }])),
    ).toBeNull();
  });

  it('rejects malformed json', () => {
    expect(parseDivisionPlayoffChoices('{')).toBeNull();
  });
});
