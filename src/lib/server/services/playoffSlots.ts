import { prisma } from '#lib/server/db.js';
import { badRequest, conflict, notFound } from '#lib/server/utils/errors.js';
import {
  buildPlayoffBracket,
  rankPlayoffField,
  selectPlayoffField,
  type PlayoffBracketFormat,
  type PlayoffSlotDraft,
} from '#lib/server/utils/playoffBracket.js';
import {
  planPlayoffAdvance,
  PlayoffAdvanceError,
  type AdvanceSection,
  type AdvanceSlot,
} from '#lib/server/utils/playoffAdvance.js';
import { planPlayoffPodium } from '#lib/server/utils/playoffPodium.js';
import { saveDivisionPlayoffPlacements } from '#lib/server/services/playoffPlacements.js';
import { createNotificationForRoster } from '#lib/server/services/notifications.js';
import { BracketSection, MatchStatus, PlayoffFormat, Prisma, TeamStatus } from '#prisma/client.js';
import { formatPlayoffSlotLabel, type PlayoffSlotSection } from '#lib/utils/playoffs.js';
import {
  discordRecipients,
  enqueueOutbox,
  regionChannels,
  siteUrl,
} from '#lib/server/services/outbox.js';
import {
  bracketCompleteItems,
  eliminatedTeamId,
  matchCreatedItems,
  scoreConfirmedItems,
  teamEliminatedItems,
  type OutboxItem,
} from '#lib/server/utils/playoffEvents.js';
import type { OutboxChannelIds } from '#lib/server/utils/outboxEvents.js';

const PLAYOFF_SERIES = 3;
const PLAYOFF_GAMES_PER_ARENA = 3;

function isPlayoffLength(length: number): boolean {
  return length === 1 || length === 3 || length === 5 || length === 7;
}

export type GeneratedPlayoffBracket = {
  divisionId: number;
  divisionName: string;
  format: PlayoffBracketFormat;
  teamCount: number;
  slotCount: number;
  matchCount: number;
};

/** Round name for a playoff match created from a slot, or null when the match is not one. */
export async function getPlayoffMatchLabel(matchId: number): Promise<string | null> {
  const slot = await prisma.playoffSlot.findUnique({
    where: { matchId },
    select: { section: true, round: true, seasonId: true, divisionId: true },
  });
  if (!slot) return null;

  const highest = await prisma.playoffSlot.aggregate({
    where: {
      seasonId: slot.seasonId,
      divisionId: slot.divisionId,
      section: slot.section,
    },
    _max: { round: true },
  });

  return formatPlayoffSlotLabel(
    slot.section as PlayoffSlotSection,
    slot.round,
    highest._max.round ?? slot.round,
  );
}

type RankedTeam = {
  id: number;
  status: TeamStatus;
  wins: number;
  losses: number;
  points: number;
};

/** Teams that could be in a division's bracket, best seed first. Withdrawn teams are left out. */
async function loadRankedField(
  seasonId: number,
  divisionId: number,
  season: { regionId: number; formatId: number },
): Promise<RankedTeam[]> {
  const teams = await prisma.team.findMany({
    where: {
      seasonId,
      divisionId,
      regionId: season.regionId,
      formatId: season.formatId,
      status: { not: TeamStatus.DEAD },
    },
    select: {
      id: true,
      status: true,
      wins: true,
      losses: true,
      gamesWon: true,
      gamesLost: true,
      pointsScored: true,
    },
  });

  return rankPlayoffField(
    teams.map((team) => {
      const played = team.gamesWon + team.gamesLost;
      return {
        id: team.id,
        status: team.status,
        wins: team.wins,
        losses: team.losses,
        points: played > 0 ? team.pointsScored / played : 0,
      };
    }),
  );
}

export type PlayoffCandidate = {
  id: number;
  /** Team name, or the player's name in a 1v1 format. */
  label: string;
  status: TeamStatus;
  wins: number;
  losses: number;
  /** Seed if every candidate is picked. */
  seed: number;
};

/** The pick list for the bracket picker: every eligible team in seed order. */
export async function listPlayoffCandidates(
  seasonId: number,
  divisionId: number,
): Promise<PlayoffCandidate[]> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { regionId: true, formatId: true },
  });
  if (!season) notFound('Season not found');

  const division = await prisma.division.findFirst({
    where: { id: divisionId, regionId: season.regionId, formatId: season.formatId },
    select: { id: true },
  });
  if (!division) badRequest('That division is not part of this season');

  const ranked = await loadRankedField(seasonId, divisionId, season);
  const details = await prisma.team.findMany({
    where: { id: { in: ranked.map((team) => team.id) } },
    select: {
      id: true,
      name: true,
      format: { select: { isIndividual: true } },
      players: {
        where: { active: 1 },
        take: 1,
        select: { player: { select: { steamUsername: true } } },
      },
    },
  });
  const byId = new Map(details.map((team) => [team.id, team]));

  return ranked.map((team, index) => {
    const detail = byId.get(team.id);
    const solo = detail?.format.isIndividual ? detail.players[0]?.player.steamUsername : null;
    return {
      id: team.id,
      label: solo || detail?.name || `Team ${team.id}`,
      status: team.status,
      wins: team.wins,
      losses: team.losses,
      seed: index + 1,
    };
  });
}

/** Divisions that already have a generated playoff tree. */
export async function listGeneratedPlayoffDivisions(): Promise<
  Array<{ seasonId: number; divisionId: number }>
> {
  return prisma.playoffSlot.findMany({
    distinct: ['seasonId', 'divisionId'],
    select: { seasonId: true, divisionId: true },
  });
}

/**
 * Fill one division's playoff tree from the teams that have not withdrawn.
 * Slots that already have both teams become real matches. The series length and
 * the games on each arena are the ones saved for that division. Later slots stay
 * empty and keep their arrows.
 */
export async function generateDivisionPlayoffBracket(
  seasonId: number,
  divisionId: number,
  mapBanPoolId: number,
  /** The teams to seed, or null for every team that has not withdrawn. */
  teamIds: number[] | null = null,
): Promise<GeneratedPlayoffBracket> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { id: true, seasonNum: true, regionId: true, formatId: true },
  });
  if (!season) notFound('Season not found');

  const division = await prisma.division.findFirst({
    where: { id: divisionId, regionId: season.regionId, formatId: season.formatId },
    select: { id: true, name: true },
  });
  if (!division) badRequest('That division is not part of this season');

  const choice = await prisma.seasonDivisionPlayoff.findUnique({
    where: { seasonId_divisionId: { seasonId, divisionId } },
    select: { format: true, series: true, arenaGames: true },
  });
  if (!choice) badRequest('Choose a playoff format for this division before generating it');
  if (!isPlayoffLength(choice.series) || !isPlayoffLength(choice.arenaGames)) {
    badRequest('Choose a series and an arena length of 1, 3, 5, or 7 before generating');
  }

  const existing = await prisma.playoffSlot.count({ where: { seasonId, divisionId } });
  if (existing > 0) conflict('This division already has a playoff bracket');

  const pool = await prisma.mapBanPool.findUnique({
    where: { id: mapBanPoolId },
    select: { id: true, isActive: true, _count: { select: { mapsInPool: true } } },
  });
  if (!pool || !pool.isActive) badRequest('Choose an active map ban pool');
  if (pool._count.mapsInPool === 0) badRequest('That map ban pool has no maps');

  const field = await loadRankedField(seasonId, divisionId, season);
  let ranked;
  try {
    ranked = selectPlayoffField(field, teamIds);
  } catch (err) {
    badRequest(err instanceof Error ? err.message : 'Invalid team selection');
  }
  if (ranked.length < 2) {
    badRequest('Choose at least two teams for the bracket');
  }

  const format: PlayoffBracketFormat =
    choice.format === PlayoffFormat.DOUBLE_ELIM ? 'DOUBLE_ELIM' : 'SINGLE_ELIM';
  const drafts = buildPlayoffBracket(format, ranked);
  const createdMatches = await persistBracket({
    seasonId,
    seasonNo: season.seasonNum,
    divisionId,
    regionId: season.regionId,
    divisionName: division.name,
    format: choice.format,
    mapBanPoolId,
    boSeries: choice.series,
    boGames: choice.arenaGames,
    drafts,
  });

  for (const match of createdMatches) {
    await createNotificationForRoster(
      [match.homeTeamId, match.awayTeamId],
      'MATCH_CREATED',
      `/matches/${match.id}`,
      `New playoff match scheduled: ${division.name}`,
    );
  }

  return {
    divisionId,
    divisionName: division.name,
    format,
    teamCount: ranked.length,
    slotCount: drafts.length,
    matchCount: createdMatches.length,
  };
}

async function persistBracket(input: {
  seasonId: number;
  seasonNo: number;
  divisionId: number;
  regionId: number;
  divisionName: string;
  format: PlayoffFormat;
  mapBanPoolId: number;
  boSeries: number;
  boGames: number;
  drafts: PlayoffSlotDraft[];
}) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.playoffSlot.createManyAndReturn({
      data: input.drafts.map((draft) => ({
        seasonId: input.seasonId,
        divisionId: input.divisionId,
        format: input.format,
        section: BracketSection[draft.section],
        round: draft.round,
        position: draft.position,
        team1Id: draft.team1Id,
        team2Id: draft.team2Id,
        isBye: draft.isBye,
      })),
    });

    const byKey = new Map(
      created.map((row) => [`${row.section}-${row.round}-${row.position}`, row]),
    );

    for (const draft of input.drafts) {
      const row = byKey.get(draft.key);
      if (!row) badRequest('Playoff bracket could not be saved');
      const winner = draft.winnerNextKey ? byKey.get(draft.winnerNextKey) : null;
      const loser = draft.loserNextKey ? byKey.get(draft.loserNextKey) : null;
      await tx.playoffSlot.update({
        where: { id: row.id },
        data: {
          winnerNextSlotId: winner?.id ?? null,
          winnerNextSide: draft.winnerNextSide,
          loserNextSlotId: loser?.id ?? null,
          loserNextSide: draft.loserNextSide,
        },
      });
    }

    const highestRound = new Map<string, number>();
    for (const draft of input.drafts) {
      highestRound.set(draft.section, Math.max(highestRound.get(draft.section) ?? 0, draft.round));
    }
    const createdInputs: Array<MatchCreatedInput> = [];
    const matches: Array<{ id: number; homeTeamId: number; awayTeamId: number }> = [];
    for (const draft of input.drafts) {
      if (draft.isBye || draft.team1Id == null || draft.team2Id == null) continue;
      const row = byKey.get(draft.key);
      if (!row) continue;
      const match = await insertPlayoffMatch(tx, {
        seasonId: input.seasonId,
        seasonNo: input.seasonNo,
        homeTeamId: draft.team1Id,
        awayTeamId: draft.team2Id,
        boSeries: input.boSeries,
        boGames: input.boGames,
        mapBanPoolId: input.mapBanPoolId,
      });
      await tx.playoffSlot.update({
        where: { id: row.id },
        data: { matchId: match.id },
      });
      matches.push({ id: match.id, homeTeamId: draft.team1Id, awayTeamId: draft.team2Id });
      createdInputs.push({
        id: match.id,
        homeTeamId: draft.team1Id,
        awayTeamId: draft.team2Id,
        round: formatPlayoffSlotLabel(
          draft.section as PlayoffSlotSection,
          draft.round,
          highestRound.get(draft.section) ?? draft.round,
        ),
      });
    }

    await enqueueOutbox(
      tx,
      await matchCreatedOutbox(tx, {
        matches: createdInputs,
        channels: await regionChannels(tx, input.regionId),
        division: input.divisionName,
        bestOf: input.boSeries,
        arenaGames: input.boGames,
      }),
    );

    return matches;
  });
}

export type AdvancedPlayoffMatch = {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  divisionName: string;
};

/**
 * Move the winner and loser of a played match along that slot's arrows.
 * Creates the next match when a slot ends up with both teams, including the
 * grand-final reset when the losers champion wins.
 */
export async function advancePlayoffFromMatch(
  tx: Prisma.TransactionClient,
  matchId: number,
  options: { auto?: boolean } = {},
): Promise<AdvancedPlayoffMatch[]> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      winnerId: true,
      winnerScore: true,
      loserScore: true,
      homeTeamId: true,
      awayTeamId: true,
      status: true,
      seasonId: true,
      seasonNo: true,
      boSeries: true,
      boGames: true,
    },
  });
  if (!match || match.status !== MatchStatus.PLAYED) return [];

  const source = await tx.playoffSlot.findUnique({ where: { matchId } });
  if (!source) return [];
  if (match.winnerId == null) badRequest('A playoff match needs a winner');

  await tx.$queryRaw`
    SELECT id FROM playoff_slots
    WHERE season_id = ${source.seasonId} AND division_id = ${source.divisionId}
    FOR UPDATE
  `;

  const rows = await tx.playoffSlot.findMany({
    where: { seasonId: source.seasonId, divisionId: source.divisionId },
  });
  const division = await tx.division.findUnique({
    where: { id: source.divisionId },
    select: { name: true, regionId: true },
  });
  const divisionName = division?.name ?? 'Playoffs';
  const pool = await tx.matchMapBan.findFirst({
    where: { matchId },
    select: { poolId: true },
  });

  let plan;
  try {
    plan = planPlayoffAdvance(rows.map(toAdvanceSlot), source.id, match.winnerId);
  } catch (err) {
    if (err instanceof PlayoffAdvanceError) conflict(err.message);
    throw err;
  }

  for (const update of plan.updates) {
    await tx.playoffSlot.update({
      where: { id: update.slotId },
      data: {
        team1Id: update.team1Id,
        team2Id: update.team2Id,
        isBye: update.isBye,
        ...(update.clearLoserArrow ? { loserNextSlotId: null, loserNextSide: null } : {}),
      },
    });
  }

  const created: AdvancedPlayoffMatch[] = [];
  const createdInputs: MatchCreatedInput[] = [];
  const highestBySection = new Map<string, number>();
  for (const row of rows) {
    highestBySection.set(row.section, Math.max(highestBySection.get(row.section) ?? 0, row.round));
  }
  const labelFor = (slotId: number): string | null => {
    const row = rows.find((candidate) => candidate.id === slotId);
    if (!row) return null;
    return formatPlayoffSlotLabel(
      row.section as PlayoffSlotSection,
      row.round,
      highestBySection.get(row.section) ?? row.round,
    );
  };
  const series = match.boSeries && match.boSeries > 0 ? match.boSeries : PLAYOFF_SERIES;
  const gamesPerArena =
    match.boGames && match.boGames > 0 ? match.boGames : PLAYOFF_GAMES_PER_ARENA;

  for (const next of plan.matches) {
    const createdMatch = await insertPlayoffMatch(tx, {
      seasonId: match.seasonId,
      seasonNo: match.seasonNo,
      homeTeamId: next.homeTeamId,
      awayTeamId: next.awayTeamId,
      boSeries: series,
      boGames: gamesPerArena,
      mapBanPoolId: pool?.poolId ?? null,
    });
    await tx.playoffSlot.update({
      where: { id: next.slotId },
      data: { matchId: createdMatch.id },
    });
    created.push({
      id: createdMatch.id,
      homeTeamId: next.homeTeamId,
      awayTeamId: next.awayTeamId,
      divisionName,
    });
    createdInputs.push({
      id: createdMatch.id,
      homeTeamId: next.homeTeamId,
      awayTeamId: next.awayTeamId,
      round: labelFor(next.slotId),
    });
  }

  if (plan.reset) {
    const resetSlot = await tx.playoffSlot.create({
      data: {
        seasonId: source.seasonId,
        divisionId: source.divisionId,
        format: source.format,
        section: BracketSection.GRAND_FINAL,
        round: 2,
        position: 1,
        team1Id: plan.reset.team1Id,
        team2Id: plan.reset.team2Id,
        isBye: false,
      },
    });
    const resetMatch = await insertPlayoffMatch(tx, {
      seasonId: match.seasonId,
      seasonNo: match.seasonNo,
      homeTeamId: plan.reset.team1Id,
      awayTeamId: plan.reset.team2Id,
      boSeries: series,
      boGames: gamesPerArena,
      mapBanPoolId: pool?.poolId ?? null,
    });
    await tx.playoffSlot.update({
      where: { id: resetSlot.id },
      data: { matchId: resetMatch.id },
    });
    created.push({
      id: resetMatch.id,
      homeTeamId: plan.reset.team1Id,
      awayTeamId: plan.reset.team2Id,
      divisionName,
    });
    createdInputs.push({
      id: resetMatch.id,
      homeTeamId: plan.reset.team1Id,
      awayTeamId: plan.reset.team2Id,
      round: formatPlayoffSlotLabel('GRAND_FINAL', 2, 2),
    });
  }

  const refreshed = await tx.playoffSlot.findMany({
    where: { seasonId: source.seasonId, divisionId: source.divisionId },
    include: { match: { select: { winnerId: true, status: true } } },
  });
  const podium = planPlayoffPodium(
    refreshed.map((row) => ({
      id: row.id,
      format: row.format === PlayoffFormat.DOUBLE_ELIM ? 'DOUBLE_ELIM' : 'SINGLE_ELIM',
      section: row.section as AdvanceSection,
      round: row.round,
      position: row.position,
      team1Id: row.team1Id,
      team2Id: row.team2Id,
      isBye: row.isBye,
      winnerNextSlotId: row.winnerNextSlotId,
      winnerId: row.match?.status === MatchStatus.PLAYED ? row.match.winnerId : null,
    })),
  );
  await saveDivisionPlayoffPlacements(tx, source.seasonId, source.divisionId, podium);

  await enqueueOutbox(
    tx,
    await advanceOutbox(tx, {
      matchId,
      divisionName,
      channels: division ? await regionChannels(tx, division.regionId) : undefined,
      divisionId: source.divisionId,
      seasonId: source.seasonId,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      winnerId: match.winnerId,
      winnerScore: match.winnerScore ?? 0,
      loserScore: match.loserScore ?? 0,
      round: labelFor(source.id),
      auto: options.auto === true,
      hasLoserArrow: source.loserNextSlotId != null,
      resetCreated: plan.reset != null,
      createdMatches: createdInputs,
      bestOf: series,
      arenaGames: gamesPerArena,
      podium: podium.map((place) => ({ teamId: place.teamId, place: place.place })),
    }),
  );

  return created;
}

export async function notifyNewPlayoffMatches(matches: AdvancedPlayoffMatch[]) {
  for (const match of matches) {
    await createNotificationForRoster(
      [match.homeTeamId, match.awayTeamId],
      'MATCH_CREATED',
      `/matches/${match.id}`,
      `New playoff match scheduled: ${match.divisionName}`,
    );
  }
}

function toAdvanceSlot(row: {
  id: number;
  section: BracketSection;
  round: number;
  position: number;
  team1Id: number | null;
  team2Id: number | null;
  winnerNextSlotId: number | null;
  winnerNextSide: number | null;
  loserNextSlotId: number | null;
  loserNextSide: number | null;
  matchId: number | null;
  isBye: boolean;
}): AdvanceSlot {
  return {
    id: row.id,
    section: row.section as AdvanceSection,
    round: row.round,
    position: row.position,
    team1Id: row.team1Id,
    team2Id: row.team2Id,
    winnerNextSlotId: row.winnerNextSlotId,
    winnerNextSide: arrowSide(row.winnerNextSide),
    loserNextSlotId: row.loserNextSlotId,
    loserNextSide: arrowSide(row.loserNextSide),
    hasMatch: row.matchId != null,
    isBye: row.isBye,
  };
}

function arrowSide(side: number | null): 1 | 2 | null {
  if (side == null) return null;
  if (side === 1 || side === 2) return side;
  throw new PlayoffAdvanceError('Playoff arrow has an invalid side');
}

async function insertPlayoffMatch(
  tx: Prisma.TransactionClient,
  input: {
    seasonId: number;
    seasonNo: number;
    homeTeamId: number;
    awayTeamId: number;
    boSeries: number;
    boGames: number;
    mapBanPoolId: number | null;
  },
) {
  const match = await tx.match.create({
    data: {
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      seasonId: input.seasonId,
      seasonNo: input.seasonNo,
      weekNo: null,
      playoffId: null,
      playoffRound: null,
      boSeries: input.boSeries,
      boGames: input.boGames,
      status: MatchStatus.UNPLAYED,
    },
  });
  const totalGames = input.boSeries * input.boGames;
  await tx.game.createMany({
    data: Array.from({ length: totalGames }, (_, index) => ({
      matchId: match.id,
      gameNum: index + 1,
    })),
  });
  if (input.mapBanPoolId) {
    await tx.matchMapBan.create({
      data: {
        matchId: match.id,
        poolId: input.mapBanPoolId,
        currentTurn: 1,
        banPhaseComplete: false,
      },
    });
  }
  return match;
}

type MatchCreatedInput = {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  round: string | null;
};

async function teamNames(tx: Prisma.TransactionClient, teamIds: number[]) {
  const teams = await tx.team.findMany({
    where: { id: { in: [...new Set(teamIds)] } },
    select: { id: true, name: true },
  });
  return new Map(teams.map((team) => [team.id, team.name]));
}

/** Outbox rows telling both rosters (and the playoffs channel) about new matches. */
async function matchCreatedOutbox(
  tx: Prisma.TransactionClient,
  input: {
    matches: MatchCreatedInput[];
    division: string;
    channels: OutboxChannelIds;
    bestOf: number;
    arenaGames: number;
  },
): Promise<OutboxItem[]> {
  if (input.matches.length === 0) return [];
  const names = await teamNames(
    tx,
    input.matches.flatMap((match) => [match.homeTeamId, match.awayTeamId]),
  );
  const recipients = await discordRecipients(
    tx,
    input.matches.flatMap((match) => [match.homeTeamId, match.awayTeamId]),
  );

  return input.matches.flatMap((match) =>
    matchCreatedItems(
      {
        id: match.id,
        division: input.division,
        round: match.round,
        home: { id: match.homeTeamId, name: names.get(match.homeTeamId) ?? 'TBD' },
        away: { id: match.awayTeamId, name: names.get(match.awayTeamId) ?? 'TBD' },
        url: siteUrl(`/matches/${match.id}`),
        channels: input.channels,
        bestOf: input.bestOf,
        arenaGames: input.arenaGames,
      },
      recipients.filter(
        (recipient) =>
          recipient.teamId === match.homeTeamId || recipient.teamId === match.awayTeamId,
      ),
    ),
  );
}

/** Everything Discord should hear about after one playoff match is decided. */
async function advanceOutbox(
  tx: Prisma.TransactionClient,
  input: {
    matchId: number;
    divisionName: string;
    channels?: OutboxChannelIds;
    divisionId: number;
    seasonId: number;
    homeTeamId: number;
    awayTeamId: number;
    winnerId: number;
    winnerScore: number;
    loserScore: number;
    round: string | null;
    auto: boolean;
    hasLoserArrow: boolean;
    resetCreated: boolean;
    createdMatches: MatchCreatedInput[];
    bestOf: number;
    arenaGames: number;
    podium: Array<{ teamId: number; place: number }>;
  },
): Promise<OutboxItem[]> {
  const loserId = input.winnerId === input.homeTeamId ? input.awayTeamId : input.homeTeamId;
  const names = await teamNames(tx, [
    input.homeTeamId,
    input.awayTeamId,
    ...input.podium.map((place) => place.teamId),
  ]);
  const nameOf = (id: number) => names.get(id) ?? 'TBD';
  const url = siteUrl(`/matches/${input.matchId}`);
  const items: OutboxItem[] = [];

  const managers = await discordRecipients(tx, [input.homeTeamId, input.awayTeamId], {
    managersOnly: true,
  });
  items.push(
    ...scoreConfirmedItems(
      {
        id: input.matchId,
        division: input.divisionName,
        round: input.round,
        channels: input.channels,
        home: { id: input.homeTeamId, name: nameOf(input.homeTeamId) },
        away: { id: input.awayTeamId, name: nameOf(input.awayTeamId) },
        url,
      },
      {
        winnerName: nameOf(input.winnerId),
        loserName: nameOf(loserId),
        score: `${input.winnerScore}-${input.loserScore}`,
        auto: input.auto,
      },
      input.winnerId,
      managers,
    ),
  );

  items.push(
    ...(await matchCreatedOutbox(tx, {
      matches: input.createdMatches,
      division: input.divisionName,
      channels: input.channels ?? { playoffs: null, staff: null },
      bestOf: input.bestOf,
      arenaGames: input.arenaGames,
    })),
  );

  const out = eliminatedTeamId({
    loserId,
    hasLoserArrow: input.hasLoserArrow,
    resetCreated: input.resetCreated,
  });
  if (out != null) {
    items.push(
      ...teamEliminatedItems(
        {
          matchId: input.matchId,
          teamId: out,
          teamName: nameOf(out),
          eliminatedBy: nameOf(input.winnerId),
          division: input.divisionName,
          url,
          channels: input.channels,
        },
        await discordRecipients(tx, [out]),
      ),
    );
  }

  if (input.podium.some((place) => place.place === 1)) {
    items.push(
      ...bracketCompleteItems(
        {
          seasonId: input.seasonId,
          divisionId: input.divisionId,
          division: input.divisionName,
          url,
          channels: input.channels,
          podium: [...input.podium]
            .sort((a, b) => a.place - b.place)
            .map((place) => ({ place: place.place, name: nameOf(place.teamId) })),
        },
        await discordRecipients(
          tx,
          input.podium.map((place) => place.teamId),
        ),
      ),
    );
  }

  return items;
}
