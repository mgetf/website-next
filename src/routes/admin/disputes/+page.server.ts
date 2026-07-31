/**
 * Admin Disputes Page - Server Load and Actions
 * Allows admins to view and resolve disputed matches
 */

import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { getDisputedMatches, resolveDispute } from '$lib/server/services/disputes';
import { MatchStatus } from '$lib/types/enums';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

const resolveDisputeSchema = z.object({
  matchId: z.coerce.number().int().positive('Invalid match ID'),
  status: z.enum(['UNPLAYED', 'PLAYED'], { message: 'Invalid status' }),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const disputedMatches = await getDisputedMatches();

  return {
    disputedMatches,
  };
};

export const actions: Actions = {
  resolveDispute: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, resolveDisputeSchema);
    if (!validation.success) return validationError(validation.errors);

    const { matchId, status } = validation.data;

    try {
      await resolveDispute(matchId, status as MatchStatus);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_DISPUTE_RESOLVED,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: { resolution: status },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Dispute resolved successfully' };
    } catch (error) {
      console.error('Error resolving dispute:', error);
      return fail(500, { error: 'Failed to resolve dispute' });
    }
  },
};
