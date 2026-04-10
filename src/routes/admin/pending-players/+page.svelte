<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import { steamId32FromSteamId64 } from '$lib/utils/steamid';

  let { data }: { data: PageData } = $props();

  let isSubmitting = $state(false);
  let decliningPlayerId = $state<string | null>(null);
  let declineReasons = $state<Record<string, string>>({});

  let selectedDivision = $state<string>('all');
  let selectedRegion = $state<string>('all');

  const filteredPlayers = $derived(() => {
    return data.pendingPlayers.filter((request) => {
      if (
        selectedDivision !== 'all' &&
        selectedDivision !== '' &&
        request.team.divisionId?.toString() !== selectedDivision
      ) {
        return false;
      }
      if (
        selectedRegion !== 'all' &&
        selectedRegion !== '' &&
        request.team.regionId?.toString() !== selectedRegion
      ) {
        return false;
      }
      return true;
    });
  });

  function getRglUrl(steamId: string): string {
    return `https://rgl.gg/Public/PlayerProfile.aspx?p=${steamId}`;
  }

  function getEtf2lUrl(steamId: string): string {
    return `https://etf2l.org/search/${steamId}/`;
  }

  function getUgcUrl(steamId: string): string {
    const steam2Id = steamId32FromSteamId64(steamId);
    return `https://stats.ugc-gaming.net/mge-stats/?search=${encodeURIComponent(steam2Id)}`;
  }

  function getLogsTfUrl(steamId: string): string {
    return `https://logs.tf/profile/${steamId}`;
  }

  function getSteamUrl(steamId: string): string {
    return `https://steamcommunity.com/profiles/${steamId}`;
  }
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <!-- Page Header -->
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">Pending Players</h2>
    <p class="text-text-body">Approve or deny team join requests</p>
  </div>

  <!-- Filters -->
  <Card padding="sm">
    <div class="flex flex-wrap items-start gap-4">
      <div class="min-w-[180px]">
        <FormSelect
          label="Division"
          name="divisionFilter"
          bind:value={selectedDivision}
          required
          placeholder="All Divisions"
          options={[
            { value: 'all', label: 'All Divisions' },
            ...data.divisions.map((d) => ({ value: String(d.id), label: d.name })),
          ]}
        />
      </div>

      <div class="min-w-[180px]">
        <FormSelect
          label="Region"
          name="regionFilter"
          bind:value={selectedRegion}
          required
          placeholder="All Regions"
          options={[
            { value: 'all', label: 'All Regions' },
            ...data.regions.map((r) => ({ value: String(r.id), label: r.name })),
          ]}
        />
      </div>

      {#if selectedDivision !== 'all' || selectedRegion !== 'all'}
        <button
          onclick={() => {
            selectedDivision = 'all';
            selectedRegion = 'all';
          }}
          class="text-sm text-text-body hover:text-white transition"
        >
          Clear filters
        </button>
      {/if}

      <div class="ml-auto text-sm text-text-muted">
        Showing {filteredPlayers().length} of {data.pendingPlayers.length} requests
      </div>
    </div>
  </Card>

  <!-- Pending Requests -->
  <Card padding="none" class="divide-y divide-border-default">
    {#if filteredPlayers().length === 0}
      <div class="py-12 text-center">
        <span class="text-6xl mb-4 block">✅</span>
        <p class="text-text-body">
          {#if data.pendingPlayers.length === 0}
            No pending player requests
          {:else}
            No requests match your filters
          {/if}
        </p>
      </div>
    {:else}
      {#each filteredPlayers() as request}
        <div class="p-4 hover:bg-surface-input/50 transition-colors">
          <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <!-- Player Info -->
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <a href="/users/{request.player.steamId}" class="flex-shrink-0">
                <img
                  src={request.player.steamAvatar || '/default-avatar.png'}
                  alt={request.player.steamUsername}
                  class="w-12 h-12 rounded-lg hover:opacity-80 transition-opacity"
                />
              </a>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  <a
                    href="/users/{request.player.steamId}"
                    class="text-white font-semibold hover:text-primary-400 transition-colors"
                  >
                    {request.player.steamUsername}
                  </a>
                  <span class="text-text-muted">→</span>
                  <a
                    href="/teams/{request.team.id}"
                    class="text-primary-400 hover:text-primary-300 font-medium transition-colors"
                  >
                    {request.team.name}
                  </a>
                </div>
                <div class="flex items-center gap-2 text-sm text-text-body">
                  <span
                    class="px-2 py-0.5 bg-surface-input rounded text-xs font-medium text-text-label"
                  >
                    {request.team.division?.name || 'No Division'}
                  </span>
                  <span
                    class="px-2 py-0.5 bg-surface-input rounded text-xs font-medium text-text-label"
                  >
                    {request.team.region?.name || 'No Region'}
                  </span>
                </div>
              </div>
            </div>

            <!-- External Profile Links -->
            <div class="flex items-center gap-1 flex-shrink-0">
              <a
                href={getSteamUrl(request.player.steamId)}
                target="_blank"
                rel="noopener noreferrer"
                class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
              >
                <img src="/steam_logo.png" alt="Steam" class="w-5 h-5" />
                <span class="tooltip">Steam</span>
              </a>
              <a
                href={getRglUrl(request.player.steamId)}
                target="_blank"
                rel="noopener noreferrer"
                class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
              >
                <img src="/rgl_logo.png" alt="RGL" class="w-5 h-5" />
                <span class="tooltip">RGL</span>
              </a>
              <a
                href={getEtf2lUrl(request.player.steamId)}
                target="_blank"
                rel="noopener noreferrer"
                class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
              >
                <img src="/etf2l_logo.png" alt="ETF2L" class="w-5 h-5" />
                <span class="tooltip">ETF2L</span>
              </a>
              <a
                href={getLogsTfUrl(request.player.steamId)}
                target="_blank"
                rel="noopener noreferrer"
                class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
              >
                <img src="/logstf_logo.png" alt="logs.tf" class="w-5 h-5" />
                <span class="tooltip">logs.tf</span>
              </a>
              <a
                href={getUgcUrl(request.player.steamId)}
                target="_blank"
                rel="noopener noreferrer"
                class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
              >
                <img src="/ugcgaming_logo.png" alt="UGC" class="w-5 h-5" />
                <span class="tooltip">UGC-Gaming</span>
              </a>
              <a
                href="https://steamhistory.net/id/{request.player.steamId}"
                target="_blank"
                rel="noopener noreferrer"
                class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
              >
                <img src="/steamhistory_logo.jpg" alt="SteamHistory" class="w-5 h-5 rounded" />
                <span class="tooltip">SteamHistory</span>
              </a>
              <a
                href="https://steamladder.com/profile/{request.player.steamId}/"
                target="_blank"
                rel="noopener noreferrer"
                class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
              >
                <img src="/steamladder_logo.png" alt="SteamLadder" class="w-5 h-5" />
                <span class="tooltip">SteamLadder</span>
              </a>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 flex-shrink-0">
              {#if decliningPlayerId === request.player.steamId}
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
                    class="px-3 py-2 bg-surface-input border border-border-input rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-32"
                  />
                  <Button type="submit" variant="danger" size="sm" disabled={isSubmitting}>
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onclick={() => (decliningPlayerId = null)}
                  >
                    Cancel
                  </Button>
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
                  <input type="hidden" name="playerSteamId" value={request.player.steamId} />
                  <input type="hidden" name="teamId" value={request.team.id} />
                  <Button type="submit" variant="success" size="sm" disabled={isSubmitting}>
                    ✓ Approve
                  </Button>
                </form>

                <Button
                  variant="danger"
                  size="sm"
                  onclick={() => (decliningPlayerId = request.player.steamId)}
                >
                  ✗ Decline
                </Button>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </Card>
</div>

<style>
  .social-link .tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 8px;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    color: #e4e4e7;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 0.1s,
      visibility 0.1s;
    pointer-events: none;
    margin-bottom: 4px;
    z-index: 50;
  }
  .social-link:hover .tooltip {
    opacity: 1;
    visibility: visible;
  }
</style>
