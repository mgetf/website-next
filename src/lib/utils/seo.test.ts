import { describe, expect, it } from 'vitest';
import { buildPageSeo, toAbsoluteUrl } from './seo';

describe('toAbsoluteUrl', () => {
  it('resolves relative paths against origin', () => {
    expect(toAbsoluteUrl('/apple-touch-icon.png', 'https://mge.tf')).toBe(
      'https://mge.tf/apple-touch-icon.png',
    );
  });

  it('keeps absolute https URLs', () => {
    expect(toAbsoluteUrl('https://avatars.steamstatic.com/abc_full.jpg', 'https://mge.tf')).toBe(
      'https://avatars.steamstatic.com/abc_full.jpg',
    );
  });

  it('returns null for empty values', () => {
    expect(toAbsoluteUrl(null, 'https://mge.tf')).toBeNull();
    expect(toAbsoluteUrl('  ', 'https://mge.tf')).toBeNull();
  });
});

describe('buildPageSeo', () => {
  it('builds seo with absolute avatar image and summary card', () => {
    const seo = buildPageSeo('https://mge.tf', {
      title: 'PRO PIRO | MGE.tf',
      description: 'PREMIER (EU) · Season 3 · Record 8-3',
      image: 'https://cdn.example/team.jpg',
      imageAlt: 'PRO PIRO',
      type: 'profile',
    });

    expect(seo.title).toBe('PRO PIRO | MGE.tf');
    expect(seo.image).toBe('https://cdn.example/team.jpg');
    expect(seo.card).toBe('summary');
    expect(seo.type).toBe('profile');
  });
});
