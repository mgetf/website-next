/**
 * Admin Flags Page — mod-only staff notes ("flags") on players.
 * Lists every flag with full history (via audit log) and edit/resolve forms.
 */

import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '#lib/server/auth/permissions.js';
import { fail, isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '#lib/server/utils/forms.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';
import {
  listFlags,
  createFlag,
  updateFlag,
  resolveFlag,
} from '#lib/server/services/playerFlags.js';
import { getAuditLogs } from '#lib/server/services/auditLog.js';
import { AuditAction } from '#lib/server/services/auditLog.js';

const flagBodySchema = z.object({
  playerSteamId: z.string().min(1, 'Player is required'),
  body: z.string().trim().min(1, 'Note text is required').max(5000, 'Note is too long'),
});

const updateFlagSchema = z.object({
  flagId: z.coerce.number().int().positive('Invalid flag'),
  body: z.string().trim().min(1, 'Note text is required').max(5000, 'Note is too long'),
});

const flagIdSchema = z.object({
  flagId: z.coerce.number().int().positive('Invalid flag'),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const [flags, flagged, updated, resolved] = await Promise.all([
    listFlags({}),
    getAuditLogs({ category: 'USER', action: AuditAction.USER_FLAGGED, pageSize: 100 }),
    getAuditLogs({ category: 'USER', action: AuditAction.USER_FLAG_UPDATED, pageSize: 100 }),
    getAuditLogs({ category: 'USER', action: AuditAction.USER_FLAG_RESOLVED, pageSize: 100 }),
  ]);

  const history = [...flagged.logs, ...updated.logs, ...resolved.logs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return { flags, history };
};

export const actions: Actions = {
  createFlag: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, flagBodySchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await createFlag(validation.data.playerSteamId, validation.data.body, {
        actorSteamId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Flag added' };
    } catch (err) {
      if (isHttpError(err)) return fail(err.status, { error: getErrorMessage(err) });
      return fail(500, { error: getErrorMessage(err, 'Failed to add flag') });
    }
  },

  updateFlag: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, updateFlagSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await updateFlag(validation.data.flagId, validation.data.body, {
        actorSteamId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Flag updated' };
    } catch (err) {
      if (isHttpError(err)) return fail(err.status, { error: getErrorMessage(err) });
      return fail(500, { error: getErrorMessage(err, 'Failed to update flag') });
    }
  },

  resolveFlag: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, flagIdSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await resolveFlag(validation.data.flagId, {
        actorSteamId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Flag resolved' };
    } catch (err) {
      if (isHttpError(err)) return fail(err.status, { error: getErrorMessage(err) });
      return fail(500, { error: getErrorMessage(err, 'Failed to resolve flag') });
    }
  },
};
