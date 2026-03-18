<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import BarChart from '$lib/components/charts/BarChart.svelte';
  import DoughnutChart from '$lib/components/charts/DoughnutChart.svelte';
  import DataTable from '$lib/components/ui/DataTable.svelte';

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

  // Calculate time remaining until deadline
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
    <p class="text-gray-400">Manage your division's day-to-day operations</p>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- ACTIONABLE WORK SECTION - Primary focus area -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->

  <!-- Match Creation Deadline Card -->
  {#if currentMatchWeek || matchDeadline}
    {@const info = deadlineInfo()}
    <div
      class="bg-zinc-900 border rounded-lg shadow-lg overflow-hidden {info?.status === 'red'
        ? 'border-red-500/50'
        : info?.status === 'yellow'
          ? 'border-yellow-500/50'
          : 'border-zinc-800'}"
    >
      <div class="p-5 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-lg flex items-center justify-center {info?.status === 'red'
              ? 'bg-red-500/20 text-red-400'
              : info?.status === 'yellow'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-green-500/20 text-green-400'}"
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
                  ? 'text-red-400'
                  : info.status === 'yellow'
                    ? 'text-yellow-400'
                    : 'text-gray-400'}"
              >
                <span class="font-medium">{info.timeText}</span>
                <span class="text-gray-500 ml-1">• {info.formattedDate}</span>
              </p>
            {:else}
              <p class="text-sm text-gray-400">No deadline set</p>
            {/if}
          </div>
        </div>
        <a
          href="/admin/matches/create"
          class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
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
        </a>
      </div>
    </div>
  {:else}
    <!-- No deadline configured - show simple create matches button -->
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg overflow-hidden">
      <div class="p-5 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div
            class="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400"
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
            <p class="text-sm text-gray-500">No deadline configured • Set one in Global Settings</p>
          </div>
        </div>
        <a
          href="/admin/matches/create"
          class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
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
        </a>
      </div>
    </div>
  {/if}

  <!-- Pending Players - Inline Quick Actions -->
  <div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg overflow-hidden">
    <div class="p-5 border-b border-zinc-800 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center text-yellow-400"
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
          <p class="text-sm text-gray-400">
            {pendingPlayers.length} player{pendingPlayers.length !== 1 ? 's' : ''} waiting for approval
          </p>
        </div>
      </div>
      {#if pendingPlayers.length > 5}
        <a
          href="/admin/pending-players"
          class="text-sm text-blue-400 hover:text-blue-300 font-medium transition"
        >
          View all →
        </a>
      {/if}
    </div>

    <div class="divide-y divide-zinc-800">
      {#if pendingPlayers.length === 0}
        <div class="py-12 text-center">
          <span class="text-5xl mb-4 block">✅</span>
          <p class="text-gray-400 font-medium">All caught up!</p>
          <p class="text-gray-500 text-sm mt-1">No pending player requests</p>
        </div>
      {:else}
        {#each pendingPlayers.slice(0, 5) as request}
          <div class="p-4 hover:bg-zinc-800/50 transition-colors">
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <!-- Player Avatar -->
                <a href="/users/{request.player.steamId}" class="flex-shrink-0">
                  <img
                    src={request.player.steamAvatar || '/default-avatar.png'}
                    alt={request.player.steamUsername}
                    class="w-10 h-10 rounded-lg hover:opacity-80 transition-opacity"
                  />
                </a>

                <!-- Request Details -->
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <a
                      href="/users/{request.player.steamId}"
                      class="text-white font-semibold hover:text-blue-400 transition-colors truncate"
                    >
                      {request.player.steamUsername}
                    </a>
                    <span class="text-gray-500">→</span>
                    <a
                      href="/teams/{request.team.id}"
                      class="text-orange-400 hover:text-orange-300 font-medium transition-colors truncate"
                    >
                      {request.team.name}
                    </a>
                  </div>
                  <div class="text-xs text-gray-500 mt-0.5">
                    {request.team.division?.name || 'No Division'}
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2 flex-shrink-0">
                {#if decliningPlayerId === request.player.steamId}
                  <!-- Decline Form -->
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
                      class="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 w-32"
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      class="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onclick={() => (decliningPlayerId = null)}
                      class="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </form>
                {:else}
                  <!-- Approve Button -->
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
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      class="px-4 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
                    >
                      ✓ Approve
                    </button>
                  </form>

                  <!-- Decline Button -->
                  <button
                    onclick={() => (decliningPlayerId = request.player.steamId)}
                    class="px-4 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors font-medium text-sm"
                  >
                    ✗ Decline
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </div>

  <!-- Recent Unplayed Matches -->
  <div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg overflow-hidden">
    <div class="p-5 border-b border-zinc-800 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400"
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
          <p class="text-sm text-gray-400">Recent unplayed matches requiring attention</p>
        </div>
      </div>
      <a
        href="/admin/matches"
        class="text-sm text-blue-400 hover:text-blue-300 font-medium transition"
      >
        Manage matches →
      </a>
    </div>

    {#if recentMatches.length === 0}
      <div class="py-12 text-center">
        <span class="text-5xl mb-4 block">📋</span>
        <p class="text-gray-400 font-medium">No unplayed matches</p>
        <p class="text-gray-500 text-sm mt-1">
          <a href="/admin/matches/create" class="text-blue-400 hover:text-blue-300"
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
              <span class="text-gray-500 text-sm">vs</span>
              <span class="text-white font-medium">{match.awayTeam.name}</span>
            </div>
          {:else if col.key === 'division'}
            <span class="text-sm text-gray-300">{match.homeTeam.division?.name || '-'}</span>
          {:else if col.key === 'season'}
            <span class="text-sm text-gray-400">
              {match.season.region.name} S{match.season.seasonNum}
            </span>
          {:else if col.key === 'action'}
            <a
              href="/matches/{match.id}"
              class="text-blue-400 hover:text-blue-300 text-sm font-medium"
            >
              View
            </a>
          {/if}
        {/snippet}
      </DataTable>
    {/if}
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- QUICK ALERTS - Secondary action items -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <!-- Disputed Matches -->
    <a
      href="/admin/disputes"
      class="bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:bg-zinc-800/70 transition group"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400 group-hover:bg-orange-500/30 transition"
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
            <div class="text-2xl font-bold text-orange-400">
              {analytics.keyMetrics.disputedMatches}
            </div>
            <div class="text-sm text-gray-400">Disputed Matches</div>
          </div>
        </div>
        <svg
          class="w-5 h-5 text-gray-500 group-hover:text-orange-400 transition"
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
      class="bg-zinc-900 border border-zinc-800 rounded-lg p-5 hover:bg-zinc-800/70 transition group"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 group-hover:bg-red-500/30 transition"
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
            <div class="text-2xl font-bold text-red-400">
              {analytics.keyMetrics.openDemoReports}
            </div>
            <div class="text-sm text-gray-400">Open Demo Reports</div>
          </div>
        </div>
        <svg
          class="w-5 h-5 text-gray-500 group-hover:text-red-400 transition"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- ANALYTICS SECTION - Overview metrics (moved to bottom) -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->

  <div class="pt-6 border-t border-zinc-800">
    <div class="mb-6">
      <h2 class="text-xl font-bold text-white">League Overview</h2>
      <p class="text-sm text-gray-500">Statistics from active seasons</p>
    </div>

    <!-- Key Metrics Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <!-- Total Players -->
      <div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
        <div class="text-3xl font-bold text-blue-400 mb-1">
          {analytics.totalPlayers}
        </div>
        <div class="text-xs text-gray-400">Active Players</div>
      </div>

      <!-- Total Teams -->
      <div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
        <div class="text-3xl font-bold text-blue-400 mb-1">
          {analytics.totalTeams}
        </div>
        <div class="text-xs text-gray-400">Active Teams</div>
      </div>

      <!-- Payment Rate -->
      <div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
        <div class="text-3xl font-bold text-green-400 mb-1">
          {analytics.paymentStatus.paymentRate}%
        </div>
        <div class="text-xs text-gray-400">Payment Rate</div>
      </div>

      <!-- Active Seasons -->
      <div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
        <div class="text-3xl font-bold text-blue-400 mb-1">
          {analytics.activeSeasonCount}
        </div>
        <div class="text-xs text-gray-400">Active Seasons</div>
      </div>
    </div>

    <!-- Charts Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Players Per Division -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
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
                  <span class="text-gray-300">{division.divisionName}</span>
                {:else if col.key === 'players'}
                  <span class="text-gray-400 font-mono">{division.playerCount}</span>
                {/if}
              {/snippet}
            </DataTable>
          </div>
        {:else}
          <p class="text-gray-500 text-center py-8 text-sm">No active players</p>
        {/if}
      </div>

      <!-- Teams Per Region -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
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
                  <span class="text-gray-300">{region.regionName}</span>
                {:else if col.key === 'teams'}
                  <span class="text-gray-400 font-mono">{region.teamCount}</span>
                {/if}
              {/snippet}
            </DataTable>
          </div>
        {:else}
          <p class="text-gray-500 text-center py-8 text-sm">No active teams</p>
        {/if}
      </div>
    </div>

    <!-- Payment Status -->
    {#if analytics.paymentStatus.totalInPaidDivisions > 0}
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mt-6">
        <h3 class="text-lg font-semibold text-white mb-4">Payment Status</h3>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Chart -->
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

          <!-- Stats Grid -->
          <div class="grid grid-cols-2 gap-3">
            <!-- Paid -->
            <div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
              <div class="text-xl font-bold text-green-400 mb-0.5">
                {analytics.paymentStatus.paid}
              </div>
              <div class="text-xs text-gray-400">Paid Players</div>
            </div>

            <!-- Unpaid -->
            <div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
              <div class="text-xl font-bold text-red-400 mb-0.5">
                {analytics.paymentStatus.unpaid}
              </div>
              <div class="text-xs text-gray-400">Unpaid Players</div>
            </div>

            <!-- Free Tier -->
            <div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
              <div class="text-xl font-bold text-blue-400 mb-0.5">
                {analytics.paymentStatus.freeTier}
              </div>
              <div class="text-xs text-gray-400">Free Tier</div>
            </div>

            <!-- Total in Paid Divisions -->
            <div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
              <div class="text-xl font-bold text-gray-300 mb-0.5">
                {analytics.paymentStatus.totalInPaidDivisions}
              </div>
              <div class="text-xs text-gray-400">Total (Paid Divs)</div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Footer Note -->
  <div class="text-center text-sm text-gray-500 pt-4">
    Statistics are calculated from active seasons only
  </div>
</div>
