import { describe, expect, it } from 'vitest';
import { countPairMeetings, describeSingleMatchWarnings, meetingsBetween } from './singleMatch';

describe('countPairMeetings', () => {
  it('counts both home/away directions as the same pairing', () => {
    expect(
      countPairMeetings([
        { homeTeamId: 2, awayTeamId: 1 },
        { homeTeamId: 1, awayTeamId: 2 },
        { homeTeamId: 3, awayTeamId: 1 },
      ]),
    ).toEqual([
      { teamAId: 1, teamBId: 2, count: 2 },
      { teamAId: 1, teamBId: 3, count: 1 },
    ]);
  });
});

describe('meetingsBetween', () => {
  const meetings = [{ teamAId: 1, teamBId: 4, count: 3 }];

  it('finds a pairing regardless of side', () => {
    expect(meetingsBetween(meetings, 4, 1)).toBe(3);
  });

  it('returns zero when the teams have not met', () => {
    expect(meetingsBetween(meetings, 1, 2)).toBe(0);
  });
});

describe('describeSingleMatchWarnings', () => {
  const home = {
    id: 1,
    name: 'Alpha',
    scheduledThisRound: true,
    onBye: true,
  };
  const away = {
    id: 2,
    name: 'Bravo',
    scheduledThisRound: false,
    onBye: false,
  };

  it('warns about an existing match, a bye, and a prior meeting', () => {
    expect(
      describeSingleMatchWarnings(home, away, [{ teamAId: 1, teamBId: 2, count: 1 }], false),
    ).toEqual([
      'Alpha already has a match in this week.',
      'Alpha is on a bye this week. Publishing will clear that bye.',
      'Alpha and Bravo already have 1 match this season.',
    ]);
  });

  it('skips bye warnings for playoff matches', () => {
    expect(describeSingleMatchWarnings(home, away, [], true)).toEqual([
      'Alpha already has a match in this round.',
    ]);
  });
});
