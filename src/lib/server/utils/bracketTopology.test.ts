import { describe, expect, it } from 'vitest';
import { deriveSection, isStructurallyFlat } from './bracketTopology';

describe('deriveSection', () => {
  it('maps single-elim matches to MAIN', () => {
    expect(deriveSection({ round: 1, label: 'Winners' }, 'SINGLE_ELIM')).toBe('MAIN');
  });

  it('uses labels then round sign for double-elim', () => {
    expect(deriveSection({ round: 1, label: 'Grand Final' }, 'DOUBLE_ELIM')).toBe('GRAND_FINAL');
    expect(deriveSection({ round: -1, label: 'Losers Round 1' }, 'DOUBLE_ELIM')).toBe('LOSERS');
    expect(deriveSection({ round: 2, label: 'Winners Round 2' }, 'DOUBLE_ELIM')).toBe('WINNERS');
    expect(deriveSection({ round: -2, label: null }, 'DOUBLE_ELIM')).toBe('LOSERS');
    expect(deriveSection({ round: 2, label: null }, 'DOUBLE_ELIM')).toBe('WINNERS');
    expect(deriveSection({ round: 0, label: null }, 'DOUBLE_ELIM')).toBe('GRAND_FINAL');
  });
});

describe('isStructurallyFlat', () => {
  it('is true only when every match has a null round', () => {
    expect(isStructurallyFlat([{ round: null }, { round: null }])).toBe(true);
    expect(isStructurallyFlat([{ round: 1 }, { round: null }])).toBe(false);
    expect(isStructurallyFlat([])).toBe(false);
  });
});
