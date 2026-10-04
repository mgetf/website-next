import { isHttpError } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import {
  getProfilingSettings,
  resetProfilingSettings,
  saveProfilingSettings,
} from '$lib/server/services/profilingSettings';
import { formError, formSuccess, validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import {
  PROFILING_FIELDS,
  profilingWeightChanges,
  weightsFromFlatRecord,
} from '$lib/utils/profiling';
import { z } from 'zod';

const saveSchema = z.object(
  Object.fromEntries(
    PROFILING_FIELDS.map((field) => [field.path, z.coerce.number().finite()]),
  ) as Record<(typeof PROFILING_FIELDS)[number]['path'], z.ZodNumber>,
);

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);
  const settings = await getProfilingSettings();
  return {
    settings,
  };
};

export const actions: Actions = {
  save: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, saveSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const nested = weightsFromFlatRecord(validation.data as Record<string, number>);
      const previous = await getProfilingSettings();
      const saved = await saveProfilingSettings(nested);
      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.PROFILING_SETTINGS_UPDATED,
        targetType: 'ProfilingSettings',
        targetId: '1',
        metadata: { changes: profilingWeightChanges(previous.weights, saved.weights) },
        ipAddress: getClientAddress(),
      });
      return formSuccess(undefined, 'Profiling weights saved');
    } catch (err) {
      if (isHttpError(err)) return formError(getErrorMessage(err), err.status);
      return formError(getErrorMessage(err, 'Failed to save profiling weights'), 500);
    }
  },

  reset: async ({ locals, getClientAddress }) => {
    requireAdmin(locals.user);
    try {
      const previous = await getProfilingSettings();
      const saved = await resetProfilingSettings();
      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.PROFILING_SETTINGS_RESET,
        targetType: 'ProfilingSettings',
        targetId: '1',
        metadata: { changes: profilingWeightChanges(previous.weights, saved.weights) },
        ipAddress: getClientAddress(),
      });
      return formSuccess(undefined, 'Profiling weights reset to defaults');
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to reset profiling weights'), 500);
    }
  },
};
