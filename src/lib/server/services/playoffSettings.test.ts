import { describe, expect, it } from 'vitest';
import { MatchStatus } from '#prisma/client.js';
import { boResizeBlocker, splitPoolTargets, type SettingsMatch } from './playoffSettings';

function match(partial: Partial<SettingsMatch>): SettingsMatch {
  return {
    id: 1,
    status: MatchStatus.UNPLAYED,
    banActionCount: 0,
    banPhaseComplete: false,
    ...partial,
  };
}

describe('boResizeBlocker', () => {
  it('allows resizing when nothing is reported or banned yet', () => {
    expect(boResizeBlocker([match({})])).toBeNull();
  });

  it('blocks a resize once any match has a reported score', () => {
    expect(boResizeBlocker([match({ status: MatchStatus.PLAYED })])).toContain(
      'already have reported scores',
    );
  });

  it('blocks a resize once ban/pick has started', () => {
    expect(boResizeBlocker([match({ banActionCount: 1 })])).toContain(
      'ban/pick has already started',
    );
  });
});

describe('splitPoolTargets', () => {
  it('flips only unplayed matches whose ban phase is unfinished', () => {
    expect(
      splitPoolTargets([
        match({ id: 1 }),
        match({ id: 2, status: MatchStatus.PLAYED }),
        match({ id: 3, banPhaseComplete: true }),
      ]),
    ).toEqual({ flip: [1], kept: [2, 3] });
  });
});
