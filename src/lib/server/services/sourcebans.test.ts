import { describe, expect, it } from 'vitest';
import { sourcebansApiBase } from './sourcebans';

describe('sourcebansApiBase', () => {
  it('appends /api/v1 when given an origin', () => {
    expect(sourcebansApiBase('https://bans.mge.tf')).toBe('https://bans.mge.tf/api/v1');
  });

  it('keeps an existing /api/v1 or PATH_INFO suffix', () => {
    expect(sourcebansApiBase('https://bans.mge.tf/api/v1')).toBe('https://bans.mge.tf/api/v1');
    expect(sourcebansApiBase('https://bans.mge.tf/api/v1.php')).toBe(
      'https://bans.mge.tf/api/v1.php',
    );
  });
});
