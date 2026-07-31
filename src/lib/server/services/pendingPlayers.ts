/**
 * Pending Players Service
 *
 * Single source of truth for approving/declining pending player join requests.
 * Audit logging is built in — callers pass an AuditContext so every code path
 * is automatically tracked.
 */

import { badRequest } from '$lib/server/utils/errors';
import { FORMAT_2V2 } from '$lib/server/constants/formats';
import { getCurrentSignupSeasonIds } from './signupSeasons';
import { logAudit, AuditCategory, AuditAction } from './auditLog';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import {
  approvePending,
  createTeamsClient,
  declinePending,
  getAwaitingPendingKeys,
  getTeam,
} from '$lib/server/rama/teams';
import { createUsersClient, getUser } from '$lib/server/rama/users';
import { createDivisionsClient, getDivision } from '$lib/server/rama/divisions';
import { createCatalogClient, getRegion } from '$lib/server/rama/catalog';

export interface AuditContext {
  actorId: string;
  actorRole: string;
  ipAddress: string;
}

/**
 * Get all pending player requests with related data
 */
export async function getPendingPlayers() {
  if (isRamaBackend()) {
    const opts = ramaClientOpts();
    const teamsClient = createTeamsClient(opts);
    const usersClient = createUsersClient(opts);
    const divisionsClient = createDivisionsClient(opts);
    const catalogClient = createCatalogClient(opts);
    const keys = await getAwaitingPendingKeys(teamsClient);
    const rows = [];
    for (const key of keys.sort()) {
      const [teamIdStr, steamId] = key.split(':');
      if (!teamIdStr || !steamId) continue;
      const teamId = Number(teamIdStr);
      const team = await getTeam(teamsClient, teamIdStr);
      if (!team) continue;
      const user = await getUser(usersClient, steamId);
      const divisionId = Number(team.divisionId);
      const regionId = Number(team.regionId);
      const division = Number.isFinite(divisionId)
        ? await getDivision(divisionsClient, String(divisionId))
        : null;
      const region = Number.isFinite(regionId)
        ? await getRegion(catalogClient, String(regionId))
        : null;
      rows.push({
        playerSteamId: steamId,
        teamId,
        status: 1,
        player: {
          steamId,
          steamUsername: String(user?.username ?? steamId),
          steamAvatar: String(user?.avatarUrl ?? ''),
        },
        team: {
          id: teamId,
          name: String(team.name ?? ''),
          seasonId: Number(team.seasonId) || null,
          divisionId: Number.isFinite(divisionId) ? divisionId : null,
          regionId: Number.isFinite(regionId) ? regionId : null,
          division: division
            ? {
                id: divisionId,
                name: division.name,
                signupCost: Number(division.signupCost ?? 0),
              }
            : null,
          region: region
            ? {
                id: regionId,
                name: region.name,
              }
            : null,
        },
      });
    }
    return rows;
  }
  throw new Error('getPendingPlayers requires DATA_BACKEND=rama');
}

/**
 * Approve a pending player and add them to the team.
 * Validates roster size, duplicate season membership, computes payment status,
 * cleans up stale memberships, and logs the action.
 */
export async function approvePlayer(playerSteamId: string, teamId: number, audit: AuditContext) {
  if (isRamaBackend()) {
    const ack = await approvePending(createTeamsClient(ramaClientOpts()), {
      teamId: String(teamId),
      steamId: playerSteamId,
    });
    if (!ack.ok) {
      if (ack.error === 'roster-full') badRequest('Team is full (maximum 3 players)');
      if (ack.error === 'player-already-on-team') {
        badRequest('Player is already in another 2v2 team for this season');
      }
      badRequest(ack.error ?? 'Failed to approve player');
    }

    await logAudit({
      actorId: audit.actorId,
      actorRole: audit.actorRole,
      category: AuditCategory.ROSTER,
      action: AuditAction.PLAYER_APPROVED,
      targetType: 'Team',
      targetId: String(teamId),
      metadata: { playerSteamId },
      ipAddress: audit.ipAddress,
    });
    return;
  }
  throw new Error('approvePlayer requires DATA_BACKEND=rama');
}

/**
 * Decline a pending player request.
 * Always creates a DeniedPlayer record for the audit trail.
 * `reason` is optional — admin routes enforce it at the form-validation level,
 * but team captains may decline without one.
 */
export async function declinePlayer(
  playerSteamId: string,
  teamId: number,
  audit: AuditContext,
  reason?: string,
) {
  if (isRamaBackend()) {
    const ack = await declinePending(createTeamsClient(ramaClientOpts()), {
      teamId: String(teamId),
      steamId: playerSteamId,
    });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to decline player');

    await logAudit({
      actorId: audit.actorId,
      actorRole: audit.actorRole,
      category: AuditCategory.ROSTER,
      action: AuditAction.PLAYER_DENIED,
      targetType: 'Team',
      targetId: String(teamId),
      metadata: { playerSteamId, ...(reason ? { reason } : {}) },
      ipAddress: audit.ipAddress,
    });
    return;
  }
  throw new Error('declinePlayer requires DATA_BACKEND=rama');
}
