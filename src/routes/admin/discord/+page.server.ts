/**
 * Admin Discord page: bot health, the outbox, and DMs sent to the bot.
 * Strict admins only; direct messages can be private.
 */

import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { requireStrictAdmin } from '#lib/server/auth/permissions.js';
import {
  getDiscordOverview,
  listInbox,
  listOutboxEvents,
  markAllInboxHandled,
  markInboxHandled,
  requeueDeadOutboxEvents,
  requeueOutboxEvent,
} from '#lib/server/services/discordAdmin.js';
import { AuditAction, AuditCategory, logAudit } from '#lib/server/services/auditLog.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';
import { validateForm, validationError } from '#lib/server/utils/forms.js';
import { OutboxStatus } from '#prisma/client.js';

const STATUS_FILTERS = ['ALL', 'PENDING', 'CLAIMED', 'DELIVERED', 'DEAD'] as const;

export const load: PageServerLoad = async ({ locals, url }) => {
  requireStrictAdmin(locals.user);

  const requested = url.searchParams.get('status') ?? 'ALL';
  const status = (STATUS_FILTERS as readonly string[]).includes(requested) ? requested : 'ALL';
  const inboxView = url.searchParams.get('inbox') === 'all' ? 'all' : 'open';

  const [overview, events, inbox] = await Promise.all([
    getDiscordOverview(),
    listOutboxEvents({ status: status === 'ALL' ? undefined : (status as OutboxStatus), take: 50 }),
    listInbox({ unhandledOnly: inboxView === 'open', take: 50 }),
  ]);

  return { overview, events, inbox, status, inboxView, statusFilters: STATUS_FILTERS };
};

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const requeueAllSchema = z.object({ kind: z.string().max(100).optional().default('') });

export const actions: Actions = {
  requeue: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    const validation = validateForm(await request.formData(), idSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await requeueOutboxEvent(validation.data.id);
      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.DISCORD_OUTBOX_REQUEUED,
        targetType: 'OutboxEvent',
        targetId: String(validation.data.id),
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Message queued again' };
    } catch (err) {
      return fail(400, { error: getErrorMessage(err, 'Could not requeue that message') });
    }
  },

  requeueDead: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    const validation = validateForm(await request.formData(), requeueAllSchema);
    if (!validation.success) return validationError(validation.errors);

    const count = await requeueDeadOutboxEvents(validation.data.kind || undefined);
    await logAudit({
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      category: AuditCategory.SITE,
      action: AuditAction.DISCORD_OUTBOX_REQUEUED,
      targetType: 'OutboxEvent',
      metadata: { count, kind: validation.data.kind || null },
      ipAddress: getClientAddress(),
    });
    return { success: true, message: `${count} message${count === 1 ? '' : 's'} queued again` };
  },

  handleInbox: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    const validation = validateForm(await request.formData(), idSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await markInboxHandled(validation.data.id, locals.user.steamId);
      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.SITE,
        action: AuditAction.DISCORD_INBOX_HANDLED,
        targetType: 'DiscordInboxMessage',
        targetId: String(validation.data.id),
        ipAddress: getClientAddress(),
      });
      return { success: true, message: 'Marked as handled' };
    } catch (err) {
      return fail(400, { error: getErrorMessage(err, 'Could not update that message') });
    }
  },

  handleAllInbox: async ({ locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    const count = await markAllInboxHandled(locals.user.steamId);
    await logAudit({
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      category: AuditCategory.SITE,
      action: AuditAction.DISCORD_INBOX_HANDLED,
      targetType: 'DiscordInboxMessage',
      metadata: { count },
      ipAddress: getClientAddress(),
    });
    return { success: true, message: `${count} message${count === 1 ? '' : 's'} marked handled` };
  },
};
