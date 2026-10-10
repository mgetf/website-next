import type { SingleMatchMeeting } from '#lib/types/matchSetDraft.js';

export function countPairMeetings(
  matches: { homeTeamId: number; awayTeamId: number }[],
): SingleMatchMeeting[] {
  const counts = new Map<string, SingleMatchMeeting>();

  for (const match of matches) {
    const teamAId = Math.min(match.homeTeamId, match.awayTeamId);
    const teamBId = Math.max(match.homeTeamId, match.awayTeamId);
    const key = `${teamAId}:${teamBId}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { teamAId, teamBId, count: 1 });
    }
  }

  return [...counts.values()];
}

export function meetingsBetween(
  meetings: SingleMatchMeeting[],
  homeTeamId: number,
  awayTeamId: number,
): number {
  const teamAId = Math.min(homeTeamId, awayTeamId);
  const teamBId = Math.max(homeTeamId, awayTeamId);
  return (
    meetings.find((meeting) => meeting.teamAId === teamAId && meeting.teamBId === teamBId)?.count ??
    0
  );
}

export function describeSingleMatchWarnings(
  home: { id: number; name: string; scheduledThisRound: boolean; onBye: boolean } | null,
  away: { id: number; name: string; scheduledThisRound: boolean; onBye: boolean } | null,
  meetings: SingleMatchMeeting[],
  isPlayoff: boolean,
): string[] {
  const notes: string[] = [];
  const roundLabel = isPlayoff ? 'round' : 'week';

  for (const team of [home, away]) {
    if (!team) continue;
    if (team.scheduledThisRound) {
      notes.push(`${team.name} already has a match in this ${roundLabel}.`);
    }
    if (team.onBye && !isPlayoff) {
      notes.push(`${team.name} is on a bye this week. Publishing will clear that bye.`);
    }
  }

  if (home && away && home.id !== away.id) {
    const count = meetingsBetween(meetings, home.id, away.id);
    if (count > 0) {
      notes.push(
        `${home.name} and ${away.name} already have ${count} match${count === 1 ? '' : 'es'} this season.`,
      );
    }
  }

  return notes;
}
