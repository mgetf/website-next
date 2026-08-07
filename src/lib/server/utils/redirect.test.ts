import { describe, expect, it } from 'vitest';
import { sanitizeRedirectUrl } from './redirect';

describe('sanitizeRedirectUrl', () => {
  it('defaults empty values to /', () => {
    expect(sanitizeRedirectUrl(null)).toBe('/');
    expect(sanitizeRedirectUrl(undefined)).toBe('/');
    expect(sanitizeRedirectUrl('')).toBe('/');
  });

  it('allows safe relative paths', () => {
    expect(sanitizeRedirectUrl('/teams/1')).toBe('/teams/1');
    expect(sanitizeRedirectUrl('/matches/42?tab=comms')).toBe('/matches/42?tab=comms');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(sanitizeRedirectUrl('https://evil.example/phish')).toBe('/');
    expect(sanitizeRedirectUrl('//evil.example')).toBe('/');
    expect(sanitizeRedirectUrl('/\\evil.example')).toBe('/');
  });

  it('rejects control characters', () => {
    expect(sanitizeRedirectUrl('/ok\nLocation: https://evil.example')).toBe('/');
  });
});
