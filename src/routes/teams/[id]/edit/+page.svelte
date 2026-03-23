<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from '$lib/state/toast.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let activeTab: 'info' | 'roster' | 'pending' | 'invite' = $state('info');
  let isSubmitting = $state(false);
  let showDisbandConfirm = $state(false);
  let removePlayerTarget: { steamId: string; name: string } | null = $state(null);
  let removePlayerFormEl: HTMLFormElement | null = $state(null);
  let avatarPreview: string | null = $state(null);
  let lastFormResult: ActionData = null;

  $effect(() => {
    avatarPreview = data.team.avatar;
    showDisbandConfirm = false;
  });

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

  function getRoleName(level: number): string {
    if (level === 2) return 'Owner';
    if (level === 1) return 'Admin';
    return 'Member';
  }

  let activePlayers = $derived(data.players.filter((p) => p.active === 1));

  function handleAvatarChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        avatarPreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  async function copyInviteLink() {
    const fullUrl = `${window.location.origin}${data.inviteUrl}`;
    await navigator.clipboard.writeText(fullUrl);
    toast.success('Invite link copied to clipboard!');
  }
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
  <div class="max-w-5xl mx-auto">
    <div class="mb-8">
      <a
        href="/teams/{data.team.id}"
        class="inline-flex items-center text-text-body hover:text-white mb-4 transition-colors"
      >
        ← Back to Team Page
      </a>
      <div class="flex items-center gap-4 mb-2">
        {#if avatarPreview}
          <img src={avatarPreview} alt={data.team.name} class="w-16 h-16 rounded-lg object-cover" />
        {:else}
          <div
            class="w-16 h-16 rounded-lg bg-surface-input flex items-center justify-center border border-border-input"
          >
            <span class="text-2xl text-text-body">{data.team.name.charAt(0)}</span>
          </div>
        {/if}
        <div>
          <h1 class="text-4xl font-bold text-white">Edit {data.team.name}</h1>
          <p class="text-text-body">Manage your team settings and roster</p>
        </div>
      </div>
      {#if data.rosterLocked}
        <div class="mt-4 p-3 bg-warning-500/20 border border-warning-500/50 rounded-lg">
          <p class="text-warning-400 text-sm">
            🔒 <strong>Rosters are locked.</strong>
            {#if data.isGlobalAdmin}
              You can bypass this restriction as an admin.
            {:else}
              Some team changes are currently disabled.
            {/if}
          </p>
        </div>
      {/if}

      {#if data.isGlobalAdmin && !data.isOwner}
        <div class="mt-4 p-3 bg-info-500/20 border border-info-500/50 rounded-lg">
          <p class="text-info-400 text-sm">
            👑 <strong>Admin Mode:</strong> You have full access to manage this team as a global administrator.
          </p>
        </div>
      {/if}
    </div>

    <Card padding="none">
      <div class="border-b border-border-default p-1 flex gap-1">
        <button
          onclick={() => (activeTab = 'info')}
          class="flex-1 px-4 py-3 rounded-md transition-colors {activeTab === 'info'
            ? 'bg-primary-600 text-white font-medium'
            : 'text-text-body hover:text-white hover:bg-surface-hover'}"
        >
          Team Info
        </button>
        <button
          onclick={() => (activeTab = 'roster')}
          class="flex-1 px-4 py-3 rounded-md transition-colors {activeTab === 'roster'
            ? 'bg-primary-600 text-white font-medium'
            : 'text-text-body hover:text-white hover:bg-surface-hover'}"
        >
          Roster ({activePlayers.length}/3)
        </button>
        <button
          onclick={() => (activeTab = 'pending')}
          class="flex-1 px-4 py-3 rounded-md transition-colors {activeTab === 'pending'
            ? 'bg-primary-600 text-white font-medium'
            : 'text-text-body hover:text-white hover:bg-surface-hover'}"
        >
          Pending {#if data.sentInvites.length + data.awaitingAdmin.length > 0}({data.sentInvites
              .length + data.awaitingAdmin.length}){/if}
        </button>
        <button
          onclick={() => (activeTab = 'invite')}
          class="flex-1 px-4 py-3 rounded-md transition-colors {activeTab === 'invite'
            ? 'bg-primary-600 text-white font-medium'
            : 'text-text-body hover:text-white hover:bg-surface-hover'}"
        >
          Invite Players
        </button>
      </div>

      <div class="p-6">
        {#if activeTab === 'info'}
          <div class="space-y-6">
            <form
              method="POST"
              action="?/updateInfo"
              use:enhance={() => {
                isSubmitting = true;
                return async ({ update }) => {
                  await update();
                  isSubmitting = false;
                };
              }}
            >
              <h3 class="text-xl font-bold text-white mb-4">Team Information</h3>
              <div class="space-y-4">
                <div>
                  <label for="name" class="block text-sm font-medium text-text-label mb-2">
                    Team Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={data.team.name}
                    maxlength="25"
                    disabled={data.rosterLocked}
                    class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white disabled:opacity-50 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label for="acronym" class="block text-sm font-medium text-text-label mb-2">
                    Team Acronym
                  </label>
                  <input
                    type="text"
                    id="acronym"
                    name="acronym"
                    value={data.team.acronym || ''}
                    maxlength="4"
                    disabled={data.rosterLocked}
                    class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white disabled:opacity-50 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <Button type="submit" disabled={isSubmitting || data.rosterLocked}>
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>

            <hr class="border-border-default" />

            <form
              method="POST"
              action="?/updateAvatar"
              enctype="multipart/form-data"
              use:enhance={() => {
                isSubmitting = true;
                return async ({ update }) => {
                  await update();
                  isSubmitting = false;
                };
              }}
            >
              <h3 class="text-xl font-bold text-white mb-4">Team Avatar</h3>
              <div class="flex items-center gap-4">
                {#if avatarPreview}
                  <img
                    src={avatarPreview}
                    alt="Avatar"
                    class="w-24 h-24 rounded-lg object-cover border border-border-input"
                  />
                {:else}
                  <div
                    class="w-24 h-24 rounded-lg bg-surface-input border border-border-input flex items-center justify-center"
                  >
                    <span class="text-3xl text-text-muted">?</span>
                  </div>
                {/if}
                <div class="flex-1">
                  <input
                    type="file"
                    name="avatar"
                    accept="image/*"
                    disabled={data.rosterLocked}
                    onchange={handleAvatarChange}
                    class="block w-full text-sm text-text-body file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-surface-input file:text-text-label hover:file:bg-surface-hover disabled:opacity-50"
                  />
                  <Button
                    type="submit"
                    disabled={isSubmitting || data.rosterLocked}
                    class="mt-2"
                    size="sm"
                  >
                    {isSubmitting ? 'Uploading...' : 'Upload Avatar'}
                  </Button>
                </div>
              </div>
            </form>

            <hr class="border-border-default" />

            <form
              method="POST"
              action="?/updatePassword"
              use:enhance={() => {
                isSubmitting = true;
                return async ({ update }) => {
                  await update();
                  isSubmitting = false;
                };
              }}
            >
              <h3 class="text-xl font-bold text-white mb-4">Join Password</h3>
              <div class="space-y-4">
                <input
                  type="text"
                  name="joinPassword"
                  disabled={data.rosterLocked}
                  placeholder="Enter a new password to change it"
                  class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white disabled:opacity-50 focus:outline-none focus:border-primary-500"
                />
                <p class="text-xs text-text-muted">Leave blank to keep your current password.</p>
                <Button type="submit" disabled={isSubmitting || data.rosterLocked}>
                  {isSubmitting ? 'Saving...' : 'Update Password'}
                </Button>
              </div>
            </form>

            {#if data.isOwner || data.isGlobalAdmin}
              <hr class="border-border-default" />

              <div>
                <h3 class="text-xl font-bold text-white mb-4">Danger Zone</h3>
                {#if !showDisbandConfirm}
                  <Button
                    type="button"
                    variant="danger"
                    onclick={() => (showDisbandConfirm = true)}
                  >
                    Disband Team
                  </Button>
                  {#if data.isGlobalAdmin && !data.isOwner}
                    <p class="text-xs text-text-muted mt-2">
                      Admin privilege: You can disband any team
                    </p>
                  {/if}
                {:else}
                  <div class="p-4 bg-danger-500/10 border border-danger-500/50 rounded-lg">
                    <p class="text-danger-400 mb-4">
                      Are you sure? This action cannot be undone. The team will be marked as
                      disbanded.
                      {#if data.isGlobalAdmin && !data.isOwner}
                        <br /><strong>Admin action:</strong> This team does not belong to you.
                      {/if}
                    </p>
                    <div class="flex gap-3">
                      <form method="POST" action="?/disbandTeam" use:enhance>
                        <Button type="submit" variant="danger">Yes, Disband Team</Button>
                      </form>
                      <Button
                        type="button"
                        variant="secondary"
                        onclick={() => (showDisbandConfirm = false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {:else if activeTab === 'roster'}
          <div>
            <h3 class="text-xl font-bold text-white mb-4">Current Roster</h3>
            {#if activePlayers.length === 0}
              <p class="text-text-body text-center py-8">No active players</p>
            {:else}
              <div class="space-y-3">
                {#each activePlayers as player}
                  <div class="flex items-center justify-between p-4 bg-surface-input rounded-lg">
                    <div class="flex items-center gap-3">
                      <img
                        src={player.player.steamAvatar}
                        alt={player.player.steamUsername}
                        class="w-12 h-12 rounded-full"
                      />
                      <div>
                        <div class="font-semibold text-white">{player.player.steamUsername}</div>
                        <div class="text-sm text-text-body">
                          {getRoleName(player.permissionLevel)}
                        </div>
                      </div>
                    </div>
                    {#if player.permissionLevel !== 2 && (!data.rosterLocked || data.isGlobalAdmin)}
                      <div class="flex gap-2">
                        {#if player.permissionLevel === 0}
                          <form method="POST" action="?/promotePlayer" use:enhance>
                            <input
                              type="hidden"
                              name="playerSteamId"
                              value={player.playerSteamId}
                            />
                            <button
                              type="submit"
                              class="px-3 py-1.5 text-sm bg-info-500/20 text-info-400 hover:bg-info-500/30 rounded transition-colors"
                            >
                              Promote
                            </button>
                          </form>
                        {:else if player.permissionLevel === 1}
                          <form method="POST" action="?/demotePlayer" use:enhance>
                            <input
                              type="hidden"
                              name="playerSteamId"
                              value={player.playerSteamId}
                            />
                            <button
                              type="submit"
                              class="px-3 py-1.5 text-sm bg-warning-500/20 text-warning-400 hover:bg-warning-500/30 rounded transition-colors"
                            >
                              Demote
                            </button>
                          </form>
                        {/if}
                        <button
                          type="button"
                          onclick={() => {
                            removePlayerTarget = {
                              steamId: player.playerSteamId,
                              name: player.player.steamUsername,
                            };
                          }}
                          class="px-3 py-1.5 text-sm bg-danger-500/20 text-danger-400 hover:bg-danger-500/30 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {:else if activeTab === 'pending'}
          <div class="space-y-6">
            <div>
              <h3 class="text-xl font-bold text-white mb-4">Sent Invitations</h3>
              {#if data.sentInvites.length === 0}
                <p class="text-text-body text-center py-8">No pending invitations</p>
              {:else}
                <div class="space-y-3">
                  {#each data.sentInvites as pending}
                    <div class="flex items-center justify-between p-4 bg-surface-input rounded-lg">
                      <div class="flex items-center gap-3">
                        <img
                          src={pending.player.steamAvatar}
                          alt={pending.player.steamUsername}
                          class="w-12 h-12 rounded-full"
                        />
                        <div>
                          <div class="font-semibold text-white">{pending.player.steamUsername}</div>
                          <div class="text-sm text-text-body">Awaiting player response</div>
                        </div>
                      </div>
                      <form method="POST" action="?/cancelInvite" use:enhance>
                        <input type="hidden" name="playerSteamId" value={pending.playerSteamId} />
                        <Button type="submit" variant="secondary" size="sm">Cancel</Button>
                      </form>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            {#if data.awaitingAdmin.length > 0}
              <div>
                <h3 class="text-xl font-bold text-white mb-4">Awaiting Admin Approval</h3>
                <div class="space-y-3">
                  {#each data.awaitingAdmin as pending}
                    <div class="flex items-center justify-between p-4 bg-surface-input rounded-lg">
                      <div class="flex items-center gap-3">
                        <img
                          src={pending.player.steamAvatar}
                          alt={pending.player.steamUsername}
                          class="w-12 h-12 rounded-full"
                        />
                        <div>
                          <div class="font-semibold text-white">{pending.player.steamUsername}</div>
                          <span
                            class="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 bg-warning-500/15 border border-warning-500/30 rounded text-warning-400 text-xs font-medium"
                          >
                            <span class="w-1.5 h-1.5 rounded-full bg-warning-400 animate-pulse"
                            ></span>
                            Pending admin approval
                          </span>
                        </div>
                      </div>
                      <form method="POST" action="?/cancelInvite" use:enhance>
                        <input type="hidden" name="playerSteamId" value={pending.playerSteamId} />
                        <Button type="submit" variant="secondary" size="sm">Cancel</Button>
                      </form>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {:else if activeTab === 'invite'}
          <div class="space-y-6">
            <div>
              <h3 class="text-xl font-bold text-white mb-4">Share Invite Link</h3>
              <p class="text-text-body text-sm mb-3">
                Share this link with players to invite them to your team. The link expires after 7
                days.
              </p>
              <div class="flex gap-2">
                <input
                  type="text"
                  readonly
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}${data.inviteUrl}`}
                  class="flex-1 px-4 py-3 bg-surface-input border border-border-input rounded-lg text-text-body"
                />
                <Button type="button" onclick={copyInviteLink}>Copy Link</Button>
              </div>
            </div>

            <hr class="border-border-default" />

            <form
              method="POST"
              action="?/invitePlayer"
              use:enhance={() => {
                isSubmitting = true;
                return async ({ update, result }) => {
                  await update();
                  isSubmitting = false;
                  if (result.type === 'success') {
                    const form = document.querySelector(
                      'input[name="steamId"]',
                    ) as HTMLInputElement;
                    if (form) form.value = '';
                  }
                };
              }}
            >
              <h3 class="text-xl font-bold text-white mb-4">Invite by Steam ID</h3>
              <div class="space-y-4">
                <div>
                  <label for="steamId" class="block text-sm font-medium text-text-label mb-2">
                    Steam ID (64-bit)
                  </label>
                  <input
                    type="text"
                    id="steamId"
                    name="steamId"
                    placeholder="76561198012345678"
                    disabled={data.rosterLocked}
                    class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white disabled:opacity-50 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <Button type="submit" disabled={isSubmitting || data.rosterLocked}>
                  {isSubmitting ? 'Inviting...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </div>
        {/if}
      </div>
    </Card>
  </div>
</div>

<form
  method="POST"
  action="?/removePlayer"
  use:enhance
  bind:this={removePlayerFormEl}
  class="hidden"
>
  <input type="hidden" name="playerSteamId" value={removePlayerTarget?.steamId ?? ''} />
</form>

<ConfirmDialog
  open={removePlayerTarget !== null}
  title="Remove Player"
  description="Remove {removePlayerTarget?.name ?? ''} from the team? This action cannot be undone."
  confirmLabel="Remove"
  variant="danger"
  onConfirm={() => {
    removePlayerFormEl?.requestSubmit();
    removePlayerTarget = null;
  }}
  onCancel={() => (removePlayerTarget = null)}
/>
