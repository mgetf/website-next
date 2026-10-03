import { describe, expect, it } from 'vitest';
import { optionalDivisionIdSchema } from './validation';

describe('optionalDivisionIdSchema', () => {
  it('maps none and empty to unplaced', () => {
    expect(optionalDivisionIdSchema.parse('none')).toBeNull();
    expect(optionalDivisionIdSchema.parse('')).toBeNull();
    expect(optionalDivisionIdSchema.parse('  none  ')).toBeNull();
  });

  it('parses a positive division id', () => {
    expect(optionalDivisionIdSchema.parse('12')).toBe(12);
  });

  it('rejects invalid ids', () => {
    expect(() => optionalDivisionIdSchema.parse('0')).toThrow();
    expect(() => optionalDivisionIdSchema.parse('-1')).toThrow();
    expect(() => optionalDivisionIdSchema.parse('abc')).toThrow();
  });
});
