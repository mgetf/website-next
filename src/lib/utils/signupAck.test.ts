import { describe, expect, it } from 'vitest';
import { formAcknowledgedSignupScope, signupScopeAckLabel } from './signupAck';

describe('signupScopeAckLabel', () => {
  it('always includes the format', () => {
    expect(signupScopeAckLabel({ formatName: '2v2' })).toBe(
      'I confirm that I am signing up for: 2v2.',
    );
  });

  it('adds region and season when they are known', () => {
    expect(
      signupScopeAckLabel({
        regionName: 'NA',
        formatName: '2v2',
        seasonNum: 12,
      }),
    ).toBe('I confirm that I am signing up for: NA 2v2 Season 12.');
  });
});

describe('formAcknowledgedSignupScope', () => {
  it('accepts checked checkbox values', () => {
    const formData = new FormData();
    formData.set('signupScopeAck', 'on');
    expect(formAcknowledgedSignupScope(formData)).toBe(true);
  });

  it('rejects a missing checkbox', () => {
    expect(formAcknowledgedSignupScope(new FormData())).toBe(false);
  });
});
