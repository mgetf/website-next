<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
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

  let leaveFormEl: HTMLFormElement | undefined = $state();
  let removeFormEl: HTMLFormElement | undefined = $state();
  let markPaidFormEl: HTMLFormElement | undefined = $state();

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
    if (result === 'W') return 'text-green-400';
    if (result === 'L') return 'text-red-400';
    if (result === 'D') return 'text-yellow-400';
    return 'text-gray-400';
  }

  function getStatusColor(status: string): string {
    const statusStr = status.toString();
    if (statusStr === 'READY') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (statusStr === 'PENDING') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (statusStr === 'UNREADY') return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }

  const totalGames = $derived(team.wins + team.losses);
  const winRate = $derived(totalGames > 0 ? ((team.wins / totalGames) * 100).toFixed(1) : '0.0');

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
            class="w-32 h-32 rounded-lg border-4 border-zinc-700 shadow-2xl object-cover"
          />
        {:else}
          <div
            class="w-32 h-32 rounded-lg border-4 border-zinc-700 shadow-2xl bg-zinc-800 flex items-center justify-center"
          >
            <span class="text-4xl font-black text-zinc-600">
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
          <p class="text-2xl text-gray-400 mb-4">{team.acronym}</p>
        {/if}

        <div class="flex flex-wrap gap-3 justify-center md:justify-start mb-4">
          {#if team.division && team.region}
            <span
              class="px-4 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium border border-blue-500/30"
            >
              {team.division} ({team.region})
            </span>
          {/if}
          {#if team.seasonNum}
            <span
              class="px-4 py-1.5 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium border border-purple-500/30"
            >
              Season {team.seasonNum}
            </span>
          {/if}
          <span
            class="px-4 py-1.5 rounded-full text-sm font-medium border {getStatusColor(
              team.status,
            )}"
          >
            {team.status}
          </span>
        </div>

        <div class="flex flex-wrap gap-6 justify-center md:justify-start text-sm">
          <div>
            <span class="text-gray-400">Record:</span>
            <span class="text-white font-medium ml-2">{team.wins} - {team.losses}</span>
            <span class="text-gray-500 ml-1">({winRate}%)</span>
          </div>
          <div>
            <span class="text-gray-400">Points:</span>
            <span class="text-white font-medium ml-2"
              >{team.pointsScored} - {team.pointsScoredAgainst}</span
            >
          </div>
          <div>
            <span class="text-gray-400">Created:</span>
            <span class="text-white font-medium ml-2">{formatDate(team.createdAt)}</span>
          </div>
        </div>

        {#if data.isAuthenticated && !data.isOnTeam && !data.canManageTeam && team.status !== 'DEAD'}
          <div class="mt-4">
            {#if data.pendingStatus === 0}
              <!-- Steam ID invite: player needs to accept/decline -->
              <p class="text-sm text-emerald-400 mb-2">You have been invited to join this team</p>
              <div class="flex flex-wrap gap-3 justify-center md:justify-start">
                <form
                  method="POST"
                  action="?/acceptInvitation"
                  use:enhance={makeEnhance('acceptInvitation')}
                >
                  <button
                    type="submit"
                    disabled={submittingAction !== null}
                    class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                  >
                    {submittingAction === 'acceptInvitation'
                      ? 'Submitting...'
                      : 'Accept Invitation'}
                  </button>
                </form>
                <form
                  method="POST"
                  action="?/declineInvitation"
                  use:enhance={makeEnhance('declineInvitation')}
                >
                  <button
                    type="submit"
                    disabled={submittingAction !== null}
                    class="px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-700/50 disabled:cursor-not-allowed text-gray-300 font-medium rounded-lg transition-colors"
                  >
                    {submittingAction === 'declineInvitation' ? 'Declining...' : 'Decline'}
                  </button>
                </form>
              </div>
            {:else if data.pendingStatus === 1}
              <!-- Awaiting admin approval -->
              <div class="flex items-center gap-2">
                <span
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 border border-amber-500/30 rounded-lg text-amber-400 text-sm font-medium"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  Pending admin approval
                </span>
                <form
                  method="POST"
                  action="?/declineInvitation"
                  use:enhance={makeEnhance('declineInvitation')}
                >
                  <button
                    type="submit"
                    disabled={submittingAction !== null}
                    class="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 rounded-lg transition-colors"
                  >
                    {submittingAction === 'declineInvitation' ? 'Withdrawing...' : 'Withdraw'}
                  </button>
                </form>
              </div>
            {:else if data.hasPendingRequestElsewhere}
              <!-- Has a pending request for a different team -->
              <p class="text-sm text-amber-400">
                You have a pending join request for another team. Resolve it before joining here.
              </p>
            {:else if !data.rosterLocked}
              <!-- Normal join flow -->
              <a
                href="/teams/{team.id}/join"
                class="inline-block px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-medium rounded-lg transition-colors"
              >
                Join Team
              </a>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </PageHero>

  <!-- Main Content - Two Column Layout -->
  <div class="max-w-7xl mx-auto px-6 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Left Column - Roster -->
      <div class="space-y-6">
        <!-- Current Roster -->
        <div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
          <div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
            <h2 class="text-xl font-bold text-white">
              Current Roster <span class="text-gray-500">({currentRoster.length} / 3)</span>
            </h2>
          </div>

          <div class="p-6">
            <div class="space-y-4">
              {#each currentRoster as player}
                <div
                  class="flex items-center justify-between p-4 bg-zinc-950/50 rounded-lg transition-colors group"
                >
                  <a
                    href="/users/{player.steamId}"
                    class="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity"
                  >
                    <img src={player.avatar} alt={player.name} class="w-12 h-12 rounded" />
                    <div>
                      <div class="flex items-center gap-2">
                        <span
                          class="text-white font-medium group-hover:text-blue-400 transition-colors"
                        >
                          {player.name}
                        </span>
                        {#if player.isLeader}
                          <span
                            class="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded border border-yellow-500/30"
                          >
                            Leader
                          </span>
                        {/if}
                      </div>
                      <div class="text-sm text-gray-400">
                        Joined: {formatDate(player.joinedAt)}
                      </div>
                    </div>
                  </a>

                  <div class="flex items-center gap-2">
                    {#if !player.isPaid}
                      {#if player.steamId === data.currentUserSteamId}
                        <a
                          href="/checkout/{player.steamId}?teamId={data.team.id}"
                          class="px-3 py-1 text-xs font-medium rounded border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                          Payment Required
                        </a>
                      {:else}
                        <span
                          class="px-3 py-1 text-xs font-medium rounded border bg-red-500/10 border-red-500/30 text-red-400"
                        >
                          Payment Required
                        </span>
                      {/if}
                      {#if data.isGlobalAdmin}
                        <button
                          type="button"
                          onclick={() => {
                            markPaidTarget = { steamId: player.steamId, name: player.name };
                            showMarkPaidDialog = true;
                          }}
                          class="px-3 py-1 text-xs font-medium rounded border bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors"
                        >
                          Mark as Paid
                        </button>
                      {/if}
                    {/if}

                    {#if data.canManageTeam && player.permissionLevel !== 2 && player.steamId !== data.currentUserSteamId && (!data.rosterLocked || data.isGlobalAdmin)}
                      <button
                        type="button"
                        onclick={() => {
                          removeTarget = { steamId: player.steamId, name: player.name };
                          showRemoveDialog = true;
                        }}
                        class="px-3 py-1 text-xs font-medium rounded border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        Remove
                      </button>
                    {/if}

                    {#if player.steamId === data.currentUserSteamId && !data.isOwner && !data.rosterLocked}
                      <button
                        type="button"
                        onclick={() => (showLeaveDialog = true)}
                        class="px-3 py-1 text-xs font-medium rounded border bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        Leave Team
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Past Roster -->
        <div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
          <div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
            <h2 class="text-xl font-bold text-white">Past Roster</h2>
          </div>

          <div class="p-6">
            {#if pastRoster.length > 0}
              <div class="space-y-4">
                {#each pastRoster as player}
                  <a
                    href="/users/{player.steamId}"
                    class="flex items-center justify-between p-4 bg-zinc-950/50 rounded-lg hover:bg-zinc-800/50 transition-colors group"
                  >
                    <div class="flex items-center gap-4">
                      <img
                        src={player.avatar}
                        alt={player.name}
                        class="w-12 h-12 rounded opacity-60"
                      />
                      <div>
                        <span
                          class="text-white font-medium group-hover:text-blue-400 transition-colors"
                        >
                          {player.name}
                        </span>
                        <div class="text-sm text-gray-400">
                          {formatDate(player.joinedAt)} - {formatDate(player.leftAt)}
                        </div>
                      </div>
                    </div>
                  </a>
                {/each}
              </div>
            {:else}
              <p class="text-center text-gray-500 py-4">No past players in this team</p>
            {/if}
          </div>
        </div>
      </div>

      <!-- Right Column - Matches -->
      <div class="space-y-6">
        {#if matchesBySeason.length > 0}
          {#each matchesBySeason as seasonData}
            <div
              class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden"
            >
              <div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
                <h2 class="text-xl font-bold text-white">{seasonData.season}</h2>
              </div>

              <div class="p-6">
                <div class="space-y-2">
                  {#each seasonData.matches as match}
                    <a
                      href="/matches/{match.matchId}"
                      class="flex items-center justify-between p-3 bg-zinc-950/50 rounded hover:bg-zinc-800/30 transition-colors group"
                    >
                      <div class="flex items-center gap-4 flex-1">
                        <div class="text-sm font-medium text-gray-400 w-20">
                          {match.week}
                        </div>
                        <div class="flex-1">
                          {#if match.opponent && match.opponentId}
                            <span class="text-white group-hover:text-blue-400 transition-colors">
                              vs {match.opponent}
                            </span>
                          {:else if match.opponent}
                            <span class="text-white group-hover:text-blue-400 transition-colors">
                              vs {match.opponent}
                            </span>
                          {:else}
                            <span class="text-gray-500 italic">{match.score}</span>
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
                          <span class="text-sm text-gray-500 w-20 text-right">
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
            class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden"
          >
            <div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
              <h2 class="text-xl font-bold text-white">Match History</h2>
            </div>

            <div class="p-6">
              <div class="text-center py-8">
                <div class="text-6xl mb-4 opacity-50">🏆</div>
                <p class="text-gray-500 text-lg">No match history yet</p>
                <p class="text-gray-600 text-sm mt-2">
                  This team hasn't participated in any seasons
                </p>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Admin Controls -->
    {#if data.canManageTeam}
      <div
        class="mt-8 bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden"
      >
        <div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
          <h2 class="text-xl font-bold text-white">Team Management</h2>
        </div>

        <div class="p-6 space-y-6">
          <!-- Edit Team Link -->
          <a
            href="/teams/{team.id}/edit"
            class="inline-block px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
          >
            ✏️ Edit Team Settings
          </a>

          <!-- Admin: Change Status -->
          {#if data.isGlobalAdmin}
            <div class="pt-4 border-t border-zinc-800">
              <h3 class="text-lg font-bold text-white mb-4">Change Team Status</h3>
              <form method="POST" action="?/updateStatus" use:enhance class="flex gap-3 items-end">
                <div class="flex-1">
                  <label for="status" class="block text-sm font-medium text-gray-300 mb-2">
                    Team Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={team.status}
                    class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="UNREADY">Unready</option>
                    <option value="PENDING">Pending</option>
                    <option value="READY">Ready</option>
                    <option value="DEAD">Dead</option>
                    <option value="PLACEMENT">Placement</option>
                  </select>
                </div>
                <button
                  type="submit"
                  class="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
                >
                  Update Status
                </button>
              </form>
            </div>

            <div class="pt-4 border-t border-zinc-800">
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
                  <button
                    type="submit"
                    class="px-6 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
                  >
                    Update Division
                  </button>
                </form>
              {:else}
                <p class="text-text-muted text-sm">
                  No divisions available for this team's region.
                </p>
              {/if}
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
