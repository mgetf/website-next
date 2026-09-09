import { prisma } from '$lib/server/db';
import type { SignupFeeRegion, SignupFeeSummary } from '$lib/types/signupFee';
import { getRegionAbbr, sortRegionsByAbbr } from '$lib/utils/region';
import { flagForRegion } from '$lib/utils/regions';

export type DivisionFeeInput = {
  regionId: number;
  signupCost: number;
  currencySymbol: string;
  itemQuantity: number | null;
  itemName: string | null;
};

export type RegionFeeInput = {
  regionId: number;
  name: string;
  paymentRequired: boolean;
  divisions: DivisionFeeInput[];
};

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function formatMoneyLabel(amounts: { symbol: string; amount: number }[]): string | null {
  if (amounts.length === 0) return null;

  const bySymbol = new Map<string, { min: number; max: number }>();
  for (const { symbol, amount } of amounts) {
    const existing = bySymbol.get(symbol);
    if (!existing) {
      bySymbol.set(symbol, { min: amount, max: amount });
    } else {
      existing.min = Math.min(existing.min, amount);
      existing.max = Math.max(existing.max, amount);
    }
  }

  return [...bySymbol.entries()]
    .map(([symbol, { min, max }]) =>
      min === max
        ? `${symbol}${formatAmount(min)}`
        : `${symbol}${formatAmount(min)}–${symbol}${formatAmount(max)}`,
    )
    .join(' / ');
}

function formatItemLabel(items: { itemQuantity: number; itemName: string }[]): string | null {
  if (items.length === 0) return null;

  const byName = new Map<string, { min: number; max: number }>();
  for (const { itemQuantity, itemName } of items) {
    const existing = byName.get(itemName);
    if (!existing) {
      byName.set(itemName, { min: itemQuantity, max: itemQuantity });
    } else {
      existing.min = Math.min(existing.min, itemQuantity);
      existing.max = Math.max(existing.max, itemQuantity);
    }
  }

  return [...byName.entries()]
    .map(([name, { min, max }]) => (min === max ? `${min}× ${name}` : `${min}–${max}× ${name}`))
    .join(' / ');
}

function paidLabels(divisions: DivisionFeeInput[]): {
  moneyLabel: string | null;
  itemLabel: string | null;
} {
  const moneyAmounts = divisions
    .filter((division) => division.signupCost > 0)
    .map((division) => ({ symbol: division.currencySymbol, amount: division.signupCost }));
  const items = divisions.flatMap((division) => {
    if (division.itemQuantity == null || division.itemQuantity <= 0 || !division.itemName) {
      return [];
    }
    return [{ itemQuantity: division.itemQuantity, itemName: division.itemName }];
  });

  return {
    moneyLabel: formatMoneyLabel(moneyAmounts),
    itemLabel: formatItemLabel(items),
  };
}

/**
 * Per-region fee from that season's paymentRequired flag and that region's divisions.
 * Free when payment is not required, or every division is $0 with no item alt.
 * Paid labels use only positive costs / item quantities (zero-cost divisions are omitted).
 */
export function summarizeRegionFee(
  paymentRequired: boolean,
  divisions: DivisionFeeInput[],
): Pick<SignupFeeRegion, 'kind' | 'moneyLabel' | 'itemLabel'> {
  if (!paymentRequired) {
    return { kind: 'free', moneyLabel: null, itemLabel: null };
  }

  const { moneyLabel, itemLabel } = paidLabels(divisions);
  if (!moneyLabel && !itemLabel) {
    return { kind: 'free', moneyLabel: null, itemLabel: null };
  }

  return { kind: 'paid', moneyLabel, itemLabel };
}

export function buildSignupFeeSummary(regions: RegionFeeInput[]): SignupFeeSummary {
  const mapped = regions.map((region) => {
    const abbr = getRegionAbbr(region.name);
    return {
      regionId: region.regionId,
      name: region.name,
      abbr,
      flagCode: flagForRegion(abbr),
      ...summarizeRegionFee(region.paymentRequired, region.divisions),
    };
  });

  return { regions: sortRegionsByAbbr(mapped) };
}

export async function getSignupFeeSummaries(
  formatIds: number[],
): Promise<Map<number, SignupFeeSummary>> {
  const summaries = new Map<number, SignupFeeSummary>();
  for (const formatId of formatIds) {
    summaries.set(formatId, { regions: [] });
  }
  if (formatIds.length === 0) return summaries;

  const seasons = await prisma.activeSignupSeason.findMany({
    where: {
      formatId: { in: formatIds },
      season: { signupsOpen: true },
    },
    select: {
      formatId: true,
      regionId: true,
      season: { select: { paymentRequired: true } },
      region: { select: { hidden: true, name: true } },
    },
  });

  const visible = seasons.filter((row) => row.region.hidden === 0);
  const regionIds = [...new Set(visible.map((row) => row.regionId))];
  const divisions =
    regionIds.length === 0
      ? []
      : await prisma.division.findMany({
          where: { hidden: 0, regionId: { in: regionIds } },
          select: {
            regionId: true,
            signupCost: true,
            region: { select: { currencySymbol: true } },
            itemPayment: {
              select: {
                itemQuantity: true,
                steamItem: { select: { name: true } },
              },
            },
          },
        });

  const divisionsByRegion = new Map<number, DivisionFeeInput[]>();
  for (const division of divisions) {
    const list = divisionsByRegion.get(division.regionId) ?? [];
    list.push({
      regionId: division.regionId,
      signupCost: division.signupCost,
      currencySymbol: division.region.currencySymbol,
      itemQuantity: division.itemPayment?.itemQuantity ?? null,
      itemName: division.itemPayment?.steamItem.name ?? null,
    });
    divisionsByRegion.set(division.regionId, list);
  }

  const regionsByFormat = new Map<number, RegionFeeInput[]>();
  for (const formatId of formatIds) {
    regionsByFormat.set(formatId, []);
  }

  const seen = new Set<string>();
  for (const row of visible) {
    const key = `${row.formatId}:${row.regionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    regionsByFormat.get(row.formatId)?.push({
      regionId: row.regionId,
      name: row.region.name,
      paymentRequired: row.season.paymentRequired,
      divisions: divisionsByRegion.get(row.regionId) ?? [],
    });
  }

  for (const formatId of formatIds) {
    summaries.set(formatId, buildSignupFeeSummary(regionsByFormat.get(formatId) ?? []));
  }

  return summaries;
}

export async function getSignupFeeSummary(formatId: number): Promise<SignupFeeSummary> {
  const summaries = await getSignupFeeSummaries([formatId]);
  return summaries.get(formatId) ?? { regions: [] };
}
