import type { PageServerLoad, Actions } from './$types';
import { z } from 'zod';
import { getAllEvents, createEvent } from '$lib/server/services/events';
import { isAdmin } from '$lib/server/auth/permissions';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { validateForm, validationError, formError } from '$lib/server/utils/forms';
import type { EventType } from '$prisma/client.js';

export const load: PageServerLoad = async ({ locals }) => {
  const events = await getAllEvents();

  return {
    events,
    isGlobalAdmin: isAdmin(locals.user),
  };
};

const createEventSchema = z.object({
  name: z.string().min(1, 'Event name is required').trim(),
  type: z.enum(['CUP', 'CHAMPIONSHIP', 'FIGHT_NIGHT']),
  description: z.string().trim().optional().default(''),
  bracketLink: z.string().url().or(z.literal('')).optional().default(''),
  avatar: z.string().url().or(z.literal('')).optional().default(''),
  startedAt: z.string().optional().default(''),
  isTeamEvent: z.string().optional(),
  card: z.string().trim().optional().default(''),
});

export const actions: Actions = {
  create: async ({ request, locals, getClientAddress }) => {
    if (!isAdmin(locals.user)) {
      return formError('Unauthorized - Admin access required', 403);
    }

    const formData = await request.formData();
    const validation = validateForm(formData, createEventSchema);
    if (!validation.success) return validationError(validation.errors);

    const { name, type, description, bracketLink, avatar, startedAt, isTeamEvent, card } =
      validation.data;

    try {
      await createEvent({
        name,
        type: type as EventType,
        description: description || undefined,
        bracketLink: bracketLink || undefined,
        avatar: avatar || undefined,
        startedAt: startedAt ? new Date(startedAt) : undefined,
        isTeamEvent: isTeamEvent === 'on',
        card: card || undefined,
      });

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.TOURNAMENT,
        action: AuditAction.TOURNAMENT_CREATED,
        metadata: { name, type, isTeamEvent: isTeamEvent === 'on' },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Event created successfully' };
    } catch (err) {
      return formError(err instanceof Error ? err.message : 'Failed to create event', 500);
    }
  },
};
