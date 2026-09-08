import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '$prisma/client.js';
import { SourcebansError } from './sourcebans';
import {
  syncDiscordForStaff,
  syncSourcebansForStaff,
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
