<script lang="ts">
  import { enhance } from '$app/forms';
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import type { TeamManagementData, TeamRosterPlayer } from '$lib/types/team';
  import { teamRoleName } from '$lib/utils/team';
  import Check from '~icons/lucide/check';
  import Lock from '~icons/lucide/lock';

  const DEFAULT_AVATAR = '/default-avatar.png';

  type ManageSection = 'info' | 'roster' | 'pending' | 'invite';

  let {
    teamName,
    teamAcronym,
    teamAvatar,
    teamStatus,
    rosterLocked,
    isOwner,
    isGlobalAdmin,
    isFreeDivision,
    paidPlayerCount,
    playersNeededToPay,
    paymentStepComplete,
    currentUserIsPaid,
    currentUserSteamId,
    unpaidPlayers,
    canToggleReady,
    management,
    submittingAction,
    onReady,
    onRemovePlayer,
    onDisband,
  }: {
    teamName: string;
    teamAcronym: string | null;
    teamAvatar: string | null;
    teamStatus: string;
    rosterLocked: boolean;
    isOwner: boolean;
    isGlobalAdmin: boolean;
    isFreeDivision: boolean;
    paidPlayerCount: number;
    playersNeededToPay: number;
    paymentStepComplete: boolean;
    currentUserIsPaid: boolean;
    currentUserSteamId: string | null;
    unpaidPlayers: TeamRosterPlayer[];
    canToggleReady: boolean;
    management: TeamManagementData;
    submittingAction: string | null;
    onReady: () => void;
    onRemovePlayer: (player: { steamId: string; name: string }) => void;
    onDisband: () => void;
  } = $props();

  let section: ManageSection = $state('info');
  let name = $state('');
  let acronym = $state('');
  let joinPassword = $state('');
  let inviteSteamId = $state('');
  let avatarPreview = $state<string | null>(null);

  $effect(() => {
    name = teamName;
    acronym = teamAcronym ?? '';
    avatarPreview = teamAvatar;
  });

  const inviteLink = $derived(`${page.url.origin}${management.inviteUrl}`);
  const busy = $derived(submittingAction !== null);

  const sections = $derived.by((): { id: ManageSection; label: string }[] => [
    { id: 'info', label: 'Team Info' },
    { id: 'roster', label: `Roster (${management.players.length}/${management.maxRosterSize})` },
    {
      id: 'pending',
      label:
        management.sentInvites.length + management.awaitingAdmin.length > 0
          ? `Pending (${management.sentInvites.length + management.awaitingAdmin.length})`
          : 'Pending',
    },
    { id: 'invite', label: 'Invite Players' },
  ]);

  function handleAvatarChange(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarPreview = typeof e.target?.result === 'string' ? e.target.result : avatarPreview;
    };
    reader.readAsDataURL(file);
  }

  async function copyInviteLink() {
    await navigator.clipboard.writeText(inviteLink);
    toast.success('Invite link copied to clipboard!');
  }
</script>

<div class="space-y-6">
  {#if rosterLocked}
    <div class="rounded-lg border border-warning-500/30 bg-warning-500/10 p-3">
      <p class="flex items-start gap-2 text-sm text-warning-400">
        <Lock class="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>Rosters are locked.</strong>
          {#if isGlobalAdmin}
            You can bypass this restriction as an admin.
          {:else}
            Some team changes are currently disabled.
          {/if}
        </span>
      </p>
    </div>
  {/if}

  {#if teamStatus === 'UNREADY' || teamStatus === 'PENDING'}
    <Card padding="md">
      {#snippet header()}
        <h2 class="text-sm font-semibold text-white">Season ready-up</h2>
      {/snippet}

      {#if teamStatus === 'UNREADY'}
        <div class="space-y-4">
          {#if !isFreeDivision}
            <div
              class="rounded-lg border p-4 {paymentStepComplete
                ? 'border-success-500/30 bg-success-500/5'
                : 'border-warning-500/30 bg-warning-500/5'}"
            >
              <div class="mb-2 flex items-center gap-3">
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white {paymentStepComplete
                    ? 'bg-success-600'
                    : 'bg-warning-600'}"
                >
                  {#if paymentStepComplete}
                    <Check class="size-4" />
                  {:else}
                    1
                  {/if}
                </span>
                <h3 class="text-base font-bold text-white">Pay signup fees</h3>
                <span
                  class="ml-auto text-sm font-medium {paymentStepComplete
                    ? 'text-success-400'
                    : 'text-warning-400'}"
                >
                  {paidPlayerCount}/{playersNeededToPay} paid
                </span>
              </div>
              {#if !paymentStepComplete}
                <div class="ml-10 space-y-3">
                  <div class="h-1.5 w-full rounded-full bg-surface-input">
                    <div
                      class="h-1.5 rounded-full bg-warning-500 transition-all"
                      style:width={`${(playersNeededToPay > 0 ? paidPlayerCount / playersNeededToPay : 0) * 100}%`}
                    ></div>
                  </div>
                  {#each unpaidPlayers as player (player.steamId)}
                    <div class="flex items-center gap-2 text-sm">
                      <span class="size-1.5 rounded-full bg-danger-400"></span>
                      <span class="text-text-body">{player.name}</span>
                      <span class="text-danger-400">— unpaid</span>
                    </div>
                  {/each}
                  {#if currentUserSteamId}
                    <Button variant="warning" href="/checkout/{currentUserSteamId}"
                      >Go to checkout</Button
                    >
                  {/if}
                </div>
              {:else if !currentUserIsPaid && currentUserSteamId}
                <div class="ml-10">
                  <p class="mb-2 text-sm text-text-body">Minimum met, but you haven't paid yet.</p>
                  <Button variant="warning" href="/checkout/{currentUserSteamId}"
                    >Pay signup fee</Button
                  >
                </div>
              {/if}
            </div>
          {/if}

          <div
            class="rounded-lg border p-4 {canToggleReady
              ? 'border-primary-500/30 bg-primary-500/5'
              : 'border-border-default bg-surface-page/30'}"
          >
            <div class="mb-2 flex items-center gap-3">
              <span
                class="flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white {canToggleReady
                  ? 'bg-primary-600'
                  : 'bg-surface-input'}"
              >
                {isFreeDivision ? '1' : '2'}
              </span>
              <h3 class="text-base font-bold {canToggleReady ? 'text-white' : 'text-text-muted'}">
                Ready up
              </h3>
              {#if !canToggleReady && !isFreeDivision}
                <Lock class="size-4 text-text-muted" />
              {/if}
            </div>
            <div class="ml-10">
              {#if canToggleReady}
                <p class="mb-3 text-sm text-text-body">
                  Once ready, an admin will review your team and approve it for the season.
                </p>
                <Button variant="primary" disabled={busy} onclick={onReady}>Ready Up</Button>
              {:else if !isFreeDivision && !paymentStepComplete}
                <p class="text-sm text-text-muted">
                  Available after at least {playersNeededToPay} player{playersNeededToPay === 1
                    ? ''
                    : 's'} have paid their signup fees.
                </p>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="rounded-lg border border-warning-500/30 bg-warning-500/5 p-4">
          <div class="flex items-center gap-2">
            <span class="size-2 animate-pulse rounded-full bg-warning-400"></span>
            <span class="font-semibold text-warning-400">Pending admin approval</span>
          </div>
          <p class="mt-2 text-sm text-text-body">
            Your team has been marked as ready and is awaiting admin review.
          </p>
        </div>
      {/if}
    </Card>
  {/if}

  <Card padding="none" class="overflow-hidden">
    <div
      class="flex gap-1 overflow-x-auto border-b border-border-default px-2"
      role="tablist"
      aria-label="Team management"
    >
      {#each sections as item (item.id)}
        <button
          type="button"
          role="tab"
          aria-selected={section === item.id}
          onclick={() => (section = item.id)}
          class="inline-flex shrink-0 items-center border-b-2 px-4 py-3 text-sm font-medium transition-colors {section ===
          item.id
            ? 'border-primary-500 text-white'
            : 'border-transparent text-text-muted hover:text-text-label'}"
        >
          {item.label}
        </button>
      {/each}
    </div>

    <div class="p-6">
      {#if section === 'info'}
        <div class="space-y-8">
          <form method="POST" action="?/updateInfo" use:enhance>
            <h3 class="mb-4 text-lg font-bold text-white">Team information</h3>
            <FormInput
              label="Team Name"
              name="name"
              bind:value={name}
              maxlength={25}
              required
              disabled={rosterLocked}
            />
            <FormInput
              label="Team Acronym"
              name="acronym"
              bind:value={acronym}
              maxlength={4}
              disabled={rosterLocked}
            />
            <Button type="submit" disabled={busy || rosterLocked}>
              {submittingAction === 'updateInfo' ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>

          <hr class="border-border-default" />

          <form method="POST" action="?/updateAvatar" enctype="multipart/form-data" use:enhance>
            <h3 class="mb-4 text-lg font-bold text-white">Team avatar</h3>
            <div class="flex items-center gap-4">
              {#if avatarPreview}
                <img
                  src={avatarPreview}
                  alt=""
                  class="size-24 rounded-xl border border-border-input object-cover"
                />
              {:else}
                <div
                  class="flex size-24 items-center justify-center rounded-xl border border-border-input bg-surface-input"
                >
                  <span class="text-3xl text-text-muted">{teamName.charAt(0)}</span>
                </div>
              {/if}
              <div class="flex-1">
                <input
                  type="file"
                  name="avatar"
                  accept="image/*"
                  disabled={rosterLocked}
                  onchange={handleAvatarChange}
                  class="block w-full text-sm text-text-body file:mr-4 file:rounded-lg file:border-0 file:bg-surface-input file:px-4 file:py-2 file:text-sm file:font-medium file:text-text-label hover:file:bg-surface-hover disabled:opacity-50"
                />
                <Button type="submit" disabled={busy || rosterLocked} class="mt-2" size="sm">
                  {submittingAction === 'updateAvatar' ? 'Uploading...' : 'Upload Avatar'}
                </Button>
              </div>
            </div>
          </form>

          <hr class="border-border-default" />

          <form method="POST" action="?/updatePassword" use:enhance>
            <h3 class="mb-4 text-lg font-bold text-white">Join password</h3>
            <FormInput
              label="Join Password"
              name="joinPassword"
              bind:value={joinPassword}
              placeholder="Enter a new password to change it"
              disabled={rosterLocked}
              hint="Leave blank to keep your current password."
            />
            <Button type="submit" disabled={busy || rosterLocked}>
              {submittingAction === 'updatePassword' ? 'Saving...' : 'Update Password'}
            </Button>
          </form>

          {#if isOwner || isGlobalAdmin}
            <hr class="border-border-default" />
            <div>
              <h3 class="mb-2 text-lg font-bold text-white">Danger zone</h3>
              <p class="mb-4 text-sm text-text-muted">
                Disbanding marks the team as dead. This cannot be undone.
              </p>
              <Button type="button" variant="danger" onclick={onDisband}>Disband Team</Button>
            </div>
          {/if}
        </div>
      {:else if section === 'roster'}
        {#if management.players.length === 0}
          <p class="py-8 text-center text-sm text-text-muted">No active players</p>
        {:else}
          <div class="space-y-3">
            {#each management.players as player (player.steamId)}
              <div class="flex items-center justify-between gap-3 rounded-lg bg-surface-input p-4">
                <div class="flex min-w-0 items-center gap-3">
                  <img
                    src={player.avatar || DEFAULT_AVATAR}
                    alt=""
                    class="size-12 rounded-lg object-cover"
                  />
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-white">{player.name}</p>
                    <p class="text-sm text-text-body">{teamRoleName(player.permissionLevel)}</p>
                  </div>
                </div>
                {#if player.permissionLevel !== 2 && (!rosterLocked || isGlobalAdmin)}
                  <div class="flex flex-wrap gap-2">
                    {#if player.permissionLevel === 0}
                      <form method="POST" action="?/promotePlayer" use:enhance>
                        <input type="hidden" name="playerSteamId" value={player.steamId} />
                        <Button type="submit" variant="ghost" size="sm" disabled={busy}
                          >Promote</Button
                        >
                      </form>
                    {:else if player.permissionLevel === 1}
                      <form method="POST" action="?/demotePlayer" use:enhance>
                        <input type="hidden" name="playerSteamId" value={player.steamId} />
                        <Button type="submit" variant="warning" size="sm" disabled={busy}
                          >Demote</Button
                        >
                      </form>
                    {/if}
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy}
                      onclick={() => onRemovePlayer({ steamId: player.steamId, name: player.name })}
                    >
                      Remove
                    </Button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {:else if section === 'pending'}
        <div class="space-y-8">
          <div>
            <h3 class="mb-4 text-lg font-bold text-white">Sent invitations</h3>
            {#if management.sentInvites.length === 0}
              <p class="py-8 text-center text-sm text-text-muted">No pending invitations</p>
            {:else}
              <div class="space-y-3">
                {#each management.sentInvites as invite (invite.steamId)}
                  <div
                    class="flex items-center justify-between gap-3 rounded-lg bg-surface-input p-4"
                  >
                    <div class="flex min-w-0 items-center gap-3">
                      <img
                        src={invite.avatar || DEFAULT_AVATAR}
                        alt=""
                        class="size-12 rounded-lg object-cover"
                      />
                      <div>
                        <p class="font-semibold text-white">{invite.name}</p>
                        <p class="text-sm text-text-body">Awaiting player response</p>
                      </div>
                    </div>
                    <form method="POST" action="?/cancelInvite" use:enhance>
                      <input type="hidden" name="playerSteamId" value={invite.steamId} />
                      <Button type="submit" variant="secondary" size="sm" disabled={busy}
                        >Cancel</Button
                      >
                    </form>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          {#if management.awaitingAdmin.length > 0}
            <div>
              <h3 class="mb-4 text-lg font-bold text-white">Awaiting admin approval</h3>
              <div class="space-y-3">
                {#each management.awaitingAdmin as invite (invite.steamId)}
                  <div
                    class="flex items-center justify-between gap-3 rounded-lg bg-surface-input p-4"
                  >
                    <div class="flex min-w-0 items-center gap-3">
                      <img
                        src={invite.avatar || DEFAULT_AVATAR}
                        alt=""
                        class="size-12 rounded-lg object-cover"
                      />
                      <div>
                        <p class="font-semibold text-white">{invite.name}</p>
                        <span
                          class="mt-1 inline-flex items-center gap-1.5 rounded border border-warning-500/30 bg-warning-500/15 px-2 py-0.5 text-xs font-medium text-warning-400"
                        >
                          <span class="size-1.5 animate-pulse rounded-full bg-warning-400"></span>
                          Pending admin approval
                        </span>
                      </div>
                    </div>
                    <form method="POST" action="?/cancelInvite" use:enhance>
                      <input type="hidden" name="playerSteamId" value={invite.steamId} />
                      <Button type="submit" variant="secondary" size="sm" disabled={busy}
                        >Cancel</Button
                      >
                    </form>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="space-y-8">
          <div>
            <h3 class="mb-2 text-lg font-bold text-white">Share invite link</h3>
            <p class="mb-3 text-sm text-text-body">
              Share this link with players to invite them to your team. The link expires after 1
              hour.
            </p>
            <div class="flex gap-2">
              <input
                type="text"
                readonly
                value={inviteLink}
                class="flex-1 rounded-lg border border-border-input bg-surface-input px-4 py-3 text-text-body"
              />
              <Button type="button" onclick={copyInviteLink}>Copy Link</Button>
            </div>
          </div>

          <hr class="border-border-default" />

          <form
            method="POST"
            action="?/invitePlayer"
            use:enhance={() => {
              return async ({ update, result }) => {
                await update();
                if (result.type === 'success') inviteSteamId = '';
              };
            }}
          >
            <h3 class="mb-4 text-lg font-bold text-white">Invite by Steam ID</h3>
            <FormInput
              label="Steam ID (64-bit)"
              name="steamId"
              bind:value={inviteSteamId}
              placeholder="76561198012345678"
              disabled={rosterLocked}
            />
            <Button type="submit" disabled={busy || rosterLocked}>
              {submittingAction === 'invitePlayer' ? 'Inviting...' : 'Send Invitation'}
            </Button>
          </form>
        </div>
      {/if}
    </div>
  </Card>
</div>
