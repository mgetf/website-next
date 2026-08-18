import { describe, expect, it } from 'vitest';
import {
  FORMAT_1V1,
  FORMAT_2V2,
  getFormatThemeClasses,
  isFormatThemeKey,
  normalizeFormatThemeKey,
} from './formats';

describe('format constants', () => {
  it('keeps known seeded ids stable', () => {
    expect(FORMAT_1V1).toBe(1);
    expect(FORMAT_2V2).toBe(2);
  });

  it('normalizes theme keys', () => {
    expect(isFormatThemeKey('orange')).toBe(true);
    expect(isFormatThemeKey('ultiduo')).toBe(false);
    expect(normalizeFormatThemeKey('blue')).toBe('blue');
    expect(normalizeFormatThemeKey('nope')).toBe('primary');
    expect(getFormatThemeClasses('orange').button).toContain('bg-primary-600');
  });
});
