<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import { toast } from '$lib/state/toast.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const seasonColumns = $derived([
    { key: 'season', label: 'Season' },
    { key: 'status', label: 'Status' },
    { key: 'teams', label: 'Teams' },
    { key: 'matches', label: 'Matches' },
    { key: 'playoffs', label: 'Playoffs' },
    ...(data.isStrictAdmin ? [{ key: 'actions', label: 'Actions', align: 'right' as const }] : []),
  ]);

  const regionColumns = $derived([
    { key: 'region', label: 'Region' },
    { key: 'currency', label: 'Currency' },
    { key: 'visibility', label: 'Visibility' },
    { key: 'seasons', label: 'Seasons' },
    { key: 'teams', label: 'Teams' },
    ...(data.isStrictAdmin ? [{ key: 'actions', label: 'Actions', align: 'right' as const }] : []),
  ]);

  const divisionColumns = $derived([
    { key: 'division', label: 'Division' },
    { key: 'cost', label: 'Signup Cost' },
    { key: 'visibility', label: 'Visibility' },
    { key: 'teams', label: 'Teams' },
    ...(data.isStrictAdmin ? [{ key: 'actions', label: 'Actions', align: 'right' as const }] : []),
  ]);

  const arenaColumns = [
    { key: 'arena', label: 'Arena' },
    { key: 'playoff', label: 'Playoff Map' },
    { key: 'games', label: 'Games' },
    { key: 'actions', label: 'Actions', align: 'right' as const },
  ];

  const formatColumns = $derived([
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
    { key: 'seasons', label: 'Seasons' },
    { key: 'teams', label: 'Teams' },
    { key: 'signups', label: 'Active Signups' },
    ...(data.isStrictAdmin ? [{ key: 'actions', label: 'Actions', align: 'right' as const }] : []),
  ]);

  // Get initial tab from URL query param, default to 'seasons'
  const validTabs = ['seasons', 'regions', 'divisions', 'arenas', 'formats'] as const;
  const urlTab = page.url.searchParams.get('tab');
  const initialTab = validTabs.includes(urlTab as any)
    ? (urlTab as (typeof validTabs)[number])
    : 'seasons';

  let activeTab: 'seasons' | 'regions' | 'divisions' | 'arenas' | 'formats' = $state(initialTab);
  let isSubmitting = $state(false);

  // Seasons state
  let showSeasonForm = $state(false);
  let editingSeason: (typeof data.seasons)[0] | null = $state(null);
  let deletingSeason: (typeof data.seasons)[0] | null = $state(null);

  // Regions state
  let showRegionForm = $state(false);
  let editingRegion: (typeof data.regions)[0] | null = $state(null);
  let deletingRegion: (typeof data.regions)[0] | null = $state(null);

  // Divisions state
  let showDivisionForm = $state(false);
  let editingDivision: (typeof data.divisions)[0] | null = $state(null);
  let deletingDivision: (typeof data.divisions)[0] | null = $state(null);
  let selectedCreateRegionId: number | null = $state(null);
  let selectedEditRegionId: number | null = $state(null);

  // Get currency symbol for a region
  function getCurrencySymbol(regionId: number | null): string {
    if (!regionId) return '€'; // Default for shared divisions
    const region = data.regions.find((r) => r.id === regionId);
    return region?.currencySymbol || '€';
  }

  // Arenas state
  let showArenaForm = $state(false);
  let editingArena: (typeof data.arenas)[0] | null = $state(null);
  let deletingArena: (typeof data.arenas)[0] | null = $state(null);

  // Map Ban Pools state
  let showPoolForm = $state(false);
  let editingPool: (typeof data.mapBanPools)[0] | null = $state(null);
  let deletingPool: (typeof data.mapBanPools)[0] | null = $state(null);
  let addingMapsToPool: (typeof data.mapBanPools)[0] | null = $state(null);

  // Formats state
  let showFormatForm = $state(false);
  let editingFormat: (typeof data.formats)[0] | null = $state(null);
  let deletingFormat: (typeof data.formats)[0] | null = $state(null);

  // Delete confirmation text (shared across all delete dialogs)
  let deleteConfirmText = $state('');

  // Playoff management state
  let showPlayoffModal: (typeof data.seasons)[0] | null = $state(null);
  let playoffFormat = $state<'tournament' | 'rounds'>('tournament');

  // Toast notifications for form results
  const isEditingAny = $derived(
    !!(
      editingSeason ||
      deletingSeason ||
      editingRegion ||
      deletingRegion ||
      editingDivision ||
      deletingDivision ||
      editingArena ||
      deletingArena ||
      editingFormat ||
      deletingFormat
    ),
  );
  let lastFormResult: ActionData = null;

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error && !isEditingAny) {
        toast.error(form.error);
      }
    }
  });

  let seasonsByFormat = $derived(
    data.seasons.reduce(
      (acc, season) => {
        if (!acc[season.format]) {
          acc[season.format] = {};
        }
        if (!acc[season.format][season.region]) {
          acc[season.format][season.region] = [];
        }
        acc[season.format][season.region].push(season);
        return acc;
      },
      {} as Record<string, Record<string, typeof data.seasons>>,
    ),
  );

  let formatNames = $derived(Object.keys(seasonsByFormat).sort());
  let selectedFormat = $state('');
  $effect(() => {
    if (selectedFormat === '' && formatNames.length > 0) {
      selectedFormat = formatNames[0];
    }
  });

  // Group divisions by region
  let divisionsByRegion = $derived(
    data.divisions.reduce(
      (acc, division) => {
        const region = data.regions.find((r) => r.id === division.regionId);
        const regionName = region?.name || 'Unknown';
        if (!acc[regionName]) {
          acc[regionName] = { region, divisions: [] };
        }
        acc[regionName].divisions.push(division);
        return acc;
      },
      {} as Record<
        string,
        {
          region: (typeof data.regions)[0] | undefined;
          divisions: typeof data.divisions;
        }
      >,
    ),
  );

  let divisionRegionNames = $derived(Object.keys(divisionsByRegion).sort());

  function getStatusDot(status: string) {
    if (status === 'Active') return 'bg-green-500';
    return 'bg-gray-500';
  }

  // Change tab and update URL
  function setTab(tab: typeof activeTab) {
    activeTab = tab;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    history.replaceState({}, '', url.toString());
  }
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <!-- Page Header -->
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">League Configuration</h2>
    <p class="text-gray-400">Manage seasons, regions, divisions, and arenas</p>
  </div>

  <!-- Tab Navigation -->
  <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-1 flex gap-1">
    <button
      onclick={() => setTab('seasons')}
      class="flex-1 px-4 py-2 rounded-md transition-colors {activeTab === 'seasons'
        ? 'bg-orange-600 text-white font-medium'
        : 'text-gray-400 hover:text-white hover:bg-zinc-800'}"
    >
      🏆 Seasons
    </button>
    <button
      onclick={() => setTab('regions')}
      class="flex-1 px-4 py-2 rounded-md transition-colors {activeTab === 'regions'
        ? 'bg-orange-600 text-white font-medium'
        : 'text-gray-400 hover:text-white hover:bg-zinc-800'}"
    >
      🌍 Regions
    </button>
    <button
      onclick={() => setTab('divisions')}
      class="flex-1 px-4 py-2 rounded-md transition-colors {activeTab === 'divisions'
        ? 'bg-orange-600 text-white font-medium'
        : 'text-gray-400 hover:text-white hover:bg-zinc-800'}"
    >
      📊 Divisions
    </button>
    <button
      onclick={() => setTab('arenas')}
      class="flex-1 px-4 py-2 rounded-md transition-colors {activeTab === 'arenas'
        ? 'bg-orange-600 text-white font-medium'
        : 'text-gray-400 hover:text-white hover:bg-zinc-800'}"
    >
      🗺️ Arenas & Maps
    </button>
    <button
      onclick={() => setTab('formats')}
      class="flex-1 px-4 py-2 rounded-md transition-colors {activeTab === 'formats'
        ? 'bg-orange-600 text-white font-medium'
        : 'text-gray-400 hover:text-white hover:bg-zinc-800'}"
    >
      🎮 Formats
    </button>
  </div>

  <!-- Tab Content -->
  {#if activeTab === 'seasons'}
    <!-- SEASONS TAB -->
    <div>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-xl font-bold text-white">Seasons</h3>
        {#if data.isStrictAdmin}
          <button
            onclick={() => (showSeasonForm = !showSeasonForm)}
            class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            {showSeasonForm ? '✕ Cancel' : '+ Create Season'}
          </button>
        {/if}
      </div>

      {#if showSeasonForm && data.isStrictAdmin}
        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
          <h4 class="text-lg font-semibold text-white mb-4">Create New Season</h4>

          {#if form?.error}
            <div class="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p class="text-red-400 text-sm">{form.error}</p>
            </div>
          {/if}

          {#if form?.success}
            <div class="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
              <p class="text-green-400 text-sm">{form.message}</p>
            </div>
          {/if}

          <form
            method="POST"
            action="?/createSeason"
            use:enhance={() => {
              isSubmitting = true;
              return async ({ update, result }) => {
                await update();
                isSubmitting = false;
                if (result.type === 'success') {
                  showSeasonForm = false;
                }
              };
            }}
          >
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label for="seasonNum" class="block text-sm font-medium text-gray-300 mb-2"
                  >Season Number</label
                >
                <input
                  id="seasonNum"
                  name="seasonNum"
                  type="number"
                  placeholder="5"
                  required
                  min="1"
                  class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label for="regionId" class="block text-sm font-medium text-gray-300 mb-2"
                  >Region</label
                >
                <select
                  id="regionId"
                  name="regionId"
                  required
                  class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {#each data.regions as region}
                    <option value={region.id}>{region.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="formatId" class="block text-sm font-medium text-gray-300 mb-2"
                  >Format</label
                >
                <select
                  id="formatId"
                  name="formatId"
                  required
                  class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  {#each data.formats as format}
                    <option value={format.id}>{format.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="numWeeks" class="block text-sm font-medium text-gray-300 mb-2"
                  >Number of Weeks</label
                >
                <input
                  id="numWeeks"
                  name="numWeeks"
                  type="number"
                  placeholder="10"
                  required
                  min="1"
                  class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
            <div class="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onclick={() => (showSeasonForm = false)}
                class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {isSubmitting ? 'Creating...' : 'Create Season'}
              </button>
            </div>
          </form>
        </div>
      {/if}

      {#if data.seasons.length === 0}
        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <p class="text-gray-400 text-lg mb-4">No seasons found</p>
          <p class="text-gray-500 text-sm">Create your first season to get started</p>
        </div>
      {:else}
        <!-- Format tabs -->
        <div class="flex gap-1 border-b border-zinc-800 mb-6">
          {#each formatNames as formatName}
            {@const count = Object.values(seasonsByFormat[formatName]).reduce(
              (s, r) => s + r.length,
              0,
            )}
            <button
              onclick={() => (selectedFormat = formatName)}
              class="relative px-5 py-2.5 text-sm font-medium transition-colors {selectedFormat ===
              formatName
                ? 'text-orange-400'
                : 'text-gray-400 hover:text-white'}"
            >
              {formatName}
              <span
                class="ml-1.5 text-xs {selectedFormat === formatName
                  ? 'text-orange-400/70'
                  : 'text-gray-600'}">{count}</span
              >
              {#if selectedFormat === formatName}
                <span class="absolute bottom-0 inset-x-0 h-0.5 bg-orange-400 rounded-full"></span>
              {/if}
            </button>
          {/each}
        </div>

        {#if selectedFormat && seasonsByFormat[selectedFormat]}
          {@const regionMap = seasonsByFormat[selectedFormat]}
          {@const regionNamesForFormat = Object.keys(regionMap).sort()}
          <div class="space-y-4">
            {#each regionNamesForFormat as regionName}
              <div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <div
                  class="bg-zinc-800/50 px-6 py-3 border-b border-zinc-800 flex items-center gap-3"
                >
                  <h4 class="text-base font-semibold text-white">{regionName}</h4>
                  <span class="text-xs text-gray-500"
                    >{regionMap[regionName].length} season{regionMap[regionName].length !== 1
                      ? 's'
                      : ''}</span
                  >
                </div>
                <DataTable
                  data={regionMap[regionName].slice().sort((a, b) => b.seasonNum - a.seasonNum)}
                  columns={seasonColumns}
                >
                  {#snippet cell(season, col)}
                    {#if col.key === 'season'}
                      <div class="flex items-center gap-3">
                        <div
                          class="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center"
                        >
                          <span class="text-lg font-bold text-orange-400">{season.seasonNum}</span>
                        </div>
                        <div>
                          <div class="font-semibold text-white">Season {season.seasonNum}</div>
                          <div class="text-xs text-gray-500">ID: {season.id}</div>
                        </div>
                      </div>
                    {:else if col.key === 'status'}
                      <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full {getStatusDot(season.status)}"></span>
                        <span class="text-sm text-gray-300">{season.status}</span>
                      </div>
                    {:else if col.key === 'teams'}
                      <span class="text-sm font-medium text-white">{season.teams}</span>
                      <span class="text-xs text-gray-500 ml-1">teams</span>
                    {:else if col.key === 'matches'}
                      <span class="text-sm font-medium text-white">{season.matches}</span>
                      <span class="text-xs text-gray-500 ml-1">matches</span>
                    {:else if col.key === 'playoffs'}
                      {#if season.playoff}
                        <span class="text-sm text-gray-300">
                          {season.playoff.isTournament
                            ? 'Tournament'
                            : `${season.playoff.numRounds} Rounds`}
                        </span>
                      {:else}
                        <span class="text-sm text-gray-500">Not set</span>
                      {/if}
                    {:else if col.key === 'actions'}
                      {#if data.isStrictAdmin}
                        <div class="flex items-center justify-end gap-2">
                          <button
                            onclick={() => {
                              showPlayoffModal = season;
                              playoffFormat =
                                (season as any).playoff?.isTournament !== false
                                  ? 'tournament'
                                  : 'rounds';
                            }}
                            class="px-3 py-1 text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded transition-colors"
                          >
                            {season.playoff ? 'Update Playoffs' : 'Add Playoffs'}
                          </button>
                          <button
                            onclick={() => (editingSeason = season)}
                            class="px-3 py-1 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onclick={() => {
                              deletingSeason = season;
                              deleteConfirmText = '';
                            }}
                            class="px-3 py-1 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      {/if}
                    {/if}
                  {/snippet}
                </DataTable>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {:else if activeTab === 'regions'}
    <!-- REGIONS TAB -->
    <div>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-xl font-bold text-white">Regions</h3>
        {#if data.isStrictAdmin}
          <button
            onclick={() => (showRegionForm = !showRegionForm)}
            class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            {showRegionForm ? '✕ Cancel' : '+ Add Region'}
          </button>
        {/if}
      </div>

      {#if showRegionForm && data.isStrictAdmin}
        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
          <h4 class="text-lg font-semibold text-white mb-4">Create New Region</h4>
          <form
            method="POST"
            action="?/createRegion"
            use:enhance={() => {
              isSubmitting = true;
              return async ({ update, result }) => {
                await update();
                isSubmitting = false;
                if (result.type === 'success') {
                  showRegionForm = false;
                }
              };
            }}
          >
            <div class="flex gap-4">
              <div class="flex-1">
                <label for="region-name" class="block text-sm font-medium text-gray-300 mb-2"
                  >Region Name</label
                >
                <input
                  id="region-name"
                  name="name"
                  type="text"
                  placeholder="North America"
                  required
                  class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div class="flex items-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Create Region'}
                </button>
              </div>
            </div>
          </form>
        </div>
      {/if}

      <DataTable data={data.regions} columns={regionColumns}>
        {#snippet cell(region: any, col: any)}
          {#if col.key === 'region'}
            <span class="font-semibold text-white">{region.name}</span>
          {:else if col.key === 'currency'}
            <span class="px-2 py-1 rounded text-xs font-medium bg-zinc-800 text-gray-300">
              {region.currencySymbol || '€'}
            </span>
          {:else if col.key === 'visibility'}
            <span
              class="px-2 py-1 rounded text-xs font-medium {region.hidden === 0
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-500/20 text-gray-400'}"
            >
              {region.hidden === 0 ? 'Visible' : 'Hidden'}
            </span>
          {:else if col.key === 'seasons'}
            <span class="text-gray-300">{region.seasons}</span>
          {:else if col.key === 'teams'}
            <span class="text-gray-300">{region.teams}</span>
          {:else if col.key === 'actions'}
            {#if data.isStrictAdmin}
              <div class="flex items-center justify-end gap-2">
                <form method="POST" action="?/toggleRegionVisibility" use:enhance>
                  <input type="hidden" name="regionId" value={region.id} />
                  <button
                    type="submit"
                    class="px-3 py-1 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
                  >
                    {region.hidden === 0 ? 'Hide' : 'Show'}
                  </button>
                </form>
                <button
                  onclick={() => (editingRegion = region)}
                  class="px-3 py-1 text-sm bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onclick={() => {
                    deletingRegion = region;
                    deleteConfirmText = '';
                  }}
                  class="px-3 py-1 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            {/if}
          {/if}
        {/snippet}
      </DataTable>
    </div>
  {:else if activeTab === 'divisions'}
    <!-- DIVISIONS TAB -->
    <div>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-xl font-bold text-white">Divisions</h3>
        {#if data.isStrictAdmin}
          <button
            onclick={() => (showDivisionForm = !showDivisionForm)}
            class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            {showDivisionForm ? '✕ Cancel' : '+ Add Division'}
          </button>
        {/if}
      </div>

      {#if showDivisionForm && data.isStrictAdmin}
        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
          <h4 class="text-lg font-semibold text-white mb-4">Create New Division</h4>
          <form
            method="POST"
            action="?/createDivision"
            use:enhance={() => {
              isSubmitting = true;
              return async ({ update, result }) => {
                await update();
                isSubmitting = false;
                if (result.type === 'success') {
                  showDivisionForm = false;
                }
              };
            }}
          >
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label for="division-name" class="block text-sm font-medium text-gray-300 mb-2"
                  >Division Name</label
                >
                <input
                  id="division-name"
                  name="name"
                  type="text"
                  placeholder="Open"
                  required
                  class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label for="division-region" class="block text-sm font-medium text-gray-300 mb-2"
                  >Region <span class="text-red-400">*</span></label
                >
                <select
                  id="division-region"
                  name="regionId"
                  required
                  onchange={(e) => {
                    const val = e.currentTarget.value;
                    selectedCreateRegionId = val ? parseInt(val) : null;
                  }}
                  class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select a region</option>
                  {#each data.regions as region}
                    <option value={region.id}>{region.name}</option>
                  {/each}
                </select>
              </div>
              <div>
                <label for="signup-cost" class="block text-sm font-medium text-gray-300 mb-2">
                  Signup Cost ({getCurrencySymbol(selectedCreateRegionId)})
                </label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >{getCurrencySymbol(selectedCreateRegionId)}</span
                  >
                  <input
                    id="signup-cost"
                    name="signupCost"
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    class="w-full pl-8 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>
            </div>
            <p class="text-xs text-gray-500 mt-2">
              Each division belongs to a specific region. You can create divisions with the same
              name in different regions (e.g., "Open" for NA and "Open" for EU).
            </p>
            <div class="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onclick={() => (showDivisionForm = false)}
                class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {isSubmitting ? 'Creating...' : 'Create Division'}
              </button>
            </div>
          </form>
        </div>
      {/if}

      {#if data.divisions.length === 0}
        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <p class="text-gray-400 text-lg mb-4">No divisions found</p>
          <p class="text-gray-500 text-sm">Create your first division to get started</p>
        </div>
      {:else}
        <div class="space-y-6">
          {#each divisionRegionNames as regionName}
            {@const regionData = divisionsByRegion[regionName]}
            <div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div class="bg-zinc-800/50 px-6 py-4 border-b border-zinc-800">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-xl font-bold text-white">{regionName}</h3>
                    <p class="text-sm text-gray-400 mt-1">
                      {regionData.divisions.length} division{regionData.divisions.length !== 1
                        ? 's'
                        : ''}
                      • Currency: {regionData.region?.currencySymbol || '€'}
                    </p>
                  </div>
                </div>
              </div>

              <DataTable data={regionData.divisions} columns={divisionColumns}>
                {#snippet cell(division, col)}
                  {#if col.key === 'division'}
                    <div class="flex items-center gap-3">
                      <div
                        class="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center"
                      >
                        <span class="text-lg font-bold text-orange-400"
                          >{division.name.charAt(0).toUpperCase()}</span
                        >
                      </div>
                      <div>
                        <div class="font-semibold text-white">{division.name}</div>
                        <div class="text-xs text-gray-500">ID: {division.id}</div>
                      </div>
                    </div>
                  {:else if col.key === 'cost'}
                    {#if division.signupCost > 0}
                      <span class="text-sm font-medium text-green-400"
                        >{regionData.region?.currencySymbol || '€'}{division.signupCost.toFixed(
                          2,
                        )}</span
                      >
                    {:else}
                      <span class="text-sm text-gray-500">Free</span>
                    {/if}
                  {:else if col.key === 'visibility'}
                    <span
                      class="px-2 py-1 rounded text-xs font-medium {division.hidden === 0
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'}"
                    >
                      {division.hidden === 0 ? 'Visible' : 'Hidden'}
                    </span>
                  {:else if col.key === 'teams'}
                    <span class="text-sm font-medium text-white">{division.teams}</span>
                    <span class="text-xs text-gray-500 ml-1">teams</span>
                  {:else if col.key === 'actions'}
                    {#if data.isStrictAdmin}
                      <div class="flex items-center justify-end gap-2">
                        <form method="POST" action="?/toggleDivisionVisibility" use:enhance>
                          <input type="hidden" name="divisionId" value={division.id} />
                          <button
                            type="submit"
                            class="px-3 py-1 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
                          >
                            {division.hidden === 0 ? 'Hide' : 'Show'}
                          </button>
                        </form>
                        <button
                          onclick={() => (editingDivision = division)}
                          class="px-3 py-1 text-sm bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onclick={() => {
                            deletingDivision = division;
                            deleteConfirmText = '';
                          }}
                          class="px-3 py-1 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    {/if}
                  {/if}
                {/snippet}
              </DataTable>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else if activeTab === 'arenas'}
    <!-- ARENAS & MAPS TAB -->
    <div class="space-y-8">
      <!-- ARENAS SECTION -->
      <div>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h3 class="text-xl font-bold text-white">Arenas</h3>
            <p class="text-sm text-gray-400 mt-1">Manage map arenas for matches</p>
          </div>
          <button
            onclick={() => (showArenaForm = !showArenaForm)}
            class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            {showArenaForm ? '✕ Cancel' : '+ Add Arena'}
          </button>
        </div>

        {#if showArenaForm}
          <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
            <h4 class="text-lg font-semibold text-white mb-4">Create New Arena</h4>
            <form
              method="POST"
              action="?/createArena"
              enctype="multipart/form-data"
              use:enhance={() => {
                isSubmitting = true;
                return async ({ update, result }) => {
                  await update();
                  isSubmitting = false;
                  if (result.type === 'success') {
                    showArenaForm = false;
                    await invalidateAll();
                  }
                };
              }}
            >
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label for="arena-name" class="block text-sm font-medium text-gray-300 mb-2"
                    >Arena Name</label
                  >
                  <input
                    id="arena-name"
                    name="name"
                    type="text"
                    placeholder="Badlands"
                    required
                    class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label
                    for="arena-avatar-file"
                    class="block text-sm font-medium text-gray-300 mb-2"
                  >
                    Upload Image
                    <span class="text-xs text-gray-500 ml-1">(JPEG, PNG, GIF, WebP - max 5MB)</span>
                  </label>
                  <input
                    id="arena-avatar-file"
                    name="avatarFile"
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-orange-600 file:text-white hover:file:bg-orange-500"
                  />
                </div>
                <div>
                  <label for="playoff-map" class="block text-sm font-medium text-gray-300 mb-2"
                    >Playoff Map</label
                  >
                  <select
                    id="playoff-map"
                    name="playoffMap"
                    class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>
              <div class="mt-4">
                <label for="arena-avatar-url" class="block text-sm font-medium text-gray-300 mb-2">
                  Or enter Image URL
                  <span class="text-xs text-gray-500 ml-1">(alternative to file upload)</span>
                </label>
                <input
                  id="arena-avatar-url"
                  name="avatarUrl"
                  type="text"
                  placeholder="https://example.com/arena.png"
                  class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>
              <div class="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onclick={() => (showArenaForm = false)}
                  class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {isSubmitting ? 'Creating...' : 'Create Arena'}
                </button>
              </div>
            </form>
          </div>
        {/if}

        {#if data.arenas.length === 0}
          <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
            <p class="text-gray-400 text-lg mb-4">No arenas found</p>
            <p class="text-gray-500 text-sm">Create your first arena to get started</p>
          </div>
        {:else}
          <DataTable data={data.arenas} columns={arenaColumns}>
            {#snippet cell(arena, col)}
              {#if col.key === 'arena'}
                <div class="flex items-center gap-2">
                  <div
                    class="w-8 h-8 rounded bg-orange-500/10 border border-orange-500/30 flex items-center justify-center overflow-hidden flex-shrink-0"
                  >
                    {#if arena.avatar}
                      <img
                        src={arena.avatar}
                        alt={arena.name}
                        class="w-full h-full object-cover"
                        onerror={(e) => {
                          const img = e.target as HTMLImageElement;
                          img.style.display = 'none';
                          (img.nextElementSibling as HTMLElement)?.style.setProperty(
                            'display',
                            'block',
                          );
                        }}
                      />
                      <span class="text-lg text-gray-500" style="display: none;">?</span>
                    {:else}
                      <span class="text-lg text-gray-500">?</span>
                    {/if}
                  </div>
                  <span class="text-sm font-medium text-white">{arena.name}</span>
                </div>
              {:else if col.key === 'playoff'}
                <span
                  class="px-2 py-1 rounded text-xs font-medium {arena.playoffMap === 1
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-gray-500/20 text-gray-400'}"
                >
                  {arena.playoffMap === 1 ? 'Yes' : 'No'}
                </span>
              {:else if col.key === 'games'}
                <span class="text-sm text-gray-300">{arena.games}</span>
              {:else if col.key === 'actions'}
                <div class="flex items-center justify-end gap-2">
                  <button
                    onclick={() => (editingArena = arena)}
                    class="px-3 py-1 text-sm bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded transition-colors"
                  >
                    Edit
                  </button>
                  {#if data.isStrictAdmin}
                    <button
                      onclick={() => {
                        deletingArena = arena;
                        deleteConfirmText = '';
                      }}
                      class="px-3 py-1 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                    >
                      Delete
                    </button>
                  {/if}
                </div>
              {/if}
            {/snippet}
          </DataTable>
        {/if}
      </div>

      <!-- MAP BAN POOLS SECTION -->
      <div class="pt-8 border-t border-zinc-800">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h3 class="text-xl font-bold text-white">Map Ban Pools</h3>
            <p class="text-sm text-gray-400 mt-1">Manage map pools for ban/pick phase</p>
          </div>
          <button
            onclick={() => (showPoolForm = !showPoolForm)}
            class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            {showPoolForm ? '✕ Cancel' : '+ Create Pool'}
          </button>
        </div>

        {#if showPoolForm}
          <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
            <h4 class="text-lg font-semibold text-white mb-4">Create New Map Ban Pool</h4>
            <form
              method="POST"
              action="?/createMapBanPool"
              use:enhance={() => {
                isSubmitting = true;
                return async ({ update, result }) => {
                  await update();
                  isSubmitting = false;
                  if (result.type === 'success') {
                    showPoolForm = false;
                  }
                };
              }}
            >
              <div class="flex gap-4">
                <div class="flex-1">
                  <label for="pool-name" class="block text-sm font-medium text-gray-300 mb-2"
                    >Pool Name</label
                  >
                  <input
                    id="pool-name"
                    name="name"
                    type="text"
                    placeholder="Season 5 Map Pool"
                    required
                    class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div class="flex items-end gap-3">
                  <button
                    type="button"
                    onclick={() => (showPoolForm = false)}
                    class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Pool'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        {/if}

        {#if data.mapBanPools.length === 0}
          <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
            <p class="text-gray-400 text-lg mb-4">No map ban pools found</p>
            <p class="text-gray-500 text-sm">Create your first pool to get started</p>
          </div>
        {:else}
          <div class="space-y-4">
            {#each data.mapBanPools as pool}
              <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
                <div class="flex items-start justify-between mb-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-3">
                      <h4 class="text-lg font-semibold text-white">{pool.name}</h4>
                      <span
                        class="px-2 py-1 rounded text-xs font-medium {pool.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-gray-500/20 text-gray-400'}"
                      >
                        {pool.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">
                      {pool.maps.length} maps • Used in {pool.matchesUsed} matches
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <form method="POST" action="?/toggleMapBanPoolStatus" use:enhance>
                      <input type="hidden" name="poolId" value={pool.id} />
                      <button
                        type="submit"
                        class="px-3 py-1.5 text-sm rounded transition-colors {pool.isActive
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}"
                      >
                        {pool.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </form>
                    <button
                      onclick={() => (addingMapsToPool = pool)}
                      class="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
                    >
                      Add Maps
                    </button>
                    <button
                      onclick={() => (editingPool = pool)}
                      class="px-3 py-1.5 text-sm bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded transition-colors"
                    >
                      Edit
                    </button>
                    {#if data.isStrictAdmin}
                      <button
                        onclick={() => (deletingPool = pool)}
                        class="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                      >
                        Delete
                      </button>
                    {/if}
                  </div>
                </div>

                {#if pool.maps.length > 0}
                  <div class="flex flex-wrap gap-2">
                    {#each pool.maps as map}
                      <div
                        class="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700"
                      >
                        <div class="w-6 h-6 rounded flex items-center justify-center flex-shrink-0">
                          {#if map.avatar}
                            <img
                              src={map.avatar}
                              alt={map.name}
                              class="w-full h-full rounded object-cover"
                              onerror={(e) => {
                                const img = e.target as HTMLImageElement;
                                img.style.display = 'none';
                                (img.nextElementSibling as HTMLElement)?.style.setProperty(
                                  'display',
                                  'block',
                                );
                              }}
                            />
                            <span class="text-xs text-gray-500" style="display: none;">?</span>
                          {:else}
                            <span class="text-xs text-gray-500">?</span>
                          {/if}
                        </div>
                        <span class="text-sm text-gray-300">{map.name}</span>
                        <form method="POST" action="?/removeMapFromPool" use:enhance class="ml-1">
                          <input type="hidden" name="poolId" value={pool.id} />
                          <input type="hidden" name="arenaId" value={map.id} />
                          <button
                            type="submit"
                            class="text-red-400 hover:text-red-300 transition-colors"
                          >
                            ×
                          </button>
                        </form>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="text-center py-4 text-gray-500 text-sm">
                    No maps in this pool yet. Click "Add Maps" to add some.
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {:else if activeTab === 'formats'}
    <!-- FORMATS TAB -->
    <div>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-xl font-bold text-white">Formats</h3>
        {#if data.isStrictAdmin}
          <button
            onclick={() => (showFormatForm = !showFormatForm)}
            class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
          >
            {showFormatForm ? 'Cancel' : '+ Add Format'}
          </button>
        {/if}
      </div>

      <!-- Create Format Form -->
      {#if showFormatForm && data.isStrictAdmin}
        <div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 mb-6">
          <h4 class="text-lg font-medium text-white mb-4">Create New Format</h4>
          <form
            method="POST"
            action="?/createFormat"
            use:enhance={() => {
              isSubmitting = true;
              return async ({ update }) => {
                await update();
                isSubmitting = false;
                showFormatForm = false;
              };
            }}
            class="space-y-4"
          >
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="formatName" class="block text-sm font-medium text-gray-300 mb-2"
                  >Name</label
                >
                <input
                  type="text"
                  id="formatName"
                  name="name"
                  placeholder="e.g., 1v1, 2v2, 3v3"
                  required
                  class="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <p class="text-xs text-gray-500 mt-1">Display name shown to users</p>
              </div>
              <div>
                <label for="formatCode" class="block text-sm font-medium text-gray-300 mb-2"
                  >Code</label
                >
                <input
                  type="text"
                  id="formatCode"
                  name="code"
                  placeholder="e.g., 1v1, 2v2, 3v3"
                  required
                  class="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <p class="text-xs text-gray-500 mt-1">Unique identifier (must be unique)</p>
              </div>
            </div>
            <div class="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Format'}
              </button>
            </div>
          </form>
        </div>
      {/if}

      <!-- Formats List -->
      {#if data.formats.length === 0}
        <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
          <p class="text-gray-400 text-lg mb-4">No formats created yet</p>
          <p class="text-gray-500 text-sm">Add a format to get started</p>
        </div>
      {:else}
        <DataTable data={data.formats} columns={formatColumns}>
          {#snippet cell(format, col)}
            {#if col.key === 'id'}
              <span class="text-gray-400 text-sm">{format.id}</span>
            {:else if col.key === 'name'}
              <span class="text-white font-medium">{format.name}</span>
            {:else if col.key === 'code'}
              <span class="px-2 py-1 bg-zinc-700 rounded text-gray-300 text-sm font-mono"
                >{format.code}</span
              >
            {:else if col.key === 'seasons'}
              <span class="text-gray-300">{format.seasons}</span>
            {:else if col.key === 'teams'}
              <span class="text-gray-300">{format.teams}</span>
            {:else if col.key === 'activeSignups'}
              <span class="text-gray-300">{format.activeSignupSeasons}</span>
            {:else if col.key === 'actions'}
              {#if data.isStrictAdmin}
                <div class="flex items-center justify-end gap-2">
                  <button
                    onclick={() => (editingFormat = format)}
                    class="px-3 py-1 text-sm bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onclick={() => {
                      deletingFormat = format;
                      deleteConfirmText = '';
                    }}
                    class="px-3 py-1 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
                  >
                    Delete
                  </button>
                </div>
              {/if}
            {/if}
          {/snippet}
        </DataTable>
      {/if}
    </div>
  {/if}
</div>

{#if editingFormat}
  <Dialog open={true} title="Edit Format" onClose={() => (editingFormat = null)}>
    <FormError error={form?.error} />

    <form
      method="POST"
      action="?/updateFormat"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            editingFormat = null;
          }
        };
      }}
    >
      <input type="hidden" name="formatId" value={editingFormat.id} />

      <FormInput label="Name" name="name" value={editingFormat.name} required />

      <FormInput
        label="Code"
        name="code"
        value={editingFormat.code}
        required
        hint="Must be unique across all formats"
      />

      <div class="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onclick={() => (editingFormat = null)}
          class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  </Dialog>
{/if}

{#if editingRegion}
  <Dialog open={true} title="Edit Region" onClose={() => (editingRegion = null)}>
    <form
      method="POST"
      action="?/updateRegion"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            editingRegion = null;
          }
        };
      }}
    >
      <input type="hidden" name="regionId" value={editingRegion.id} />

      <FormInput label="Region Name" name="name" value={editingRegion.name} required />

      <FormSelect
        label="Currency"
        name="currencyCode"
        value={editingRegion.currencyCode || 'USD'}
        options={[
          { value: 'USD', label: '$ (USD)' },
          { value: 'EUR', label: '€ (EUR)' },
        ]}
        hint="The currency used for PayPal charges and displaying signup costs in this region."
      />

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          onclick={() => (editingRegion = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  </Dialog>
{/if}

{#if editingSeason}
  <Dialog
    open={true}
    title="Edit Season {editingSeason.seasonNum}"
    onClose={() => (editingSeason = null)}
  >
    <FormError error={form?.error} />

    <form
      method="POST"
      action="?/updateSeason"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            editingSeason = null;
          }
        };
      }}
    >
      <input type="hidden" name="seasonId" value={editingSeason.id} />

      <FormInput
        label="Season Number"
        name="seasonNum"
        type="number"
        value={String(editingSeason.seasonNum)}
        required
      />

      <FormSelect
        label="Region"
        name="regionId"
        value={String(editingSeason.regionId)}
        options={data.regions.map((r) => ({ value: String(r.id), label: r.name }))}
        required
      />

      <FormSelect
        label="Format"
        name="formatId"
        value={String(editingSeason.formatId)}
        options={data.formats.map((f) => ({ value: String(f.id), label: f.name }))}
        required
      />

      <FormInput
        label="Number of Weeks"
        name="numWeeks"
        type="number"
        value={String(editingSeason.numWeeks)}
        required
      />

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          onclick={() => (editingSeason = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  </Dialog>
{/if}

{#if editingDivision}
  {@const effectiveRegionId =
    selectedEditRegionId !== null ? selectedEditRegionId : editingDivision.regionId}
  <Dialog
    open={true}
    title="Edit Division"
    onClose={() => {
      editingDivision = null;
      selectedEditRegionId = null;
    }}
  >
    <form
      method="POST"
      action="?/updateDivision"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            editingDivision = null;
            selectedEditRegionId = null;
          }
        };
      }}
    >
      <input type="hidden" name="divisionId" value={editingDivision.id} />

      <FormInput label="Division Name" name="name" value={editingDivision.name} required />

      <FormSelect
        label="Region"
        name="regionId"
        value={String(editingDivision.regionId)}
        options={data.regions.map((r) => ({ value: String(r.id), label: r.name }))}
        required
        hint="Changing region allows you to have same-named divisions in different regions with different pricing."
        onChange={(val) => {
          selectedEditRegionId = val ? parseInt(val) : null;
        }}
      />

      <div class="mb-6">
        <label for="edit-signup-cost" class="block text-sm font-medium text-gray-300 mb-2">
          Signup Cost ({getCurrencySymbol(effectiveRegionId)})
        </label>
        <div class="relative">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            >{getCurrencySymbol(effectiveRegionId)}</span
          >
          <input
            id="edit-signup-cost"
            name="signupCost"
            type="number"
            value={editingDivision.signupCost}
            step="0.01"
            min="0"
            class="w-full pl-8 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          onclick={() => {
            editingDivision = null;
            selectedEditRegionId = null;
          }}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  </Dialog>
{/if}

{#if editingArena}
  <Dialog open={true} title="Edit Arena" onClose={() => (editingArena = null)}>
    <form
      method="POST"
      action="?/updateArena"
      enctype="multipart/form-data"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            editingArena = null;
            await invalidateAll();
          }
        };
      }}
    >
      <input type="hidden" name="arenaId" value={editingArena.id} />

      <FormInput label="Arena Name" name="name" value={editingArena.name} required />

      <div class="mb-6">
        <label for="edit-arena-avatar-file" class="block text-sm font-medium text-gray-300 mb-2">
          Arena Image
          <span class="text-xs text-gray-500 ml-1">(JPEG, PNG, GIF, WebP - max 5MB)</span>
        </label>
        <div class="flex items-start gap-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
          {#if editingArena.avatar}
            <img
              src={editingArena.avatar}
              alt={editingArena.name}
              class="w-16 h-16 rounded object-cover flex-shrink-0"
            />
          {:else}
            <div
              class="w-16 h-16 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0"
            >
              <span class="text-2xl text-gray-500">?</span>
            </div>
          {/if}
          <div class="flex-1">
            <input
              id="edit-arena-avatar-file"
              name="avatarFile"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              class="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500 file:cursor-pointer cursor-pointer"
            />
            <input type="hidden" name="avatarUrl" value={editingArena.avatar || ''} />
          </div>
        </div>
      </div>

      <FormSelect
        label="Playoff Map"
        name="playoffMap"
        value={editingArena.playoffMap === 1 ? 'true' : 'false'}
        options={[
          { value: 'false', label: 'No' },
          { value: 'true', label: 'Yes' },
        ]}
      />

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          onclick={() => (editingArena = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  </Dialog>
{/if}

{#if deletingArena}
  <Dialog open={true} title="Delete Arena" onClose={() => (deletingArena = null)}>
    <div class="mb-6">
      <p class="text-gray-300 mb-4">
        Are you sure you want to delete <strong class="text-white">{deletingArena.name}</strong>?
      </p>

      {#if deletingArena.games > 0}
        <div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg mb-4">
          <p class="text-yellow-400 text-sm font-medium mb-2">Cannot Delete</p>
          <p class="text-yellow-300 text-sm">
            This arena has {deletingArena.games} game{deletingArena.games !== 1 ? 's' : ''} played on
            it. You cannot delete it until these are removed.
          </p>
        </div>
      {:else}
        <div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg mb-4">
          <p class="text-red-400 text-sm">This action cannot be undone.</p>
        </div>
        <div>
          <label for="arenaDeleteConfirm" class="block text-sm text-gray-400 mb-1"
            >Type <strong class="text-white">DELETE</strong> to confirm</label
          >
          <input
            id="arenaDeleteConfirm"
            type="text"
            bind:value={deleteConfirmText}
            placeholder="DELETE"
            class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500"
          />
        </div>
      {/if}
    </div>

    {#snippet footer()}
      <form
        method="POST"
        action="?/deleteArena"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update, result }) => {
            await update();
            isSubmitting = false;
            if (result.type === 'success') {
              deletingArena = null;
            }
          };
        }}
        class="flex gap-3"
      >
        <input type="hidden" name="arenaId" value={deletingArena!.id} />
        <button
          type="button"
          onclick={() => (deletingArena = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || deletingArena!.games > 0 || deleteConfirmText !== 'DELETE'}
          class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Deleting...' : 'Delete Arena'}
        </button>
      </form>
    {/snippet}
  </Dialog>
{/if}

{#if editingPool}
  <Dialog open={true} title="Edit Map Ban Pool" onClose={() => (editingPool = null)}>
    <form
      method="POST"
      action="?/updateMapBanPool"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            editingPool = null;
          }
        };
      }}
    >
      <input type="hidden" name="poolId" value={editingPool.id} />

      <FormInput label="Pool Name" name="name" value={editingPool.name} required />

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          onclick={() => (editingPool = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  </Dialog>
{/if}

{#if deletingPool}
  <Dialog open={true} title="Delete Map Ban Pool" onClose={() => (deletingPool = null)}>
    <div class="mb-6">
      <p class="text-gray-300 mb-4">
        Are you sure you want to delete <strong class="text-white">{deletingPool.name}</strong>?
      </p>

      {#if deletingPool.matchesUsed > 0}
        <div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
          <p class="text-yellow-400 text-sm font-medium mb-2">⚠️ Warning</p>
          <p class="text-yellow-300 text-sm">
            This pool is used in {deletingPool.matchesUsed} match{deletingPool.matchesUsed !== 1
              ? 'es'
              : ''}. You cannot delete it until these are removed.
          </p>
        </div>
      {:else}
        <div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
          <p class="text-red-400 text-sm">
            ⚠️ This action cannot be undone. All maps in this pool will be removed.
          </p>
        </div>
      {/if}
    </div>

    {#snippet footer()}
      <form
        method="POST"
        action="?/deleteMapBanPool"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update, result }) => {
            await update();
            isSubmitting = false;
            if (result.type === 'success') {
              deletingPool = null;
            }
          };
        }}
        class="flex gap-3"
      >
        <input type="hidden" name="poolId" value={deletingPool!.id} />
        <button
          type="button"
          onclick={() => (deletingPool = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || deletingPool!.matchesUsed > 0}
          class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Deleting...' : 'Delete Pool'}
        </button>
      </form>
    {/snippet}
  </Dialog>
{/if}

{#if addingMapsToPool}
  <Dialog
    open={true}
    title="Add Maps to {addingMapsToPool.name}"
    maxWidth="2xl"
    onClose={() => (addingMapsToPool = null)}
  >
    <form
      method="POST"
      action="?/addMapsToPool"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            addingMapsToPool = null;
          }
        };
      }}
    >
      <input type="hidden" name="poolId" value={addingMapsToPool.id} />

      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 max-h-96 overflow-y-auto">
        {#each data.arenas as arena}
          {@const isInPool = addingMapsToPool.maps.some((m) => m.id === arena.id)}
          <label
            class="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700 cursor-pointer hover:border-orange-500 transition-colors {isInPool
              ? 'opacity-50'
              : ''}"
          >
            <input
              type="checkbox"
              name="arenaIds"
              value={arena.id}
              disabled={isInPool}
              class="rounded border-gray-600 bg-zinc-700"
            />
            <div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0">
              {#if arena.avatar}
                <img
                  src={arena.avatar}
                  alt={arena.name}
                  class="w-full h-full rounded object-cover"
                  onerror={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                    (img.nextElementSibling as HTMLElement)?.style.setProperty('display', 'block');
                  }}
                />
                <span class="text-sm text-gray-500" style="display: none;">?</span>
              {:else}
                <span class="text-sm text-gray-500">?</span>
              {/if}
            </div>
            <span class="text-sm text-gray-300">{arena.name}</span>
          </label>
        {/each}
      </div>

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          onclick={() => (addingMapsToPool = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Adding...' : 'Add Selected Maps'}
        </button>
      </div>
    </form>
  </Dialog>
{/if}

{#if showPlayoffModal}
  <Dialog open={true} title="Manage Playoffs" onClose={() => (showPlayoffModal = null)}>
    <p class="text-gray-400 text-sm mb-6">
      Configure playoff settings for Season {showPlayoffModal.seasonNum} ({showPlayoffModal.region})
    </p>

    <form
      method="POST"
      action="?/managePlayoff"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            showPlayoffModal = null;
          }
        };
      }}
    >
      <input type="hidden" name="seasonId" value={showPlayoffModal.id} />

      <FormSelect
        label="Playoff Format"
        name="format"
        value={playoffFormat}
        options={[
          { value: 'tournament', label: 'Tournament' },
          { value: 'rounds', label: 'Rounds' },
        ]}
        onChange={(val) => {
          playoffFormat = val as 'tournament' | 'rounds';
        }}
      />

      {#if playoffFormat === 'rounds'}
        <FormInput
          label="Number of Rounds"
          name="numRounds"
          type="number"
          value={String(showPlayoffModal.playoff?.numRounds || 2)}
        />

        <FormSelect
          label="Double Elimination"
          name="doubleElim"
          value={String(showPlayoffModal.playoff?.doubleElim || 0)}
          options={[
            { value: '0', label: 'No' },
            { value: '1', label: 'Yes' },
          ]}
        />
      {/if}

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          onclick={() => (showPlayoffModal = null)}
          class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>
    </form>
  </Dialog>
{/if}

{#if deletingSeason}
  <Dialog open={true} title="Delete Season" onClose={() => (deletingSeason = null)}>
    <div class="mb-6">
      <p class="text-gray-300 mb-4">
        Are you sure you want to delete <strong class="text-white"
          >Season {deletingSeason.seasonNum} ({deletingSeason.region})</strong
        >?
      </p>

      {#if deletingSeason.teams > 0 || deletingSeason.matches > 0}
        <div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg mb-4">
          <p class="text-yellow-400 text-sm font-medium mb-2">Cannot Delete</p>
          <p class="text-yellow-300 text-sm">
            This season has {[
              deletingSeason.teams > 0
                ? `${deletingSeason.teams} team${deletingSeason.teams !== 1 ? 's' : ''}`
                : '',
              deletingSeason.matches > 0
                ? `${deletingSeason.matches} match${deletingSeason.matches !== 1 ? 'es' : ''}`
                : '',
            ]
              .filter(Boolean)
              .join(' and ')}. You cannot delete it until these are removed.
          </p>
        </div>
      {:else}
        <div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg mb-4">
          <p class="text-red-400 text-sm">This action cannot be undone.</p>
        </div>
        <div>
          <label for="seasonDeleteConfirm" class="block text-sm text-gray-400 mb-1"
            >Type <strong class="text-white">DELETE</strong> to confirm</label
          >
          <input
            id="seasonDeleteConfirm"
            type="text"
            bind:value={deleteConfirmText}
            placeholder="DELETE"
            class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500"
          />
        </div>
      {/if}
    </div>

    {#snippet footer()}
      <form
        method="POST"
        action="?/deleteSeason"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update, result }) => {
            await update();
            isSubmitting = false;
            if (result.type === 'success') {
              deletingSeason = null;
            }
          };
        }}
        class="flex gap-3"
      >
        <input type="hidden" name="seasonId" value={deletingSeason!.id} />
        <button
          type="button"
          onclick={() => (deletingSeason = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting ||
            deletingSeason!.teams > 0 ||
            deletingSeason!.matches > 0 ||
            deleteConfirmText !== 'DELETE'}
          class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Deleting...' : 'Delete Season'}
        </button>
      </form>
    {/snippet}
  </Dialog>
{/if}

{#if deletingRegion}
  <Dialog open={true} title="Delete Region" onClose={() => (deletingRegion = null)}>
    <div class="mb-6">
      <p class="text-gray-300 mb-4">
        Are you sure you want to delete <strong class="text-white">{deletingRegion.name}</strong>?
      </p>

      {#if deletingRegion.seasons > 0 || deletingRegion.teams > 0}
        <div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg mb-4">
          <p class="text-yellow-400 text-sm font-medium mb-2">Cannot Delete</p>
          <p class="text-yellow-300 text-sm">
            This region has {[
              deletingRegion.seasons > 0
                ? `${deletingRegion.seasons} season${deletingRegion.seasons !== 1 ? 's' : ''}`
                : '',
              deletingRegion.teams > 0
                ? `${deletingRegion.teams} team${deletingRegion.teams !== 1 ? 's' : ''}`
                : '',
            ]
              .filter(Boolean)
              .join(' and ')}. You cannot delete it until these are removed.
          </p>
        </div>
      {:else}
        <div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg mb-4">
          <p class="text-red-400 text-sm">This action cannot be undone.</p>
        </div>
        <div>
          <label for="regionDeleteConfirm" class="block text-sm text-gray-400 mb-1"
            >Type <strong class="text-white">DELETE</strong> to confirm</label
          >
          <input
            id="regionDeleteConfirm"
            type="text"
            bind:value={deleteConfirmText}
            placeholder="DELETE"
            class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500"
          />
        </div>
      {/if}
    </div>

    {#snippet footer()}
      <form
        method="POST"
        action="?/deleteRegion"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update, result }) => {
            await update();
            isSubmitting = false;
            if (result.type === 'success') {
              deletingRegion = null;
            }
          };
        }}
        class="flex gap-3"
      >
        <input type="hidden" name="regionId" value={deletingRegion!.id} />
        <button
          type="button"
          onclick={() => (deletingRegion = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting ||
            deletingRegion!.seasons > 0 ||
            deletingRegion!.teams > 0 ||
            deleteConfirmText !== 'DELETE'}
          class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Deleting...' : 'Delete Region'}
        </button>
      </form>
    {/snippet}
  </Dialog>
{/if}

{#if deletingDivision}
  <Dialog open={true} title="Delete Division" onClose={() => (deletingDivision = null)}>
    <div class="mb-6">
      <p class="text-gray-300 mb-4">
        Are you sure you want to delete <strong class="text-white">{deletingDivision.name}</strong>?
      </p>

      {#if deletingDivision.teams > 0}
        <div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg mb-4">
          <p class="text-yellow-400 text-sm font-medium mb-2">Cannot Delete</p>
          <p class="text-yellow-300 text-sm">
            This division has {deletingDivision.teams} team{deletingDivision.teams !== 1 ? 's' : ''} assigned
            to it. You cannot delete it until these are removed.
          </p>
        </div>
      {:else}
        <div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg mb-4">
          <p class="text-red-400 text-sm">This action cannot be undone.</p>
        </div>
        <div>
          <label for="divisionDeleteConfirm" class="block text-sm text-gray-400 mb-1"
            >Type <strong class="text-white">DELETE</strong> to confirm</label
          >
          <input
            id="divisionDeleteConfirm"
            type="text"
            bind:value={deleteConfirmText}
            placeholder="DELETE"
            class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500"
          />
        </div>
      {/if}
    </div>

    {#snippet footer()}
      <form
        method="POST"
        action="?/deleteDivision"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update, result }) => {
            await update();
            isSubmitting = false;
            if (result.type === 'success') {
              deletingDivision = null;
            }
          };
        }}
        class="flex gap-3"
      >
        <input type="hidden" name="divisionId" value={deletingDivision!.id} />
        <button
          type="button"
          onclick={() => (deletingDivision = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || deletingDivision!.teams > 0 || deleteConfirmText !== 'DELETE'}
          class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Deleting...' : 'Delete Division'}
        </button>
      </form>
    {/snippet}
  </Dialog>
{/if}

{#if deletingFormat}
  <Dialog open={true} title="Delete Format" onClose={() => (deletingFormat = null)}>
    <div class="mb-6">
      <p class="text-gray-300 mb-4">
        Are you sure you want to delete <strong class="text-white">{deletingFormat.name}</strong>
        (<span class="font-mono">{deletingFormat.code}</span>)?
      </p>

      {#if deletingFormat.seasons > 0 || deletingFormat.teams > 0 || deletingFormat.activeSignupSeasons > 0}
        <div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg mb-4">
          <p class="text-yellow-400 text-sm font-medium mb-2">Cannot Delete</p>
          <p class="text-yellow-300 text-sm">
            This format is used by
            {[
              deletingFormat.seasons > 0
                ? `${deletingFormat.seasons} season${deletingFormat.seasons !== 1 ? 's' : ''}`
                : '',
              deletingFormat.teams > 0
                ? `${deletingFormat.teams} team${deletingFormat.teams !== 1 ? 's' : ''}`
                : '',
              deletingFormat.activeSignupSeasons > 0 ? 'active signup configuration' : '',
            ]
              .filter(Boolean)
              .join(', ')}. You cannot delete it until these are removed.
          </p>
        </div>
      {:else}
        <div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg mb-4">
          <p class="text-red-400 text-sm">This action cannot be undone.</p>
        </div>
        <div>
          <label for="formatDeleteConfirm" class="block text-sm text-gray-400 mb-1"
            >Type <strong class="text-white">DELETE</strong> to confirm</label
          >
          <input
            id="formatDeleteConfirm"
            type="text"
            bind:value={deleteConfirmText}
            placeholder="DELETE"
            class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500"
          />
        </div>
      {/if}
    </div>

    {#snippet footer()}
      <form
        method="POST"
        action="?/deleteFormat"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update, result }) => {
            await update();
            isSubmitting = false;
            if (result.type === 'success') {
              deletingFormat = null;
            }
          };
        }}
        class="flex gap-3"
      >
        <input type="hidden" name="formatId" value={deletingFormat!.id} />
        <button
          type="button"
          onclick={() => (deletingFormat = null)}
          class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting ||
            deletingFormat!.seasons > 0 ||
            deletingFormat!.teams > 0 ||
            deletingFormat!.activeSignupSeasons > 0 ||
            deleteConfirmText !== 'DELETE'}
          class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSubmitting ? 'Deleting...' : 'Delete Format'}
        </button>
      </form>
    {/snippet}
  </Dialog>
{/if}
