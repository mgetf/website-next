<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import FilterBar from '$lib/components/ui/FilterBar.svelte';
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import LeagueScopeFilters from '$lib/components/ui/LeagueScopeFilters.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import { steamId32FromSteamId64 } from '$lib/utils/steamid';
  import type { PendingApprovalKind } from '$lib/types/pendingApproval';

  let { data, form }: { data: PageData; form: ActionData } = $props();

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

  let selectedKind = $state('');
  let selectedFormat = $state('');
  let selectedRegion = $state('');
  let selectedDivision = $state('');

  const hasActiveFilters = $derived(
    !!(selectedKind || selectedFormat || selectedRegion || selectedDivision),
  );

  const filteredItems = $derived(
    data.pendingApprovals.filter((item) => {
      if (selectedKind && item.kind !== selectedKind) return false;
      if (selectedFormat && String(item.formatId) !== selectedFormat) return false;
      if (selectedRegion && String(item.regionId ?? '') !== selectedRegion) return false;
      if (selectedDivision && String(item.divisionId ?? '') !== selectedDivision) return false;
      return true;
    }),
  );

  const kindOptions = [
    { value: 'JOIN_REQUEST', label: 'Join requests' },
    { value: 'ENTRY_READY', label: 'Ready-up' },
  ];

  function clearFilters() {
    selectedKind = '';
    selectedFormat = '';
    selectedRegion = '';
    selectedDivision = '';
  }

  function kindLabel(kind: PendingApprovalKind): string {
    return kind === 'ENTRY_READY' ? 'Ready-up' : 'Join request';
  }

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
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">Pending Players</h2>
    <p class="text-text-body">
      Approve or deny roster join requests and 1v1/2v2 ready-ups awaiting admin review.
    </p>
  </div>

  <FormError error={form?.error} />

  <FilterBar onClear={clearFilters} {hasActiveFilters}>
    {#snippet filters()}
      <div class="md:w-44">
        <div class="block text-sm font-medium text-text-body mb-2">Type</div>
        <SelectFilter
          bind:value={selectedKind}
          options={kindOptions}
          allLabel="All types"
          onChange={(value) => (selectedKind = value)}
        />
      </div>

      <LeagueScopeFilters
        formats={data.formats}
        regions={data.regions}
        divisions={data.divisions}
        regionIdsByFormat={data.regionIdsByFormat}
        bind:formatId={selectedFormat}
        bind:regionId={selectedRegion}
        bind:divisionId={selectedDivision}
      />

      <div class="ml-auto text-sm text-text-muted pb-2">
        Showing {filteredItems.length} of {data.pendingApprovals.length} items
      </div>
    {/snippet}
  </FilterBar>

  <Card padding="none" class="divide-y divide-border-default">
    {#if filteredItems.length === 0}
      <div class="py-12 text-center">
        <span class="text-6xl mb-4 block">✅</span>
        <p class="text-text-body">
          {#if data.pendingApprovals.length === 0}
            No pending approvals
          {:else}
            No items match your filters
          {/if}
        </p>
      </div>
    {:else}
      {#each filteredItems as item (item.key)}
        <div class="p-4 hover:bg-surface-input/50 transition-colors">
          <div class="flex flex-col lg:flex-row lg:items-center gap-4">
            <div class="flex items-center gap-3 flex-1 min-w-0">
              {#if item.playerSteamId}
                <a href="/users/{item.playerSteamId}" class="flex-shrink-0">
                  <img
                    src={item.playerAvatar || '/default-avatar.png'}
                    alt={item.playerUsername}
                    class="w-12 h-12 rounded-lg hover:opacity-80 transition-opacity"
                  />
                </a>
              {:else}
                <div
                  class="w-12 h-12 rounded-lg bg-surface-input flex items-center justify-center text-sm font-bold text-text-body flex-shrink-0"
                >
                  {item.teamName.slice(0, 2).toUpperCase()}
                </div>
              {/if}

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap mb-1">
                  {#if item.playerSteamId}
                    <a
                      href="/users/{item.playerSteamId}"
                      class="text-white font-semibold hover:text-primary-400 transition-colors"
                    >
                      {item.playerUsername}
                    </a>
                  {:else}
                    <span class="text-white font-semibold">{item.playerUsername}</span>
                  {/if}
                  {#if item.kind === 'JOIN_REQUEST'}
                    <span class="text-text-muted">→</span>
                    <a
                      href="/teams/{item.teamId}"
                      class="text-primary-400 hover:text-primary-300 font-medium transition-colors"
                    >
                      {item.teamName}
                    </a>
                  {:else if !item.isIndividual}
                    <span class="text-text-muted">·</span>
                    <a
                      href="/teams/{item.teamId}"
                      class="text-primary-400 hover:text-primary-300 font-medium transition-colors"
                    >
                      {item.teamName}
                    </a>
                  {/if}
                </div>
                <div class="flex items-center gap-2 flex-wrap text-sm text-text-body">
                  <Badge color={item.isIndividual ? 'purple' : 'blue'}>{item.formatName}</Badge>
                  <Badge color="yellow">{kindLabel(item.kind)}</Badge>
                  <Badge color="zinc">{item.divisionName || 'No Division'}</Badge>
                  <Badge color="zinc">{item.regionName || 'No Region'}</Badge>
                  {#if item.kind === 'ENTRY_READY' && !item.paid}
                    <Badge color="red">Unpaid</Badge>
                  {/if}
                </div>
              </div>
            </div>

            {#if item.playerSteamId}
              <div class="flex items-center gap-1 flex-shrink-0">
                <a
                  href={getSteamUrl(item.playerSteamId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
                >
                  <img src="/steam_logo.png" alt="Steam" class="w-5 h-5" />
                  <span class="tooltip">Steam</span>
                </a>
                <a
                  href={getRglUrl(item.playerSteamId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
                >
                  <img src="/rgl_logo.png" alt="RGL" class="w-5 h-5" />
                  <span class="tooltip">RGL</span>
                </a>
                <a
                  href={getEtf2lUrl(item.playerSteamId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
                >
                  <img src="/etf2l_logo.png" alt="ETF2L" class="w-5 h-5" />
                  <span class="tooltip">ETF2L</span>
                </a>
                <a
                  href={getLogsTfUrl(item.playerSteamId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
                >
                  <img src="/logstf_logo.png" alt="logs.tf" class="w-5 h-5" />
                  <span class="tooltip">logs.tf</span>
                </a>
                <a
                  href={getUgcUrl(item.playerSteamId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
                >
                  <img src="/ugcgaming_logo.png" alt="UGC" class="w-5 h-5" />
                  <span class="tooltip">UGC-Gaming</span>
                </a>
                <a
                  href="https://steamhistory.net/id/{item.playerSteamId}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
                >
                  <img src="/steamhistory_logo.jpg" alt="SteamHistory" class="w-5 h-5 rounded" />
                  <span class="tooltip">SteamHistory</span>
                </a>
                <a
                  href="https://steamladder.com/profile/{item.playerSteamId}/"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="social-link p-1.5 bg-surface-input hover:bg-surface-hover rounded transition relative group"
                >
                  <img src="/steamladder_logo.png" alt="SteamLadder" class="w-5 h-5" />
                  <span class="tooltip">SteamLadder</span>
                </a>
              </div>
            {/if}

            <div class="flex items-center gap-2 flex-shrink-0">
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
                  class="flex items-center gap-2"
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
                    class="px-3 py-2 bg-surface-input border border-border-input rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-32"
                  />
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
