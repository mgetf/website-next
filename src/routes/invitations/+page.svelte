<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { toast } from '$lib/state/toast.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
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

  function enhanceWithLoading({ cancel }: { cancel: () => void }) {
    if (isSubmitting) {
      cancel();
      return;
    }
    isSubmitting = true;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      isSubmitting = false;
    };
  }
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
  <div class="max-w-4xl mx-auto">
    <div class="mb-8">
      <h1 class="text-4xl font-bold text-white mb-2">Team Invitations</h1>
      <p class="text-text-body">View and manage your pending team invitations and join requests</p>
    </div>

    {#if data.rosterLocked}
      <div class="mb-6 p-4 bg-warning-500/20 border border-warning-500/50 rounded-lg">
        <p class="text-warning-400 text-sm">
          🔒 Rosters are currently locked. You cannot accept invitations at this time.
        </p>
      </div>
    {/if}

    {#if data.invitations.length === 0}
      <Card padding="none" class="p-12 text-center">
        <div class="text-6xl mb-4">📭</div>
        <h2 class="text-2xl font-bold text-white mb-4">No Pending Invitations</h2>
        <p class="text-text-body text-lg">
          You don't have any pending team invitations or join requests.
        </p>
      </Card>
    {:else}
      <div class="space-y-4">
        {#each data.invitations as invitation}
          <Card padding="none" class="overflow-hidden">
            <div class="p-6 flex items-center justify-between gap-4">
              <!-- Team Info -->
              <div class="flex items-center gap-4 flex-1 min-w-0">
                {#if invitation.team.avatar}
                  <img
                    src={invitation.team.avatar}
                    alt={invitation.team.name}
                    class="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                {:else}
                  <div
                    class="w-16 h-16 rounded-lg bg-surface-input border border-border-input flex items-center justify-center flex-shrink-0"
                  >
                    <span class="text-2xl text-text-body">{invitation.team.name.charAt(0)}</span>
                  </div>
                {/if}

                <div class="flex-1 min-w-0">
                  <h3 class="text-xl font-bold text-white mb-1 truncate">{invitation.team.name}</h3>
                  <div class="flex flex-wrap gap-2 text-sm text-text-body">
                    {#if invitation.team.division}
                      <span class="px-2 py-1 bg-surface-input rounded"
                        >{invitation.team.division.name}</span
                      >
                    {/if}
                    {#if invitation.team.region}
                      <span class="px-2 py-1 bg-surface-input rounded"
                        >{invitation.team.region.name}</span
                      >
                    {/if}
                    {#if invitation.team.season}
                      <span class="px-2 py-1 bg-surface-input rounded"
                        >Season {invitation.team.season.seasonNum}</span
                      >
                    {/if}
                    <span class="px-2 py-1 bg-surface-input rounded"
                      >{invitation.team.players.length}/3 Players</span
                    >
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2 flex-shrink-0">
                {#if invitation.status === 0}
                  <!-- Team invite: player can accept or decline -->
                  <form method="POST" action="?/accept" use:enhance={enhanceWithLoading}>
                    <input type="hidden" name="teamId" value={invitation.teamId} />
                    <Button
                      type="submit"
                      variant="success"
                      size="md"
                      disabled={isSubmitting || data.rosterLocked}
                    >
                      {isSubmitting ? 'Submitting...' : 'Accept'}
                    </Button>
                  </form>
                  <form method="POST" action="?/withdraw" use:enhance={enhanceWithLoading}>
                    <input type="hidden" name="teamId" value={invitation.teamId} />
                    <Button type="submit" variant="secondary" size="md" disabled={isSubmitting}>
                      Decline
                    </Button>
                  </form>
                {:else}
                  <!-- status=1: awaiting admin approval -->
                  <span
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-warning-500/15 border border-warning-500/30 rounded-lg text-warning-400 text-sm font-medium"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-warning-400 animate-pulse"></span>
                    Pending admin approval
                  </span>
                  <form method="POST" action="?/withdraw" use:enhance={enhanceWithLoading}>
                    <input type="hidden" name="teamId" value={invitation.teamId} />
                    <Button type="submit" variant="secondary" size="sm" disabled={isSubmitting}>
                      Withdraw
                    </Button>
                  </form>
                {/if}
              </div>
            </div>

            <div class="px-6 pb-4 border-t border-border-default/50 pt-3">
              <a
                href="/teams/{invitation.teamId}"
                class="text-sm text-primary-500 hover:text-primary-400 transition-colors"
              >
                View Team Page →
              </a>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  </div>
</div>
