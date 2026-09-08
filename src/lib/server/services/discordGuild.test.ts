import { describe, expect, it } from 'vitest';
import { nextMemberRoleIds, filterOrphanManagedRoleHolders } from './discordGuild';

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

describe('filterOrphanManagedRoleHolders', () => {
  const managed = new Set(['staff', 'mod', 'admin']);
  const names = new Map([
    ['staff', 'Staff'],
    ['mod', 'Moderator'],
    ['admin', 'Admin'],
  ]);

  it('keeps non-staff members who hold hub-managed roles', () => {
    const holders = filterOrphanManagedRoleHolders(
      [
        {
          discordId: '1',
          username: 'ghost',
          displayName: 'Ghost',
          bot: false,
          roleIds: ['mod', 'fun'],
        },
      ],
      new Set(['9']),
      managed,
      names,
    );
    expect(holders).toEqual([
      {
        discordId: '1',
        username: 'ghost',
        displayName: 'Ghost',
        roleIds: ['mod'],
        roleNames: ['Moderator'],
      },
    ]);
  });

  it('skips designated staff, bots, and members without managed roles', () => {
    const holders = filterOrphanManagedRoleHolders(
      [
        {
          discordId: 'staff-1',
          username: 'maxi',
          displayName: 'Maxi',
          bot: false,
          roleIds: ['admin'],
        },
        {
          discordId: 'bot-1',
          username: 'mge-bot',
          displayName: 'mge-bot',
          bot: true,
          roleIds: ['mod'],
        },
        {
          discordId: '2',
          username: 'player',
          displayName: 'Player',
          bot: false,
          roleIds: ['fun'],
        },
      ],
      new Set(['staff-1']),
      managed,
      names,
    );
    expect(holders).toEqual([]);
  });

  it('falls back to the role id when the guild name is missing', () => {
    const holders = filterOrphanManagedRoleHolders(
      [
        {
          discordId: '3',
          username: 'orphan',
          displayName: 'Orphan',
          bot: false,
          roleIds: ['staff', 'staff'],
        },
      ],
      new Set(),
      managed,
      new Map(),
    );
    expect(holders[0]?.roleNames).toEqual(['staff']);
  });
});
