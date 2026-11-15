import type { TeamMatchArena } from './team';

export interface ProfileMatch {
  matchId: number;
  week: string;
  opponentName: string;
  opponentId: number;
  opponentAvatar?: string | null;
  result: 'W' | 'L' | 'D' | 'V' | 'TBD';
  score: string;
  arenas: TeamMatchArena[];
}
