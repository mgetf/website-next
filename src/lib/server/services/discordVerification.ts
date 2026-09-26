import {
  getDiscordVerificationLogChannelId,
  getDiscordVerifyAddRoleIds,
  getDiscordVerifyRemoveRoleIds,
  getOptionalEnv,
} from '$lib/server/utils/env';
import {
  DiscordGuildError,
  isDiscordGuildConfigured,
  sendDiscordChannelMessage,
  syncDiscordMemberRoles,
} from './discordGuild';

export type VerificationSyncResult = 'ok' | 'not_in_guild' | 'skipped' | 'error';

export function parseCsvRoleIds(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

export function verificationManagedRoleIds(addIds: string[], removeIds: string[]): Set<string> {
  return new Set([...addIds, ...removeIds]);
}

export function verificationDesiredRoleIds(
  verified: boolean,
  addIds: string[],
  removeIds: string[],
): string[] {
  return verified ? addIds : removeIds;
}

function verifyAddRoleIds(): string[] {
  return parseCsvRoleIds(getDiscordVerifyAddRoleIds());
}

function verifyRemoveRoleIds(): string[] {
  return parseCsvRoleIds(getDiscordVerifyRemoveRoleIds());
}

function profileUrl(steamId: string): string {
  const origin = getOptionalEnv('PUBLIC_URL', 'https://mge.tf').replace(/\/$/, '');
  return `${origin}/users/${steamId}`;
}

export async function syncDiscordVerificationRoles(
  discordId: string,
  verified: boolean,
): Promise<VerificationSyncResult> {
  if (!discordId || !isDiscordGuildConfigured()) return 'skipped';

  const addIds = verifyAddRoleIds();
  const removeIds = verifyRemoveRoleIds();
  const managed = verificationManagedRoleIds(addIds, removeIds);
  if (managed.size === 0) return 'skipped';

  const desired = verificationDesiredRoleIds(verified, addIds, removeIds);
  try {
    return await syncDiscordMemberRoles(discordId, desired, managed);
  } catch (err) {
    console.error('[discordVerification] role sync failed:', err);
    return 'error';
  }
}

export async function postDiscordVerificationLog(params: {
  success: boolean;
  description: string;
  discordUsername?: string | null;
}): Promise<void> {
  const channelId = getDiscordVerificationLogChannelId();
  if (!channelId) return;

  try {
    await sendDiscordChannelMessage(channelId, {
      embeds: [
        {
          color: params.success ? 0x57f287 : 0xed4245,
          description: params.description,
          timestamp: new Date().toISOString(),
          footer: { text: 'mge.tf' },
          ...(params.discordUsername ? { author: { name: params.discordUsername } } : {}),
        },
      ],
    });
  } catch (err) {
    if (err instanceof DiscordGuildError) {
      console.error('[discordVerification] log channel post failed:', err.message);
      return;
    }
    console.error('[discordVerification] log channel post failed:', err);
  }
}

export async function applyDiscordLinkVerification(params: {
  discordId: string;
  discordUsername?: string | null;
  steamId: string;
  steamUsername: string;
}): Promise<void> {
  const result = await syncDiscordVerificationRoles(params.discordId, true);
  if (result === 'skipped') return;

  const profile = profileUrl(params.steamId);
  if (result === 'ok') {
    await postDiscordVerificationLog({
      success: true,
      discordUsername: params.discordUsername,
      description: `Linked **${params.steamUsername}** (\`${params.steamId}\`) and verified. [Profile](${profile})`,
    });
    return;
  }

  if (result === 'not_in_guild') {
    await postDiscordVerificationLog({
      success: true,
      discordUsername: params.discordUsername,
      description: `Linked **${params.steamUsername}** (\`${params.steamId}\`) — not in the Discord server yet. [Profile](${profile})`,
    });
    return;
  }

  await postDiscordVerificationLog({
    success: false,
    discordUsername: params.discordUsername,
    description: `Linked **${params.steamUsername}** (\`${params.steamId}\`) but failed to update roles. [Profile](${profile})`,
  });
}

export async function applyDiscordUnlinkVerification(params: {
  discordId: string;
  discordUsername?: string | null;
  steamId: string;
  steamUsername: string;
}): Promise<void> {
  const result = await syncDiscordVerificationRoles(params.discordId, false);
  if (result === 'skipped') return;

  const profile = profileUrl(params.steamId);
  if (result === 'error') {
    await postDiscordVerificationLog({
      success: false,
      discordUsername: params.discordUsername,
      description: `Unlinked **${params.steamUsername}** (\`${params.steamId}\`) but failed to revert roles. [Profile](${profile})`,
    });
    return;
  }

  const inGuild = result === 'ok';
  await postDiscordVerificationLog({
    success: true,
    discordUsername: params.discordUsername,
    description: inGuild
      ? `Unlinked **${params.steamUsername}** (\`${params.steamId}\`). MGER removed. [Profile](${profile})`
      : `Unlinked **${params.steamUsername}** (\`${params.steamId}\`) — not in the Discord server. [Profile](${profile})`,
  });
}
