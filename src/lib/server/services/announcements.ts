/**
 * Announcements Service — Rama GlobalsModule (no Prisma).
 */

import { badRequest, notFound } from '$lib/server/utils/errors';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import {
  createAnnouncement as ramaCreateAnnouncement,
  createGlobalsClient,
  deleteAnnouncement as ramaDeleteAnnouncement,
  getAnnouncement,
  getAnnouncementIds,
  getVisibleAnnouncementIds,
  setAnnouncementVisible,
  updateAnnouncement as ramaUpdateAnnouncement,
} from '$lib/server/rama/globals';

function requireRama() {
  if (!isRamaBackend()) {
    throw new Error('Announcements require DATA_BACKEND=rama');
  }
}

function nextAnnouncementId(): string {
  return String(Date.now() % 2_000_000_000);
}

async function loadAnnouncementRows(ids: string[]) {
  const client = createGlobalsClient(ramaClientOpts());
  const rows = await Promise.all(
    ids.map(async (id) => {
      const row = await getAnnouncement(client, id);
      if (!row) return null;
      return {
        id: Number(id),
        content: row.content,
        visible: row.visible ? 1 : 0,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      };
    }),
  );
  return rows.filter((r): r is NonNullable<typeof r> => r != null).sort((a, b) => b.id - a.id);
}

export async function getAnnouncements() {
  requireRama();
  const client = createGlobalsClient(ramaClientOpts());
  const ids = await getAnnouncementIds(client);
  return loadAnnouncementRows(ids);
}

export async function getVisibleAnnouncements() {
  requireRama();
  const client = createGlobalsClient(ramaClientOpts());
  const ids = await getVisibleAnnouncementIds(client);
  return loadAnnouncementRows(ids);
}

export async function createAnnouncement(content: string) {
  requireRama();
  const trimmed = content.trim();
  if (!trimmed) badRequest('Content is required');
  const id = nextAnnouncementId();
  const client = createGlobalsClient(ramaClientOpts());
  const ack = await ramaCreateAnnouncement(client, {
    announcementId: id,
    content: trimmed,
  });
  if (!ack.ok) throw new Error(ack.error ?? 'Failed to create announcement');
  const row = await getAnnouncement(client, id);
  return {
    id: Number(id),
    content: row?.content ?? trimmed,
    visible: 0,
    createdAt: row?.createdAt ? new Date(row.createdAt) : new Date(),
  };
}

export async function updateAnnouncement(id: number, content: string) {
  requireRama();
  const trimmed = content.trim();
  if (!trimmed) badRequest('Content is required');
  const client = createGlobalsClient(ramaClientOpts());
  const ack = await ramaUpdateAnnouncement(client, {
    announcementId: String(id),
    content: trimmed,
  });
  if (!ack.ok) {
    if (ack.error === 'announcement-not-found') notFound('Announcement not found');
    throw new Error(ack.error ?? 'Failed to update announcement');
  }
  const row = await getAnnouncement(client, String(id));
  return {
    id,
    content: row?.content ?? trimmed,
    visible: row?.visible ? 1 : 0,
    createdAt: row?.createdAt ? new Date(row.createdAt) : new Date(),
  };
}

export async function toggleAnnouncementVisibility(id: number, visible: boolean) {
  requireRama();
  const client = createGlobalsClient(ramaClientOpts());
  const ack = await setAnnouncementVisible(client, {
    announcementId: String(id),
    visible,
  });
  if (!ack.ok) {
    if (ack.error === 'announcement-not-found') notFound('Announcement not found');
    throw new Error(ack.error ?? 'Failed to toggle announcement');
  }
  const row = await getAnnouncement(client, String(id));
  return {
    id,
    content: row?.content ?? '',
    visible: visible ? 1 : 0,
    createdAt: row?.createdAt ? new Date(row.createdAt) : new Date(),
  };
}

export async function deleteAnnouncement(id: number) {
  requireRama();
  const client = createGlobalsClient(ramaClientOpts());
  const ack = await ramaDeleteAnnouncement(client, String(id));
  if (!ack.ok) {
    if (ack.error === 'announcement-not-found') notFound('Announcement not found');
    throw new Error(ack.error ?? 'Failed to delete announcement');
  }
  return { id };
}
