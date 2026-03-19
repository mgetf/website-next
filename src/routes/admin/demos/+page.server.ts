/**
 * Admin Demo Reports Page - Server Load and Actions
 * Allows admins to review and manage reported demos
 */

import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { getAllDemoReports, updateDemoReport } from '$lib/server/services/demoReports';
import { fail } from '@sveltejs/kit';
import type { DemoStatus } from '$prisma/client.js';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const demoReports = await getAllDemoReports();

  return {
    demoReports,
  };
};

export const actions: Actions = {
  updateReport: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const reportId = parseInt(formData.get('reportId')?.toString() || '');
    const status = formData.get('status')?.toString() as DemoStatus;
    const adminComments = formData.get('adminComments')?.toString() || '';

    if (!reportId || isNaN(reportId)) {
      return fail(400, { error: 'Invalid report ID' });
    }

    if (!status || !['CLEAR', 'REVIEW', 'ACTION'].includes(status)) {
      return fail(400, { error: 'Invalid status' });
    }

    try {
      await updateDemoReport(reportId, status, adminComments, locals.user.steamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.DEMO,
        action: AuditAction.DEMO_REPORT_REVIEWED,
        targetType: 'DemoReport',
        targetId: String(reportId),
        metadata: { status, adminComments: adminComments || null },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Report updated successfully' };
    } catch (error) {
      console.error('Error updating demo report:', error);
      return fail(500, { error: 'Failed to update report' });
    }
  },
};
