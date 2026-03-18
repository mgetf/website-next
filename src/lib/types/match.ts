export interface ProfileMatch {
  matchId: number;
  week: string;
  opponentName: string;
  opponentId: number;
  result: 'W' | 'L' | 'TBD';
  score: string;
}
