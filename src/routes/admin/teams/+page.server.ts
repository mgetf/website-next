import type { PageServerLoad, Actions } from './$types';
import { requireAdmin, requireStrictAdmin, isStrictAdmin } from '$lib/server/auth/permissions';
import { TeamStatus } from '$prisma/client.js';
import { fail } from '@sveltejs/kit';
import { getSeasonsForFilter } from '$lib/server/services/seasons';
import { getRegionsForFilter } from '$lib/server/services/regions';
import { getDivisionsForFilter } from '$lib/server/services/divisions';
import { getTeams, countTeams, updateTeam, getTeamAuditSnapshot } from '$lib/server/services/teams';
import { disbandTeam, hardDeleteTeam } from '$lib/server/services/teamManagement';
import { change1v1Status } from '$lib/server/services/signup1v1';
import { getFormatsForFilter } from '$lib/server/services/formats';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { getMatchesByTeamIds } from '$lib/server/services/adminMatches';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

// Zod schema for team update form
const updateTeamSchema = z.object({
  teamId: z.coerce.number().int().positive('Invalid team ID'),
  name: z.string().min(1, 'Team name is required').max(50, 'Team name too long'),
  acronym: z.string().max(6, 'Acronym too long').optional().default(''),
  seasonId: z.string().optional(),
  divisionId: z.string().optional(),
  regionId: z.string().optional(),
  status: z.string().optional(),
});

// Zod schema for team disband form
const disbandTeamSchema = z.object({
  teamId: z.coerce.number().int().positive('Invalid team ID'),
});

const hardDeleteTeamSchema = z.object({
  teamId: z.coerce.number().int().positive('Invalid team ID'),
  cascadeMatches: z.coerce.boolean().optional().default(false),
});

const restore1v1Schema = z.object({
  teamId: z.coerce.number().int().positive('Invalid team ID'),
});

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  // Parse query parameters
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
  const search = url.searchParams.get('search') || '';
  const divisionFilter = url.searchParams.get('division');
  const regionFilter = url.searchParams.get('region');
  const statusFilter = url.searchParams.get('status');
  const seasonFilter = url.searchParams.get('season');
  const formatFilter = url.searchParams.get('format');
  const paymentFilter = url.searchParams.get('payment');

  // Parse filters
  const divisionId =
    divisionFilter && divisionFilter !== 'all' ? parseInt(divisionFilter) : undefined;
  const regionId = regionFilter && regionFilter !== 'all' ? parseInt(regionFilter) : undefined;
  const seasonId = seasonFilter && seasonFilter !== 'all' ? parseInt(seasonFilter) : undefined;
  const formatId = formatFilter && formatFilter !== 'all' ? parseInt(formatFilter) : undefined;

  let status: TeamStatus | undefined;
  if (statusFilter && statusFilter !== 'all') {
    const statusInt = parseInt(statusFilter);
    if (statusInt === 0) status = TeamStatus.UNREADY;
    else if (statusInt === 1) status = TeamStatus.PENDING;
    else if (statusInt === 2) status = TeamStatus.READY;
    else if (statusInt === 3) status = TeamStatus.DEAD;
  }

  let paymentStatus: number | undefined;
  if (paymentFilter && paymentFilter !== 'all') {
    const p = parseInt(paymentFilter);
    if (p === 0 || p === 1 || p === 2) paymentStatus = p;
  }

  // Get total count for pagination
  const totalTeams = await countTeams({
    search,
    divisionId,
    regionId,
    status,
    seasonId,
    formatId,
    paymentStatus,
  });

  // Fetch teams with pagination
  const teams = await getTeams({
    search,
    divisionId,
    regionId,
    status,
    seasonId,
    formatId,
    paymentStatus,
    page,
    pageSize,
  });

  // Fetch divisions for filter
  const divisions = await getDivisionsForFilter();

  // Fetch regions for filter
  const regions = await getRegionsForFilter();

  // Fetch seasons for filter
  const seasons = await getSeasonsForFilter();

  const formats = await getFormatsForFilter();

  const teamIds = teams.map((t) => t.id);

  const matchesByTeam = isStrictAdmin(locals.user) ? await getMatchesByTeamIds(teamIds) : [];

  const matchMap = new Map<number, typeof matchesByTeam>();
  for (const match of matchesByTeam) {
    for (const tid of [match.homeTeamId, match.awayTeamId]) {
      if (teamIds.includes(tid)) {
        const list = matchMap.get(tid) || [];
        list.push(match);
        matchMap.set(tid, list);
      }
    }
  }

  return {
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      acronym: team.acronym,
      avatar: team.avatar,
      record: `${team.wins}-${team.losses}`,
      wins: team.wins,
      losses: team.losses,
      status: team.status,
      paymentStatus: team.paymentStatus,
      formatId: team.formatId,
      division: team.division,
      region: team.region,
      season: team.season,
      matchCount: team._count.homeMatches + team._count.awayMatches,
      matches: (matchMap.get(team.id) || []).map((m) => ({
        id: m.id,
        weekNo: m.weekNo,
        status: m.status,
        winnerScore: m.winnerScore,
        loserScore: m.loserScore,
        matchDateTime: m.matchDateTime?.toISOString() ?? null,
        homeTeam: m.homeTeam.name,
        awayTeam: m.awayTeam.name,
      })),
    })),
    divisions,
    regions,
    seasons,
    formats,
    pagination: {
      page,
      pageSize,
      totalTeams,
      totalPages: Math.ceil(totalTeams / pageSize),
    },
    filters: {
      search,
      division: divisionFilter || '',
      region: regionFilter || '',
      status: statusFilter || '',
      season: seasonFilter || '',
      format: formatFilter || '',
      payment: paymentFilter || '',
    },
    isStrictAdmin: isStrictAdmin(locals.user),
  };
};

export const actions: Actions = {
  updateTeam: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();

    // Validate form data with Zod
    const validation = validateForm(formData, updateTeamSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { teamId, name, acronym, seasonId, divisionId, regionId, status } = validation.data;

    try {
      const before = await getTeamAuditSnapshot(teamId);
      if (!before) {
        return fail(404, { error: 'Team not found' });
      }

      // Parse status enum
      let teamStatus: TeamStatus | undefined;
      if (status) {
        const statusInt = parseInt(status);
        if (statusInt === -1) teamStatus = TeamStatus.DEAD;
        else if (statusInt === 0) teamStatus = TeamStatus.UNREADY;
        else if (statusInt === 1) teamStatus = TeamStatus.PENDING;
        else if (statusInt === 2) teamStatus = TeamStatus.READY;
        else if (statusInt === 3) teamStatus = TeamStatus.PLACEMENT;
      }

      const nextSeasonId = seasonId === 'none' ? null : seasonId ? parseInt(seasonId) : null;
      const nextDivisionId =
        divisionId === 'none' ? null : divisionId ? parseInt(divisionId) : null;
      const nextRegionId = regionId === 'none' ? null : regionId ? parseInt(regionId) : null;

      // For 1v1 entries, status changes need side effects (player activation/deactivation)
      const is1v1 = before.formatId === FORMAT_1V1;
      const statusChanging = teamStatus !== undefined && teamStatus !== before.status;

      if (is1v1 && statusChanging) {
        await change1v1Status(teamId, teamStatus!);
        await updateTeam(teamId, {
          name,
          acronym,
          seasonId: nextSeasonId,
          divisionId: nextDivisionId,
          regionId: nextRegionId,
        });
      } else {
        await updateTeam(teamId, {
          name,
          acronym,
          seasonId: nextSeasonId,
          divisionId: nextDivisionId,
          regionId: nextRegionId,
          status: teamStatus,
        });
      }

      const after = await getTeamAuditSnapshot(teamId);
      const changedFields = after
        ? [
            before.name !== after.name ? 'name' : null,
            before.acronym !== after.acronym ? 'acronym' : null,
            before.seasonId !== after.seasonId ? 'seasonId' : null,
            before.divisionId !== after.divisionId ? 'divisionId' : null,
            before.regionId !== after.regionId ? 'regionId' : null,
            before.status !== after.status ? 'status' : null,
          ].filter((field): field is string => field !== null)
        : [];
      const statusChanged = after ? before.status !== after.status : teamStatus !== undefined;

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.TEAM,
        action: statusChanged ? AuditAction.TEAM_STATUS_CHANGED : AuditAction.TEAM_UPDATED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          changedFields: changedFields.join(',') || null,
          nameBefore: before.name,
          nameAfter: after?.name ?? null,
          acronymBefore: before.acronym,
          acronymAfter: after?.acronym ?? null,
          seasonIdBefore: before.seasonId,
          seasonIdAfter: after?.seasonId ?? null,
          seasonNumBefore: before.seasonNum,
          seasonNumAfter: after?.seasonNum ?? null,
          divisionIdBefore: before.divisionId,
          divisionIdAfter: after?.divisionId ?? null,
          divisionNameBefore: before.divisionName,
          divisionNameAfter: after?.divisionName ?? null,
          regionIdBefore: before.regionId,
          regionIdAfter: after?.regionId ?? null,
          regionNameBefore: before.regionName,
          regionNameAfter: after?.regionName ?? null,
          statusBefore: before.status,
          statusAfter: after?.status ?? null,
        },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Team updated successfully!' };
    } catch (error) {
      console.error('Error updating team:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update team',
      });
    }
  },

  disbandTeam: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();

    // Validate form data with Zod
    const validation = validateForm(formData, disbandTeamSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { teamId } = validation.data;

    try {
      const before = await getTeamAuditSnapshot(teamId);
      await disbandTeam(teamId);
      const after = await getTeamAuditSnapshot(teamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_DISBANDED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          nameBefore: before?.name ?? null,
          statusBefore: before?.status ?? null,
          statusAfter: after?.status ?? null,
          seasonIdBefore: before?.seasonId ?? null,
          divisionIdBefore: before?.divisionId ?? null,
          divisionNameBefore: before?.divisionName ?? null,
          regionIdBefore: before?.regionId ?? null,
          regionNameBefore: before?.regionName ?? null,
        },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Team disbanded successfully!' };
    } catch (error) {
      console.error('Error disbanding team:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to disband team',
      });
    }
  },

  hardDeleteTeam: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();

    const validation = validateForm(formData, hardDeleteTeamSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { teamId, cascadeMatches } = validation.data;

    try {
      const before = await getTeamAuditSnapshot(teamId);
      const { teamName, deletedMatches } = await hardDeleteTeam(teamId, cascadeMatches);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_DELETED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          teamName,
          deletedMatches,
          cascadeMatches,
          statusBefore: before?.status ?? null,
          seasonIdBefore: before?.seasonId ?? null,
          seasonNumBefore: before?.seasonNum ?? null,
          divisionIdBefore: before?.divisionId ?? null,
          divisionNameBefore: before?.divisionName ?? null,
          regionIdBefore: before?.regionId ?? null,
          regionNameBefore: before?.regionName ?? null,
        },
        ipAddress: getClientAddress(),
      });

      const matchMsg =
        deletedMatches > 0 ? ` and ${deletedMatches} match${deletedMatches !== 1 ? 'es' : ''}` : '';
      return { success: true, message: `Team "${teamName}"${matchMsg} permanently deleted.` };
    } catch (error) {
      console.error('Error hard-deleting team:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to delete team',
      });
    }
  },

  restore1v1: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();

    // Validate form data with Zod
    const validation = validateForm(formData, restore1v1Schema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { teamId } = validation.data;

    try {
      const { restore1v1Entry } = await import('$lib/server/services/signup1v1');
      await restore1v1Entry(teamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.SIGNUP,
        action: AuditAction.SIGNUP_1V1_CREATED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { action: 'restore' },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player restored successfully!' };
    } catch (error) {
      console.error('Error restoring 1v1 entry:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to restore player',
      });
    }
  },
};
