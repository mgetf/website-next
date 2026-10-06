import { isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin, requireStrictAdmin, isStrictAdmin } from '$lib/server/auth/permissions';
import { getErrorMessage, notFound } from '$lib/server/utils/errors';
import {
  discardMatchSetDraft,
  getMatchSetDraftDetail,
  publishMatchSetDraft,
} from '$lib/server/services/matchSetDrafts';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { formError } from '$lib/server/utils/forms';

export const load: PageServerLoad = async ({ locals, params }) => {
  requireAdmin(locals.user);

  const draftId = parseInt(params.id, 10);
  if (!Number.isInteger(draftId) || draftId <= 0) {
    notFound('Match set draft not found');
  }

  const draft = await getMatchSetDraftDetail(draftId);

  return {
    isStrictAdmin: isStrictAdmin(locals.user),
    draft,
  };
};

export const actions: Actions = {
  publish: async ({ locals, params, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const draftId = parseInt(params.id, 10);
    if (!Number.isInteger(draftId) || draftId <= 0) {
      return formError('Invalid draft');
    }

    try {
      const published = await publishMatchSetDraft(draftId, locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_SET_PUBLISHED,
        targetType: 'MatchSetDraft',
        targetId: String(draftId),
        metadata: {
          matchCount: published.matchCount,
          byeTeamCount: published.byeTeamCount,
        },
        ipAddress: getClientAddress(),
      });

      throw redirect(303, `/admin/matches?created=${published.matchCount}`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      return formError(getErrorMessage(err, 'Failed to publish match set'));
    }
  },

  discard: async ({ locals, params, getClientAddress }) => {
    requireAdmin(locals.user);

    const draftId = parseInt(params.id, 10);
    if (!Number.isInteger(draftId) || draftId <= 0) {
      return formError('Invalid draft');
    }

    try {
      await discardMatchSetDraft(draftId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_SET_DRAFT_DISCARDED,
        targetType: 'MatchSetDraft',
        targetId: String(draftId),
        ipAddress: getClientAddress(),
      });

      throw redirect(303, '/admin/matches?discarded=1');
    } catch (err) {
      if (isRedirect(err)) throw err;
      return formError(getErrorMessage(err, 'Failed to discard draft'));
    }
  },
};
