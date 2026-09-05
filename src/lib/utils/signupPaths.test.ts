import { describe, expect, it } from 'vitest';
import { signupPathForFormat } from './signupPaths';

describe('signupPathForFormat', () => {
  it('routes individual formats to the format signup page', () => {
    expect(signupPathForFormat({ id: 1, code: '1v1', isIndividual: true })).toBe('/signup/1v1');
  });

  it('routes team formats to create or existing', () => {
    expect(signupPathForFormat({ id: 2, code: '2v2', isIndividual: false })).toBe(
      '/signup/2v2/create',
    );
    expect(signupPathForFormat({ id: 2, code: '2v2', isIndividual: false }, 'existing')).toBe(
      '/signup/2v2/existing',
    );
  });
});
