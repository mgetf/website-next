import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '$prisma/client.js';
import { SourcebansError } from './sourcebans';
import {
  syncDiscordForStaff,
  syncSourcebansForStaff,
  withStaffSyncLock,
  type StaffIntegrations,
  type StaffMappingSnapshot,
} from './staff';

const snapshot: StaffMappingSnapshot = {
  roleMappings: [
    {
      permissionLevel: UserRole.MODERATOR,
      sourcebansServerGroupId: 2,
      sourcebansWebGroupId: null,
      sourcebansImmunity: 0,
      discordRoleIds: ['mod'],
    },
  ],
  discordRules: [],
  sourcebansServers: [],
};

describe('syncSourcebansForStaff', () => {
  it('upserts with the resolved server group and skips password', async () => {
    const upsertAdmin = vi
      .fn()
      .mockResolvedValue({ id: 9, name: 'Maxi', steam64: '1', enabled: true });
    const integrations: StaffIntegrations = {
      sourcebans: {
        configured: true,
        upsertAdmin,
        deactivateAdmin: vi.fn(),
      },
      discord: { configured: false, syncMemberRoles: vi.fn() },
    };

    const result = await syncSourcebansForStaff(
      '76561198000000000',
      'Maxi',
      UserRole.MODERATOR,
      [],
      snapshot,
      integrations,
    );

    expect(result).toEqual({ status: 'OK', error: null, adminId: 9 });
    expect(upsertAdmin).toHaveBeenCalledWith('76561198000000000', {
      name: 'Maxi',
      immunity: 0,
      server_group_id: 2,
    });
  });

  it('records SourceBans errors without throwing', async () => {
    const integrations: StaffIntegrations = {
      sourcebans: {
        configured: true,
        upsertAdmin: vi
          .fn()
          .mockRejectedValue(new SourcebansError('Unknown group', 400, 'validation')),
        deactivateAdmin: vi.fn(),
      },
      discord: { configured: false, syncMemberRoles: vi.fn() },
    };

    const result = await syncSourcebansForStaff(
      '76561198000000000',
      'Maxi',
      UserRole.MODERATOR,
      [],
      snapshot,
      integrations,
    );

    expect(result.status).toBe('ERROR');
    expect(result.error).toBe('Unknown group');
  });
});

describe('syncDiscordForStaff', () => {
  it('stays pending when Discord is not linked', async () => {
    const result = await syncDiscordForStaff(null, UserRole.MODERATOR, [], snapshot, {
      sourcebans: { configured: false, upsertAdmin: vi.fn(), deactivateAdmin: vi.fn() },
      discord: { configured: true, syncMemberRoles: vi.fn() },
    });
    expect(result).toEqual({ status: 'PENDING', error: 'Discord is not linked' });
  });

  it('adds mapped roles and reports not_in_guild as pending', async () => {
    const syncMemberRoles = vi.fn().mockResolvedValue('not_in_guild');
    const result = await syncDiscordForStaff('123', UserRole.MODERATOR, [], snapshot, {
      sourcebans: { configured: false, upsertAdmin: vi.fn(), deactivateAdmin: vi.fn() },
      discord: { configured: true, syncMemberRoles },
    });
    expect(result.status).toBe('PENDING');
    expect(syncMemberRoles).toHaveBeenCalledWith('123', ['mod'], expect.any(Set));
  });
});

describe('withStaffSyncLock', () => {
  it('serializes work for the same steamId', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let startedFirst!: () => void;
    const startedFirstPromise = new Promise<void>((resolve) => {
      startedFirst = resolve;
    });

    const first = withStaffSyncLock('76561198000000000', async () => {
      order.push('first-start');
      startedFirst();
      await firstGate;
      order.push('first-end');
      return 1;
    });
    const second = withStaffSyncLock('76561198000000000', async () => {
      order.push('second');
      return 2;
    });

    await startedFirstPromise;
    expect(order).toEqual(['first-start']);
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(['first-start', 'first-end', 'second']);
  });

  it('does not block a different steamId', async () => {
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let startedB!: () => void;
    const startedBPromise = new Promise<void>((resolve) => {
      startedB = resolve;
    });

    const a = withStaffSyncLock('aaa', async () => {
      await gateA;
      return 'a';
    });
    const b = withStaffSyncLock('bbb', async () => {
      startedB();
      return 'b';
    });

    await startedBPromise;
    releaseA();
    await expect(Promise.all([a, b])).resolves.toEqual(['a', 'b']);
  });
});
