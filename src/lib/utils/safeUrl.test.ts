import { describe, expect, it } from 'vitest';
import { isSafeUrl } from './safeUrl';

describe('isSafeUrl', () => {
  it('allows http(s), mailto, relative paths, and hashes', () => {
    expect(isSafeUrl('https://mge.tf/rulebook')).toBe(true);
    expect(isSafeUrl('http://localhost:5173/teams/1')).toBe(true);
    expect(isSafeUrl('mailto:staff@mge.tf')).toBe(true);
    expect(isSafeUrl('/teams/1')).toBe(true);
    expect(isSafeUrl('#section')).toBe(true);
  });

  it('rejects dangerous schemes and protocol-relative URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('//evil.example/phish')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });
});
