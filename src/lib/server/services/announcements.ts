/**
 * Announcements Service
 *
 * All announcement-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all announcements (admin view)
 * Returns all announcements including hidden ones
 */
export async function getAnnouncements() {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    // No AnnouncementsModule yet — admin UI sees empty list under Rama.
    return [];
  }
  return await prisma.announcement.findMany({
    orderBy: {
      id: 'desc',
    },
  });
}

/**
 * Get visible announcements only (public view)
 * Returns only announcements with visible = 1
 */
export async function getVisibleAnnouncements() {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) return [];
  return await prisma.announcement.findMany({
    where: {
      visible: 1,
    },
    orderBy: {
      id: 'desc',
    },
  });
}

/**
 * Create a new announcement
 */
export async function createAnnouncement(content: string) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Announcements are not available under DATA_BACKEND=rama yet');
  }
  return await prisma.announcement.create({
    data: {
      content,
      visible: 0,
    },
  });
}

/**
 * Update announcement content
 */
export async function updateAnnouncement(id: number, content: string) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Announcements are not available under DATA_BACKEND=rama yet');
  }
  return await prisma.announcement.update({
    where: { id },
    data: { content },
  });
}

/**
 * Toggle announcement visibility
 */
export async function toggleAnnouncementVisibility(id: number, visible: boolean) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Announcements are not available under DATA_BACKEND=rama yet');
  }
  return await prisma.announcement.update({
    where: { id },
    data: { visible: visible ? 1 : 0 },
  });
}

/**
 * Delete an announcement
 */
export async function deleteAnnouncement(id: number) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Announcements are not available under DATA_BACKEND=rama yet');
  }
  return await prisma.announcement.delete({
    where: { id },
  });
}
