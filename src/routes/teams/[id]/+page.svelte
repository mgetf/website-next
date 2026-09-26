<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import TeamAdminPanel from '$lib/components/team/TeamAdminPanel.svelte';
  import TeamManagementPanel from '$lib/components/team/TeamManagementPanel.svelte';
  import TeamOverviewPanel from '$lib/components/team/TeamOverviewPanel.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import FormatIcon from '$lib/components/ui/FormatIcon.svelte';
  import SeasonScope from '$lib/components/ui/SeasonScope.svelte';
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import type { TeamPageTab } from '$lib/types/team';
  import { statusColor, statusLabel } from '$lib/utils/profile';
  import { parseTeamTab } from '$lib/utils/team';
  import { hasMetPaidPlayerRequirement, paidPlayersNeeded } from '$lib/utils/rosterPayments';
  import Settings from '~icons/lucide/settings';
  import TriangleAlert from '~icons/lucide/triangle-alert';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const team = $derived(data.team);
  const currentRoster = $derived(data.currentRoster);
  const pastRoster = $derived(data.pastRoster);
  const matchesBySeason = $derived(data.matchesBySeason);
  const canManage = $derived(data.canManageTeam);
  const tab = $derived(parseTeamTab(page.url.searchParams.get('tab'), canManage));
  const teamPath = $derived(resolve('/teams/[id]', { id: String(team.id) }));

  let lastFormResult: ActionData = null;
  let submittingAction = $state<string | null>(null);
  let showLeaveDialog = $state(false);
  let showRemoveDialog = $state(false);
  let removeTarget: { steamId: string; name: string } | null = $state(null);
  let showMarkPaidDialog = $state(false);
  let markPaidTarget: { steamId: string; name: string } | null = $state(null);
  let showUnmarkPaidDialog = $state(false);
  let unmarkPaidTarget: { steamId: string; name: string } | null = $state(null);
  let showReadyDialog = $state(false);
  let showDisbandDialog = $state(false);

  let leaveFormEl: HTMLFormElement | undefined = $state();
  let removeFormEl: HTMLFormElement | undefined = $state();
  let markPaidFormEl: HTMLFormElement | undefined = $state();
  let unmarkPaidFormEl: HTMLFormElement | undefined = $state();
  let readyFormEl: HTMLFormElement | undefined = $state();
  let disbandFormEl: HTMLFormElement | undefined = $state();

  const tabs = $derived.by(() => {
    const items: { id: TeamPageTab; label: string }[] = [{ id: 'overview', label: 'Overview' }];
    if (canManage) items.push({ id: 'management', label: 'Management' });
    return items;
  });

  const canToggleReady = $derived(
    data.canManageTeam &&
      team.status === 'UNREADY' &&
      (data.isFreeDivision ||
        hasMetPaidPlayerRequirement(
          data.paidPlayerCount,
          data.requiredPaidPlayers,
          currentRoster.length,
        )),
  );

  const hasUnpaidPlayers = $derived(!data.isFreeDivision && currentRoster.some((p) => !p.isPaid));
  const unpaidPlayers = $derived(currentRoster.filter((p) => !p.isPaid));
  const paidPlayers = $derived(currentRoster.filter((p) => p.paymentStatus === 1));
  const currentUserIsPaid = $derived(
    currentRoster.find((p) => p.steamId === data.currentUserSteamId)?.isPaid ?? true,
  );
  const paymentStepComplete = $derived(
    data.isFreeDivision ||
      hasMetPaidPlayerRequirement(
        data.paidPlayerCount,
        data.requiredPaidPlayers,
        currentRoster.length,
      ),
  );
  const playersNeededToPay = $derived(
    paidPlayersNeeded(data.requiredPaidPlayers, currentRoster.length),
  );

  $effect(() => {
    const payment = page.url.searchParams.get('payment');
    const signup = page.url.searchParams.get('signup');
    const joined = page.url.searchParams.get('joined');
    const disbanded = page.url.searchParams.get('disbanded');
    if (payment === 'success') {
      toast.success('Payment Successful! Your signup fee has been paid. Thank you!');
      void goto(teamPath, { replaceState: true });
    } else if (signup) {
      toast.success('Team created successfully! Your registration is complete.');
      void goto(teamPath, { replaceState: true });
    } else if (joined === 'awaiting-admin') {
      toast.success('Join request submitted! An admin will review it shortly.');
      void goto(teamPath, { replaceState: true });
    } else if (disbanded === '1') {
      toast.success('Team has been disbanded.');
      void goto(teamPath, { replaceState: true });
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
      showUnmarkPaidDialog = false;
      unmarkPaidTarget = null;
      showReadyDialog = false;
      showDisbandDialog = false;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error) {
        toast.error(form.error);
      }
    }
  });

  function tabHref(next: TeamPageTab): string {
    const params = new URLSearchParams(page.url.searchParams);
    if (next === 'overview') params.delete('tab');
    else params.set('tab', next);
    const search = params.toString();
    return search ? `${teamPath}?${search}` : teamPath;
  }

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
</script>

<svelte:head>
  <title>{team.name} | MGE.tf</title>
</svelte:head>

<header class="border-b border-border-default bg-surface-page/80">
  <div class="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center">
    {#if team.avatar}
      <img
        src={team.avatar}
        alt=""
        class="size-24 shrink-0 rounded-xl border-2 border-border-input object-cover shadow-lg"
      />
    {:else}
      <div
        class="flex size-24 shrink-0 items-center justify-center rounded-xl border-2 border-border-input bg-surface-input shadow-lg"
      >
        <span class="text-3xl font-black text-text-muted">{team.name.charAt(0)}</span>
      </div>
    {/if}

    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1
          class="flex items-center gap-2 text-3xl font-black tracking-tight text-white sm:text-4xl"
        >
          {#if team.formatIconUrl}
            <Tooltip text={team.formatName}>
              <FormatIcon name={team.formatName} src={team.formatIconUrl} size="lg" />
            </Tooltip>
          {/if}
          {team.name}
        </h1>
        {#if team.acronym}
          <span class="text-lg font-semibold text-text-muted">{team.acronym}</span>
        {/if}
      </div>

      <div class="mt-2 flex flex-wrap items-center gap-2">
        <SeasonScope region={team.region} seasonNum={team.seasonNum} division={team.division} />
        <Badge color={statusColor(team.status)} tooltip={getStatusTooltip(team.status)}>
          {statusLabel(team.status)}
        </Badge>
      </div>
    </div>

    <div class="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
      {#if canToggleReady}
        <Button
          variant="primary"
          size="sm"
          disabled={submittingAction !== null}
          onclick={() => (showReadyDialog = true)}
        >
          Ready Up
        </Button>
      {/if}

      {#if data.isAuthenticated && !data.isOnTeam && !data.canManageTeam && team.status !== 'DEAD'}
        {#if data.pendingStatus === 0}
          <p class="text-sm text-success-400">You have been invited to join this team</p>
          <div class="flex flex-wrap gap-2 lg:justify-end">
            <form
              method="POST"
              action="?/acceptInvitation"
              use:enhance={makeEnhance('acceptInvitation')}
            >
              <Button
                type="submit"
                variant="success"
                size="sm"
                disabled={submittingAction !== null}
              >
                {submittingAction === 'acceptInvitation' ? 'Submitting...' : 'Accept Invitation'}
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
                size="sm"
                disabled={submittingAction !== null}
              >
                {submittingAction === 'declineInvitation' ? 'Declining...' : 'Decline'}
              </Button>
            </form>
          </div>
        {:else if data.pendingStatus === 1}
          <div class="flex flex-wrap items-center gap-2 lg:justify-end">
            <span
              class="inline-flex items-center gap-1.5 rounded-lg border border-warning-500/30 bg-warning-500/15 px-3 py-1.5 text-sm font-medium text-warning-400"
            >
              <span class="size-1.5 animate-pulse rounded-full bg-warning-400"></span>
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
          <Button href="/teams/{team.id}/join" variant="primary" size="sm">Join Team</Button>
        {/if}
      {/if}
    </div>
  </div>
</header>

<div class="border-b border-border-default bg-surface-page">
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <div class="flex gap-1" role="tablist" aria-label="Team sections">
      {#each tabs as item (item.id)}
        <a
          href={tabHref(item.id)}
          role="tab"
          id="tab-{item.id}"
          aria-selected={tab === item.id}
          aria-controls="panel-{item.id}"
          data-sveltekit-noscroll
          class="inline-flex items-center border-b-2 px-4 py-3 text-sm font-medium transition-colors {tab ===
          item.id
            ? 'border-primary-500 text-white'
            : 'border-transparent text-text-muted hover:text-text-label'}"
        >
          {item.label}
        </a>
      {/each}
    </div>
  </div>
</div>

<div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
  {#if data.isOnTeam && hasUnpaidPlayers && (!paymentStepComplete || !currentUserIsPaid) && team.status !== 'DEAD'}
    <div
      class="mb-6 flex flex-col items-start gap-4 rounded-lg border border-warning-500/30 bg-warning-500/5 p-5 sm:flex-row sm:items-center"
    >
      <div class="flex flex-1 items-start gap-3">
        <TriangleAlert class="mt-0.5 size-6 shrink-0 text-warning-400" />
        <div>
          {#if !currentUserIsPaid && paymentStepComplete}
            <h3 class="text-lg font-bold text-white">Signup fee unpaid</h3>
            <p class="mt-1 text-sm text-text-body">
              You haven't paid your signup fee yet. The team can ready up, but your payment is still
              required.
            </p>
          {:else if !currentUserIsPaid}
            <h3 class="text-lg font-bold text-white">Payment required</h3>
            <p class="mt-1 text-sm text-text-body">
              You need to pay your signup fee before the team can ready up.
              <span class="font-medium text-warning-400">
                ({data.paidPlayerCount}/{playersNeededToPay} paid)
              </span>
            </p>
          {:else}
            <h3 class="text-lg font-bold text-white">Payment required</h3>
            <p class="mt-1 text-sm text-text-body">
              {unpaidPlayers.length} teammate{unpaidPlayers.length !== 1 ? 's' : ''} still need{unpaidPlayers.length ===
              1
                ? 's'
                : ''} to pay before the team can ready up.
              <span class="font-medium text-warning-400">
                ({data.paidPlayerCount}/{playersNeededToPay} paid)
              </span>
            </p>
          {/if}
        </div>
      </div>
      {#if data.currentUserSteamId}
        <Button variant="warning" href="/checkout/{data.currentUserSteamId}">
          {!currentUserIsPaid ? 'Pay Signup Fee' : 'View Checkout'}
        </Button>
      {/if}
    </div>
  {/if}

  {#if tab === 'management' && data.management}
    <div id="panel-management" role="tabpanel" aria-labelledby="tab-management">
      <TeamManagementPanel
        teamName={team.name}
        teamAcronym={team.acronym}
        teamAvatar={team.avatar}
        teamStatus={team.status}
        rosterLocked={data.rosterLocked}
        isOwner={data.isOwner}
        isGlobalAdmin={data.isGlobalAdmin}
        isFreeDivision={data.isFreeDivision}
        paidPlayerCount={data.paidPlayerCount}
        {playersNeededToPay}
        {paymentStepComplete}
        {currentUserIsPaid}
        currentUserSteamId={data.currentUserSteamId}
        {unpaidPlayers}
        {canToggleReady}
        management={data.management}
        {submittingAction}
        onReady={() => (showReadyDialog = true)}
        onRemovePlayer={(player) => {
          removeTarget = player;
          showRemoveDialog = true;
        }}
        onDisband={() => (showDisbandDialog = true)}
      />
    </div>
  {:else}
    <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview">
      <TeamOverviewPanel
        teamName={team.name}
        teamAvatar={team.avatar}
        {currentRoster}
        {pastRoster}
        {matchesBySeason}
        achievements={data.achievements}
        maxRosterSize={team.maxRosterSize}
        showPaymentBadges={(data.isOnTeam || canManage) && !data.isFreeDivision}
        currentUserSteamId={data.currentUserSteamId}
        canLeave={data.isOnTeam && !data.isOwner && !data.rosterLocked}
        onLeaveTeam={() => (showLeaveDialog = true)}
      />
    </div>
  {/if}

  {#if data.isGlobalAdmin}
    <div class="mt-6">
      <TeamAdminPanel
        teamStatus={team.status}
        divisionId={team.divisionId}
        divisions={data.divisions}
        isFreeDivision={data.isFreeDivision}
        {unpaidPlayers}
        {paidPlayers}
        busy={submittingAction !== null}
        onMarkPaid={(player) => {
          markPaidTarget = player;
          showMarkPaidDialog = true;
        }}
        onUnmarkPaid={(player) => {
          unmarkPaidTarget = player;
          showUnmarkPaidDialog = true;
        }}
      />
    </div>
  {/if}
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
  bind:this={unmarkPaidFormEl}
  method="POST"
  action="?/unmarkPlayerPaid"
  use:enhance={makeEnhance('unmarkPlayerPaid')}
  class="hidden"
>
  <input type="hidden" name="playerSteamId" value={unmarkPaidTarget?.steamId ?? ''} />
</form>

<form
  bind:this={readyFormEl}
  method="POST"
  action="?/toggleReady"
  use:enhance={makeEnhance('toggleReady')}
  class="hidden"
></form>

<form
  bind:this={disbandFormEl}
  method="POST"
  action="?/disbandTeam"
  use:enhance={makeEnhance('disbandTeam')}
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
  open={showUnmarkPaidDialog}
  title="Mark Player as Unpaid"
  description="Mark {unmarkPaidTarget?.name ??
    'this player'} as unpaid? They will need to pay the signup fee again. PayPal and item payments are not refunded."
  confirmLabel="Mark as Unpaid"
  loadingLabel="Saving..."
  variant="danger"
  isLoading={submittingAction === 'unmarkPlayerPaid'}
  onConfirm={() => unmarkPaidFormEl?.requestSubmit()}
  onCancel={() => {
    showUnmarkPaidDialog = false;
    unmarkPaidTarget = null;
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

<ConfirmDialog
  open={showDisbandDialog}
  title="Disband Team"
  description="Disband {team.name}? This action cannot be undone. The team will be marked as disbanded."
  confirmLabel="Disband Team"
  loadingLabel="Disbanding..."
  variant="danger"
  isLoading={submittingAction === 'disbandTeam'}
  onConfirm={() => disbandFormEl?.requestSubmit()}
  onCancel={() => (showDisbandDialog = false)}
/>
