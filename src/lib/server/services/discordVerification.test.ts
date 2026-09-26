import { describe, expect, it } from 'vitest';
import {
  parseCsvRoleIds,
  verificationDesiredRoleIds,
  verificationManagedRoleIds,
} from './discordVerification';

describe('parseCsvRoleIds', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseCsvRoleIds(' 111 , 222,,333 ')).toEqual(['111', '222', '333']);
  });

  it('dedupes ids', () => {
    expect(parseCsvRoleIds('111,111,222')).toEqual(['111', '222']);
  });

  it('returns an empty list when unset', () => {
    expect(parseCsvRoleIds('')).toEqual([]);
    expect(parseCsvRoleIds('   ')).toEqual([]);
  });
});

describe('verificationDesiredRoleIds', () => {
  const add = ['mger'];
  const remove = ['unverified'];

  it('grants add-ids when verified', () => {
    expect(verificationDesiredRoleIds(true, add, remove)).toEqual(['mger']);
  });

  it('grants remove-ids when unverified', () => {
    expect(verificationDesiredRoleIds(false, add, remove)).toEqual(['unverified']);
  });
});

describe('verificationManagedRoleIds', () => {
  it('treats both add and remove ids as managed so they swap cleanly', () => {
    const managed = verificationManagedRoleIds(['mger'], ['unverified']);
    expect([...managed].sort()).toEqual(['mger', 'unverified']);
  });
});
