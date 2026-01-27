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
  return await prisma.announcement.update({
    where: { id },
    data: { content },
  });
}

/**
 * Toggle announcement visibility
 */
export async function toggleAnnouncementVisibility(
  id: number,
  visible: boolean,
) {
  return await prisma.announcement.update({
    where: { id },
    data: { visible: visible ? 1 : 0 },
  });
}

/**
 * Delete an announcement
 */
export async function deleteAnnouncement(id: number) {
  return await prisma.announcement.delete({
    where: { id },
  });
}
