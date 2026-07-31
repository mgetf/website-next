/**
 * Typed helpers for TeamsModule over Rama REST JSON.
 *
 * @lintignore Spike team helpers; production team routes still use Postgres.
 */

import { RamaClient, ramaLong, type AckLevel } from './client';

export const TEAMS_MODULE = 'mge.tf.rama.teams-module/TeamsModule';
export const TEAM_DEPOT = '*team-depot';

export type TeamAck = {
  ok: boolean;
  error?: string;
  teamId?: string;
  steamId?: string;
  status?: string | number;
  permissionLevel?: string;
  type?: string;
};

export type RosterMember = {
  active: boolean;
  permissionLevel: string;
  paymentStatus: string;
};

function asAck(topologyReturns: Record<string, unknown>): TeamAck {
  const raw = topologyReturns['teams'];
  if (raw && typeof raw === 'object') return raw as TeamAck;
  return { ok: false, error: 'missing-ack' };
}

export function createTeamsClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: TEAMS_MODULE,
  });
}

export async function createTeam(
  client: RamaClient,
  event: {
    teamId: string;
    steamId: string;
    name: string;
    acronym: string;
    formatId: string;
    seasonId: string;
    divisionId: string;
    regionId: string;
    joinPassword?: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(
    await client.append(
      TEAM_DEPOT,
      {
        type: 'create-team',
        teamId: event.teamId,
        steamId: event.steamId,
        name: event.name,
        acronym: event.acronym,
        formatId: event.formatId,
        seasonId: event.seasonId,
        divisionId: event.divisionId,
        regionId: event.regionId,
        joinPassword: event.joinPassword ?? '',
      },
      ackLevel,
    ),
  );
}

export async function joinTeam(
  client: RamaClient,
  event: { teamId: string; steamId: string },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'join-team', ...event }, ackLevel));
}

export async function requestJoin(
  client: RamaClient,
  event: { teamId: string; steamId: string; status?: number },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(
    await client.append(
      TEAM_DEPOT,
      {
        type: 'request-join',
        teamId: event.teamId,
        steamId: event.steamId,
        status: ramaLong(event.status ?? 1),
      },
      ackLevel,
    ),
  );
}

export async function createInvite(
  client: RamaClient,
  event: { teamId: string; steamId: string },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'create-invite', ...event }, ackLevel));
}

export async function acceptInvite(
  client: RamaClient,
  event: { teamId: string; steamId: string },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'accept-invite', ...event }, ackLevel));
}

export async function approvePending(
  client: RamaClient,
  event: { teamId: string; steamId: string },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'approve-pending', ...event }, ackLevel));
}

export async function declinePending(
  client: RamaClient,
  event: { teamId: string; steamId: string },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'decline-pending', ...event }, ackLevel));
}

export async function leaveTeam(
  client: RamaClient,
  event: { teamId: string; steamId: string },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'leave-team', ...event }, ackLevel));
}

export async function setTeamStatus(
  client: RamaClient,
  event: {
    teamId: string;
    status: 'UNREADY' | 'PENDING' | 'READY' | 'DEAD' | 'PLACEMENT';
  },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'set-status', ...event }, ackLevel));
}

export async function setMemberPermission(
  client: RamaClient,
  event: {
    teamId: string;
    steamId: string;
    permissionLevel: 'MEMBER' | 'ADMIN' | 'STATUS';
  },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(
    await client.append(TEAM_DEPOT, { type: 'set-member-permission', ...event }, ackLevel),
  );
}

export async function setMemberPayment(
  client: RamaClient,
  event: {
    teamId: string;
    steamId: string;
    paymentStatus: 'UNPAID' | 'PAID' | 'EXEMPT';
  },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'set-member-payment', ...event }, ackLevel));
}

export async function getTeam(
  client: RamaClient,
  teamId: string,
): Promise<Record<string, unknown> | null> {
  try {
    return (await client.selectOne('$$teams', [teamId])) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function getRoster(
  client: RamaClient,
  teamId: string,
): Promise<Record<string, RosterMember>> {
  try {
    const v = await client.selectOne('$$roster', [teamId]);
    if (!v || typeof v !== 'object') return {};
    return v as Record<string, RosterMember>;
  } catch {
    return {};
  }
}

export async function getRosterMember(
  client: RamaClient,
  teamId: string,
  steamId: string,
): Promise<RosterMember | null> {
  try {
    const v = await client.selectOne('$$roster', [teamId, steamId]);
    if (!v || typeof v !== 'object') return null;
    return v as RosterMember;
  } catch {
    return null;
  }
}

export async function getPlayerSeasonTeam(
  client: RamaClient,
  steamId: string,
  seasonId: string,
): Promise<string | null> {
  try {
    const v = await client.selectOne('$$player-season', [steamId, seasonId]);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

export async function getPendingStatus(
  client: RamaClient,
  teamId: string,
  steamId: string,
): Promise<number | null> {
  try {
    const v = await client.selectOne('$$pending', [teamId, steamId, 'status']);
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** Pending rows for a team: steamId → { status }. */
export async function getPendingForTeam(
  client: RamaClient,
  teamId: string,
): Promise<Record<string, { status: number }>> {
  try {
    const v = await client.selectOne('$$pending', [teamId]);
    if (!v || typeof v !== 'object') return {};
    return v as Record<string, { status: number }>;
  } catch {
    return {};
  }
}

/** Pending statuses keyed by teamId for a player. */
export async function getPendingByPlayer(
  client: RamaClient,
  steamId: string,
): Promise<Record<string, number>> {
  try {
    const v = await client.selectOne('$$pending-by-player', [steamId]);
    if (!v || typeof v !== 'object') return {};
    return v as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Awaiting-admin pending keys from $$pending-awaiting["all"].
 * Keys are "teamId:steamId".
 */
export async function getAwaitingPendingKeys(client: RamaClient): Promise<string[]> {
  try {
    const v = await client.selectOne('$$pending-awaiting', ['all']);
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v as Record<string, boolean>);
  } catch {
    return [];
  }
}

/** teamId → status for a season from $$team-ids-by-season. */
export async function getTeamIdsBySeason(
  client: RamaClient,
  seasonId: string,
): Promise<Record<string, string>> {
  try {
    const v = await client.selectOne('$$team-ids-by-season', [seasonId]);
    if (!v || typeof v !== 'object') return {};
    return v as Record<string, string>;
  } catch {
    return {};
  }
}

/** seasonId → teamId for a player from $$player-season. */
export async function getPlayerSeasonMap(
  client: RamaClient,
  steamId: string,
): Promise<Record<string, string>> {
  try {
    const v = await client.selectOne('$$player-season', [steamId]);
    if (!v || typeof v !== 'object') return {};
    return v as Record<string, string>;
  } catch {
    return {};
  }
}
