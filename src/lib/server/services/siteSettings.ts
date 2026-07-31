/**
 * Site Settings Service
 * Manage site-wide settings like title, favicon, background image, etc.
 */

import { prisma } from '$lib/server/db';

export interface SiteSettingsData {
  id: number;
  siteTitle: string;
  faviconPath: string | null;
  backgroundImagePath: string | null;
  backgroundBlur: number;
  backgroundBrightness: number;
  backgroundOverlay: number;
  updatedAt: Date;
}

const RAMA_DEFAULTS: SiteSettingsData = {
  id: 1,
  siteTitle: 'MGE.tf',
  faviconPath: null,
  backgroundImagePath: null,
  backgroundBlur: 0,
  backgroundBrightness: 1,
  backgroundOverlay: 0.85,
  updatedAt: new Date(0),
};

/**
 * Get current site settings (creates default if none exist)
 */
export async function getSiteSettings(): Promise<SiteSettingsData> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) return { ...RAMA_DEFAULTS };

  let settings = await prisma.siteSettings.findFirst();

  if (!settings) {
    settings = await prisma.siteSettings.create({
      data: {
        siteTitle: 'MGE.tf',
      },
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
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Site settings mutations are not available under DATA_BACKEND=rama yet');
  }
  const current = await getSiteSettings();

  return await prisma.siteSettings.update({
    where: { id: current.id },
    data,
  });
}

/**
 * Update favicon path
 */
export async function updateFavicon(faviconPath: string) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Site settings mutations are not available under DATA_BACKEND=rama yet');
  }
  const current = await getSiteSettings();

  return await prisma.siteSettings.update({
    where: { id: current.id },
    data: { faviconPath },
  });
}

/**
 * Update background image and its visual settings
 */
export async function updateBackgroundImage(
  backgroundImagePath: string,
  backgroundBlur: number,
  backgroundBrightness: number,
  backgroundOverlay: number,
) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Site settings mutations are not available under DATA_BACKEND=rama yet');
  }
  const current = await getSiteSettings();

  return await prisma.siteSettings.update({
    where: { id: current.id },
    data: {
      backgroundImagePath,
      backgroundBlur,
      backgroundBrightness,
      backgroundOverlay,
    },
  });
}

/**
 * Update only the background visual settings (blur, brightness, overlay) without changing the image
 */
export async function updateBackgroundSettings(
  backgroundBlur: number,
  backgroundBrightness: number,
  backgroundOverlay: number,
) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Site settings mutations are not available under DATA_BACKEND=rama yet');
  }
  const current = await getSiteSettings();

  return await prisma.siteSettings.update({
    where: { id: current.id },
    data: {
      backgroundBlur,
      backgroundBrightness,
      backgroundOverlay,
    },
  });
}

/**
 * Remove background image and reset filter defaults
 */
export async function removeBackgroundImage() {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Site settings mutations are not available under DATA_BACKEND=rama yet');
  }
  const current = await getSiteSettings();

  return await prisma.siteSettings.update({
    where: { id: current.id },
    data: {
      backgroundImagePath: null,
      backgroundBlur: 0,
      backgroundBrightness: 1,
      backgroundOverlay: 0.85,
    },
  });
}
