/**
 * Admin Disputes Page - Server Load and Actions
 * Allows admins to view and resolve disputed matches
 */

import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  getDisputedMatches,
  resolveDispute,
} from '$lib/server/services/disputes';
import { MatchStatus } from '$prisma/client.js';
import { fail } from '@sveltejs/kit';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

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
    const matchId = parseInt(formData.get('matchId')?.toString() || '');
    const status = formData.get('status')?.toString() as MatchStatus;

    if (!matchId || isNaN(matchId)) {
      return fail(400, { error: 'Invalid match ID' });
    }

    if (!status || !['UNPLAYED', 'PLAYED'].includes(status)) {
      return fail(400, { error: 'Invalid status' });
    }

    try {
      await resolveDispute(matchId, status);

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
