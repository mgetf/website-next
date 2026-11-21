import { describe, expect, it } from 'vitest';
import {
  bracketCompleteItems,
  eliminatedTeamId,
  matchCreatedItems,
  scoreConfirmedItems,
  scoreDisputedItems,
  scoreSubmittedItems,
  teamEliminatedItems,
} from './playoffEvents';
import { outboxRetryDelaySeconds } from './outboxEvents';

const match = {
  id: 42,
  division: 'Platinum',
  round: 'Semifinals',
  home: { id: 1, name: 'Alpha' },
  away: { id: 2, name: 'Bravo' },
  url: 'https://mge.tf/matches/42',
};
const alice = { steamId: '1', discordId: 'd-alice', teamId: 1 };
const bob = { steamId: '2', discordId: 'd-bob', teamId: 2 };

describe('matchCreatedItems', () => {
  it('sends one DM per person and one channel post, keyed so retries cannot duplicate', () => {
    const items = matchCreatedItems({ ...match, bestOf: 3, arenaGames: 3 }, [alice, bob]);
    expect(items.map((item) => item.dedupeKey)).toEqual([
      'playoff.match_created:42:dm:d-alice',
      'playoff.match_created:42:dm:d-bob',
      'playoff.match_created:42:channel:playoffs',
    ]);
    expect(items[0].payload).toMatchObject({
      target: { type: 'dm', discordId: 'd-alice', steamId: '1' },
      fallbackChannel: 'playoffs',
      recipientSide: 'home',
    });
    expect(items[1].payload).toMatchObject({ recipientSide: 'away' });
    expect(items[2].payload).toMatchObject({
      target: { type: 'channel', channel: 'playoffs' },
      recipientSide: null,
    });
  });

  it('messages a person once even when listed twice', () => {
    const items = matchCreatedItems({ ...match, bestOf: 3, arenaGames: 3 }, [alice, alice]);
    expect(items.filter((item) => item.dedupeKey.includes(':dm:'))).toHaveLength(1);
  });

  it('still posts to the channel when nobody has linked Discord', () => {
    const items = matchCreatedItems({ ...match, bestOf: 3, arenaGames: 3 }, []);
    expect(items).toHaveLength(1);
    expect(items[0].payload).toMatchObject({ target: { type: 'channel' } });
  });
});

describe('region channels', () => {
  const channels = { playoffs: '1111', staff: '2222' };

  it('posts to the region channel and uses it for closed-DM mentions', () => {
    const items = matchCreatedItems({ ...match, channels, bestOf: 3, arenaGames: 3 }, [alice]);
    expect(items[0].payload).toMatchObject({
      fallbackChannel: 'playoffs',
      fallbackChannelId: '1111',
    });
    expect(items[1].payload).toMatchObject({
      target: { type: 'channel', channel: 'playoffs', channelId: '1111' },
    });
  });

  it('sends disputes to the region staff channel', () => {
    const items = scoreDisputedItems(
      { ...match, channels },
      { submissionId: 9, disputedByTeam: 'Bravo', reason: null },
      [],
    );
    expect(items[0].payload).toMatchObject({
      target: { type: 'channel', channel: 'staff', channelId: '2222' },
    });
  });

  it('leaves the channel empty when the region has none, so the bot default applies', () => {
    const [, channel] = matchCreatedItems({ ...match, bestOf: 3, arenaGames: 3 }, [alice]);
    expect(channel.payload).toMatchObject({ target: { channelId: null } });
  });
});

describe('score events', () => {
  it('asks the other team to confirm and carries the deadline', () => {
    const autoConfirmAt = new Date('2026-11-21T12:00:00.000Z');
    const [item] = scoreSubmittedItems(
      match,
      { id: 7, submittedByTeam: 'Alpha', winnerName: 'Alpha', score: '2-1', autoConfirmAt },
      [bob],
    );
    expect(item.dedupeKey).toBe('playoff.score_submitted:7:dm:d-bob');
    expect(item.payload).toMatchObject({
      score: '2-1',
      autoConfirmAt: '2026-11-21T12:00:00.000Z',
    });
  });

  it('keys a confirmed result by its outcome, so a corrected result notifies again', () => {
    const result = { winnerName: 'Alpha', loserName: 'Bravo', score: '2-1', auto: false };
    const first = scoreConfirmedItems(match, result, 1, [alice]);
    const corrected = scoreConfirmedItems(match, { ...result, winnerName: 'Bravo' }, 2, [alice]);
    expect(first[0].dedupeKey).not.toBe(corrected[0].dedupeKey);
    expect(first.at(-1)?.payload).toMatchObject({ target: { channel: 'playoffs' } });
  });

  it('sends disputes to the reporting team and to staff', () => {
    const items = scoreDisputedItems(
      match,
      { submissionId: 9, disputedByTeam: 'Bravo', reason: 'wrong map' },
      [alice],
    );
    expect(items.map((item) => item.dedupeKey)).toEqual([
      'playoff.score_disputed:9:dm:d-alice',
      'playoff.score_disputed:9:channel:staff',
    ]);
  });
});

describe('bracket events', () => {
  it('tells an eliminated roster once per match', () => {
    const items = teamEliminatedItems(
      {
        matchId: 42,
        teamId: 2,
        teamName: 'Bravo',
        eliminatedBy: 'Alpha',
        division: 'Platinum',
        url: match.url,
      },
      [bob],
    );
    expect(items).toHaveLength(1);
    expect(items[0].dedupeKey).toBe('playoff.team_eliminated:2:42:dm:d-bob');
  });

  it('announces the podium once per division', () => {
    const items = bracketCompleteItems(
      {
        seasonId: 5,
        divisionId: 3,
        division: 'Platinum',
        url: match.url,
        podium: [
          { place: 1, name: 'Alpha' },
          { place: 2, name: 'Bravo' },
        ],
      },
      [alice],
    );
    expect(items.map((item) => item.dedupeKey)).toEqual([
      'playoff.bracket_complete:5:3:dm:d-alice',
      'playoff.bracket_complete:5:3:channel:playoffs',
    ]);
  });
});

describe('eliminatedTeamId', () => {
  it('eliminates the loser when nothing catches them', () => {
    expect(eliminatedTeamId({ loserId: 2, hasLoserArrow: false, resetCreated: false })).toBe(2);
  });

  it('keeps the loser alive when they drop to the losers bracket', () => {
    expect(eliminatedTeamId({ loserId: 2, hasLoserArrow: true, resetCreated: false })).toBeNull();
  });

  it('keeps the loser alive when a grand final reset follows', () => {
    expect(eliminatedTeamId({ loserId: 1, hasLoserArrow: false, resetCreated: true })).toBeNull();
  });
});

describe('outboxRetryDelaySeconds', () => {
  it('backs off and caps at half an hour', () => {
    expect(outboxRetryDelaySeconds(1)).toBe(10);
    expect(outboxRetryDelaySeconds(2)).toBe(20);
    expect(outboxRetryDelaySeconds(3)).toBe(40);
    expect(outboxRetryDelaySeconds(20)).toBe(1800);
  });
});
