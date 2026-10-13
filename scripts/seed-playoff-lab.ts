#!/usr/bin/env bun
/**
 * Local-only playoff lab.
 *
 * Creates a "Playoff Lab" region on the 1v1 format, with two large divisions,
 * a finished regular season, and no playoff yet. Each division is a round
 * robin: the better team wins every match, so the table is the seeding order.
 * Running it again clears playoffs, replaces the field, and rewrites that season.
 *
 * Single 32 is a full bracket. Double 31 fills a 32-slot bracket with one bye.
 * One withdrawn team stays out of both the table and the bracket.
 *
 * Does not attach the season to active signups.
 *
 * Usage:
 *   bun --env-file=.env run scripts/seed-playoff-lab.ts
 */

import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { MatchStatus, Prisma, PrismaClient, TeamStatus } from '../prisma/generated/client';

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const host = new URL(connectionString).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  throw new Error(`Refusing to seed ${host}. This script is for the local database only.`);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 1 }),
});

const REGION_NAME = 'Playoff Lab';
const SINGLE_COUNT = 32;
const DOUBLE_COUNT = 31;
const SEASON_WEEKS = Math.max(SINGLE_COUNT - 1, DOUBLE_COUNT);
const BYE = 'BYE';

const singleNames = Array.from(
  { length: SINGLE_COUNT },
  (_, index) => `S${String(index + 1).padStart(2, '0')}`,
);
const doubleNames = Array.from(
  { length: DOUBLE_COUNT },
  (_, index) => `D${String(index + 1).padStart(2, '0')}`,
);
const withdrawnName = 'Out';

type LabTeam = { name: string; status: TeamStatus; division: 'single' | 'double' };
type RegularMatch = { week: number; home: string; away: string; winner: string };
type RegularBye = { week: number; name: string };

const teams: LabTeam[] = [
  ...singleNames.map((name) => ({ name, status: TeamStatus.READY, division: 'single' as const })),
  ...doubleNames.map((name) => ({ name, status: TeamStatus.READY, division: 'double' as const })),
  { name: withdrawnName, status: TeamStatus.DEAD, division: 'double' },
];

function roundRobin(ranked: string[]): { matches: RegularMatch[]; byes: RegularBye[] } {
  const list = [...ranked];
  if (list.length % 2 === 1) list.push(BYE);
  const count = list.length;
  const half = count / 2;
  let rotation = [...list];
  const matches: RegularMatch[] = [];
  const byes: RegularBye[] = [];

  for (let round = 0; round < count - 1; round++) {
    for (let index = 0; index < half; index++) {
      const home = rotation[index];
      const away = rotation[count - 1 - index];
      if (home === BYE) byes.push({ week: round + 1, name: away });
      else if (away === BYE) byes.push({ week: round + 1, name: home });
      else {
        const winner = ranked.indexOf(home) < ranked.indexOf(away) ? home : away;
        matches.push({ week: round + 1, home, away, winner });
      }
    }

    const fixed = rotation[0];
    const rest = rotation.slice(1);
    const last = rest.pop();
    if (last !== undefined) rest.unshift(last);
    rotation = [fixed, ...rest];
  }

  return { matches, byes };
}

const singleSeason = roundRobin(singleNames);
const doubleSeason = roundRobin(doubleNames);
const regularMatches = [...singleSeason.matches, ...doubleSeason.matches];
const regularByes = [...singleSeason.byes, ...doubleSeason.byes];

function recordFor(name: string) {
  const played = regularMatches.filter((match) => match.home === name || match.away === name);
  const wins = played.filter((match) => match.winner === name).length;
  const losses = played.length - wins;
  return {
    wins,
    losses,
    gamesWon: wins,
    gamesLost: losses,
    pointsScored: wins * 20 + losses * 10,
    pointsScoredAgainst: wins * 10 + losses * 20,
  };
}

async function wipeSeason(tx: Prisma.TransactionClient, seasonId: number) {
  const matches = await tx.match.findMany({
    where: { seasonId },
    select: { id: true },
  });
  const matchIds = matches.map((match) => match.id);

  await tx.playoffSlot.updateMany({
    where: { seasonId },
    data: { matchId: null, winnerNextSlotId: null, loserNextSlotId: null },
  });

  if (matchIds.length > 0) {
    const bans = await tx.matchMapBan.findMany({
      where: { matchId: { in: matchIds } },
      select: { id: true },
    });
    const banIds = bans.map((ban) => ban.id);
    if (banIds.length > 0) {
      await tx.mapBanAction.deleteMany({ where: { matchMapBanId: { in: banIds } } });
    }
    await tx.matchMapBan.deleteMany({ where: { matchId: { in: matchIds } } });
    await tx.game.deleteMany({ where: { matchId: { in: matchIds } } });
    await tx.matchComm.deleteMany({ where: { matchId: { in: matchIds } } });
    const demos = await tx.demo.findMany({
      where: { matchId: { in: matchIds } },
      select: { id: true },
    });
    const demoIds = demos.map((demo) => demo.id);
    if (demoIds.length > 0) {
      await tx.demoReport.deleteMany({ where: { demoId: { in: demoIds } } });
    }
    await tx.demo.deleteMany({ where: { matchId: { in: matchIds } } });
    await tx.notification.deleteMany({
      where: { url: { in: matchIds.map((id) => `/matches/${id}`) } },
    });
    await tx.match.deleteMany({ where: { id: { in: matchIds } } });
  }

  await tx.byeWeek.deleteMany({ where: { seasonId } });
  await tx.playoffPlacement.deleteMany({ where: { seasonId } });
  await tx.playoffSlot.deleteMany({ where: { seasonId } });
  await tx.seasonDivisionPlayoff.deleteMany({ where: { seasonId } });
  await tx.team.deleteMany({ where: { seasonId } });
}

async function installField(
  tx: Prisma.TransactionClient,
  input: {
    seasonId: number;
    seasonNo: number;
    regionId: number;
    formatId: number;
    singleDivisionId: number;
    doubleDivisionId: number;
  },
) {
  await tx.division.update({
    where: { id: input.singleDivisionId },
    data: { name: `Single ${SINGLE_COUNT}`, sortOrder: 20 },
  });
  await tx.division.update({
    where: { id: input.doubleDivisionId },
    data: { name: `Double ${DOUBLE_COUNT}`, sortOrder: 10 },
  });
  await tx.season.update({
    where: { id: input.seasonId },
    data: { numWeeks: SEASON_WEEKS },
  });

  await tx.team.createMany({
    data: teams.map((team) => ({
      name: team.name,
      formatId: input.formatId,
      seasonId: input.seasonId,
      divisionId: team.division === 'single' ? input.singleDivisionId : input.doubleDivisionId,
      regionId: input.regionId,
      status: team.status,
      ...recordFor(team.name),
    })),
  });

  const rows = await tx.team.findMany({
    where: { seasonId: input.seasonId },
    select: { id: true, name: true },
  });
  const ids = new Map(rows.map((team) => [team.name, team.id]));
  const teamId = (name: string) => {
    const id = ids.get(name);
    if (id == null) throw new Error(`Missing lab team ${name}`);
    return id;
  };

  const createdMatches = await tx.match.createManyAndReturn({
    data: regularMatches.map((match) => {
      const homeTeamId = teamId(match.home);
      const awayTeamId = teamId(match.away);
      const winnerId = teamId(match.winner);
      return {
        homeTeamId,
        awayTeamId,
        winnerId,
        winnerScore: 1,
        loserScore: 0,
        seasonId: input.seasonId,
        seasonNo: input.seasonNo,
        weekNo: match.week,
        playoffId: null,
        playoffRound: null,
        boSeries: 1,
        boGames: 1,
        status: MatchStatus.PLAYED,
      };
    }),
  });

  await tx.game.createMany({
    data: createdMatches.map((match) => {
      const homeWon = match.winnerId === match.homeTeamId;
      return {
        matchId: match.id,
        gameNum: 1,
        homeTeamScore: homeWon ? 20 : 10,
        awayTeamScore: homeWon ? 10 : 20,
      };
    }),
  });

  await tx.byeWeek.createMany({
    data: regularByes.map((bye) => ({
      teamId: teamId(bye.name),
      seasonId: input.seasonId,
      seasonNo: input.seasonNo,
      weekNo: bye.week,
    })),
  });
}

async function main() {
  const format = await prisma.format.findUnique({ where: { code: '1v1' } });
  if (!format) throw new Error('1v1 format was not found');

  const existing = await prisma.region.findFirst({
    where: { name: REGION_NAME },
    include: {
      seasons: { select: { id: true, seasonNum: true } },
      divisions: { select: { id: true, sortOrder: true } },
    },
  });

  let regionId = existing?.id;
  let seasonId = existing?.seasons[0]?.id;
  const seasonNo = existing?.seasons[0]?.seasonNum ?? 1;

  if (regionId != null && seasonId != null) {
    const singleDivision = existing?.divisions.find((division) => division.sortOrder === 20);
    const doubleDivision = existing?.divisions.find((division) => division.sortOrder === 10);
    if (!singleDivision || !doubleDivision) {
      throw new Error('Playoff Lab is missing its two divisions');
    }
    const id = seasonId;
    const region = regionId;
    await prisma.$transaction(
      async (tx) => {
        await wipeSeason(tx, id);
        await installField(tx, {
          seasonId: id,
          seasonNo,
          regionId: region,
          formatId: format.id,
          singleDivisionId: singleDivision.id,
          doubleDivisionId: doubleDivision.id,
        });
      },
      { timeout: 60_000 },
    );
  } else {
    const created = await prisma.$transaction(
      async (tx) => {
        const region = await tx.region.create({
          data: { name: REGION_NAME, hidden: 0, currencySymbol: '$', currencyCode: 'USD' },
        });
        const single = await tx.division.create({
          data: {
            name: `Single ${SINGLE_COUNT}`,
            regionId: region.id,
            formatId: format.id,
            hidden: 0,
            sortOrder: 20,
          },
        });
        const double = await tx.division.create({
          data: {
            name: `Double ${DOUBLE_COUNT}`,
            regionId: region.id,
            formatId: format.id,
            hidden: 0,
            sortOrder: 10,
          },
        });
        const season = await tx.season.create({
          data: {
            seasonNum: 1,
            numWeeks: SEASON_WEEKS,
            regionId: region.id,
            formatId: format.id,
            signupsOpen: false,
            rosterLocked: true,
            paymentRequired: false,
            info: 'Playoff lab. Not a real season.',
          },
        });
        await installField(tx, {
          seasonId: season.id,
          seasonNo: season.seasonNum,
          regionId: region.id,
          formatId: format.id,
          singleDivisionId: single.id,
          doubleDivisionId: double.id,
        });
        return { regionId: region.id, seasonId: season.id };
      },
      { timeout: 60_000 },
    );
    regionId = created.regionId;
    seasonId = created.seasonId;
  }

  const top = recordFor(singleNames[0]);
  const bottom = recordFor(singleNames[singleNames.length - 1]);
  const doubleTop = recordFor(doubleNames[0]);
  const doubleBottom = recordFor(doubleNames[doubleNames.length - 1]);
  console.log(`Playoff Lab is ready. Region ${regionId}, season ${seasonId}.`);
  console.log(
    `Single ${SINGLE_COUNT}: ${singleNames[0]} ${top.wins}-${top.losses} down to ${singleNames.at(-1)} ${bottom.wins}-${bottom.losses}.`,
  );
  console.log(
    `Double ${DOUBLE_COUNT}: ${doubleNames[0]} ${doubleTop.wins}-${doubleTop.losses} down to ${doubleNames.at(-1)} ${doubleBottom.wins}-${doubleBottom.losses}. ${withdrawnName} is withdrawn.`,
  );
  console.log(
    `Regular season: ${regularMatches.length} matches, ${SEASON_WEEKS} weeks, no playoff yet.`,
  );
  console.log(`League: /leagues/1v1?region=${regionId}&season=${seasonId}`);
  console.log('Admin: League → 1v1 → Playoff Lab → Season 1 → Add Playoffs.');
  console.log('Map pool, when you generate: 1v1 Spring 2026.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
