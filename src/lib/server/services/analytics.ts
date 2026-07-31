/**
 * Analytics Service Layer
 * Provides league statistics for admin dashboard
 */

import { getCurrentSignupSeasonIds } from './signupSeasons';

interface PlayerPerDivision {
  divisionName: string;
  playerCount: number;
}

interface TeamPerRegion {
  regionName: string;
  teamCount: number;
}

interface PaymentStatus {
  paid: number;
  unpaid: number;
  freeTier: number;
  totalInPaidDivisions: number;
  paymentRate: number;
}

interface KeyMetrics {
  pendingPlayers: number;
  disputedMatches: number;
  openDemoReports: number;
}

interface AnalyticsData {
  playersPerDivision: PlayerPerDivision[];
  teamsPerRegion: TeamPerRegion[];
  paymentStatus: PaymentStatus;
  keyMetrics: KeyMetrics;
  totalPlayers: number;
  totalTeams: number;
  activeSeasonCount: number;
}

export async function getAdminAnalytics(): Promise<AnalyticsData> {
  const empty: AnalyticsData = {
    playersPerDivision: [],
    teamsPerRegion: [],
    paymentStatus: {
      paid: 0,
      unpaid: 0,
      freeTier: 0,
      totalInPaidDivisions: 0,
      paymentRate: 0,
    },
    keyMetrics: {
      pendingPlayers: 0,
      disputedMatches: 0,
      openDemoReports: 0,
    },
    totalPlayers: 0,
    totalTeams: 0,
    activeSeasonCount: 0,
  };

  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    // Soft zeros until a query topology aggregates Teams/Match/Payments/Demos.
    return empty;
  }
  throw new Error('getAdminAnalytics requires DATA_BACKEND=rama');
}
