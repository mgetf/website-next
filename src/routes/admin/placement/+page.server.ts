import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { z } from 'zod';
import { validateForm, validationError, formError, formSuccess } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import { getFormatsForFilter } from '$lib/server/services/formats';
import { getRegionsForFilter } from '$lib/server/services/regions';
import {
  applyDivisionPlacements,
  getCurrentPlacementSeason,
  getPlacementBoard,
} from '$lib/server/services/placement';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import type { PlacementAssignment } from '$lib/types/placement';

const saveSchema = z.object({
  seasonId: z.coerce.number().int().positive(),
  regionId: z.coerce.number().int().positive(),
  formatId: z.coerce.number().int().positive(),
  placements: z.string().min(1, 'Placement list is required'),
});

const assignmentSchema = z.array(
  z.object({
    teamId: z.number().int().positive(),
    divisionId: z.number().int().positive(),
  }),
);

function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}

function parseAssignments(raw: string): PlacementAssignment[] | null {
  try {
    return assignmentSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  const formats = await getFormatsForFilter();
  const regions = await getRegionsForFilter();

  const requestedFormatId = parsePositiveInt(url.searchParams.get('format'));
  const requestedRegionId = parsePositiveInt(url.searchParams.get('region'));

  const formatId =
    (requestedFormatId && formats.some((format) => format.id === requestedFormatId)
      ? requestedFormatId
      : formats[0]?.id) ?? null;
  const regionId =
    (requestedRegionId && regions.some((region) => region.id === requestedRegionId)
      ? requestedRegionId
      : regions[0]?.id) ?? null;

  if (formatId == null || regionId == null) {
    return {
      formats,
      regions,
      formatId: null,
      regionId: null,
      seasonId: null,
      seasonNum: null,
      isIndividual: false,
      currencySymbol: '$',
      divisions: [],
      entries: [],
    };
  }

  const currentSeason = await getCurrentPlacementSeason(regionId, formatId);

  if (currentSeason == null) {
    return {
      formats,
      regions,
      formatId,
      regionId,
      seasonId: null,
      seasonNum: null,
      isIndividual: formats.find((format) => format.id === formatId)?.isIndividual ?? false,
      currencySymbol: '$',
      divisions: [],
      entries: [],
    };
  }

  const seasonId = currentSeason.id;

  const board = await getPlacementBoard({ seasonId, regionId, formatId });

  return {
    formats,
    regions,
    formatId,
    regionId,
    seasonId,
    seasonNum: currentSeason.seasonNum,
    isIndividual: board.format.isIndividual,
    currencySymbol: board.region.currencySymbol,
    divisions: board.divisions,
    entries: board.entries,
  };
};

export const actions: Actions = {
  save: async ({ locals, request, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, saveSchema);
    if (!validation.success) return validationError(validation.errors);

    const assignments = parseAssignments(validation.data.placements);
    if (!assignments) return formError('Invalid placement list');

    try {
      const result = await applyDivisionPlacements({
        seasonId: validation.data.seasonId,
        regionId: validation.data.regionId,
        formatId: validation.data.formatId,
        assignments,
        adminSteamId: locals.user.steamId,
      });

      for (const change of result.changes) {
        await logAudit({
          actorId: locals.user.steamId,
          actorRole: locals.user.permissionLevel,
          category: AuditCategory.TEAM,
          action: AuditAction.TEAM_DIVISION_CHANGED,
          targetType: 'Team',
          targetId: String(change.teamId),
          metadata: {
            divisionIdBefore: change.oldDivision?.id ?? null,
            divisionIdAfter: change.newDivision?.id ?? null,
            divisionNameBefore: change.oldDivision?.name ?? null,
            divisionNameAfter: change.newDivision?.name ?? null,
            paymentStatusReset: change.paymentStatusReset,
            statusReset: change.statusReset,
            refundNotices: change.notifiedPlayerSteamIds.length,
          },
          ipAddress: getClientAddress(),
        });
      }

      const extra: string[] = [];
      if (result.paymentStatusReset > 0) {
        extra.push(
          `${result.paymentStatusReset} ${result.paymentStatusReset === 1 ? 'entry' : 'entries'} reset to unpaid`,
        );
      }
      if (result.statusReset > 0) {
        extra.push(
          `${result.statusReset} ${result.statusReset === 1 ? 'entry' : 'entries'} returned to unready`,
        );
      }
      if (result.refundNotices > 0) {
        extra.push(
          `${result.refundNotices} refund ${result.refundNotices === 1 ? 'notice' : 'notices'} sent`,
        );
      }

      const message = `Saved ${result.moved} division ${result.moved === 1 ? 'change' : 'changes'}${
        extra.length ? ` — ${extra.join(', ')}` : ''
      }`;

      return formSuccess(
        {
          moved: result.moved,
          paymentStatusReset: result.paymentStatusReset,
          statusReset: result.statusReset,
          refundNotices: result.refundNotices,
        },
        message,
      );
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to save placements'), 400);
    }
  },
};
