import type { DraftParticipant } from '$lib/types/tournament-editor';
import { steamId64FromAnyFormat } from '$lib/utils/steamid';

export interface ParticipantSearchUser {
  steamId: string;
  name: string;
  avatar: string | null;
}

export function normalizeParticipantName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export function participantDuplicateMessage(
  participants: DraftParticipant[],
  candidate: { displayName: string; steamId: string | null },
  ignoredParticipantId?: string,
): string | null {
  const normalizedName = normalizeParticipantName(candidate.displayName);
  const duplicate = participants.find(
    (participant) =>
      participant.id !== ignoredParticipantId &&
      ((candidate.steamId !== null && participant.steamId === candidate.steamId) ||
        normalizeParticipantName(participant.displayName) === normalizedName),
  );

  if (!duplicate) return null;
  if (candidate.steamId && duplicate.steamId === candidate.steamId) {
    return 'That Steam user is already a participant.';
  }
  return `A participant named "${duplicate.displayName}" already exists.`;
}

export function searchParticipantUsers(
  users: ParticipantSearchUser[],
  query: string,
  participants: DraftParticipant[],
  limit = 25,
): ParticipantSearchUser[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const normalizedQuery = normalizeParticipantName(trimmed);
  const normalizedSteamId = steamId64FromAnyFormat(trimmed);
  const existingSteamIds = new Set(
    participants.flatMap((participant) => (participant.steamId ? [participant.steamId] : [])),
  );

  return users
    .filter((user) => {
      if (existingSteamIds.has(user.steamId)) return false;
      return (
        user.name.toLocaleLowerCase().includes(normalizedQuery) ||
        user.steamId.includes(trimmed) ||
        user.steamId === normalizedSteamId
      );
    })
    .sort((first, second) => {
      const firstExact =
        normalizeParticipantName(first.name) === normalizedQuery ||
        first.steamId === normalizedSteamId;
      const secondExact =
        normalizeParticipantName(second.name) === normalizedQuery ||
        second.steamId === normalizedSteamId;
      if (firstExact !== secondExact) return firstExact ? -1 : 1;
      return first.name.localeCompare(second.name);
    })
    .slice(0, limit);
}
