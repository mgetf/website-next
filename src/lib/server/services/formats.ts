/**
 * Format Service Layer
 * Manages game formats and their behavioral configuration.
 */

import { prisma } from '$lib/server/db';
import { FORMAT_THEME_KEYS, isFormatThemeKey, type FormatThemeKey } from '$lib/constants/formats';
import { badRequest, notFound } from '$lib/server/utils/errors';

export type FormatConfigInput = {
  name: string;
  code: string;
  isIndividual?: boolean;
  minRosterSize?: number;
  maxRosterSize?: number;
  requiredPaidPlayers?: number;
  supportsJoinPassword?: boolean;
  supportsAcronym?: boolean;
  supportsReregistration?: boolean;
  themeKey?: string;
};

function normalizeThemeKey(themeKey: string | undefined): FormatThemeKey {
  if (themeKey && isFormatThemeKey(themeKey)) return themeKey;
  if (themeKey) badRequest(`Invalid themeKey. Allowed: ${FORMAT_THEME_KEYS.join(', ')}`);
  return 'primary';
}

function validateRosterRules(data: {
  minRosterSize: number;
  maxRosterSize: number;
  requiredPaidPlayers: number;
  isIndividual: boolean;
}) {
  if (data.minRosterSize < 1) badRequest('minRosterSize must be at least 1');
  if (data.maxRosterSize < data.minRosterSize) {
    badRequest('maxRosterSize must be greater than or equal to minRosterSize');
  }
  if (data.requiredPaidPlayers < 1 || data.requiredPaidPlayers > data.maxRosterSize) {
    badRequest('requiredPaidPlayers must be between 1 and maxRosterSize');
  }
  if (data.isIndividual && (data.minRosterSize !== 1 || data.maxRosterSize !== 1)) {
    badRequest('Individual formats must have minRosterSize and maxRosterSize of 1');
  }
}

export async function getFormats() {
  return prisma.format.findMany({
    orderBy: { id: 'asc' },
    include: {
      _count: {
        select: {
          seasons: true,
          teams: true,
          activeSignupSeasons: true,
        },
      },
    },
  });
}

export async function getFormatByCode(code: string) {
  return prisma.format.findUnique({
    where: { code },
  });
}

export async function getFormatById(id: number) {
  return prisma.format.findUnique({
    where: { id },
  });
}

export async function requireFormatById(id: number) {
  const format = await getFormatById(id);
  if (!format) notFound('Format not found');
  return format;
}

export async function requireFormatByCode(code: string) {
  const format = await getFormatByCode(code);
  if (!format) notFound(`Format "${code}" not found`);
  return format;
}

export async function createFormat(data: FormatConfigInput) {
  const existing = await prisma.format.findUnique({
    where: { code: data.code },
  });

  if (existing) {
    badRequest(`Format with code "${data.code}" already exists`);
  }

  const isIndividual = data.isIndividual ?? false;
  const minRosterSize = data.minRosterSize ?? (isIndividual ? 1 : 2);
  const maxRosterSize = data.maxRosterSize ?? (isIndividual ? 1 : 3);
  const requiredPaidPlayers = data.requiredPaidPlayers ?? (isIndividual ? 1 : 2);
  const supportsJoinPassword = data.supportsJoinPassword ?? !isIndividual;
  const supportsAcronym = data.supportsAcronym ?? !isIndividual;
  const supportsReregistration = data.supportsReregistration ?? !isIndividual;
  const themeKey = normalizeThemeKey(data.themeKey);

  validateRosterRules({
    minRosterSize,
    maxRosterSize,
    requiredPaidPlayers,
    isIndividual,
  });

  return prisma.format.create({
    data: {
      name: data.name.trim(),
      code: data.code.trim().toLowerCase(),
      isIndividual,
      minRosterSize,
      maxRosterSize,
      requiredPaidPlayers,
      supportsJoinPassword,
      supportsAcronym,
      supportsReregistration,
      themeKey,
    },
  });
}

export async function deleteFormat(id: number) {
  const format = await prisma.format.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          seasons: true,
          teams: true,
          teamHistory: true,
          activeSignupSeasons: true,
        },
      },
    },
  });

  if (!format) {
    notFound('Format not found');
  }

  const blockers: string[] = [];
  if (format._count.seasons > 0)
    blockers.push(`${format._count.seasons} season${format._count.seasons !== 1 ? 's' : ''}`);
  if (format._count.teams > 0)
    blockers.push(`${format._count.teams} team${format._count.teams !== 1 ? 's' : ''}`);
  if (format._count.teamHistory > 0)
    blockers.push(
      `${format._count.teamHistory} team history record${format._count.teamHistory !== 1 ? 's' : ''}`,
    );
  if (format._count.activeSignupSeasons > 0) blockers.push('active signup configuration');

  if (blockers.length > 0) {
    badRequest(`Cannot delete format: it has ${blockers.join(', ')}.`);
  }

  return await prisma.format.delete({ where: { id } });
}

/**
 * Get formats for filter/dropdown UI
 */
export async function getFormatsForFilter(): Promise<
  { id: number; name: string; code: string; themeKey: string; isIndividual: boolean }[]
> {
  return prisma.format.findMany({
    select: { id: true, name: true, code: true, themeKey: true, isIndividual: true },
    orderBy: { id: 'asc' },
  });
}

/**
 * Formats that already have at least one season — used for public nav league links.
 * Seeded formats without seasons (e.g. Ultiduo/BBall before admins create seasons) stay hidden.
 */
export async function getFormatsWithSeasons(): Promise<
  { id: number; name: string; code: string; themeKey: string; isIndividual: boolean }[]
> {
  return prisma.format.findMany({
    where: { seasons: { some: { region: { hidden: 0 } } } },
    select: { id: true, name: true, code: true, themeKey: true, isIndividual: true },
    orderBy: { id: 'asc' },
  });
}

export async function updateFormat(id: number, data: FormatConfigInput) {
  const existing = await prisma.format.findFirst({
    where: {
      code: data.code,
      NOT: { id },
    },
  });

  if (existing) {
    badRequest(`Format with code "${data.code}" already exists`);
  }

  const current = await prisma.format.findUnique({ where: { id } });
  if (!current) notFound('Format not found');

  const isIndividual = data.isIndividual ?? current.isIndividual;
  const minRosterSize = data.minRosterSize ?? current.minRosterSize;
  const maxRosterSize = data.maxRosterSize ?? current.maxRosterSize;
  const requiredPaidPlayers = data.requiredPaidPlayers ?? current.requiredPaidPlayers;
  const supportsJoinPassword = data.supportsJoinPassword ?? current.supportsJoinPassword;
  const supportsAcronym = data.supportsAcronym ?? current.supportsAcronym;
  const supportsReregistration = data.supportsReregistration ?? current.supportsReregistration;
  const themeKey = data.themeKey ? normalizeThemeKey(data.themeKey) : current.themeKey;

  validateRosterRules({
    minRosterSize,
    maxRosterSize,
    requiredPaidPlayers,
    isIndividual,
  });

  return prisma.format.update({
    where: { id },
    data: {
      name: data.name.trim(),
      code: data.code.trim().toLowerCase(),
      isIndividual,
      minRosterSize,
      maxRosterSize,
      requiredPaidPlayers,
      supportsJoinPassword,
      supportsAcronym,
      supportsReregistration,
      themeKey,
    },
  });
}
