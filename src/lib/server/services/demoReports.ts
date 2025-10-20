/**
 * Demo Reports Service
 * 
 * All demo report-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import type { DemoStatus } from '@prisma/client';

/**
 * Get all demo reports with related data (demo, reporter, player, match)
 */
export async function getAllDemoReports() {
	return await prisma.demoReport.findMany({
		include: {
			demo: {
				include: {
					player: {
						select: { steamId: true, steamUsername: true, steamAvatar: true }
					},
					submitter: {
						select: { steamId: true, steamUsername: true, steamAvatar: true }
					},
					match: {
						select: {
							id: true,
							seasonNo: true,
							weekNo: true,
							homeTeam: { select: { id: true, name: true } },
							awayTeam: { select: { id: true, name: true } }
						}
					},
					tournament: {
						select: { id: true, name: true }
					}
				}
			},
			reporter: {
				select: { steamId: true, steamUsername: true, steamAvatar: true }
			},
			admin: {
				select: { steamId: true, steamUsername: true }
			}
		},
		orderBy: [
			{ status: 'asc' }, // Pending first
			{ reportedAt: 'desc' }
		]
	});
}

/**
 * Update demo report status and admin comments
 */
export async function updateDemoReport(
	reportId: number,
	status: DemoStatus,
	adminComments: string,
	adminSteamId: string
) {
	return await prisma.demoReport.update({
		where: { id: reportId },
		data: {
			status,
			adminComments,
			adminId: adminSteamId
		}
	});
}

