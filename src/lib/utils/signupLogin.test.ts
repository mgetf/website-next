import { describe, expect, it } from 'vitest';
import { loginToParticipateHref } from './signupLogin';

describe('loginToParticipateHref', () => {
  it('sends guests to Steam login and back to the signup destination', () => {
    expect(loginToParticipateHref('/signup/2v2/create')).toBe(
      '/auth/login?redirect=%2Fsignup%2F2v2%2Fcreate',
    );
  });
});
