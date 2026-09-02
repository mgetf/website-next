import { describe, expect, it } from 'vitest';
import { parseSignupDraft, signupLoginPath } from './signupDraft';

describe('signupLoginPath', () => {
  it('puts safe fields on the login return URL and skips password', () => {
    const formData = new FormData();
    formData.set('regionId', '2');
    formData.set('divisionId', '9');
    formData.set('name', 'Cool Team');
    formData.set('joinPassword', 'secret');

    expect(signupLoginPath('/signup/2v2/create', formData)).toBe(
      '/auth/login?redirect=%2Fsignup%2F2v2%2Fcreate%3FregionId%3D2%26divisionId%3D9%26name%3DCool%2BTeam',
    );
  });
});

describe('parseSignupDraft', () => {
  it('parses region, division, and optional team fields', () => {
    expect(parseSignupDraft(new URLSearchParams('regionId=2&divisionId=9&teamId=4'))).toEqual({
      regionId: 2,
      divisionId: '9',
      name: '',
      acronym: '',
      teamId: 4,
    });
  });

  it('ignores invalid ids', () => {
    expect(parseSignupDraft(new URLSearchParams('regionId=0&teamId=abc'))).toEqual({
      regionId: null,
      divisionId: '',
      name: '',
      acronym: '',
      teamId: null,
    });
  });
});
