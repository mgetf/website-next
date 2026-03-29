<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import DoughnutChart from '$lib/components/charts/DoughnutChart.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { data }: { data: PageData } = $props();

  const matchColumns = [
    { key: 'match', label: 'Match' },
    { key: 'division', label: 'Division' },
    { key: 'season', label: 'Season' },
    { key: 'action', label: 'Action', align: 'right' as const },
  ];

  const divisionColumns = [
    { key: 'division', label: 'Division' },
    { key: 'players', label: 'Players', align: 'right' as const },
  ];

  const regionColumns = [
    { key: 'region', label: 'Region' },
    { key: 'teams', label: 'Teams', align: 'right' as const },
  ];

  const analytics = $derived(data.analytics);
  const pendingPlayers = $derived(data.pendingPlayers);
  const recentMatches = $derived(data.recentMatches);
  const matchDeadline = $derived(data.matchDeadline ? new Date(data.matchDeadline) : null);
  const currentMatchWeek = $derived(data.currentMatchWeek);

  let isSubmitting = $state(false);
  let decliningPlayerId = $state<string | null>(null);
  let declineReasons = $state<Record<string, string>>({});

  const deadlineInfo = $derived(() => {
    if (!matchDeadline) return null;

    const now = new Date();
    const diff = matchDeadline.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let status: 'green' | 'yellow' | 'red';
    let timeText: string;

    if (diff < 0) {
      status = 'red';
      const overdueDays = Math.abs(days);
      const overdueHours = Math.abs(hours);
      timeText =
        overdueDays > 0
          ? `${overdueDays} day${overdueDays !== 1 ? 's' : ''} overdue`
          : `${overdueHours} hour${overdueHours !== 1 ? 's' : ''} overdue`;
    } else if (days < 1) {
      status = 'red';
      timeText = hours > 0 ? `${hours} hour${hours !== 1 ? 's' : ''} remaining` : 'Due now';
    } else if (days <= 3) {
      status = 'yellow';
      timeText = `${days} day${days !== 1 ? 's' : ''} remaining`;
    } else {
      status = 'green';
      timeText = `${days} day${days !== 1 ? 's' : ''} remaining`;
    }

    const formattedDate = matchDeadline.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    return { status, timeText, formattedDate };
  });
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-white mb-2">Dashboard</h1>
    <p class="text-text-body">Manage your division's day-to-day operations</p>
  </div>

  <!-- Match Creation Deadline Card -->
  {#if currentMatchWeek || matchDeadline}
    {@const info = deadlineInfo()}
    <div
      class="bg-surface-card border rounded-lg shadow-lg overflow-hidden {info?.status === 'red'
        ? 'border-danger-500/50'
        : info?.status === 'yellow'
          ? 'border-warning-500/50'
          : 'border-border-default'}"
    >
      <div class="p-5 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-lg flex items-center justify-center {info?.status === 'red'
              ? 'bg-danger-500/20 text-danger-400'
              : info?.status === 'yellow'
                ? 'bg-warning-500/20 text-warning-400'
                : 'bg-success-500/20 text-success-400'}"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">
              {#if currentMatchWeek}
                Create Week {currentMatchWeek} Matches
              {:else}
                Create Matches
              {/if}
            </h2>
            {#if info}
              <p
                class="text-sm {info.status === 'red'
                  ? 'text-danger-400'
                  : info.status === 'yellow'
                    ? 'text-warning-400'
                    : 'text-text-body'}"
              >
                <span class="font-medium">{info.timeText}</span>
                <span class="text-text-muted ml-1">• {info.formattedDate}</span>
              </p>
            {:else}
              <p class="text-sm text-text-body">No deadline set</p>
            {/if}
          </div>
        </div>
        <Button
          variant="primary"
          href="/admin/matches/create"
          size="lg"
          class="flex items-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Matches
        </Button>
      </div>
    </div>
  {:else}
    <Card padding="none" class="overflow-hidden shadow-lg">
      <div class="p-5 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-lg bg-info-500/20 flex items-center justify-center text-info-400"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h2 class="text-xl font-bold text-white">Create Matches</h2>
            <p class="text-sm text-text-muted">
              No deadline configured • Set one in Global Settings
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          href="/admin/matches/create"
          size="lg"
          class="flex items-center gap-2"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4v16m8-8H4"
            />
          </svg>
          Create Matches
        </Button>
      </div>
    </Card>
  {/if}

  <!-- Pending Players - Inline Quick Actions -->
  <Card padding="none" class="overflow-hidden shadow-lg">
    <div class="p-5 border-b border-border-default flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg bg-warning-500/20 flex items-center justify-center text-warning-400"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
            />
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Pending Players</h2>
          <p class="text-sm text-text-body">
            {pendingPlayers.length} player{pendingPlayers.length !== 1 ? 's' : ''} waiting for approval
          </p>
        </div>
      </div>
      {#if pendingPlayers.length > 5}
        <a
          href="/admin/pending-players"
          class="text-sm text-info-400 hover:text-primary-300 font-medium transition"
        >
          View all →
        </a>
      {/if}
    </div>

    <div class="divide-y divide-border-default">
      {#if pendingPlayers.length === 0}
        <div class="py-12 text-center">
          <span class="text-5xl mb-4 block">✅</span>
          <p class="text-text-body font-medium">All caught up!</p>
          <p class="text-text-muted text-sm mt-1">No pending player requests</p>
        </div>
      {:else}
        {#each pendingPlayers.slice(0, 5) as request}
          <div class="p-4 hover:bg-surface-input/50 transition-colors">
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <a href="/users/{request.player.steamId}" class="flex-shrink-0">
                  <img
                    src={request.player.steamAvatar || '/default-avatar.png'}
                    alt={request.player.steamUsername}
                    class="w-10 h-10 rounded-lg hover:opacity-80 transition-opacity"
                  />
                </a>

                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <a
                      href="/users/{request.player.steamId}"
                      class="text-white font-semibold hover:text-primary-400 transition-colors truncate"
                    >
                      {request.player.steamUsername}
                    </a>
                    <span class="text-text-muted">→</span>
                    <a
                      href="/teams/{request.team.id}"
                      class="text-primary-400 hover:text-primary-300 font-medium transition-colors truncate"
                    >
                      {request.team.name}
                    </a>
                  </div>
                  <div class="text-xs text-text-muted mt-0.5">
                    {request.team.division?.name || 'No Division'}
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2 flex-shrink-0">
                {#if decliningPlayerId === request.player.steamId}
                  <form
                    method="POST"
                    action="?/decline"
                    use:enhance={() => {
                      isSubmitting = true;
                      return async ({ update }) => {
                        await update();
                        isSubmitting = false;
                        decliningPlayerId = null;
                        declineReasons[request.player.steamId] = '';
                      };
                    }}
                    class="flex items-center gap-2"
                  >
                    <input type="hidden" name="playerSteamId" value={request.player.steamId} />
                    <input type="hidden" name="teamId" value={request.team.id} />
                    <input
                      type="text"
                      name="reason"
                      bind:value={declineReasons[request.player.steamId]}
                      placeholder="Reason..."
                      required
                      class="px-3 py-1.5 bg-surface-input border border-border-input rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-32"
                    />
                    <Button type="submit" variant="danger" size="sm" disabled={isSubmitting}>
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onclick={() => (decliningPlayerId = null)}
                    >
                      Cancel
                    </Button>
                  </form>
                {:else}
                  <form
                    method="POST"
                    action="?/approve"
                    use:enhance={() => {
                      isSubmitting = true;
                      return async ({ update }) => {
                        await update();
                        isSubmitting = false;
                      };
                    }}
                  >
                    <input type="hidden" name="playerSteamId" value={request.player.steamId} />
                    <input type="hidden" name="teamId" value={request.team.id} />
                    <Button type="submit" variant="success" size="sm" disabled={isSubmitting}>
                      ✓ Approve
                    </Button>
                  </form>

                  <Button
                    variant="danger"
                    size="sm"
                    onclick={() => (decliningPlayerId = request.player.steamId)}
                  >
                    ✗ Decline
                  </Button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </Card>

  <!-- Recent Unplayed Matches -->
  <Card padding="none" class="overflow-hidden shadow-lg">
    <div class="p-5 border-b border-border-default flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg bg-info-500/20 flex items-center justify-center text-info-400"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Upcoming Matches</h2>
          <p class="text-sm text-text-body">Recent unplayed matches requiring attention</p>
        </div>
      </div>
      <a
        href="/admin/matches"
        class="text-sm text-info-400 hover:text-primary-300 font-medium transition"
      >
        Manage matches →
      </a>
    </div>

    {#if recentMatches.length === 0}
      <div class="py-12 text-center">
        <span class="text-5xl mb-4 block">📋</span>
        <p class="text-text-body font-medium">No unplayed matches</p>
        <p class="text-text-muted text-sm mt-1">
          <a href="/admin/matches/create" class="text-info-400 hover:text-primary-300"
            >Create new matches</a
          > to get started
        </p>
      </div>
    {:else}
      <DataTable data={recentMatches} columns={matchColumns} emptyMessage="No unplayed matches">
        {#snippet cell(match, col)}
          {#if col.key === 'match'}
            <div class="flex items-center gap-2">
              <span class="text-white font-medium">{match.homeTeam.name}</span>
              <span class="text-text-muted text-sm">vs</span>
              <span class="text-white font-medium">{match.awayTeam.name}</span>
            </div>
          {:else if col.key === 'division'}
            <span class="text-sm text-text-label">{match.homeTeam.division?.name || '-'}</span>
          {:else if col.key === 'season'}
            <span class="text-sm text-text-body">
              {match.season.region.name} S{match.season.seasonNum}
            </span>
          {:else if col.key === 'action'}
            <a
              href="/matches/{match.id}"
              class="text-info-400 hover:text-primary-300 text-sm font-medium"
            >
              View
            </a>
          {/if}
        {/snippet}
      </DataTable>
    {/if}
  </Card>

  <!-- Quick Alerts -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Disputed Matches -->
    <a
      href="/admin/disputes"
      class="bg-surface-card border border-border-default rounded-lg p-5 hover:bg-surface-input/70 transition group"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400 group-hover:bg-primary-500/30 transition"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <div class="text-2xl font-bold text-primary-400">
              {analytics.keyMetrics.disputedMatches}
            </div>
            <div class="text-sm text-text-body">Disputed Matches</div>
          </div>
        </div>
        <svg
          class="w-5 h-5 text-text-muted group-hover:text-primary-400 transition"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </a>

    <!-- Open Demo Reports -->
    <a
      href="/admin/demos"
      class="bg-surface-card border border-border-default rounded-lg p-5 hover:bg-surface-input/70 transition group"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-lg bg-danger-500/20 flex items-center justify-center text-danger-400 group-hover:bg-danger-500/30 transition"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <div class="text-2xl font-bold text-danger-400">
              {analytics.keyMetrics.openDemoReports}
            </div>
            <div class="text-sm text-text-body">Open Demo Reports</div>
          </div>
        </div>
        <svg
          class="w-5 h-5 text-text-muted group-hover:text-danger-400 transition"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  </div>

  <!-- Analytics Section -->
  <div class="pt-6 border-t border-border-default">
    <div class="mb-6">
      <h2 class="text-xl font-bold text-white">League Overview</h2>
      <p class="text-sm text-text-muted">Statistics from active seasons</p>
    </div>

    <!-- Key Metrics Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-surface-input/50 border border-border-input rounded-lg p-4">
        <div class="text-3xl font-bold text-info-400 mb-1">
          {analytics.totalPlayers}
        </div>
        <div class="text-xs text-text-body">Active Players</div>
      </div>

      <div class="bg-surface-input/50 border border-border-input rounded-lg p-4">
        <div class="text-3xl font-bold text-info-400 mb-1">
          {analytics.totalTeams}
        </div>
        <div class="text-xs text-text-body">Active Teams</div>
      </div>

      <div class="bg-surface-input/50 border border-border-input rounded-lg p-4">
        <div class="text-3xl font-bold text-success-400 mb-1">
          {analytics.paymentStatus.paymentRate}%
        </div>
        <div class="text-xs text-text-body">Payment Rate</div>
      </div>

      <div class="bg-surface-input/50 border border-border-input rounded-lg p-4">
        <div class="text-3xl font-bold text-info-400 mb-1">
          {analytics.activeSeasonCount}
        </div>
        <div class="text-xs text-text-body">Active Seasons</div>
      </div>
    </div>

    <!-- Charts Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card padding="none" class="p-5">
        <h3 class="text-lg font-semibold text-white mb-4">Players Per Division</h3>

        {#if analytics.playersPerDivision.length > 0}
          <div class="mb-4">
            <BarChart
              labels={analytics.playersPerDivision.map((d) => d.divisionName)}
              data={analytics.playersPerDivision.map((d) => d.playerCount)}
              title="Players"
            />
          </div>

          <div class="max-h-48 overflow-y-auto">
            <DataTable data={analytics.playersPerDivision} columns={divisionColumns}>
              {#snippet cell(division, col)}
                {#if col.key === 'division'}
                  <span class="text-text-label">{division.divisionName}</span>
                {:else if col.key === 'players'}
                  <span class="text-text-body font-mono">{division.playerCount}</span>
                {/if}
              {/snippet}
            </DataTable>
          </div>
        {:else}
          <p class="text-text-muted text-center py-8 text-sm">No active players</p>
        {/if}
      </Card>

      <Card padding="none" class="p-5">
        <h3 class="text-lg font-semibold text-white mb-4">Teams Per Region</h3>

        {#if analytics.teamsPerRegion.length > 0}
          <div class="mb-4">
            <BarChart
              labels={analytics.teamsPerRegion.map((r) => r.regionName)}
              data={analytics.teamsPerRegion.map((r) => r.teamCount)}
              title="Teams"
            />
          </div>

          <div class="max-h-48 overflow-y-auto">
            <DataTable data={analytics.teamsPerRegion} columns={regionColumns}>
              {#snippet cell(region, col)}
                {#if col.key === 'region'}
                  <span class="text-text-label">{region.regionName}</span>
                {:else if col.key === 'teams'}
                  <span class="text-text-body font-mono">{region.teamCount}</span>
                {/if}
              {/snippet}
            </DataTable>
          </div>
        {:else}
          <p class="text-text-muted text-center py-8 text-sm">No active teams</p>
        {/if}
      </Card>
    </div>

    <!-- Payment Status -->
    {#if analytics.paymentStatus.totalInPaidDivisions > 0}
      <Card padding="none" class="p-5 mt-6">
        <h3 class="text-lg font-semibold text-white mb-4">Payment Status</h3>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="flex items-center justify-center">
            <DoughnutChart
              labels={['Paid', 'Unpaid', 'Free Tier']}
              data={[
                analytics.paymentStatus.paid,
                analytics.paymentStatus.unpaid,
                analytics.paymentStatus.freeTier,
              ]}
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="bg-surface-input/50 border border-border-input rounded-lg p-3">
              <div class="text-xl font-bold text-success-400 mb-0.5">
                {analytics.paymentStatus.paid}
              </div>
              <div class="text-xs text-text-body">Paid Players</div>
            </div>

            <div class="bg-surface-input/50 border border-border-input rounded-lg p-3">
              <div class="text-xl font-bold text-danger-400 mb-0.5">
                {analytics.paymentStatus.unpaid}
              </div>
              <div class="text-xs text-text-body">Unpaid Players</div>
            </div>

            <div class="bg-surface-input/50 border border-border-input rounded-lg p-3">
              <div class="text-xl font-bold text-info-400 mb-0.5">
                {analytics.paymentStatus.freeTier}
              </div>
              <div class="text-xs text-text-body">Free Tier</div>
            </div>

            <div class="bg-surface-input/50 border border-border-input rounded-lg p-3">
              <div class="text-xl font-bold text-text-label mb-0.5">
                {analytics.paymentStatus.totalInPaidDivisions}
              </div>
              <div class="text-xs text-text-body">Total (Paid Divs)</div>
            </div>
          </div>
        </div>
      </Card>
    {/if}
  </div>

  <div class="text-center text-sm text-text-muted pt-4">
    Statistics are calculated from active seasons only
  </div>
</div>
