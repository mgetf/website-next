/**
 * Shared Event Types
 * Client-safe interfaces for the unified event system.
 * Can be safely imported by both client and server code.
 */

import type { BracketFormat } from './bracket';

export type EventType = 'CUP' | 'CHAMPIONSHIP' | 'FIGHT_NIGHT';

export type EventStatus = 'UPCOMING' | 'REGISTRATION' | 'IN_PROGRESS' | 'COMPLETED';

export interface EventUser {
  steamId: string;
  steamUsername: string;
  steamAvatar: string | null;
}

export interface EventPlacementEntry {
  placement: number;
  steamId: string;
  user: EventUser | null;
}

export interface EventStageDetail {
  id: number;
  name: string;
  bracketFormat: BracketFormat;
  orderNum: number;
  matchCount: number;
}

export interface EventParticipantEntry {
  steamId: string;
  seed: number | null;
  eliminated: boolean;
  user: EventUser | null;
}

export interface EventListItem {
  id: number;
  name: string;
  type: EventType;
  status: EventStatus;
  isTeamEvent: boolean;
  description: string | null;
  avatar: string | null;
  startedAt: string | null;
  endedAt: string | null;
  prizepool: number;
  card: string | null;
  bracketLink: string | null;
  placements: EventPlacementEntry[];
  matchCount: number;
  participantCount: number;
  stageCount: number;
}

export interface EventDetail extends Omit<EventListItem, 'matchCount' | 'stageCount'> {
  stages: EventStageDetail[];
  participants: EventParticipantEntry[];
}
