<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
</script>

<div class="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
  <div class="max-w-2xl w-full">
    {#if data.error || !data.team}
      <Card padding="lg" class="text-center">
        <div class="text-6xl mb-4">❌</div>
        <h2 class="text-2xl font-bold text-white mb-4">Invalid Invitation</h2>
        <p class="text-text-body text-lg mb-6">
          {data.error || 'This invitation link is invalid or has expired.'}
        </p>
        <Button href="/" variant="primary">Go Home</Button>
      </Card>
    {:else if data.rosterLocked}
      <Card padding="lg" class="text-center">
        <div class="text-6xl mb-4">🔒</div>
        <h2 class="text-2xl font-bold text-white mb-4">Rosters Locked</h2>
        <p class="text-text-body text-lg mb-6">
          Team rosters are currently locked. You cannot join teams at this time.
        </p>
        <Button href="/" variant="primary">Go Home</Button>
      </Card>
    {:else if !data.canJoin}
      <Card padding="lg" class="text-center">
        <div class="text-6xl mb-4">⚠️</div>
        <h2 class="text-2xl font-bold text-white mb-4">Cannot Join Team</h2>
        <p class="text-text-body text-lg mb-6">
          {data.error || 'You cannot join this team at this time.'}
        </p>
        {#if data.team}
          <Button href="/teams/{data.team.id}" variant="primary">View Team Page</Button>
        {:else}
          <Button href="/" variant="primary">Go Home</Button>
        {/if}
      </Card>
    {:else}
      <Card padding="none" class="overflow-hidden">
        <div
          class="bg-gradient-to-r from-orange-600/20 to-orange-600/5 p-8 text-center border-b border-border-default"
        >
          {#if data.team.avatar}
            <img
              src={data.team.avatar}
              alt={data.team.name}
              class="w-24 h-24 rounded-lg mx-auto mb-4 object-cover"
            />
          {:else}
            <div
              class="w-24 h-24 rounded-lg bg-surface-input border border-border-input mx-auto mb-4 flex items-center justify-center"
            >
              <span class="text-4xl text-text-body">{data.team.name.charAt(0)}</span>
            </div>
          {/if}
          <h1 class="text-3xl font-bold text-white mb-2">{data.team.name}</h1>
          <p class="text-text-body">You've been invited to join this team</p>
        </div>

        <div class="p-8">
          <div class="grid grid-cols-2 gap-4 mb-8">
            <div class="bg-surface-input rounded-lg p-4 text-center">
              <div class="text-sm text-text-body mb-1">Division</div>
              <div class="font-semibold text-white">{data.team.division?.name || 'N/A'}</div>
            </div>
            <div class="bg-surface-input rounded-lg p-4 text-center">
              <div class="text-sm text-text-body mb-1">Region</div>
              <div class="font-semibold text-white">{data.team.region?.name || 'N/A'}</div>
            </div>
            <div class="bg-surface-input rounded-lg p-4 text-center">
              <div class="text-sm text-text-body mb-1">Season</div>
              <div class="font-semibold text-white">
                {data.team.season ? `Season ${data.team.season.seasonNum}` : 'N/A'}
              </div>
            </div>
            <div class="bg-surface-input rounded-lg p-4 text-center">
              <div class="text-sm text-text-body mb-1">Roster</div>
              <div class="font-semibold text-white">{data.activePlayers.length}/3 Players</div>
            </div>
          </div>

          {#if data.activePlayers.length > 0}
            <div class="mb-8">
              <h3 class="text-lg font-semibold text-white mb-3">Current Roster</h3>
              <div class="space-y-2">
                {#each data.activePlayers as player}
                  <div class="flex items-center gap-3 p-3 bg-surface-input rounded-lg">
                    <img
                      src={player.player.steamAvatar}
                      alt={player.player.steamUsername}
                      class="w-10 h-10 rounded-full"
                    />
                    <div>
                      <div class="font-medium text-white">{player.player.steamUsername}</div>
                      <div class="text-xs text-text-body">
                        {player.permissionLevel === 2
                          ? 'Owner'
                          : player.permissionLevel === 1
                            ? 'Admin'
                            : 'Member'}
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <FormError error={form?.error} />

          <div class="flex gap-3">
            <form
              method="POST"
              action="?/accept"
              class="flex-1"
              use:enhance={() => {
                isSubmitting = true;
                return async ({ update }) => {
                  await update();
                  isSubmitting = false;
                };
              }}
            >
              <input type="hidden" name="token" value={data.token} />
              <Button type="submit" variant="success" disabled={isSubmitting} class="w-full">
                {isSubmitting ? 'Joining...' : 'Accept Invitation'}
              </Button>
            </form>
            <form
              method="POST"
              action="?/decline"
              use:enhance={() => {
                isSubmitting = true;
                return async ({ update }) => {
                  await update();
                  isSubmitting = false;
                };
              }}
            >
              <input type="hidden" name="token" value={data.token} />
              <Button type="submit" variant="secondary" disabled={isSubmitting}>Decline</Button>
            </form>
          </div>
        </div>
      </Card>
    {/if}
  </div>
</div>
