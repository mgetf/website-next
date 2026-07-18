import { fireEvent, render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import BracketRenderer from './BracketRenderer.svelte';
import MatchCard from './MatchCard.svelte';
import type { BracketMatch, RoundRobinBracketData } from '$lib/types/bracket';

describe('BracketRenderer', () => {
  it('renders round-robin standings and matches', () => {
    const data: RoundRobinBracketData = {
      format: 'round_robin',
      status: 'completed',
      title: 'Group A',
      standings: [
        {
          steamId: 'alpha',
          label: 'Alpha',
          played: 1,
          wins: 1,
          losses: 0,
          draws: 0,
          gamesWon: 2,
          gamesLost: 0,
          points: 3,
        },
      ],
      rounds: [
        {
          number: 1,
          label: 'Round 1',
          matches: [
            {
              id: 1,
              round: 1,
              position: 1,
              side1: { label: 'Alpha', score: 2, isWinner: true },
              side2: { label: 'Beta', score: 0 },
              status: 'completed',
              isBye: false,
            },
          ],
        },
      ],
    };

    render(BracketRenderer, { data });

    expect(screen.getByRole('heading', { name: 'Standings' })).toBeInTheDocument();
    expect(screen.getAllByText('Alpha')).toHaveLength(2);
    expect(screen.getByText('Round 1')).toBeInTheDocument();
  });
});

describe('MatchCard', () => {
  it('opens game details with the keyboard-accessible details button', async () => {
    const match: BracketMatch = {
      id: 'match-1',
      round: 1,
      position: 1,
      side1: { label: 'Alpha', score: 2, isWinner: true },
      side2: { label: 'Beta', score: 1 },
      status: 'completed',
      isBye: false,
      games: [{ gameNumber: 1, side1Score: 20, side2Score: 15, arena: 'Granary' }],
    };

    render(MatchCard, { match });
    const button = screen.getByRole('button', {
      name: 'Show game details for Alpha vs Beta',
    });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tooltip')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('Granary')).toBeInTheDocument();
  });
});
