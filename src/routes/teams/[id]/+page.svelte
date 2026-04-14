<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { onMount } from 'svelte';
  import { toast } from '$lib/state/toast.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const team = $derived(data.team);
  const currentRoster = $derived(data.currentRoster);
  const pastRoster = $derived(data.pastRoster);
  const matchesBySeason = $derived(data.matchesBySeason);
  let lastFormResult: ActionData = null;

  let submittingAction = $state<string | null>(null);
  let showLeaveDialog = $state(false);
  let showRemoveDialog = $state(false);
  let removeTarget: { steamId: string; name: string } | null = $state(null);
  let showMarkPaidDialog = $state(false);
  let markPaidTarget: { steamId: string; name: string } | null = $state(null);
  let showReadyDialog = $state(false);

  let leaveFormEl: HTMLFormElement | undefined = $state();
  let removeFormEl: HTMLFormElement | undefined = $state();
  let markPaidFormEl: HTMLFormElement | undefined = $state();
  let readyFormEl: HTMLFormElement | undefined = $state();

  const canToggleReady = $derived(
    data.canManageTeam &&
      team.status === 'UNREADY' &&
      (data.isFreeDivision || data.paidPlayerCount >= 2),
  );

  onMount(() => {
    if (data.paymentSuccess) {
      history.replaceState({}, '', window.location.pathname);
      toast.success('Payment Successful! Your signup fee has been paid. Thank you!');
    } else if (data.signupSuccess) {
      history.replaceState({}, '', window.location.pathname);
      toast.success('Team created successfully! Your registration is complete.');
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get('joined') === 'awaiting-admin') {
      history.replaceState({}, '', window.location.pathname);
      toast.success('Join request submitted! An admin will review it shortly.');
    }
    if (url.searchParams.get('disbanded') === '1') {
      history.replaceState({}, '', window.location.pathname);
      toast.success('Team has been disbanded.');
    }
  });

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      showLeaveDialog = false;
      showRemoveDialog = false;
      removeTarget = null;
      showMarkPaidDialog = false;
      markPaidTarget = null;
      showReadyDialog = false;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error) {
        toast.error(form.error);
      }
    }
  });

  function formatDate(date: Date | string | null): string {
    if (!date) return 'N/A';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  }

  function getResultColor(result: string): string {
    if (result === 'W') return 'text-success-400';
    if (result === 'L') return 'text-danger-400';
    if (result === 'D') return 'text-warning-400';
    return 'text-text-body';
  }

  function getStatusBadgeColor(status: string): 'green' | 'yellow' | 'zinc' {
    if (status === 'READY') return 'green';
    if (status === 'PENDING') return 'yellow';
    return 'zinc';
  }

  function getStatusTooltip(status: string): string {
    switch (status) {
      case 'UNREADY':
        return 'Team is registered but has not readied up yet';
      case 'PENDING':
        return 'Team has readied up and is awaiting admin approval';
      case 'READY':
        return 'Team has been approved and is active for the season';
      case 'DEAD':
        return 'Team has been disbanded';
      default:
        return '';
    }
  }

  const totalGames = $derived(team.wins + team.losses);
  const winRate = $derived(totalGames > 0 ? ((team.wins / totalGames) * 100).toFixed(1) : '0.0');

  const hasUnpaidPlayers = $derived(!data.isFreeDivision && currentRoster.some((p) => !p.isPaid));
  const unpaidPlayers = $derived(currentRoster.filter((p) => !p.isPaid));
  const currentUserIsPaid = $derived(
    currentRoster.find((p) => p.steamId === data.currentUserSteamId)?.isPaid ?? true,
  );
  const paymentStepComplete = $derived(data.isFreeDivision || data.paidPlayerCount >= 2);

  function makeEnhance(action: string) {
    return ({ cancel }: { cancel: () => void }) => {
      if (submittingAction !== null) {
        cancel();
        return;
      }
      submittingAction = action;
      return async ({ update }: { update: () => Promise<void> }) => {
        await update();
        submittingAction = null;
      };
    };
  }
</script>

<div class="min-h-screen pb-16">
  <!-- Team Hero Section -->
  <PageHero maxWidth="max-w-6xl">
    <div class="flex flex-col md:flex-row items-center gap-8">
      <!-- Team Logo -->
      <div class="flex-shrink-0">
        {#if team.avatar}
          <img
            src={team.avatar}
            alt={team.name}
            class="w-32 h-32 rounded-lg border-4 border-border-input shadow-2xl object-cover"
          />
        {:else}
          <div
            class="w-32 h-32 rounded-lg border-4 border-border-input shadow-2xl bg-surface-input flex items-center justify-center"
          >
            <span class="text-4xl font-black text-text-muted">
              {team.name.charAt(0)}
            </span>
          </div>
        {/if}
      </div>

      <!-- Team Info -->
      <div class="flex-grow text-center md:text-left">
        <h1 class="text-5xl font-black text-white mb-2">
          {team.name}
        </h1>
        {#if team.acronym}
          <p class="text-2xl text-text-body mb-4">{team.acronym}</p>
        {/if}

        <div class="flex flex-wrap gap-3 justify-center md:justify-start mb-4">
          {#if team.division && team.region}
            <Badge color="blue" size="md">{team.division} ({team.region})</Badge>
          {/if}
          {#if team.seasonNum}
            <Badge color="purple" size="md">Season {team.seasonNum}</Badge>
          {/if}
          <Badge
            color={getStatusBadgeColor(team.status)}
            size="md"
            tooltip={getStatusTooltip(team.status)}>{team.status}</Badge
          >
        </div>

        <div class="flex flex-wrap gap-6 justify-center md:justify-start text-sm">
          <div>
            <span class="text-text-body">Record:</span>
            <span class="text-white font-medium ml-2">{team.wins} - {team.losses}</span>
            <span class="text-text-muted ml-1">({winRate}%)</span>
          </div>
          <div>
            <span class="text-text-body">Points:</span>
            <span class="text-white font-medium ml-2"
              >{team.pointsScored} - {team.pointsScoredAgainst}</span
            >
          </div>
          <div>
            <span class="text-text-body">Created:</span>
            <span class="text-white font-medium ml-2">{formatDate(team.createdAt)}</span>
          </div>
        </div>

        {#if data.isAuthenticated && !data.isOnTeam && !data.canManageTeam && team.status !== 'DEAD'}
          <div class="mt-4">
            {#if data.pendingStatus === 0}
              <p class="text-sm text-success-400 mb-2">You have been invited to join this team</p>
              <div class="flex flex-wrap gap-3 justify-center md:justify-start">
                <form
                  method="POST"
                  action="?/acceptInvitation"
                  use:enhance={makeEnhance('acceptInvitation')}
                >
                  <Button
                    type="submit"
                    variant="success"
                    size="lg"
                    disabled={submittingAction !== null}
                  >
                    {submittingAction === 'acceptInvitation'
                      ? 'Submitting...'
                      : 'Accept Invitation'}
                  </Button>
                </form>
                <form
                  method="POST"
                  action="?/declineInvitation"
                  use:enhance={makeEnhance('declineInvitation')}
                >
                  <Button
                    type="submit"
                    variant="secondary"
                    size="lg"
                    disabled={submittingAction !== null}
                  >
                    {submittingAction === 'declineInvitation' ? 'Declining...' : 'Decline'}
                  </Button>
                </form>
              </div>
            {:else if data.pendingStatus === 1}
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warning-500/15 border border-warning-500/30 rounded-lg text-warning-400 text-sm font-medium"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-warning-400 animate-pulse"></span>
                  Pending admin approval
                </span>
                <form
                  method="POST"
                  action="?/declineInvitation"
                  use:enhance={makeEnhance('declineInvitation')}
                >
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={submittingAction !== null}
                  >
                    {submittingAction === 'declineInvitation' ? 'Withdrawing...' : 'Withdraw'}
                  </Button>
                </form>
              </div>
            {:else if data.hasPendingRequestElsewhere}
              <p class="text-sm text-warning-400">
                You have a pending join request for another team. Resolve it before joining here.
              </p>
            {:else if !data.isSeasonActive}
              <p class="text-sm text-text-muted">
                This team's season has ended. Joining is no longer available.
              </p>
            {:else if !data.rosterLocked}
              <Button href="/teams/{team.id}/join" variant="primary" size="lg">Join Team</Button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </PageHero>

  <!-- Main Content -->
  <div class="max-w-7xl mx-auto px-6 py-8">
    <!-- Payment CTA Banner — shows when minimum not met, or when current user still hasn't paid -->
    {#if data.isOnTeam && hasUnpaidPlayers && (!paymentStepComplete || !currentUserIsPaid) && team.status !== 'DEAD'}
      <div
        class="mb-6 p-5 rounded-lg border border-warning-500/30 bg-warning-500/5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
      >
        <div class="flex items-start gap-3 flex-1">
          <svg
            class="w-6 h-6 text-warning-400 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            {#if !currentUserIsPaid && paymentStepComplete}
              <h3 class="text-lg font-bold text-white">Signup Fee Unpaid</h3>
              <p class="text-sm text-text-body mt-1">
                You haven't paid your signup fee yet. The team can ready up, but your payment is
                still required.
              </p>
            {:else if !currentUserIsPaid}
              <h3 class="text-lg font-bold text-white">Payment Required</h3>
              <p class="text-sm text-text-body mt-1">
                You need to pay your signup fee before the team can ready up.
                <span class="text-warning-400 font-medium">
                  ({data.paidPlayerCount}/2 paid)
                </span>
              </p>
            {:else}
              <h3 class="text-lg font-bold text-white">Payment Required</h3>
              <p class="text-sm text-text-body mt-1">
                {unpaidPlayers.length}
                teammate{unpaidPlayers.length !== 1 ? 's' : ''} still need{unpaidPlayers.length ===
                1
                  ? 's'
                  : ''} to pay before the team can ready up.
                <span class="text-warning-400 font-medium">
                  ({data.paidPlayerCount}/2 paid)
                </span>
              </p>
            {/if}
          </div>
        </div>
        {#if data.currentUserSteamId}
          <Button variant="warning" href="/checkout/{data.currentUserSteamId}" size="lg">
            {!currentUserIsPaid ? 'Pay Signup Fee' : 'View Checkout'}
          </Button>
        {/if}
      </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left Column - Roster -->
      <div class="space-y-6">
        <!-- Current Roster -->
        <div
          class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
        >
          <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
            <h2 class="text-xl font-bold text-white">
              Current Roster <span class="text-text-muted">({currentRoster.length} / 3)</span>
            </h2>
          </div>

          <div class="p-6">
            <div class="space-y-4">
              {#each currentRoster as player}
                <div
                  class="flex items-center justify-between p-4 bg-surface-page/50 rounded-lg transition-colors group"
                >
                  <a
                    href="/users/{player.steamId}"
                    class="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity"
                  >
                    <img src={player.avatar} alt={player.name} class="w-12 h-12 rounded" />
                    <div>
                      <div class="flex items-center gap-2">
                        <span
                          class="text-white font-medium group-hover:text-primary-400 transition-colors"
                        >
                          {player.name}
                        </span>
                        {#if player.isLeader}
                          <Badge color="yellow">Leader</Badge>
                        {/if}
                      </div>
                      <div class="text-sm text-text-body">
                        Joined: {formatDate(player.joinedAt)}
                      </div>
                    </div>
                  </a>

                  <div class="flex items-center gap-2">
                    {#if !player.isPaid && !data.isFreeDivision}
                      <Badge color="red">Unpaid</Badge>
                    {/if}

                    {#if data.canManageTeam && player.permissionLevel !== 2 && player.steamId !== data.currentUserSteamId && (!data.rosterLocked || data.isGlobalAdmin)}
                      <Button
                        variant="danger"
                        size="sm"
                        onclick={() => {
                          removeTarget = { steamId: player.steamId, name: player.name };
                          showRemoveDialog = true;
                        }}
                      >
                        Remove
                      </Button>
                    {/if}

                    {#if player.steamId === data.currentUserSteamId && !data.isOwner && !data.rosterLocked}
                      <Button variant="danger" size="sm" onclick={() => (showLeaveDialog = true)}>
                        Leave Team
                      </Button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Past Roster -->
        <div
          class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
        >
          <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
            <h2 class="text-xl font-bold text-white">Past Roster</h2>
          </div>

          <div class="p-6">
            {#if pastRoster.length > 0}
              <div class="space-y-4">
                {#each pastRoster as player}
                  <a
                    href="/users/{player.steamId}"
                    class="flex items-center justify-between p-4 bg-surface-page/50 rounded-lg hover:bg-surface-input/30 transition-colors group"
                  >
                    <div class="flex items-center gap-4">
                      <img
                        src={player.avatar}
                        alt={player.name}
                        class="w-12 h-12 rounded opacity-60"
                      />
                      <div>
                        <span
                          class="text-white font-medium group-hover:text-primary-400 transition-colors"
                        >
                          {player.name}
                        </span>
                        <div class="text-sm text-text-body">
                          {formatDate(player.joinedAt)} - {formatDate(player.leftAt)}
                        </div>
                      </div>
                    </div>
                  </a>
                {/each}
              </div>
            {:else}
              <p class="text-center text-text-muted py-4">No past players in this team</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- Right Column - Matches -->
      <div class="space-y-6">
        {#if matchesBySeason.length > 0}
          {#each matchesBySeason as seasonData}
            <div
              class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
            >
              <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
                <h2 class="text-xl font-bold text-white">{seasonData.season}</h2>
              </div>

              <div class="p-6">
                <div class="space-y-2">
                  {#each seasonData.matches as match}
                    <a
                      href="/matches/{match.matchId}"
                      class="flex items-center justify-between p-3 bg-surface-page/50 rounded hover:bg-surface-input/30 transition-colors group"
                    >
                      <div class="flex items-center gap-4 flex-1">
                        <div class="text-sm font-medium text-text-body w-20">
                          {match.week}
                        </div>
                        <div class="flex-1">
                          {#if match.opponent && match.opponentId}
                            <span class="text-white group-hover:text-primary-400 transition-colors">
                              vs {match.opponent}
                            </span>
                          {:else if match.opponent}
                            <span class="text-white group-hover:text-primary-400 transition-colors">
                              vs {match.opponent}
                            </span>
                          {:else}
                            <span class="text-text-muted italic">{match.score}</span>
                          {/if}
                        </div>
                      </div>
                      <div class="flex items-center gap-4">
                        {#if match.opponent && match.result !== 'TBD'}
                          <span
                            class="text-sm {getResultColor(match.result)} font-bold w-20 text-right"
                          >
                            {match.result}
                            {match.score}
                          </span>
                        {:else if match.result === 'TBD'}
                          <span class="text-sm text-text-muted w-20 text-right">
                            {formatDate(match.date)}
                          </span>
                        {/if}
                      </div>
                    </a>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        {:else}
          <div
            class="bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
          >
            <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
              <h2 class="text-xl font-bold text-white">Match History</h2>
            </div>

            <div class="p-6">
              <div class="text-center py-8">
                <div class="text-6xl mb-4 opacity-50">🏆</div>
                <p class="text-text-muted text-lg">No match history yet</p>
                <p class="text-text-muted text-sm mt-2">
                  This team hasn't participated in any seasons
                </p>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Section 2: Team Management -->
    {#if data.canManageTeam}
      <div
        class="mt-8 bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
      >
        <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
          <h2 class="text-xl font-bold text-white">Team Management</h2>
        </div>

        <div class="p-6 space-y-6">
          {#if team.status === 'UNREADY'}
            <!-- Step 1: Pay Signup Fees (only for paid divisions) -->
            {#if !data.isFreeDivision}
              <div
                class="p-4 rounded-lg border {paymentStepComplete
                  ? 'border-success-500/30 bg-success-500/5'
                  : 'border-warning-500/30 bg-warning-500/5'}"
              >
                <div class="flex items-center gap-3 mb-2">
                  <span
                    class="flex items-center justify-center w-7 h-7 rounded-full {paymentStepComplete
                      ? 'bg-success-600'
                      : 'bg-warning-600'} text-white text-sm font-bold flex-shrink-0"
                  >
                    {#if paymentStepComplete}
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2.5"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    {:else}
                      1
                    {/if}
                  </span>
                  <h3 class="text-lg font-bold text-white">Pay Signup Fees</h3>
                  <span
                    class="text-sm {paymentStepComplete
                      ? 'text-success-400'
                      : 'text-warning-400'} font-medium ml-auto"
                  >
                    {data.paidPlayerCount}/2 paid
                  </span>
                </div>
                {#if !paymentStepComplete}
                  <div class="ml-10 space-y-3">
                    <div class="w-full bg-surface-input rounded-full h-1.5">
                      <div
                        class="bg-warning-500 h-1.5 rounded-full transition-all"
                        style="width: {(data.paidPlayerCount / 2) * 100}%"
                      ></div>
                    </div>
                    <div class="space-y-1">
                      {#each unpaidPlayers as player}
                        <div class="flex items-center gap-2 text-sm">
                          <span class="w-1.5 h-1.5 rounded-full bg-danger-400"></span>
                          <span class="text-text-body">{player.name}</span>
                          <span class="text-danger-400">&mdash; unpaid</span>
                        </div>
                      {/each}
                    </div>
                    {#if data.currentUserSteamId}
                      <Button variant="warning" href="/checkout/{data.currentUserSteamId}">
                        Go to Checkout
                      </Button>
                    {/if}
                  </div>
                {:else if !currentUserIsPaid}
                  <div class="ml-10 mt-2">
                    <p class="text-sm text-text-body mb-2">
                      Minimum met, but you haven't paid yet.
                    </p>
                    {#if data.currentUserSteamId}
                      <Button variant="warning" href="/checkout/{data.currentUserSteamId}">
                        Pay Signup Fee
                      </Button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}

            <!-- Step 2 (or Step 1 for free divisions): Ready Up -->
            <div
              class="p-4 rounded-lg border {canToggleReady
                ? 'border-primary-500/30 bg-primary-500/5'
                : 'border-border-default bg-surface-page/30'}"
            >
              <div class="flex items-center gap-3 mb-2">
                <span
                  class="flex items-center justify-center w-7 h-7 rounded-full {canToggleReady
                    ? 'bg-primary-600'
                    : 'bg-surface-input'} text-white text-sm font-bold flex-shrink-0"
                >
                  {data.isFreeDivision ? '1' : '2'}
                </span>
                <h3 class="text-lg font-bold {canToggleReady ? 'text-white' : 'text-text-muted'}">
                  Ready Up
                </h3>
                {#if !canToggleReady && !data.isFreeDivision}
                  <svg class="w-4 h-4 text-text-muted" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clip-rule="evenodd"
                    />
                  </svg>
                {/if}
              </div>
              <div class="ml-10">
                {#if canToggleReady}
                  <p class="text-sm text-text-body mb-3">
                    Once ready, an admin will review your team and approve it for the season.
                  </p>
                  <Button
                    variant="primary"
                    disabled={submittingAction !== null}
                    onclick={() => (showReadyDialog = true)}
                  >
                    Ready Up
                  </Button>
                {:else if !data.isFreeDivision && data.paidPlayerCount < 2}
                  <p class="text-sm text-text-muted">
                    Available after at least 2 players have paid their signup fees.
                  </p>
                {/if}
              </div>
            </div>
          {:else if team.status === 'PENDING'}
            <div class="p-4 rounded-lg border border-warning-500/30 bg-warning-500/5">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full bg-warning-400 animate-pulse"></span>
                <span class="text-warning-400 font-semibold">Pending Admin Approval</span>
              </div>
              <p class="text-sm text-text-body mt-2">
                Your team has been marked as ready and is awaiting admin review.
              </p>
            </div>
          {/if}
          <Button href="/teams/{team.id}/edit" variant="secondary">Edit Team Settings</Button>
        </div>
      </div>
    {/if}

    <!-- Section 3: League Admin Controls -->
    {#if data.isGlobalAdmin}
      <div
        class="mt-8 bg-surface-card/80 backdrop-blur rounded-lg border border-border-default overflow-hidden"
      >
        <div class="bg-surface-page/80 px-6 py-4 border-b border-border-default">
          <h2 class="text-xl font-bold text-white">Admin Controls</h2>
        </div>

        <div class="p-6 space-y-6">
          <div>
            <h3 class="text-lg font-bold text-white mb-4">Change Team Status</h3>
            <form method="POST" action="?/updateStatus" use:enhance class="flex gap-3 items-end">
              <div class="flex-1">
                <label for="status" class="block text-sm font-medium text-text-label mb-2">
                  Team Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={team.status}
                  class="w-full px-4 py-2 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="UNREADY">Unready</option>
                  <option value="PENDING">Pending</option>
                  <option value="READY">Ready</option>
                  <option value="DEAD">Dead</option>
                  <option value="PLACEMENT">Placement</option>
                </select>
              </div>
              <Button type="submit">Update Status</Button>
            </form>
          </div>

          <div class="pt-4 border-t border-border-default">
            <h3 class="text-lg font-bold text-white mb-4">Change Division</h3>
            {#if data.divisions.length > 0}
              <form
                method="POST"
                action="?/changeDivision"
                use:enhance
                class="flex gap-3 items-end"
              >
                <div class="flex-1">
                  <label for="divisionId" class="block text-sm font-medium text-text-label mb-2">
                    Division
                  </label>
                  <select
                    id="divisionId"
                    name="divisionId"
                    class="w-full px-4 py-2 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    {#each data.divisions as division}
                      <option value={division.id} selected={division.id === team.divisionId}>
                        {division.name}{division.signupCost > 0
                          ? ` ($${division.signupCost})`
                          : ' (free)'}
                      </option>
                    {/each}
                  </select>
                </div>
                <Button type="submit" size="lg">Update Division</Button>
              </form>
            {:else}
              <p class="text-text-muted text-sm">No divisions available for this team's region.</p>
            {/if}
          </div>

          {#if !data.isFreeDivision && unpaidPlayers.length > 0}
            <div class="pt-4 border-t border-border-default">
              <h3 class="text-lg font-bold text-white mb-4">Mark Player as Paid</h3>
              <div class="space-y-2">
                {#each unpaidPlayers as player}
                  <div class="flex items-center justify-between p-3 bg-surface-page/50 rounded-lg">
                    <div class="flex items-center gap-3">
                      <img src={player.avatar} alt={player.name} class="w-8 h-8 rounded" />
                      <span class="text-white font-medium">{player.name}</span>
                      <Badge color="red">Unpaid</Badge>
                    </div>
                    <Button
                      variant="success"
                      size="sm"
                      onclick={() => {
                        markPaidTarget = { steamId: player.steamId, name: player.name };
                        showMarkPaidDialog = true;
                      }}
                    >
                      Mark as Paid
                    </Button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<form
  bind:this={leaveFormEl}
  method="POST"
  action="?/leaveTeam"
  use:enhance={makeEnhance('leaveTeam')}
  class="hidden"
></form>

<form
  bind:this={removeFormEl}
  method="POST"
  action="?/removePlayer"
  use:enhance={makeEnhance('removePlayer')}
  class="hidden"
>
  <input type="hidden" name="playerSteamId" value={removeTarget?.steamId ?? ''} />
</form>

<form
  bind:this={markPaidFormEl}
  method="POST"
  action="?/markPlayerPaid"
  use:enhance={makeEnhance('markPlayerPaid')}
  class="hidden"
>
  <input type="hidden" name="playerSteamId" value={markPaidTarget?.steamId ?? ''} />
</form>

<form
  bind:this={readyFormEl}
  method="POST"
  action="?/toggleReady"
  use:enhance={makeEnhance('toggleReady')}
  class="hidden"
></form>

<ConfirmDialog
  open={showLeaveDialog}
  title="Leave Team"
  description="Are you sure you want to leave {team.name}? You will need to be re-invited or request to join again."
  confirmLabel="Leave Team"
  loadingLabel="Leaving..."
  variant="danger"
  isLoading={submittingAction === 'leaveTeam'}
  onConfirm={() => leaveFormEl?.requestSubmit()}
  onCancel={() => (showLeaveDialog = false)}
/>

<ConfirmDialog
  open={showRemoveDialog}
  title="Remove Player"
  description="Remove {removeTarget?.name ??
    'this player'} from the team? They will need to be re-invited or request to join again."
  confirmLabel="Remove Player"
  loadingLabel="Removing..."
  variant="danger"
  isLoading={submittingAction === 'removePlayer'}
  onConfirm={() => removeFormEl?.requestSubmit()}
  onCancel={() => {
    showRemoveDialog = false;
    removeTarget = null;
  }}
/>

<ConfirmDialog
  open={showMarkPaidDialog}
  title="Mark Player as Paid"
  description="Mark {markPaidTarget?.name ??
    'this player'} as paid? This records a manual payment outside of the automatic payment options."
  confirmLabel="Mark as Paid"
  loadingLabel="Saving..."
  variant="success"
  isLoading={submittingAction === 'markPlayerPaid'}
  onConfirm={() => markPaidFormEl?.requestSubmit()}
  onCancel={() => {
    showMarkPaidDialog = false;
    markPaidTarget = null;
  }}
/>

<ConfirmDialog
  open={showReadyDialog}
  title="Ready Up"
  description="Mark {team.name} as ready? An admin will review and approve your team for the season."
  confirmLabel="Ready Up"
  loadingLabel="Submitting..."
  variant="success"
  isLoading={submittingAction === 'toggleReady'}
  onConfirm={() => readyFormEl?.requestSubmit()}
  onCancel={() => (showReadyDialog = false)}
/>
