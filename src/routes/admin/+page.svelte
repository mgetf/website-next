<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';
  import BarChart from '#lib/components/charts/BarChart.svelte';
  import DoughnutChart from '#lib/components/charts/DoughnutChart.svelte';
  import DataTable from '#lib/components/ui/DataTable.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Badge from '#lib/components/ui/Badge.svelte';
  import FormatBadge from '#lib/components/ui/FormatBadge.svelte';
  import Card from '#lib/components/ui/Card.svelte';
  import FormError from '#lib/components/ui/form/FormError.svelte';
  import SeasonScope from '#lib/components/ui/SeasonScope.svelte';
  import { toast } from '#lib/state/toast.svelte.js';
  import CircleCheck from '~icons/lucide/circle-check';
  import ClipboardList from '~icons/lucide/clipboard-list';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const matchColumns = [
    { key: 'match', label: 'Match' },
    { key: 'scope', label: 'Season' },
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
  const pendingApprovals = $derived(data.pendingApprovals);
  const recentMatches = $derived(data.recentMatches);
  const matchDeadline = $derived(data.matchDeadline ? new Date(data.matchDeadline) : null);
  const currentMatchWeek = $derived(data.currentMatchWeek);

  let isSubmitting = $state(false);
  let decliningKey = $state<string | null>(null);
  let declineReasons = $state<Record<string, string>>({});
  let lastFormResult: ActionData = null;

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error) {
        toast.error(form.error);
      }
    }
  });

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

<div class="mx-auto min-w-0 max-w-7xl space-y-6">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-text-heading mb-2">Dashboard</h1>
    <p class="text-text-body">Manage your division's day-to-day operations</p>
  </div>

  <FormError error={form?.error} />

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
      <div class="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
        <div class="flex min-w-0 items-start gap-4">
          <div
            class="flex size-12 shrink-0 items-center justify-center rounded-lg {info?.status ===
            'red'
              ? 'bg-danger-500/20 text-danger-ink'
              : info?.status === 'yellow'
                ? 'bg-warning-500/20 text-warning-ink'
                : 'bg-success-500/20 text-success-ink'}"
          >
            <svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div class="min-w-0">
            <h2 class="text-lg font-bold text-text-heading sm:text-xl">
              {#if currentMatchWeek}
                Create Week {currentMatchWeek} Matches
              {:else}
                Create Matches
              {/if}
            </h2>
            {#if info}
              <p
                class="text-sm {info.status === 'red'
                  ? 'text-danger-ink'
                  : info.status === 'yellow'
                    ? 'text-warning-ink'
                    : 'text-text-body'}"
              >
                <span class="font-medium">{info.timeText}</span>
                <span class="mt-0.5 block text-text-muted md:mt-0 md:ml-1 md:inline"
                  >· {info.formattedDate}</span
                >
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
          class="flex w-full items-center justify-center gap-2 md:w-auto"
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
      <div class="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-center md:justify-between">
        <div class="flex min-w-0 items-start gap-4">
          <div
            class="flex size-12 shrink-0 items-center justify-center rounded-lg bg-info-500/20 text-info-ink"
          >
            <svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div class="min-w-0">
            <h2 class="text-lg font-bold text-text-heading sm:text-xl">Create Matches</h2>
            <p class="text-sm text-text-muted">
              No deadline configured · Set one in Global Settings
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          href="/admin/matches/create"
          size="lg"
          class="flex w-full items-center justify-center gap-2 md:w-auto"
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
    <div
      class="flex flex-col gap-3 border-b border-border-default p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div class="flex min-w-0 items-center gap-3">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning-500/20 text-warning-ink"
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
        <div class="min-w-0">
          <h2 class="text-lg font-bold text-text-heading sm:text-xl">Pending Players</h2>
          <p class="text-sm text-text-body">
            {pendingApprovals.length} item{pendingApprovals.length !== 1 ? 's' : ''} waiting for approval
          </p>
        </div>
      </div>
      {#if pendingApprovals.length > 5}
        <a
          href="/admin/pending-players"
          class="shrink-0 text-sm font-medium text-info-ink transition hover:text-primary-300"
        >
          View all →
        </a>
      {/if}
    </div>

    <div class="divide-y divide-border-default">
      {#if pendingApprovals.length === 0}
        <div class="py-12 text-center">
          <div class="mb-4 flex justify-center text-success-ink">
            <CircleCheck class="size-12" />
          </div>
          <p class="text-text-body font-medium">All caught up!</p>
          <p class="text-text-muted text-sm mt-1">No pending approvals</p>
        </div>
      {:else}
        {#each pendingApprovals.slice(0, 5) as item (item.key)}
          <div
            class="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-input/50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="flex min-w-0 items-center gap-3">
              {#if item.playerSteamId}
                <a href="/users/{item.playerSteamId}" class="flex-shrink-0">
                  <img
                    src={item.playerAvatar || '/default-avatar.png'}
                    alt={item.playerUsername}
                    class="w-10 h-10 rounded-lg hover:opacity-80 transition-opacity"
                  />
                </a>
              {/if}

              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  {#if item.playerSteamId}
                    <a
                      href="/users/{item.playerSteamId}"
                      class="font-semibold break-words text-text-heading transition-colors hover:text-primary-ink"
                    >
                      {item.playerUsername}
                    </a>
                  {:else}
                    <span class="font-semibold break-words text-text-heading"
                      >{item.playerUsername}</span
                    >
                  {/if}
                  {#if item.kind === 'JOIN_REQUEST'}
                    <span class="text-text-muted">→</span>
                    <a
                      href="/teams/{item.teamId}"
                      class="font-medium break-words text-primary-ink transition-colors hover:text-primary-300"
                    >
                      {item.teamName}
                    </a>
                  {:else if !item.isIndividual}
                    <span class="text-text-muted">·</span>
                    <a
                      href="/teams/{item.teamId}"
                      class="font-medium break-words text-primary-ink transition-colors hover:text-primary-300"
                    >
                      {item.teamName}
                    </a>
                  {/if}
                  <FormatBadge
                    name={item.formatName}
                    themeKey={item.formatThemeKey}
                    iconUrl={item.formatIconUrl}
                  />
                  <Badge color="yellow">
                    {item.kind === 'ENTRY_READY' ? 'Ready-up' : 'Join'}
                  </Badge>
                </div>
                <div class="text-xs text-text-muted mt-0.5">
                  {item.divisionName || 'No Division'}
                  {#if item.regionName}
                    · {item.regionName}
                  {/if}
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              {#if decliningKey === item.key}
                <form
                  method="POST"
                  action="?/decline"
                  use:enhance={() => {
                    isSubmitting = true;
                    return async ({ update }) => {
                      await update();
                      isSubmitting = false;
                      decliningKey = null;
                      declineReasons[item.key] = '';
                    };
                  }}
                  class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
                >
                  <input type="hidden" name="kind" value={item.kind} />
                  <input type="hidden" name="playerSteamId" value={item.playerSteamId} />
                  <input type="hidden" name="teamId" value={item.teamId} />
                  <input
                    type="text"
                    name="reason"
                    bind:value={declineReasons[item.key]}
                    placeholder="Reason..."
                    required
                    class="w-full rounded-md border border-border-input bg-surface-input px-3 py-1.5 text-sm text-text-heading focus:ring-2 focus:ring-primary-500 focus:outline-none sm:w-40"
                  />
                  <div class="flex gap-2">
                    <Button type="submit" variant="danger" size="sm" disabled={isSubmitting}>
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onclick={() => (decliningKey = null)}
                    >
                      Cancel
                    </Button>
                  </div>
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
                  <input type="hidden" name="kind" value={item.kind} />
                  <input type="hidden" name="playerSteamId" value={item.playerSteamId} />
                  <input type="hidden" name="teamId" value={item.teamId} />
                  <Button type="submit" variant="success" size="sm" disabled={isSubmitting}>
                    ✓ Approve
                  </Button>
                </form>

                <Button variant="danger" size="sm" onclick={() => (decliningKey = item.key)}>
                  ✗ Decline
                </Button>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </Card>

  <!-- Recent Unplayed Matches -->
  <Card padding="none" class="overflow-hidden shadow-lg">
    <div
      class="flex flex-col gap-3 border-b border-border-default p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div class="flex min-w-0 items-center gap-3">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-info-500/20 text-info-ink"
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
        <div class="min-w-0">
          <h2 class="text-lg font-bold text-text-heading sm:text-xl">Upcoming Matches</h2>
          <p class="text-sm text-text-body">Recent unplayed matches requiring attention</p>
        </div>
      </div>
      <a
        href="/admin/matches"
        class="shrink-0 text-sm font-medium text-info-ink transition hover:text-primary-300"
      >
        Manage matches →
      </a>
    </div>

    {#if recentMatches.length === 0}
      <div class="py-12 text-center">
        <div class="mb-4 flex justify-center text-text-muted">
          <ClipboardList class="size-12" />
        </div>
        <p class="text-text-body font-medium">No unplayed matches</p>
        <p class="text-text-muted text-sm mt-1">
          <a href="/admin/matches/create" class="text-info-ink hover:text-primary-300"
            >Create new matches</a
          > to get started
        </p>
      </div>
    {:else}
      <div class="divide-y divide-border-default lg:hidden">
        {#each recentMatches as match (match.id)}
          <a
            href="/matches/{match.id}"
            class="block p-4 transition-colors hover:bg-surface-input/50"
          >
            <p class="font-medium break-words text-text-heading">
              {match.homeTeam.name}
              <span class="text-sm text-text-muted">vs</span>
              {match.awayTeam.name}
            </p>
            <p class="mt-1">
              <SeasonScope
                region={match.season.region.name}
                seasonNum={match.season.seasonNum}
                division={match.homeTeam.division?.name}
                class="text-sm"
              />
            </p>
          </a>
        {/each}
      </div>
      <div class="hidden lg:block">
        <DataTable data={recentMatches} columns={matchColumns} emptyMessage="No unplayed matches">
          {#snippet cell(match, col)}
            {#if col.key === 'match'}
              <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span class="font-medium text-text-heading">{match.homeTeam.name}</span>
                <span class="text-sm text-text-muted">vs</span>
                <span class="font-medium text-text-heading">{match.awayTeam.name}</span>
              </div>
            {:else if col.key === 'scope'}
              <SeasonScope
                region={match.season.region.name}
                seasonNum={match.season.seasonNum}
                division={match.homeTeam.division?.name}
                class="text-sm"
              />
            {:else if col.key === 'action'}
              <a
                href="/matches/{match.id}"
                class="text-sm font-medium text-info-ink hover:text-primary-300"
              >
                View
              </a>
            {/if}
          {/snippet}
        </DataTable>
      </div>
    {/if}
  </Card>

  <!-- Quick Alerts -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <!-- Disputed Matches -->
    <a
      href="/admin/disputes"
      class="bg-surface-card border border-border-default rounded-lg p-5 hover:bg-surface-input/70 transition group"
    >
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-500/20 text-primary-ink transition group-hover:bg-primary-500/30"
          >
            <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div class="min-w-0">
            <div class="text-2xl font-bold text-primary-ink">
              {analytics.keyMetrics.disputedMatches}
            </div>
            <div class="text-sm text-text-body">Disputed Matches</div>
          </div>
        </div>
        <svg
          class="size-5 shrink-0 text-text-muted transition group-hover:text-primary-ink"
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
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-danger-500/20 text-danger-ink transition group-hover:bg-danger-500/30"
          >
            <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div class="min-w-0">
            <div class="text-2xl font-bold text-danger-ink">
              {analytics.keyMetrics.openDemoReports}
            </div>
            <div class="text-sm text-text-body">Open Demo Reports</div>
          </div>
        </div>
        <svg
          class="size-5 shrink-0 text-text-muted transition group-hover:text-danger-ink"
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
      <h2 class="text-xl font-bold text-text-heading">League Overview</h2>
      <p class="text-sm text-text-muted">Statistics from active seasons</p>
    </div>

    <!-- Key Metrics Cards -->
    <div class="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      <div class="rounded-lg border border-border-input bg-surface-input/50 p-3 sm:p-4">
        <div class="mb-1 text-2xl font-bold text-info-ink sm:text-3xl">
          {analytics.totalPlayers}
        </div>
        <div class="text-xs text-text-body">Active Players</div>
      </div>

      <div class="rounded-lg border border-border-input bg-surface-input/50 p-3 sm:p-4">
        <div class="mb-1 text-2xl font-bold text-info-ink sm:text-3xl">
          {analytics.totalTeams}
        </div>
        <div class="text-xs text-text-body">Active Teams</div>
      </div>

      <div class="rounded-lg border border-border-input bg-surface-input/50 p-3 sm:p-4">
        <div class="mb-1 text-2xl font-bold text-success-ink sm:text-3xl">
          {analytics.paymentStatus.paymentRate}%
        </div>
        <div class="text-xs text-text-body">Payment Rate</div>
      </div>

      <div class="rounded-lg border border-border-input bg-surface-input/50 p-3 sm:p-4">
        <div class="mb-1 text-2xl font-bold text-info-ink sm:text-3xl">
          {analytics.activeSeasonCount}
        </div>
        <div class="text-xs text-text-body">Active Seasons</div>
      </div>
    </div>

    <!-- Charts Grid -->
    <div class="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
      <Card padding="none" class="min-w-0 p-4 sm:p-5">
        <h3 class="text-lg font-semibold text-text-heading mb-4">Players Per Division</h3>

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

      <Card padding="none" class="min-w-0 p-4 sm:p-5">
        <h3 class="text-lg font-semibold text-text-heading mb-4">Teams Per Region</h3>

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
      <Card padding="none" class="mt-6 min-w-0 p-4 sm:p-5">
        <h3 class="text-lg font-semibold text-text-heading mb-4">Payment Status</h3>

        <div class="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
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
              <div class="text-xl font-bold text-success-ink mb-0.5">
                {analytics.paymentStatus.paid}
              </div>
              <div class="text-xs text-text-body">Paid Players</div>
            </div>

            <div class="bg-surface-input/50 border border-border-input rounded-lg p-3">
              <div class="text-xl font-bold text-danger-ink mb-0.5">
                {analytics.paymentStatus.unpaid}
              </div>
              <div class="text-xs text-text-body">Unpaid Players</div>
            </div>

            <div class="bg-surface-input/50 border border-border-input rounded-lg p-3">
              <div class="text-xl font-bold text-info-ink mb-0.5">
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
