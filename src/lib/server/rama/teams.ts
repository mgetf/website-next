/**
 * Typed helpers for TeamsModule over Rama REST JSON.
 *
 * @lintignore Spike team helpers; production team routes still use Postgres.
 */

import { RamaClient, type AckLevel } from './client';

export const TEAMS_MODULE = 'mge.tf.rama.teams-module/TeamsModule';
export const TEAM_DEPOT = '*team-depot';

export type TeamAck = {
  ok: boolean;
  error?: string;
  teamId?: string;
  steamId?: string;
  status?: string;
  permissionLevel?: string;
  type?: string;
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
  },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'create-team', ...event }, ackLevel));
}

export async function joinTeam(
  client: RamaClient,
  event: { teamId: string; steamId: string },
  ackLevel: AckLevel = 'ack',
): Promise<TeamAck> {
  return asAck(await client.append(TEAM_DEPOT, { type: 'join-team', ...event }, ackLevel));
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
