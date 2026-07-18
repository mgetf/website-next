import { isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStrictAdmin } from '$lib/server/auth/permissions';
import {
  cloneEventToDraft,
  createEventDraft,
  importHistoricalEventDrafts,
  listTournamentEditorItems,
  type EventEditorActor,
} from '$lib/server/services/eventEditor';
import { eventDraftCloneSchema, eventDraftCreateSchema } from '$lib/server/utils/validation';
import { formError, formSuccess, validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';

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

export const load: PageServerLoad = async ({ locals }) => {
  requireStrictAdmin(locals.user);
  return {
    tournaments: await listTournamentEditorItems(),
  };
};

export const actions: Actions = {
  create: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, eventDraftCreateSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const draft = await createEventDraft(
        validation.data,
        editorActor(locals.user, getClientAddress),
      );
      throw redirect(303, `/admin/tournaments/${draft.draftId}`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      return formError(getErrorMessage(err, 'Failed to create tournament draft'), 400);
    }
  },

  clone: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    const formData = await request.formData();
    const validation = validateForm(formData, eventDraftCloneSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      const draft = await cloneEventToDraft(
        validation.data.eventId,
        editorActor(locals.user, getClientAddress),
      );
      throw redirect(303, `/admin/tournaments/${draft.draftId}`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      return formError(getErrorMessage(err, 'Failed to create draft from tournament'), 400);
    }
  },

  importHistorical: async ({ locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    try {
      const result = await importHistoricalEventDrafts(editorActor(locals.user, getClientAddress));
      return formSuccess(result, `Created ${result.imported} historical draft(s)`);
    } catch (err) {
      return formError(getErrorMessage(err, 'Failed to import historical tournaments'), 500);
    }
  },
};
