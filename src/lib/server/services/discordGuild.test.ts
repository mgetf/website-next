import { describe, expect, it } from 'vitest';
import { nextMemberRoleIds } from './discordGuild';

describe('nextMemberRoleIds', () => {
  it('keeps unmanaged roles and replaces managed ones with the desired set', () => {
    const next = nextMemberRoleIds(
      ['unmanaged', 'staff', 'mod', 'stale'],
      ['staff', 'admin'],
      new Set(['staff', 'mod', 'admin']),
    );
    expect(next.sort()).toEqual(['admin', 'staff', 'stale', 'unmanaged']);
  });

  it('strips managed roles when the desired set is empty', () => {
    const next = nextMemberRoleIds(['unmanaged', 'staff'], [], new Set(['staff', 'mod']));
    expect(next).toEqual(['unmanaged']);
  });

  it('ignores desired ids that are not in the managed catalog', () => {
    const next = nextMemberRoleIds(['keep'], ['not-managed', 'staff'], new Set(['staff']));
    expect(next.sort()).toEqual(['keep', 'staff']);
  });

  it('dedupes overlapping unmanaged and desired ids', () => {
    const next = nextMemberRoleIds(['staff', 'staff'], ['staff'], new Set(['staff']));
    expect(next).toEqual(['staff']);
  });
});
