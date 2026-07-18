import { isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStrictAdmin } from '$lib/server/auth/permissions';
import {
  getEventDraft,
  getEventDraftRevisions,
  previewEventDraft,
  publishEventDraft,
  restoreEventRevision,
  saveEventDraft,
  type EventEditorActor,
} from '$lib/server/services/eventEditor';
import { getArenas } from '$lib/server/services/arenas';
import {
  eventDraftPublishSchema,
  eventDraftSaveSchema,
  eventRevisionRestoreSchema,
} from '$lib/server/utils/validation';
import { formError, formSuccess, validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import { validateDraftStructure } from '$lib/utils/tournamentDraftValidation';

function draftIdFromParams(params: { draftId: string }): number {
  const draftId = Number(params.draftId);
  if (!Number.isInteger(draftId) || draftId <= 0) {
    throw new Error('Invalid tournament draft id');
  }
  return draftId;
}

function editorActor(
  user: NonNullable<App.Locals['user']>,
  getClientAddress: () => string,
): EventEditorActor {
  return {
    steamId: user.steamId,
    role: user.permissionLevel,
    ipAddress: getClientAddress(),
  };
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireStrictAdmin(locals.user);
  const draftId = draftIdFromParams(params);
  const [draft, revisions, arenas] = await Promise.all([
    getEventDraft(draftId),
    getEventDraftRevisions(draftId),
    getArenas(),
  ]);

  return {
    draft,
    revisions,
    arenas: arenas.map((arena) => ({ id: arena.id, name: arena.name })),
    initialIssues: validateDraftStructure(draft.payload),
    publishedRevision: url.searchParams.get('published'),
  };
};

export const actions: Actions = {
  save: async ({ request, params, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, eventDraftSaveSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const draft = await saveEventDraft({
        draftId: draftIdFromParams(params),
        expectedRevision: validation.data.expectedRevision,
        payload: validation.data.payload,
        actor: editorActor(locals.user, getClientAddress),
      });
      return formSuccess(
        {
          revision: draft.revision,
          updatedAt: draft.updatedAt,
          issues: validateDraftStructure(draft.payload),
        },
        'Draft saved',
      );
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to save tournament draft'), 400);
    }
  },

  preview: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, eventDraftSaveSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      return formSuccess(await previewEventDraft(validation.data.payload), 'Preview updated');
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to preview tournament draft'), 400);
    }
  },

  publish: async ({ request, params, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, eventDraftPublishSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const result = await publishEventDraft({
        draftId: draftIdFromParams(params),
        expectedRevision: validation.data.expectedRevision,
        payload: validation.data.payload,
        summary: validation.data.summary,
        actor: editorActor(locals.user, getClientAddress),
      });
      throw redirect(
        303,
        `/admin/tournaments/${draftIdFromParams(params)}?published=${result.publishedRevision}`,
      );
    } catch (err) {
      if (isRedirect(err)) throw err;
      return formError(getErrorMessage(err, 'Failed to publish tournament'), 400);
    }
  },

  restore: async ({ request, params, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, eventRevisionRestoreSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const result = await restoreEventRevision({
        draftId: draftIdFromParams(params),
        revisionId: validation.data.revisionId,
        expectedRevision: validation.data.expectedRevision,
        actor: editorActor(locals.user, getClientAddress),
      });
      throw redirect(
        303,
        `/admin/tournaments/${draftIdFromParams(params)}?published=${result.publishedRevision}`,
      );
    } catch (err) {
      if (isRedirect(err)) throw err;
      return formError(getErrorMessage(err, 'Failed to restore tournament revision'), 400);
    }
  },
};
