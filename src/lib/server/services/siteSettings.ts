/**
 * Site Settings Service
 * Manage site-wide settings like title, favicon, background image, etc.
 */

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
  throw new Error('getSiteSettings requires DATA_BACKEND=rama');
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
  throw new Error('updateSiteSettings requires DATA_BACKEND=rama');
}

/**
 * Update favicon path
 */
export async function updateFavicon(faviconPath: string) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Site settings mutations are not available under DATA_BACKEND=rama yet');
  }
  throw new Error('updateFavicon requires DATA_BACKEND=rama');
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
  throw new Error('updateBackgroundImage requires DATA_BACKEND=rama');
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
  throw new Error('updateBackgroundSettings requires DATA_BACKEND=rama');
}

/**
 * Remove background image and reset filter defaults
 */
export async function removeBackgroundImage() {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Site settings mutations are not available under DATA_BACKEND=rama yet');
  }
  throw new Error('removeBackgroundImage requires DATA_BACKEND=rama');
}
