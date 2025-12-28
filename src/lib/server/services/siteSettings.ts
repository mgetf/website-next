/**
 * Site Settings Service
 * Manage site-wide settings like title, favicon, etc.
 */

import { prisma } from '$lib/server/db';

export interface SiteSettingsData {
	id: number;
	siteTitle: string;
	faviconPath: string | null;
	updatedAt: Date;
}

/**
 * Get current site settings (creates default if none exist)
 */
export async function getSiteSettings(): Promise<SiteSettingsData> {
	let settings = await prisma.siteSettings.findFirst();

	if (!settings) {
		// Create default settings
		settings = await prisma.siteSettings.create({
			data: {
				siteTitle: 'MGE.tf'
			}
		});
	}

	return settings;
}

/**
 * Update site settings
 */
export async function updateSiteSettings(data: {
	siteTitle?: string;
	faviconPath?: string | null;
}) {
	const current = await getSiteSettings();

	return await prisma.siteSettings.update({
		where: { id: current.id },
		data
	});
}

/**
 * Update favicon path
 */
export async function updateFavicon(faviconPath: string) {
	const current = await getSiteSettings();

	return await prisma.siteSettings.update({
		where: { id: current.id },
		data: { faviconPath }
	});
}

