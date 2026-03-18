import type { PageServerLoad } from './$types';
import { requireStrictAdmin } from '$lib/server/auth/permissions';
import { getAuditLogs, getAuditLogStats, AuditCategory } from '$lib/server/services/auditLog';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireStrictAdmin(locals.user);

  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = 50;
  const category = url.searchParams.get('category') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const actorId = url.searchParams.get('actorId') || undefined;
  const targetType = url.searchParams.get('targetType') || undefined;
  const targetId = url.searchParams.get('targetId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom')
    ? new Date(url.searchParams.get('dateFrom')!)
    : undefined;
  const dateTo = url.searchParams.get('dateTo')
    ? new Date(url.searchParams.get('dateTo')! + 'T23:59:59Z')
    : undefined;

  const [{ logs, pagination }, stats] = await Promise.all([
    getAuditLogs({
      category,
      action,
      actorId,
      targetType,
      targetId,
      dateFrom,
      dateTo,
      page,
      pageSize,
    }),
    getAuditLogStats(),
  ]);

  return {
    logs: logs.map((log) => ({
      id: log.id,
      timestamp: log.timestamp.toISOString(),
      actorId: log.actorId,
      actorRole: log.actorRole,
      actorUsername: log.actor?.steamUsername ?? null,
      actorAvatar: log.actor?.steamAvatar ?? null,
      category: log.category,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      targetUsername: log.targetUser?.steamUsername ?? null,
      targetAvatar: log.targetUser?.steamAvatar ?? null,
      metadata: log.metadata,
      ipAddress: log.ipAddress,
    })),
    pagination,
    stats,
    categories: Object.values(AuditCategory),
    filters: {
      category: category ?? '',
      action: action ?? '',
      actorId: actorId ?? '',
      targetType: targetType ?? '',
      targetId: targetId ?? '',
      dateFrom: url.searchParams.get('dateFrom') ?? '',
      dateTo: url.searchParams.get('dateTo') ?? '',
    },
  };
};
