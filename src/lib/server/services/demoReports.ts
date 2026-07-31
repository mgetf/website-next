/**
 * Demo Reports Service
 *
 * All demo report-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import type { DemoStatus } from '$prisma/client.js';

/**
 * Get all demo reports with related data (demo, reporter, player, match)
 */
export async function getAllDemoReports() {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createDemosClient, getReportIdsByStatus, getDemoReport, getDemo } =
      await import('$lib/server/rama/demos');
    const { createUsersClient, getUser } = await import('$lib/server/rama/users');
    const { createMatchClient, getMatch } = await import('$lib/server/rama/match');
    const { getTeamById } = await import('$lib/server/services/teams');

    const opts = ramaClientOpts();
    const demosClient = createDemosClient(opts);
    const usersClient = createUsersClient(opts);
    const matchClient = createMatchClient(opts);

    const statuses = ['REVIEW', 'ACTION', 'CLEAR'] as const;
    const reportIds: string[] = [];
    for (const status of statuses) {
      reportIds.push(...(await getReportIdsByStatus(demosClient, status)));
    }

    const rows = [];
    for (const reportId of reportIds) {
      const report = await getDemoReport(demosClient, reportId);
      if (!report) continue;
      const demo = await getDemo(demosClient, report.demoId);
      if (!demo) continue;

      const [reporter, player, submitter, admin, matchRow] = await Promise.all([
        getUser(usersClient, report.reportedBy),
        getUser(usersClient, demo.playerSteamId),
        getUser(usersClient, demo.submittedBy),
        report.adminId ? getUser(usersClient, report.adminId) : null,
        getMatch(matchClient, demo.matchId),
      ]);

      let matchView = null;
      if (matchRow) {
        const homeTeamId = Number(matchRow.homeTeamId);
        const awayTeamId = Number(matchRow.awayTeamId);
        const [homeTeam, awayTeam] = await Promise.all([
          Number.isFinite(homeTeamId) ? getTeamById(homeTeamId) : null,
          Number.isFinite(awayTeamId) ? getTeamById(awayTeamId) : null,
        ]);
        matchView = {
          id: Number(demo.matchId),
          seasonNo: Number(matchRow.seasonNo ?? 0),
          weekNo: Number(matchRow.weekNo ?? 0) || null,
          homeTeam: homeTeam ? { id: homeTeam.id, name: homeTeam.name } : null,
          awayTeam: awayTeam ? { id: awayTeam.id, name: awayTeam.name } : null,
        };
      }

      rows.push({
        id: Number(reportId),
        demoId: Number(report.demoId),
        reportedBy: report.reportedBy,
        status: report.status as DemoStatus,
        description: report.description,
        adminComments: report.adminComments || null,
        adminId: report.adminId || null,
        reportedAt: report.reportedAt ? new Date(report.reportedAt) : new Date(),
        demo: {
          id: Number(report.demoId),
          file: demo.file,
          playerSteamId: demo.playerSteamId,
          submittedBy: demo.submittedBy,
          matchId: Number(demo.matchId),
          title: demo.title || null,
          description: demo.description || null,
          player: player
            ? {
                steamId: demo.playerSteamId,
                steamUsername: String(player.username ?? demo.playerSteamId),
                steamAvatar: String(player.avatarUrl ?? ''),
              }
            : null,
          submitter: submitter
            ? {
                steamId: demo.submittedBy,
                steamUsername: String(submitter.username ?? demo.submittedBy),
                steamAvatar: String(submitter.avatarUrl ?? ''),
              }
            : null,
          match: matchView,
        },
        reporter: reporter
          ? {
              steamId: report.reportedBy,
              steamUsername: String(reporter.username ?? report.reportedBy),
              steamAvatar: String(reporter.avatarUrl ?? ''),
            }
          : null,
        admin: admin
          ? {
              steamId: report.adminId,
              steamUsername: String(admin.username ?? report.adminId),
            }
          : null,
      });
    }

    rows.sort((a, b) => {
      if (a.status !== b.status) return a.status.localeCompare(b.status);
      return b.reportedAt.getTime() - a.reportedAt.getTime();
    });
    return rows;
  }

  return await prisma.demoReport.findMany({
    include: {
      demo: {
        include: {
          player: {
            select: { steamId: true, steamUsername: true, steamAvatar: true },
          },
          submitter: {
            select: { steamId: true, steamUsername: true, steamAvatar: true },
          },
          match: {
            select: {
              id: true,
              seasonNo: true,
              weekNo: true,
              homeTeam: { select: { id: true, name: true } },
              awayTeam: { select: { id: true, name: true } },
            },
          },
        },
      },
      reporter: {
        select: { steamId: true, steamUsername: true, steamAvatar: true },
      },
      admin: {
        select: { steamId: true, steamUsername: true },
      },
    },
    orderBy: [
      { status: 'asc' }, // Pending first
      { reportedAt: 'desc' },
    ],
  });
}

/**
 * Update demo report status and admin comments
 */
export async function updateDemoReport(
  reportId: number,
  status: DemoStatus,
  adminComments: string,
  adminSteamId: string,
) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createDemosClient, resolveReport, getDemoReport } =
      await import('$lib/server/rama/demos');
    const client = createDemosClient(ramaClientOpts());
    const ack = await resolveReport(client, {
      reportId: String(reportId),
      status: status as 'REVIEW' | 'ACTION' | 'CLEAR',
      adminComments: adminComments || '',
      adminId: adminSteamId,
    });
    if (!ack.ok) {
      throw new Error(ack.error || 'Failed to update demo report');
    }
    const report = await getDemoReport(client, String(reportId));
    return {
      id: reportId,
      demoId: Number(report?.demoId ?? 0),
      reportedBy: report?.reportedBy ?? '',
      status,
      description: report?.description ?? '',
      adminComments: adminComments || null,
      adminId: adminSteamId,
      reportedAt: report?.reportedAt ? new Date(report.reportedAt) : new Date(),
    };
  }

  return await prisma.demoReport.update({
    where: { id: reportId },
    data: {
      status,
      adminComments,
      adminId: adminSteamId,
    },
  });
}
