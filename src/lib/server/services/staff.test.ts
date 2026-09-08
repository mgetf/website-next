import { describe, expect, it } from 'vitest';
import { UserRole } from '$prisma/client.js';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/server/constants/formats';
import {
  catalogDiscordRoleIds,
  resolveDiscordRoleIds,
  resolveSourcebansPayload,
  type StaffMappingSnapshot,
} from './staff';

const snapshot: StaffMappingSnapshot = {
  roleMappings: [
    {
      permissionLevel: UserRole.MODERATOR,
      sourcebansServerGroupId: 2,
      sourcebansWebGroupId: null,
      sourcebansImmunity: 10,
      discordRoleIds: ['staff', 'mod'],
    },
    {
      permissionLevel: UserRole.ADMIN,
      sourcebansServerGroupId: 1,
      sourcebansWebGroupId: 4,
      sourcebansImmunity: 80,
      discordRoleIds: ['staff', 'admin'],
    },
  ],
  discordRules: [
    {
      permissionLevel: UserRole.MODERATOR,
      formatId: FORMAT_1V1,
      regionId: null,
      discordRoleId: '1v1-mod',
    },
    {
      permissionLevel: null,
      formatId: null,
      regionId: 3,
      discordRoleId: 'na-staff',
    },
    {
      permissionLevel: UserRole.ADMIN,
      formatId: FORMAT_1V1,
      regionId: 3,
      discordRoleId: 'na-1v1-admin',
    },
  ],
  sourcebansServers: [
    { regionId: 3, sourcebansServerId: 11 },
    { regionId: 3, sourcebansServerId: 12 },
    { regionId: 4, sourcebansServerId: 21 },
  ],
};

describe('resolveDiscordRoleIds', () => {
  it('unions always-on roles with matching format/region rules', () => {
    const roles = resolveDiscordRoleIds(
      UserRole.MODERATOR,
      [{ formatId: FORMAT_1V1, regionId: 3 }],
      snapshot,
    );
    expect(roles.sort()).toEqual(['1v1-mod', 'mod', 'na-staff', 'staff']);
  });

  it('skips scoped rules that do not match assignments', () => {
    const roles = resolveDiscordRoleIds(
      UserRole.ADMIN,
      [{ formatId: FORMAT_2V2, regionId: 4 }],
      snapshot,
    );
    expect(roles.sort()).toEqual(['admin', 'staff']);
  });

  it('applies a fully scoped format+region rule', () => {
    const roles = resolveDiscordRoleIds(
      UserRole.ADMIN,
      [{ formatId: FORMAT_1V1, regionId: 3 }],
      snapshot,
    );
    expect(roles).toContain('na-1v1-admin');
    expect(roles).toContain('na-staff');
  });
});

describe('catalogDiscordRoleIds', () => {
  it('includes every mapped Discord role for demote cleanup', () => {
    expect([...catalogDiscordRoleIds(snapshot)].sort()).toEqual([
      '1v1-mod',
      'admin',
      'mod',
      'na-1v1-admin',
      'na-staff',
      'staff',
    ]);
  });
});

describe('resolveSourcebansPayload', () => {
  it('maps group ids from the site role and servers from assigned regions', () => {
    expect(
      resolveSourcebansPayload(
        UserRole.MODERATOR,
        [{ formatId: FORMAT_1V1, regionId: 3 }],
        snapshot,
      ),
    ).toEqual({
      serverGroupId: 2,
      webGroupId: null,
      immunity: 10,
      serverIds: [11, 12],
    });
  });

  it('omits server_ids when the staff member has no league assignments', () => {
    expect(resolveSourcebansPayload(UserRole.ADMIN, [], snapshot)).toEqual({
      serverGroupId: 1,
      webGroupId: 4,
      immunity: 80,
      serverIds: null,
    });
  });
});
