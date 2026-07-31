/**
 * Team Service
 *
 * All team-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { TeamStatus, NotificationType } from '$prisma/client.js';
import type { Prisma } from '$prisma/client.js';
import { FORMAT_2V2 } from '$lib/server/constants/formats';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import { notFound, badRequest, forbidden } from '$lib/server/utils/errors';
import { createNotificationForUser } from '$lib/server/services/notifications';

/**
 * Get teams with filtering, search, and pagination
 * Used by admin teams page
 */
export async function getTeams(options: {
  search?: string;
  divisionId?: number;
  regionId?: number;
  status?: TeamStatus;
  seasonId?: number;
  formatId?: number;
  paymentStatus?: number;
  page?: number;
  pageSize?: number;
}) {
  const {
    search,
    divisionId,
    regionId,
    status,
    seasonId,
    formatId,
    paymentStatus,
    page = 1,
    pageSize = 20,
  } = options;

  // Build where clause
  const where: Prisma.TeamWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { acronym: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (divisionId) where.divisionId = divisionId;
  if (regionId) where.regionId = regionId;
  if (status) where.status = status;
  if (seasonId) where.seasonId = seasonId;
  if (formatId) where.formatId = formatId;
  if (paymentStatus !== undefined) where.paymentStatus = paymentStatus;

  const teams = await prisma.team.findMany({
    where,
    include: {
      division: {
        select: {
          id: true,
          name: true,
        },
      },
      region: {
        select: {
          id: true,
          name: true,
        },
      },
      season: {
        select: {
          id: true,
          seasonNum: true,
        },
      },
      _count: {
        select: {
          homeMatches: true,
          awayMatches: true,
        },
      },
    },
    orderBy: [{ status: 'desc' }, { wins: 'desc' }, { losses: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return teams;
}

/**
 * Get teams for public listing with pagination
 */
export async function getTeamsPublic(
  page: number = 1,
  search?: string,
  regionId?: number,
  seasonId?: number,
) {
  const TEAMS_PER_PAGE = 50;
  const skip = (page - 1) * TEAMS_PER_PAGE;

  const where: Prisma.TeamWhereInput = { formatId: FORMAT_2V2 };

  if (search && search.trim().length > 0) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { acronym: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (regionId) {
    where.regionId = regionId;
  }

  if (seasonId) {
    where.seasonId = seasonId;
  }

  const [teams, totalCount] = await Promise.all([
    prisma.team.findMany({
      where,
      select: {
        id: true,
        name: true,
        acronym: true,
        avatar: true,
        wins: true,
        losses: true,
        status: true,
        division: {
          select: {
            id: true,
            name: true,
          },
        },
        region: {
          select: {
            id: true,
            name: true,
          },
        },
        season: {
          select: {
            id: true,
            seasonNum: true,
          },
        },
        _count: {
          select: {
            players: {
              where: { active: 1 },
            },
          },
        },
      },
      orderBy: [{ wins: 'desc' }, { losses: 'asc' }, { id: 'asc' }],
      skip,
      take: TEAMS_PER_PAGE,
    }),
    prisma.team.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / TEAMS_PER_PAGE);

  return {
    teams,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      perPage: TEAMS_PER_PAGE,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Count teams with filters
 * Used for pagination
 */
export async function countTeams(options: {
  search?: string;
  divisionId?: number;
  regionId?: number;
  status?: TeamStatus;
  seasonId?: number;
  formatId?: number;
  paymentStatus?: number;
}) {
  const { search, divisionId, regionId, status, seasonId, formatId, paymentStatus } = options;

  const where: Prisma.TeamWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { acronym: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (divisionId) where.divisionId = divisionId;
  if (regionId) where.regionId = regionId;
  if (status) where.status = status;
  if (seasonId) where.seasonId = seasonId;
  if (formatId) where.formatId = formatId;
  if (paymentStatus !== undefined) where.paymentStatus = paymentStatus;

  return await prisma.team.count({ where });
}

/**
 * Get teams for standings/league view
 * Returns teams with calculated stats
 */
export async function getTeamsForStandings(options: {
  seasonId?: number;
  regionId?: number;
  divisionId?: number;
  statuses?: TeamStatus[];
  limit?: number;
}) {
  const { seasonId, regionId, divisionId, statuses, limit } = options;

  const where: Prisma.TeamWhereInput = {};

  if (seasonId) where.seasonId = seasonId;
  if (regionId) where.regionId = regionId;
  if (divisionId) where.divisionId = divisionId;
  if (statuses && statuses.length > 0) {
    where.status = { in: statuses };
  }

  const teams = await prisma.team.findMany({
    where,
    select: {
      id: true,
      name: true,
      acronym: true,
      avatar: true,
      wins: true,
      losses: true,
      pointsScored: true,
      pointsScoredAgainst: true,
      gamesWon: true,
      gamesLost: true,
      paymentStatus: true,
      division: {
        select: {
          id: true,
          name: true,
        },
      },
      region: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ wins: 'desc' }, { losses: 'asc' }, { pointsScored: 'desc' }],
    take: limit,
  });

  return teams;
}

/**
 * Get teams by division for league standings
 * Returns teams with calculated average points
 */
export async function getTeamsByDivision(
  divisionId: number,
  seasonId: number,
  regionId: number,
  statuses: string[],
) {
  const teams = await prisma.team.findMany({
    where: {
      seasonId,
      regionId,
      divisionId,
      status: { in: statuses as any },
    },
    select: {
      id: true,
      name: true,
      acronym: true,
      avatar: true,
      status: true,
      wins: true,
      losses: true,
      gamesWon: true,
      gamesLost: true,
      pointsScored: true,
      pointsScoredAgainst: true,
      paymentStatus: true,
      players: {
        select: {
          playerSteamId: true,
          player: {
            select: {
              steamId: true,
              steamUsername: true,
            },
          },
        },
      },
    },
  });

  // Calculate derived stats and sort by average points
  return teams
    .map((team) => {
      const totalGames = team.gamesWon + team.gamesLost;
      const avgPoints = totalGames > 0 ? team.pointsScored / totalGames : 0;

      return {
        id: team.id,
        name: team.name,
        acronym: team.acronym,
        avatar: team.avatar,
        status: team.status,
        wins: team.wins,
        losses: team.losses,
        points: parseFloat(avgPoints.toFixed(1)),
        paymentStatus: team.paymentStatus,
        players: team.players,
        _sortKey: avgPoints, // temporary field for sorting
      };
    })
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      return b._sortKey - a._sortKey;
    })
    .map(({ _sortKey, ...team }) => team); // Remove temporary sort key
}

/**
 * Get a single team by ID
 */
function permToInt(level: string | undefined): number {
  if (level === 'STATUS') return 2;
  if (level === 'ADMIN') return 1;
  return 0;
}

function paymentToInt(status: string | undefined): number {
  if (status === 'PAID' || status === 'MARKED_PAID') return 1;
  if (status === 'FREE' || status === 'NOT_REQUIRED') return 2;
  return 0;
}

async function getTeamByIdRama(id: number) {
  const opts = ramaClientOpts();
  const teamsClient = (await import('$lib/server/rama/teams')).createTeamsClient(opts);
  const { getTeam, getRoster } = await import('$lib/server/rama/teams');
  const { createDivisionsClient, getDivision } = await import('$lib/server/rama/divisions');
  const { createCatalogClient, getRegion } = await import('$lib/server/rama/catalog');
  const { createSeasonsClient, getSeason } = await import('$lib/server/rama/seasons');
  const { createUsersClient, getUser } = await import('$lib/server/rama/users');

  const teamId = String(id);
  const row = await getTeam(teamsClient, teamId);
  if (!row) return null;

  const roster = await getRoster(teamsClient, teamId);
  const usersClient = createUsersClient(opts);
  const players = [];
  for (const [steamId, member] of Object.entries(roster)) {
    const user = await getUser(usersClient, steamId);
    players.push({
      playerSteamId: steamId,
      teamId: id,
      active: member.active ? 1 : 0,
      permissionLevel: permToInt(member.permissionLevel),
      paymentStatus: paymentToInt(member.paymentStatus),
      startedAt: new Date(0),
      leftAt: null,
      player: {
        steamId,
        steamUsername: String(user?.username ?? steamId),
        steamAvatar: String(user?.avatarUrl ?? ''),
      },
    });
  }

  const divisionId = Number(row.divisionId);
  const regionId = Number(row.regionId);
  const seasonId = Number(row.seasonId);
  const division = Number.isFinite(divisionId)
    ? await getDivision(createDivisionsClient(opts), String(divisionId))
    : null;
  const region = Number.isFinite(regionId)
    ? await getRegion(createCatalogClient(opts), String(regionId))
    : null;
  const season = Number.isFinite(seasonId)
    ? await getSeason(createSeasonsClient(opts), String(seasonId))
    : null;

  return {
    id,
    name: String(row.name ?? ''),
    acronym: String(row.acronym ?? '') || null,
    formatId: Number(row.formatId),
    seasonId: Number.isFinite(seasonId) ? seasonId : null,
    divisionId: Number.isFinite(divisionId) ? divisionId : null,
    regionId: Number.isFinite(regionId) ? regionId : null,
    status: String(row.status ?? 'UNREADY') as TeamStatus,
    createdBy: String(row.createdBy ?? ''),
    joinPassword: String(row.joinPassword ?? ''),
    paymentStatus: 0,
    avatar: null,
    wins: 0,
    losses: 0,
    gamesWon: 0,
    gamesLost: 0,
    pointsScored: 0,
    pointsScoredAgainst: 0,
    createdAt: new Date(0),
    division: division
      ? {
          id: divisionId,
          name: division.name,
          regionId,
          signupCost: Number(division.signupCost ?? 0),
          sortOrder: Number(division.sortOrder ?? 0),
        }
      : null,
    region: region
      ? {
          id: regionId,
          name: region.name,
          hidden: region.hidden,
          currencySymbol: region.currencySymbol,
          currencyCode: region.currencyCode,
        }
      : null,
    season: season
      ? {
          id: seasonId,
          seasonNum: Number(season.seasonNum),
          numWeeks: Number(season.numWeeks),
          regionId,
          formatId: Number(season.formatId),
          signupsOpen: Boolean(season.signupsOpen),
          rosterLocked: Boolean(season.rosterLocked),
          paymentRequired: Boolean(season.paymentRequired),
          matchWeek: Number(season.matchWeek ?? 0),
          matchDeadline: season.matchDeadline || null,
          info: season.info ?? '',
        }
      : null,
    players,
    homeMatches: [] as never[],
    awayMatches: [] as never[],
    _count: {
      players: players.length,
      homeMatches: 0,
      awayMatches: 0,
    },
  };
}

export async function getTeamById(id: number) {
  if (isRamaBackend()) return getTeamByIdRama(id);

  return await prisma.team.findUnique({
    where: { id },
    include: {
      division: true,
      region: true,
      season: true,
      players: {
        include: {
          player: {
            select: {
              steamId: true,
              steamUsername: true,
              steamAvatar: true,
            },
          },
        },
        orderBy: {
          startedAt: 'asc',
        },
      },
      homeMatches: {
        include: {
          awayTeam: {
            select: {
              id: true,
              name: true,
              acronym: true,
            },
          },
          season: {
            select: {
              id: true,
              seasonNum: true,
            },
          },
        },
        orderBy: {
          matchDateTime: 'desc',
        },
      },
      awayMatches: {
        include: {
          homeTeam: {
            select: {
              id: true,
              name: true,
              acronym: true,
            },
          },
          season: {
            select: {
              id: true,
              seasonNum: true,
            },
          },
        },
        orderBy: {
          matchDateTime: 'desc',
        },
      },
      _count: {
        select: {
          players: true,
          homeMatches: true,
          awayMatches: true,
        },
      },
    },
  });
}

/**
 * Get a compact team snapshot for audit metadata.
 */
export async function getTeamAuditSnapshot(id: number) {
  if (isRamaBackend()) return null;

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      acronym: true,
      status: true,
      seasonId: true,
      divisionId: true,
      regionId: true,
      paymentStatus: true,
      formatId: true,
      avatar: true,
      division: {
        select: {
          name: true,
        },
      },
      region: {
        select: {
          name: true,
        },
      },
      season: {
        select: {
          seasonNum: true,
        },
      },
    },
  });

  if (!team) return null;

  return {
    id: team.id,
    name: team.name,
    acronym: team.acronym ?? null,
    status: team.status,
    seasonId: team.seasonId ?? null,
    divisionId: team.divisionId ?? null,
    regionId: team.regionId ?? null,
    paymentStatus: team.paymentStatus,
    formatId: team.formatId,
    avatar: team.avatar ?? null,
    divisionName: team.division?.name ?? null,
    regionName: team.region?.name ?? null,
    seasonNum: team.season?.seasonNum ?? null,
  };
}

/**
 * Update team metadata (name, acronym, seasonId, regionId).
 * Does NOT handle status or division changes — use adminSetTeamStatus() and
 * changeTeamDivision() for those, as they carry payment side-effects.
 */
export async function updateTeam(
  id: number,
  data: {
    name: string;
    acronym?: string | null;
    seasonId?: number | null;
    regionId?: number | null;
  },
) {
  const trimmedName = data.name.trim();

  if (!trimmedName) {
    throw new Error('Team name is required');
  }

  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) {
    throw new Error('Team not found');
  }

  return await prisma.team.update({
    where: { id },
    data: {
      name: trimmedName,
      acronym: data.acronym?.trim() || null,
      seasonId: data.seasonId,
      regionId: data.regionId,
    },
  });
}

/**
 * Set a team's status with payment enforcement (admin action).
 *
 * Setting to READY is hard-blocked for paid divisions unless all required
 * players already have a non-zero paymentStatus. Admins must use the
 * "Mark as paid" action first.
 */
export async function adminSetTeamStatus(id: number, status: TeamStatus) {
  if (isRamaBackend()) {
    const team = await getTeamByIdRama(id);
    if (!team) notFound('Team not found');

    if (status === TeamStatus.READY || status === TeamStatus.PENDING) {
      const isFreeDiv = !team.division || team.division.signupCost === 0;
      if (!isFreeDiv) {
        const paidCount = team.players.filter(
          (p) => p.active === 1 && p.paymentStatus !== 0,
        ).length;
        if (paidCount < MIN_PAID_PLAYERS_TO_READY) {
          badRequest(
            `Cannot set team to ${status}: at least ${MIN_PAID_PLAYERS_TO_READY} active players must be marked as paid first`,
          );
        }
      }
    }

    const { createTeamsClient, setTeamStatus } = await import('$lib/server/rama/teams');
    const ack = await setTeamStatus(createTeamsClient(ramaClientOpts()), {
      teamId: String(id),
      status: status as 'UNREADY' | 'PENDING' | 'READY' | 'DEAD' | 'PLACEMENT',
    });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to set status');
    return { id, status };
  }

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      division: { select: { signupCost: true } },
      players: {
        where: { active: 1 },
        select: { paymentStatus: true },
      },
    },
  });

  if (!team) notFound('Team not found');

  if (status === TeamStatus.READY || status === TeamStatus.PENDING) {
    const isFreeDiv = !team.division || team.division.signupCost === 0;
    if (!isFreeDiv) {
      const paidCount = team.players.filter((p) => p.paymentStatus !== 0).length;
      if (paidCount < MIN_PAID_PLAYERS_TO_READY) {
        badRequest(
          `Cannot set team to ${status}: at least ${MIN_PAID_PLAYERS_TO_READY} active players must be marked as paid first`,
        );
      }
    }
  }

  return await prisma.team.update({
    where: { id },
    data: { status },
  });
}

const MIN_PAID_PLAYERS_TO_READY = 2;

/**
 * Toggle a team from UNREADY to PENDING.
 * Requires the caller to be a team admin (permissionLevel >= 1)
 * and at least MIN_PAID_PLAYERS_TO_READY active players to be paid.
 */
export async function toggleTeamReady(teamId: number, userSteamId: string) {
  if (isRamaBackend()) {
    const team = await getTeamByIdRama(teamId);
    if (!team) notFound('Team not found');

    const caller = team.players.find((p) => p.playerSteamId === userSteamId && p.active === 1);
    if (!caller || caller.permissionLevel < 1) {
      forbidden('Only team admins can toggle ready');
    }

    if (team.status !== TeamStatus.UNREADY) {
      badRequest('Team must be in UNREADY status to toggle ready');
    }

    const isFreeDiv = !team.division || team.division.signupCost === 0;
    if (!isFreeDiv) {
      const paidCount = team.players.filter((p) => p.active === 1 && p.paymentStatus !== 0).length;
      if (paidCount < MIN_PAID_PLAYERS_TO_READY) {
        badRequest(`At least ${MIN_PAID_PLAYERS_TO_READY} players must be paid before readying up`);
      }
    }

    const { createTeamsClient, setTeamStatus } = await import('$lib/server/rama/teams');
    const ack = await setTeamStatus(createTeamsClient(ramaClientOpts()), {
      teamId: String(teamId),
      status: 'PENDING',
    });
    if (!ack.ok) badRequest(ack.error ?? 'Failed to ready up');
    return { id: teamId, status: TeamStatus.PENDING };
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: {
        where: { active: 1 },
        select: { playerSteamId: true, permissionLevel: true, paymentStatus: true },
      },
      division: { select: { signupCost: true } },
    },
  });

  if (!team) notFound('Team not found');

  const caller = team.players.find((p) => p.playerSteamId === userSteamId);
  if (!caller || caller.permissionLevel < 1) {
    forbidden('Only team admins can toggle ready');
  }

  if (team.status !== TeamStatus.UNREADY) {
    badRequest('Team must be in UNREADY status to toggle ready');
  }

  const isFreeDiv = !team.division || team.division.signupCost === 0;
  if (!isFreeDiv) {
    const paidCount = team.players.filter((p) => p.paymentStatus !== 0).length;
    if (paidCount < MIN_PAID_PLAYERS_TO_READY) {
      badRequest(`At least ${MIN_PAID_PLAYERS_TO_READY} players must be paid before readying up`);
    }
  }

  return await prisma.team.update({
    where: { id: teamId },
    data: { status: TeamStatus.PENDING },
  });
}

export interface ChangeTeamDivisionResult {
  oldDivision: { id: number; name: string; signupCost: number } | null;
  newDivision: { id: number; name: string; signupCost: number };
  paymentStatusReset: boolean;
  statusReset: boolean;
  notifiedPlayerSteamIds: string[];
}

/**
 * Change a team's division with payment status side-effects.
 *
 * Free → Paid:  resets paymentStatus to 0 for all active players and the team.
 * Paid → Free:  marks all active players and the team as paid (1), and sends
 *               a refund-eligibility notification to any players who had already paid.
 * Same tier:    no payment changes.
 */
export async function changeTeamDivision(
  teamId: number,
  newDivisionId: number,
  adminSteamId: string,
): Promise<ChangeTeamDivisionResult> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      division: true,
      players: {
        where: { active: 1 },
        select: { playerSteamId: true, paymentStatus: true },
      },
    },
  });

  if (!team) notFound('Team not found');

  const newDivision = await prisma.division.findUnique({ where: { id: newDivisionId } });

  if (!newDivision) notFound('Division not found');

  if (team.divisionId === newDivisionId) {
    badRequest('Team is already in that division');
  }

  if (team.regionId && newDivision.regionId !== team.regionId) {
    badRequest('Division must be in the same region as the team');
  }

  const oldDiv = team.division;
  const oldIsFree = !oldDiv || oldDiv.signupCost === 0;
  const newIsFree = newDivision.signupCost === 0;

  const notifiedPlayerSteamIds: string[] = [];
  let paymentStatusReset = false;
  let statusReset = false;

  await prisma.$transaction(async (tx) => {
    await tx.team.update({ where: { id: teamId }, data: { divisionId: newDivisionId } });

    if (oldIsFree && !newIsFree) {
      // Free → Paid: mark all active players and the team as unpaid.
      // If the team was READY or PENDING in the free division, kick it back to
      // UNREADY so it must go through the paid ready-up flow again.
      await tx.playerInTeam.updateMany({
        where: { teamId, active: 1 },
        data: { paymentStatus: 0 },
      });

      const statusNeedsReset =
        team.status === TeamStatus.READY || team.status === TeamStatus.PENDING;
      await tx.team.update({
        where: { id: teamId },
        data: {
          paymentStatus: 0,
          ...(statusNeedsReset ? { status: TeamStatus.UNREADY } : {}),
        },
      });
      paymentStatusReset = true;
      statusReset = statusNeedsReset;
    } else if (!oldIsFree && newIsFree) {
      // Paid → Free: mark everyone as exempt and notify players who actually paid (refund eligibility)
      await tx.playerInTeam.updateMany({
        where: { teamId, active: 1 },
        data: { paymentStatus: 2 },
      });
      await tx.team.update({ where: { id: teamId }, data: { paymentStatus: 2 } });

      const paidPlayers = team.players.filter((p) => p.paymentStatus === 1);
      for (const p of paidPlayers) {
        notifiedPlayerSteamIds.push(p.playerSteamId);
      }
    }
  });

  // Send notifications outside the transaction (non-critical)
  const teamUrl = `/teams/${teamId}`;
  const oldDivName = oldDiv?.name ?? 'Unknown';
  const refundMessage = `Your division was changed from ${oldDivName} to ${newDivision.name}. Since you already paid for ${oldDivName}, you may be entitled to a refund. Please contact an admin to discuss your options (PayPal refund, TF2 keys, or site credit for future signups).`;

  for (const steamId of notifiedPlayerSteamIds) {
    await createNotificationForUser(
      steamId,
      NotificationType.ADMIN_ACTION,
      teamUrl,
      refundMessage,
      adminSteamId,
    );
  }

  return {
    oldDivision: oldDiv
      ? { id: oldDiv.id, name: oldDiv.name, signupCost: oldDiv.signupCost }
      : null,
    newDivision: { id: newDivision.id, name: newDivision.name, signupCost: newDivision.signupCost },
    paymentStatusReset,
    statusReset,
    notifiedPlayerSteamIds,
  };
}

/**
 * Find the most recent season that has teams with specific statuses
 * Used to find default season for league pages
 */
export async function findRecentSeasonWithTeams(statuses: string[], formatId?: number) {
  return await prisma.team.findFirst({
    where: {
      status: { in: statuses as any },
      ...(formatId !== undefined && { formatId }),
    },
    orderBy: {
      seasonId: 'desc',
    },
    select: {
      seasonId: true,
      regionId: true,
    },
  });
}

/**
 * Get top 1v1 entries for the homepage card
 * Includes player steamId for profile links
 */
export async function getTop1v1EntriesForHomepage(options: {
  seasonId: number;
  divisionId: number;
  limit?: number;
  statuses?: string[];
}) {
  const { seasonId, divisionId, limit = 3, statuses = ['READY', 'PENDING'] } = options;

  const teams = await prisma.team.findMany({
    where: {
      seasonId,
      divisionId,
      status: { in: statuses as any },
    },
    select: {
      id: true,
      name: true,
      avatar: true,
      wins: true,
      losses: true,
      gamesWon: true,
      gamesLost: true,
      pointsScored: true,
      players: {
        select: {
          player: {
            select: {
              steamId: true,
            },
          },
        },
        take: 1,
      },
    },
    orderBy: [{ wins: 'desc' }, { losses: 'asc' }, { pointsScored: 'desc' }],
    take: limit,
  });

  return teams.map((team, index) => {
    const totalGames = team.gamesWon + team.gamesLost;
    const pointsPerGame =
      totalGames > 0 ? parseFloat((team.pointsScored / totalGames).toFixed(1)) : 0;
    return {
      rank: index + 1,
      id: team.id,
      name: team.name,
      avatar: team.avatar,
      steamId: team.players[0]?.player?.steamId ?? null,
      wins: team.wins,
      losses: team.losses,
      record: `${team.wins}-${team.losses}`,
      pointsPerGame,
    };
  });
}

/**
 * Get the team name a player is currently on for a given format and set of season IDs
 * Returns empty string if not found
 */
export async function getPlayerCurrentTeamName(
  steamId: string,
  formatId: number,
  seasonIds: number[],
): Promise<string> {
  if (seasonIds.length === 0) return '';
  const membership = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        formatId,
        seasonId: { in: seasonIds },
      },
    },
    include: { team: { select: { name: true } } },
  });
  return membership?.team?.name ?? '';
}

/**
 * Find the most recent season that has 1v1 entries with the given statuses
 * Returns { seasonId, regionId } or null if none found
 */
export async function findRecent1v1SeasonWithEntries(
  statuses: string[],
  formatId: number,
): Promise<{ seasonId: number; regionId: number } | null> {
  const result = await prisma.team.findFirst({
    where: {
      formatId,
      status: { in: statuses as any },
    },
    select: {
      seasonId: true,
      regionId: true,
      season: { select: { seasonNum: true } },
    },
    orderBy: [{ season: { seasonNum: 'desc' } }],
  });

  if (result?.seasonId && result?.regionId) {
    return { seasonId: result.seasonId, regionId: result.regionId };
  }
  return null;
}

/**
 * Get team format and player list for format-based redirect checks
 * Returns null if team not found
 */
export async function getTeamFormatCheck(teamId: number) {
  return await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      formatId: true,
      players: {
        select: { playerSteamId: true, active: true },
      },
    },
  });
}

/**
 * Helper: Calculate standings stats for a team
 */
export function calculateStandingsStats(team: {
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointsScored: number;
  pointsScoredAgainst: number;
}) {
  const totalGames = team.gamesWon + team.gamesLost;
  const ppg = totalGames > 0 ? (team.pointsScored / totalGames).toFixed(1) : '0.0';
  const winRate =
    team.wins + team.losses > 0
      ? ((team.wins / (team.wins + team.losses)) * 100).toFixed(1)
      : '0.0';

  return {
    pointsPerGame: parseFloat(ppg),
    winRate: parseFloat(winRate),
    record: `${team.wins}-${team.losses}`,
  };
}
