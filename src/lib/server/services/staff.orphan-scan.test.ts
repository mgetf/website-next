import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listDiscordGuildMembers, listDiscordGuildRoles, isDiscordGuildConfigured, prisma } =
  vi.hoisted(() => ({
    listDiscordGuildMembers: vi.fn(),
    listDiscordGuildRoles: vi.fn(),
    isDiscordGuildConfigured: vi.fn(() => true),
    prisma: {
      staffRoleMapping: { findMany: vi.fn() },
      staffDiscordRule: { findMany: vi.fn() },
      staffSourcebansServer: { findMany: vi.fn() },
      user: { findMany: vi.fn() },
      discord: { findMany: vi.fn() },
    },
  }));

vi.mock('$lib/server/db', () => ({ prisma }));

vi.mock('./discordGuild', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./discordGuild')>();
  return {
    ...actual,
    listDiscordGuildMembers,
    listDiscordGuildRoles,
    isDiscordGuildConfigured,
  };
});

import {
  getOrphanManagedDiscordMembers,
  refreshOrphanManagedDiscordMembers,
  resetOrphanDiscordMemberScan,
} from './staff';

describe('orphan Discord member scan', () => {
  beforeEach(() => {
    resetOrphanDiscordMemberScan();
    listDiscordGuildMembers.mockReset();
    listDiscordGuildRoles.mockReset();
    isDiscordGuildConfigured.mockReturnValue(true);
    prisma.staffRoleMapping.findMany.mockResolvedValue([
      {
        permissionLevel: 'MODERATOR',
        sourcebansServerGroupId: null,
        sourcebansWebGroupId: null,
        sourcebansImmunity: 0,
        discordRoleIds: ['mod'],
      },
    ]);
    prisma.staffDiscordRule.findMany.mockResolvedValue([]);
    prisma.staffSourcebansServer.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.discord.findMany.mockResolvedValue([]);
    listDiscordGuildMembers.mockResolvedValue([
      {
        discordId: '111',
        username: 'ghost',
        displayName: 'Ghost',
        bot: false,
        roleIds: ['mod'],
      },
    ]);
    listDiscordGuildRoles.mockResolvedValue([
      { id: 'mod', name: 'Moderator', managed: false, position: 1 },
    ]);
  });

  it('does not call Discord until an explicit refresh', async () => {
    const cached = await getOrphanManagedDiscordMembers();

    expect(cached).toMatchObject({ configured: true, members: [], fetchedAt: null });
    expect(listDiscordGuildMembers).not.toHaveBeenCalled();
    expect(listDiscordGuildRoles).not.toHaveBeenCalled();
  });

  it('fetches members once and reuses that scan', async () => {
    const first = await refreshOrphanManagedDiscordMembers();
    const second = await getOrphanManagedDiscordMembers();

    expect(first.members.map((member) => member.discordId)).toEqual(['111']);
    expect(first.fetchedAt).toEqual(expect.any(String));
    expect(second.members).toEqual(first.members);
    expect(listDiscordGuildMembers).toHaveBeenCalledTimes(1);
    expect(listDiscordGuildRoles).toHaveBeenCalledTimes(1);
  });

  it('asks Discord again only when refresh is called', async () => {
    await refreshOrphanManagedDiscordMembers();
    await refreshOrphanManagedDiscordMembers();

    expect(listDiscordGuildMembers).toHaveBeenCalledTimes(2);
  });

  it('skips Discord when no hub roles are mapped', async () => {
    prisma.staffRoleMapping.findMany.mockResolvedValue([
      {
        permissionLevel: 'MODERATOR',
        sourcebansServerGroupId: null,
        sourcebansWebGroupId: null,
        sourcebansImmunity: 0,
        discordRoleIds: [],
      },
    ]);

    const audit = await refreshOrphanManagedDiscordMembers();

    expect(audit.members).toEqual([]);
    expect(audit.fetchedAt).toEqual(expect.any(String));
    expect(listDiscordGuildMembers).not.toHaveBeenCalled();
  });
});
