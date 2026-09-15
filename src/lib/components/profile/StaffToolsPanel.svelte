<script lang="ts">
  import { enhance } from '$app/forms';
  import DiscordIcon from '$lib/components/icons/DiscordIcon.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import X from '~icons/lucide/x';

  interface StaffToolsPlayer {
    steamId: string;
    name: string;
    avatar: string | null;
    discordLinked: boolean;
    discordUsername: string | null;
    permissionLevel: string;
    banStatus: string;
    nameOverride: number;
    avatarOverride: number;
  }

  let {
    open = $bindable(false),
    player,
  }: {
    open: boolean;
    player: StaffToolsPlayer;
  } = $props();

  const isStaffPlayer = $derived(
    player.permissionLevel === 'MODERATOR' || player.permissionLevel === 'ADMIN',
  );
  const currentBanLabel = $derived(
    player.banStatus === 'WARNING'
      ? 'Warning'
      : player.banStatus === 'SUSPENDED'
        ? 'Suspended'
        : player.banStatus === 'BANNED'
          ? 'Banned'
          : 'Clean',
  );

  let editNameValue = $state('');
  let editAvatarValue = $state('');
  let punishSeverity = $state('');
  let punishDuration = $state('');
  let punishReason = $state('');
  let linkDiscordId = $state('');
  let linkDiscordError = $state('');
  let confirmUnlink = $state(false);
  let submitting = $state(false);

  $effect(() => {
    if (!open) return;
    editNameValue = player.nameOverride === 1 ? player.name : '';
    editAvatarValue = player.avatarOverride === 1 ? (player.avatar ?? '') : '';
  });

  function actionError(result: { type: string; data?: unknown }, fallback: string): string {
    if (result.type !== 'failure') return fallback;
    const data = result.data as { error?: string } | undefined;
    return data?.error || fallback;
  }

  function syncIdentityFields() {
    editNameValue = player.nameOverride === 1 ? player.name : '';
    editAvatarValue = player.avatarOverride === 1 ? (player.avatar ?? '') : '';
  }

  function close() {
    open = false;
    confirmUnlink = false;
    punishSeverity = '';
    punishDuration = '';
    punishReason = '';
    linkDiscordId = '';
    linkDiscordError = '';
  }

  function onKeydown(event: KeyboardEvent) {
    if (open && event.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <button
    type="button"
    class="fixed inset-0 z-40 bg-black/50"
    aria-label="Close staff tools"
    onclick={close}
  ></button>
  <div
    id="staff-tools-panel"
    class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border-default bg-surface-card shadow-2xl"
    role="dialog"
    aria-modal="true"
    aria-labelledby="staff-tools-title"
  >
    <div class="flex items-center justify-between border-b border-border-default px-5 py-4">
      <div>
        <h2 id="staff-tools-title" class="text-lg font-bold text-white">Staff tools</h2>
        <p class="text-xs text-text-muted">
          Identity and moderation. 1v1 league controls stay on the 1v1 tab.
        </p>
      </div>
      <button
        type="button"
        class="rounded-lg p-1.5 text-text-body transition-colors hover:bg-surface-hover hover:text-white"
        aria-label="Close"
        onclick={close}
      >
        <X class="size-5" />
      </button>
    </div>

    <div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
      <div class="flex items-center gap-3 rounded-lg bg-surface-input p-3">
        <img
          src={player.avatar || '/default-avatar.png'}
          alt=""
          class="size-10 rounded-lg object-cover"
        />
        <div class="min-w-0">
          <p class="font-medium text-white">{player.name}</p>
          <p class="font-mono text-xs text-text-muted">{player.steamId}</p>
        </div>
        {#if player.nameOverride === 1}
          <span
            class="ml-auto shrink-0 rounded border border-primary-500/30 bg-primary-500/20 px-2 py-0.5 text-[10px] font-bold text-primary-400"
          >
            LOCKED
          </span>
        {/if}
      </div>

      <form
        id="form-lock-name"
        method="POST"
        action="?/lockName"
        use:enhance={() => {
          submitting = true;
          const wasLocked = player.nameOverride === 1;
          return async ({ update, result }) => {
            await update();
            submitting = false;
            if (result.type === 'success') {
              toast.success(wasLocked ? 'Name updated' : 'Name set and locked');
              syncIdentityFields();
            } else if (result.type === 'failure') {
              toast.error(actionError(result, 'Failed to update name'));
            }
          };
        }}
      >
        <FormInput
          label="Display name"
          name="name"
          bind:value={editNameValue}
          maxlength={64}
          required
          placeholder={player.name}
        />
      </form>
      <form
        id="form-unlock-name"
        method="POST"
        action="?/unlockName"
        use:enhance={() => {
          submitting = true;
          return async ({ update, result }) => {
            await update();
            submitting = false;
            if (result.type === 'success') {
              toast.success(
                (result.data as { message?: string } | undefined)?.message || 'Name unlocked',
              );
              syncIdentityFields();
            } else if (result.type === 'failure') {
              toast.error(actionError(result, 'Failed to unlock name'));
            }
          };
        }}
      ></form>
      <div class="-mt-4 flex gap-2">
        <Button
          type="submit"
          form="form-lock-name"
          variant="primary"
          size="sm"
          disabled={submitting ||
            !editNameValue.trim() ||
            (player.nameOverride === 1 && editNameValue.trim() === player.name)}
        >
          {player.nameOverride === 1 ? 'Save' : 'Set and lock'}
        </Button>
        {#if player.nameOverride === 1}
          <Button
            type="submit"
            form="form-unlock-name"
            variant="secondary"
            size="sm"
            disabled={submitting}
          >
            Unlock
          </Button>
        {/if}
      </div>

      {#if editAvatarValue.trim()}
        <div class="-mb-2">
          <p class="mb-1 text-xs text-text-muted">Preview</p>
          <img
            src={editAvatarValue}
            alt=""
            class="size-16 rounded-lg border border-border-input object-cover"
            onerror={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      {/if}
      <form
        id="form-edit-avatar"
        method="POST"
        action="?/lockAvatar"
        use:enhance={() => {
          submitting = true;
          return async ({ update, result }) => {
            await update();
            submitting = false;
            if (result.type === 'success') {
              toast.success('Avatar set and locked');
              syncIdentityFields();
            } else if (result.type === 'failure') {
              toast.error(actionError(result, 'Failed to update avatar'));
            }
          };
        }}
      >
        <FormInput
          label="Avatar URL"
          name="avatarUrl"
          type="url"
          bind:value={editAvatarValue}
          placeholder="https://…"
          hint="Locking stops Steam from overwriting it on login."
        />
      </form>
      <form
        id="form-unlock-avatar"
        method="POST"
        action="?/unlockAvatar"
        use:enhance={() => {
          submitting = true;
          return async ({ update, result }) => {
            await update();
            submitting = false;
            if (result.type === 'success') {
              toast.success(
                (result.data as { message?: string } | undefined)?.message || 'Avatar unlocked',
              );
              syncIdentityFields();
            } else if (result.type === 'failure') {
              toast.error(actionError(result, 'Failed to unlock avatar'));
            }
          };
        }}
      ></form>
      <div class="-mt-4 flex gap-2">
        <Button
          type="submit"
          form="form-edit-avatar"
          variant="primary"
          size="sm"
          disabled={submitting || !editAvatarValue.trim()}
        >
          {player.avatarOverride === 1 ? 'Save' : 'Set and lock'}
        </Button>
        {#if player.avatarOverride === 1}
          <Button
            type="submit"
            form="form-unlock-avatar"
            variant="secondary"
            size="sm"
            disabled={submitting}
          >
            Unlock
          </Button>
        {/if}
      </div>

      {#if isStaffPlayer}
        <div class="rounded-lg border border-warning-500/30 bg-warning-500/10 p-3">
          <p class="text-xs text-warning-400">
            Demote this user from /admin/staff before punishing them.
          </p>
        </div>
      {/if}

      <form
        id="form-punish"
        method="POST"
        action="?/punishUser"
        use:enhance={() => {
          submitting = true;
          return async ({ update, result }) => {
            await update();
            submitting = false;
            if (result.type === 'success') {
              toast.success(
                (result.data as { message?: string } | undefined)?.message || 'Status updated',
              );
              punishSeverity = '';
              punishDuration = '';
              punishReason = '';
            } else if (result.type === 'failure') {
              toast.error(actionError(result, 'Failed to update status'));
            }
          };
        }}
      >
        <FormSelect
          label="Punishment"
          name="severity"
          id="staff-punish-severity"
          required
          bind:value={punishSeverity}
          placeholder="Select status..."
          hint="Current status: {currentBanLabel}"
          options={[
            { value: 'NONE', label: 'None (clear)' },
            { value: 'WARNING', label: 'Warning', disabled: isStaffPlayer },
            { value: 'SUSPENDED', label: 'Suspended', disabled: isStaffPlayer },
            { value: 'BANNED', label: 'Banned', disabled: isStaffPlayer },
          ]}
        />

        {#if punishSeverity && punishSeverity !== 'NONE'}
          <FormInput
            label="Duration (days)"
            name="duration"
            type="number"
            bind:value={punishDuration}
            placeholder="Leave empty for permanent"
            hint="Leave empty for permanent punishment."
          />

          <div class="mb-6">
            <label for="staff-punish-reason" class="mb-2 block text-sm font-medium text-text-label">
              Reason <span class="text-danger-500">*</span>
            </label>
            <textarea
              id="staff-punish-reason"
              name="reason"
              rows="3"
              required
              bind:value={punishReason}
              placeholder="Explain why this user is being punished..."
              class="w-full resize-none rounded-lg border border-border-input bg-surface-input px-4 py-3 text-white placeholder-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
            ></textarea>
          </div>
        {/if}

        {#if punishSeverity === 'NONE'}
          <div class="rounded-lg border border-success-500/30 bg-success-500/10 p-3">
            <p class="text-xs text-success-400">
              This will clear the user's punishment status and deactivate all active records.
            </p>
          </div>
        {:else if punishSeverity}
          <div class="rounded-lg border border-danger-500/30 bg-danger-500/10 p-3">
            <p class="text-xs text-danger-400">
              This will create a punishment record and update the user's ban status.
            </p>
          </div>
        {/if}
      </form>
      <div class="-mt-4">
        <Button
          type="submit"
          form="form-punish"
          variant={punishSeverity === 'NONE' ? 'success' : 'danger'}
          size="sm"
          disabled={submitting ||
            !punishSeverity ||
            (isStaffPlayer && punishSeverity !== 'NONE') ||
            (punishSeverity !== 'NONE' && !punishReason.trim())}
        >
          {punishSeverity === 'NONE' ? 'Clear' : 'Apply'}
        </Button>
      </div>

      <div class="border-t border-border-default pt-4">
        <p class="mb-2 text-sm font-medium text-text-label">Discord</p>
        {#if player.discordLinked}
          <p class="mb-3 inline-flex items-center gap-1.5 text-sm text-info-400">
            <DiscordIcon size={14} />
            {player.discordUsername || 'Linked'}
          </p>
          {#if confirmUnlink}
            <p class="mb-3 text-sm text-text-body">
              Unlink <span class="font-medium text-white">{player.name}</span>'s Discord account?
            </p>
            <div class="mb-4 flex gap-2">
              <form
                method="POST"
                action="?/unlinkDiscord"
                use:enhance={() => {
                  submitting = true;
                  return async ({ update, result }) => {
                    await update();
                    submitting = false;
                    confirmUnlink = false;
                    if (result.type === 'success') {
                      toast.success('Discord account unlinked');
                    } else if (result.type === 'failure') {
                      toast.error(actionError(result, 'Failed to unlink Discord'));
                    }
                  };
                }}
              >
                <Button type="submit" variant="danger" size="sm" disabled={submitting}>
                  {submitting ? 'Unlinking...' : 'Unlink Discord'}
                </Button>
              </form>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onclick={() => (confirmUnlink = false)}
              >
                Cancel
              </Button>
            </div>
          {:else}
            <div class="mb-4">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onclick={() => (confirmUnlink = true)}
              >
                Unlink Discord
              </Button>
            </div>
          {/if}
        {:else}
          <p class="mb-3 inline-flex items-center gap-1.5 text-sm text-text-body">
            <DiscordIcon size={14} />
            Discord not linked
          </p>
        {/if}

        <form
          method="POST"
          action="?/linkDiscord"
          use:enhance={() => {
            submitting = true;
            linkDiscordError = '';
            return async ({ update, result }) => {
              await update();
              submitting = false;
              if (result.type === 'success') {
                linkDiscordId = '';
                toast.success('Discord account linked');
              } else if (result.type === 'failure') {
                const message = actionError(result, 'Failed to link Discord');
                linkDiscordError = message;
                toast.error(message);
              }
            };
          }}
        >
          <FormError error={linkDiscordError} />
          <FormInput
            label={player.discordLinked ? 'Replace Discord ID' : 'Link by Discord ID'}
            name="discordId"
            bind:value={linkDiscordId}
            placeholder="123456789012345678"
            required
            hint="Developer Mode → right-click the user → Copy User ID."
          />
          <div class="-mt-2">
            <Button type="submit" variant="primary" size="sm" disabled={submitting}>
              {player.discordLinked ? 'Replace' : 'Link Discord'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
