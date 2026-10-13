import { z } from 'zod';
import { prisma } from '#lib/server/db.js';
import { notFound, badRequest, internalError } from '#lib/server/utils/errors.js';
import { PlayoffFormat } from '#prisma/client.js';

export const DIVISION_PLAYOFF_FORMATS = ['SINGLE_ELIM', 'DOUBLE_ELIM'] as const;
export type DivisionPlayoffFormat = (typeof DIVISION_PLAYOFF_FORMATS)[number];

/** Best-of length for a playoff series or for the games on one arena. */
export const PLAYOFF_SERIES_LENGTHS = [3, 5, 7] as const;
export type PlayoffSeriesLength = (typeof PLAYOFF_SERIES_LENGTHS)[number];

export type DivisionPlayoffChoice = {
  divisionId: number;
  format: DivisionPlayoffFormat | null;
  series: PlayoffSeriesLength | null;
  arenaGames: PlayoffSeriesLength | null;
};

const playoffLengthSchema = z.union([z.literal(3), z.literal(5), z.literal(7)]).nullable();

const divisionPlayoffChoiceSchema = z.object({
  divisionId: z.number().int().positive(),
  format: z.enum(DIVISION_PLAYOFF_FORMATS).nullable(),
  series: playoffLengthSchema,
  arenaGames: playoffLengthSchema,
});

/**
 * Parse the season playoff form payload.
 * Every division is present. `null` means the admin left that division unset.
 * Returns null when the payload is not that list.
 */
export function parseDivisionPlayoffChoices(raw: string): DivisionPlayoffChoice[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = z.array(divisionPlayoffChoiceSchema).safeParse(parsed);
  if (!result.success) return null;

  const ids = result.data.map((choice) => choice.divisionId);
  if (new Set(ids).size !== ids.length) return null;

  return result.data;
}

/**
 * Get playoff configuration for a specific season
 */
export async function getPlayoffBySeason(seasonId: number) {
  try {
    const playoff = await prisma.playoff.findFirst({
      where: { seasonId },
      include: {
        season: {
          include: {
            region: true,
          },
        },
      },
    });

    return playoff;
  } catch (err) {
    console.error('Error fetching playoff by season:', err);
    internalError('Failed to fetch playoff configuration');
  }
}

/**
 * Get all playoffs with season information
 */
export async function getAllPlayoffs() {
  try {
    const playoffs = await prisma.playoff.findMany({
      include: {
        season: {
          include: {
            region: true,
          },
        },
      },
      orderBy: [{ season: { regionId: 'asc' } }, { season: { seasonNum: 'desc' } }],
    });

    return playoffs;
  } catch (err) {
    console.error('Error fetching all playoffs:', err);
    internalError('Failed to fetch playoffs');
  }
}

export type SeasonDivisionPlayoffRow = {
  seasonId: number;
  divisionId: number;
  divisionName: string;
  format: DivisionPlayoffFormat;
  series: PlayoffSeriesLength;
  arenaGames: PlayoffSeriesLength;
};

/** Chosen playoff formats, in division display order within each season. */
export async function listSeasonDivisionPlayoffs(): Promise<SeasonDivisionPlayoffRow[]> {
  const rows = await prisma.seasonDivisionPlayoff.findMany({
    select: {
      seasonId: true,
      divisionId: true,
      format: true,
      series: true,
      arenaGames: true,
      division: { select: { name: true } },
    },
    orderBy: [{ seasonId: 'asc' }, { division: { sortOrder: 'asc' } }, { divisionId: 'asc' }],
  });

  return rows.map((row) => ({
    seasonId: row.seasonId,
    divisionId: row.divisionId,
    divisionName: row.division.name,
    format: row.format,
    series: playoffLength(row.series),
    arenaGames: playoffLength(row.arenaGames),
  }));
}

function playoffLength(length: number): PlayoffSeriesLength {
  if (length === 3 || length === 5 || length === 7) return length;
  badRequest('Playoff length must be best of 3, 5, or 7');
}

/**
 * Replace playoff format choices for the visible divisions of a season.
 * A null format removes that division's choice. Hidden divisions are left alone.
 */
export async function saveSeasonDivisionPlayoffs(
  seasonId: number,
  choices: DivisionPlayoffChoice[],
) {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { id: true, regionId: true, formatId: true },
  });
  if (!season) notFound('Season not found');

  const divisions = await prisma.division.findMany({
    where: { regionId: season.regionId, formatId: season.formatId, hidden: 0 },
    select: { id: true },
  });
  const allowedIds = divisions.map((division) => division.id);
  if (allowedIds.length === 0) {
    if (choices.length === 0) return;
    badRequest('Playoff choices do not match the divisions for this region and format');
  }
  const submittedIds = choices.map((choice) => choice.divisionId);
  const allowed = new Set(allowedIds);

  if (
    submittedIds.length !== allowedIds.length ||
    submittedIds.some((divisionId) => !allowed.has(divisionId))
  ) {
    badRequest('Playoff choices do not match the divisions for this region and format');
  }

  if (
    choices.some(
      (choice) => choice.format != null && (choice.series == null || choice.arenaGames == null),
    )
  ) {
    badRequest('Choose a series and an arena length for every division that has a playoff format');
  }

  const chosen = choices.filter(
    (
      choice,
    ): choice is DivisionPlayoffChoice & {
      format: DivisionPlayoffFormat;
      series: PlayoffSeriesLength;
      arenaGames: PlayoffSeriesLength;
    } => choice.format != null && choice.series != null && choice.arenaGames != null,
  );

  await prisma.$transaction([
    prisma.seasonDivisionPlayoff.deleteMany({
      where: { seasonId, divisionId: { in: allowedIds } },
    }),
    ...(chosen.length > 0
      ? [
          prisma.seasonDivisionPlayoff.createMany({
            data: chosen.map((choice) => ({
              seasonId,
              divisionId: choice.divisionId,
              format:
                choice.format === 'DOUBLE_ELIM'
                  ? PlayoffFormat.DOUBLE_ELIM
                  : PlayoffFormat.SINGLE_ELIM,
              series: choice.series,
              arenaGames: choice.arenaGames,
            })),
          }),
        ]
      : []),
  ]);
}
