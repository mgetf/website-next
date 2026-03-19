<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import FilterBar from '$lib/components/ui/FilterBar.svelte';
  import SearchInput from '$lib/components/ui/SearchInput.svelte';
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import { FORMAT_1V1 } from '$lib/constants/formats';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let editingTeam: (typeof data.teams)[0] | null = $state(null);
  let editModalRegionId: number | null = $state(null);
  let editModalSeasonId: number | null = $state(null);
  let disbandingTeam: (typeof data.teams)[0] | null = $state(null);
  let restoringTeam: (typeof data.teams)[0] | null = $state(null);
  let deletingTeam: (typeof data.teams)[0] | null = $state(null);
  let deleteConfirmText = $state('');
  let isSubmitting = $state(false);
  let isDisbanding = $state(false);
  let isRestoring = $state(false);
  let isDeleting = $state(false);
  let lastFormResult: ActionData = null;

  const editModalSeasonOptions = $derived(
    editModalRegionId
      ? data.seasons.filter(
          (s) =>
            s.regionId === editModalRegionId &&
            (!editingTeam || s.formatId === editingTeam.formatId),
        )
      : [],
  );

  const editModalDivisionOptions = $derived(
    editModalRegionId ? data.divisions.filter((d) => d.regionId === editModalRegionId) : [],
  );

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error && !editingTeam) {
        toast.error(form.error);
      }
    }
  });

  const columns = [
    { key: 'team', label: 'Team' },
    { key: 'format', label: 'Format' },
    { key: 'season', label: 'Season' },
    { key: 'division', label: 'Division' },
    { key: 'region', label: 'Region' },
    { key: 'record', label: 'Record' },
    { key: 'status', label: 'Status' },
    { key: 'payment', label: 'Payment' },
    { key: 'actions', label: 'Actions', align: 'right' as const },
  ];

  const paginationInfo = $derived(
    `Showing ${(data.pagination.page - 1) * data.pagination.pageSize + 1} to ${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalTeams)} of ${data.pagination.totalTeams} teams`,
  );

  const filteredSeasons = $derived(() => {
    let seasons = data.seasons;
    if (data.filters.region) {
      const regionId = parseInt(data.filters.region);
      seasons = seasons.filter((s) => s.regionId === regionId);
    }
    if (data.filters.format) {
      const formatId = parseInt(data.filters.format);
      seasons = seasons.filter((s) => s.formatId === formatId);
    }
    return seasons;
  });

  const seasonOptions = $derived(
    filteredSeasons().map((s) => ({
      value: s.id.toString(),
      label: `Season ${s.seasonNum} (${s.region.name})`,
    })),
  );

  const divisionOptions = $derived(
    data.divisions
      .filter((d) => !data.filters.region || d.regionId === parseInt(data.filters.region))
      .map((d) => ({ value: d.id.toString(), label: d.name })),
  );

  const regionOptions = $derived(
    data.regions.map((r) => ({ value: r.id.toString(), label: r.name })),
  );

  const formatOptions = $derived(
    (data.formats ?? []).map((f) => ({ value: f.id.toString(), label: f.name })),
  );

  const statusOptions = [
    { value: '2', label: 'Ready' },
    { value: '1', label: 'Pending' },
    { value: '0', label: 'Unready' },
    { value: '3', label: 'Dead' },
  ];

  let searchInput = $state('');

  $effect(() => {
    searchInput = data.filters.search;
  });

  const hasActiveFilters = $derived(
    !!(
      data.filters.search ||
      data.filters.format ||
      data.filters.region ||
      data.filters.season ||
      data.filters.division ||
      data.filters.status
    ),
  );

  function handleSearch() {
    updateFilters({ search: searchInput });
  }

  function clearFilters() {
    searchInput = '';
    goto('/admin/teams');
  }

  function updateFilters(updates: Record<string, string>) {
    const params = new URLSearchParams(page.url.searchParams);

    if (updates.region !== undefined || updates.format !== undefined) {
      const newRegionId =
        updates.region !== undefined
          ? updates.region
            ? parseInt(updates.region)
            : null
          : params.get('region')
            ? parseInt(params.get('region')!)
            : null;
      const newFormatId =
        updates.format !== undefined
          ? updates.format
            ? parseInt(updates.format)
            : null
          : params.get('format')
            ? parseInt(params.get('format')!)
            : null;
      const currentSeasonId = params.get('season');

      if (currentSeasonId) {
        const currentSeason = data.seasons.find((s) => s.id === parseInt(currentSeasonId));
        if (currentSeason) {
          const regionMismatch = newRegionId && currentSeason.regionId !== newRegionId;
          const formatMismatch = newFormatId && currentSeason.formatId !== newFormatId;
          if (regionMismatch || formatMismatch) {
            params.delete('season');
          }
        }
      }
    }

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    if (!updates.page) {
      params.delete('page');
    }

    goto(`?${params.toString()}`, { keepFocus: true, replaceState: true });
  }

  const statusNames: Record<string, string> = {
    UNREADY: 'Unready',
    PENDING: 'Pending',
    READY: 'Ready',
    DEAD: 'Dead',
  };

  const paymentNames: Record<number, string> = {
    0: 'Unpaid',
    1: 'Paid',
    2: 'Exempt',
  };

  function getStatusColor(status: string) {
    if (status === 'READY') return 'bg-green-500/20 text-green-400';
    if (status === 'PENDING') return 'bg-yellow-500/20 text-yellow-400';
    if (status === 'DEAD') return 'bg-red-500/20 text-red-400';
    return 'bg-gray-500/20 text-gray-400';
  }

  function getPaymentColor(payment: number) {
    if (payment === 1) return 'bg-green-500/20 text-green-400';
    if (payment === 2) return 'bg-blue-500/20 text-blue-400';
    return 'bg-red-500/20 text-red-400';
  }

  function goToPage(pageNum: number) {
    updateFilters({ page: pageNum.toString() });
  }

  function openEditModal(team: (typeof data.teams)[0]) {
    editingTeam = { ...team };
    editModalRegionId = team.region?.id ?? null;
    editModalSeasonId = team.season?.id ?? null;
  }

  function closeEditModal() {
    editingTeam = null;
    editModalRegionId = null;
    editModalSeasonId = null;
  }

  const statusToInt: Record<string, number> = {
    DEAD: -1,
    UNREADY: 0,
    PENDING: 1,
    READY: 2,
    PLACEMENT: 3,
  };
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <!-- Page Header -->
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">Team Management</h2>
    <p class="text-gray-400">View and manage all teams across all divisions</p>
  </div>

  <!-- Filters -->
  <FilterBar onSubmit={handleSearch} onClear={clearFilters} {hasActiveFilters}>
    {#snippet filters()}
      <div class="flex-1">
        <label for="search" class="block text-sm font-medium text-gray-400 mb-2">Search</label>
        <SearchInput bind:value={searchInput} placeholder="Search teams..." />
      </div>

      <div class="md:w-40">
        <label for="format" class="block text-sm font-medium text-gray-400 mb-2">Format</label>
        <SelectFilter
          value={data.filters.format}
          options={formatOptions}
          allLabel="All Formats"
          onChange={(v) => updateFilters({ format: v })}
        />
      </div>

      <div class="md:w-40">
        <label for="region" class="block text-sm font-medium text-gray-400 mb-2">Region</label>
        <SelectFilter
          value={data.filters.region}
          options={regionOptions}
          allLabel="All Regions"
          onChange={(v) => updateFilters({ region: v })}
        />
      </div>

      <div class="md:w-44">
        <label for="season" class="block text-sm font-medium text-gray-400 mb-2">Season</label>
        <SelectFilter
          value={data.filters.season}
          options={seasonOptions}
          allLabel="All Seasons"
          onChange={(v) => updateFilters({ season: v })}
        />
      </div>

      <div class="md:w-44">
        <label for="division" class="block text-sm font-medium text-gray-400 mb-2">Division</label>
        <SelectFilter
          value={data.filters.division}
          options={divisionOptions}
          allLabel="All Divisions"
          onChange={(v) => updateFilters({ division: v })}
        />
      </div>

      <div class="md:w-40">
        <label for="status" class="block text-sm font-medium text-gray-400 mb-2">Status</label>
        <SelectFilter
          value={data.filters.status}
          options={statusOptions}
          allLabel="All Status"
          onChange={(v) => updateFilters({ status: v })}
        />
      </div>
    {/snippet}
  </FilterBar>

  <!-- Teams Table -->
  <DataTable
    data={data.teams}
    {columns}
    emptyMessage="No teams found matching your filters"
    pagination={{
      currentPage: data.pagination.page,
      totalPages: data.pagination.totalPages,
      onPageChange: goToPage,
      infoText: paginationInfo,
    }}
  >
    {#snippet cell(team, col)}
      {#if col.key === 'team'}
        <div class="flex items-center gap-3">
          {#if team.avatar}
            <img src={team.avatar} alt={team.name} class="w-8 h-8 rounded" />
          {:else}
            <div
              class="w-8 h-8 bg-zinc-700 rounded flex items-center justify-center text-xs font-bold text-gray-400"
            >
              {team.acronym?.slice(0, 2) || team.name.slice(0, 2).toUpperCase()}
            </div>
          {/if}
          <div>
            <a href="/teams/{team.id}" class="text-white font-medium hover:text-orange-400">
              {team.name}
            </a>
            <p class="text-sm text-gray-400">{team.acronym}</p>
          </div>
        </div>
      {:else if col.key === 'format'}
        {@const format = data.formats?.find((f) => f.id === team.formatId)}
        <span
          class="px-2 py-1 rounded text-xs font-medium {team.formatId === FORMAT_1V1
            ? 'bg-purple-500/20 text-purple-400'
            : 'bg-blue-500/20 text-blue-400'}"
        >
          {format?.name ?? team.formatId}
        </span>
      {:else if col.key === 'season'}
        {#if team.season}
          <span class="text-gray-300">S{team.season.seasonNum}</span>
        {:else}
          <span class="text-gray-500">—</span>
        {/if}
      {:else if col.key === 'division'}
        <span class="text-gray-300">{team.division?.name || '—'}</span>
      {:else if col.key === 'region'}
        <span class="text-gray-300">{team.region?.name || '—'}</span>
      {:else if col.key === 'record'}
        <span class="text-white font-mono">{team.record}</span>
      {:else if col.key === 'status'}
        <span class="px-2 py-1 rounded text-xs font-medium {getStatusColor(team.status)}">
          {statusNames[team.status]}
        </span>
      {:else if col.key === 'payment'}
        <span class="px-2 py-1 rounded text-xs font-medium {getPaymentColor(team.paymentStatus)}">
          {paymentNames[team.paymentStatus]}
        </span>
      {:else if col.key === 'actions'}
        <div class="flex items-center justify-end gap-2">
          {#if team.formatId !== 1}
            <a
              href="/teams/{team.id}"
              class="px-3 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-sm transition-colors"
              title="View team page with full management access (roster, status, deletion)"
            >
              Manage Team
            </a>
          {/if}
          <button
            onclick={() => openEditModal(team)}
            class="px-3 py-1 bg-zinc-700 text-gray-300 hover:bg-zinc-600 rounded text-sm transition-colors"
            title="Quick edit team metadata"
          >
            Quick Edit
          </button>
          {#if team.status !== 'DEAD'}
            <button
              type="button"
              class="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-sm transition-colors"
              title={team.formatId === FORMAT_1V1
                ? 'Withdraw player from 1v1 league'
                : 'Disband team (mark as dead and remove all players)'}
              onclick={() => (disbandingTeam = team)}
            >
              {team.formatId === FORMAT_1V1 ? 'Withdraw' : 'Disband'}
            </button>
          {:else if team.formatId === FORMAT_1V1}
            <button
              type="button"
              class="px-3 py-1 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded text-sm transition-colors"
              title="Restore player to 1v1 league"
              onclick={() => (restoringTeam = team)}
            >
              Restore
            </button>
          {/if}
          {#if data.isStrictAdmin}
            <button
              type="button"
              class="px-3 py-1 bg-red-900/40 text-red-300 hover:bg-red-900/60 rounded text-sm transition-colors"
              title="Permanently delete team and all related data"
              onclick={() => {
                deletingTeam = team;
                deleteConfirmText = '';
              }}
            >
              Delete
            </button>
          {/if}
        </div>
      {/if}
    {/snippet}
  </DataTable>
</div>

<!-- Edit Modal -->
{#if editingTeam}
  {@const editTitle = `Quick Edit: ${editingTeam.name}${editingTeam.formatId === FORMAT_1V1 ? ' (1v1)' : ''}`}
  <Dialog open={true} title={editTitle} maxWidth="2xl" onClose={closeEditModal}>
    <FormError error={form?.error} />

    {@const modalRegionOptions = [
      { value: 'none', label: 'No Region' },
      ...data.regions.map((r) => ({ value: String(r.id), label: r.name })),
    ]}
    {@const modalSeasonOptions = [
      { value: 'none', label: 'No Season' },
      ...editModalSeasonOptions.map((s) => ({
        value: String(s.id),
        label: `Season ${s.seasonNum}`,
      })),
    ]}
    {@const modalDivisionOptions = [
      { value: 'none', label: 'No Division' },
      ...editModalDivisionOptions.map((d) => ({ value: String(d.id), label: d.name })),
    ]}
    {@const statusOptions = [
      { value: '-1', label: 'Dead' },
      { value: '0', label: 'Unready' },
      { value: '1', label: 'Pending' },
      { value: '2', label: 'Ready' },
      { value: '3', label: 'Placement' },
    ]}

    <form
      method="POST"
      action="?/updateTeam"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            closeEditModal();
          }
        };
      }}
    >
      <input type="hidden" name="teamId" value={editingTeam.id} />

      <FormInput
        label={editingTeam.formatId === FORMAT_1V1 ? 'Player Name' : 'Team Name'}
        name="name"
        bind:value={editingTeam.name}
        required
      />

      {#if editingTeam.formatId !== 1}
        <FormInput label="Acronym" name="acronym" bind:value={editingTeam.acronym} />
      {/if}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
        <FormSelect
          label="Region"
          name="regionId"
          value={editModalRegionId ? String(editModalRegionId) : 'none'}
          options={modalRegionOptions}
          onChange={(val) => {
            editModalRegionId = val !== 'none' ? parseInt(val) : null;
            editModalSeasonId = null;
            if (editingTeam) {
              editingTeam.region = editModalRegionId
                ? (data.regions.find((r) => r.id === editModalRegionId) ?? null)
                : null;
              editingTeam.season = null;
              editingTeam.division = null;
            }
          }}
        />

        <FormSelect
          label="Season"
          name="seasonId"
          value={editModalSeasonId ? String(editModalSeasonId) : 'none'}
          options={modalSeasonOptions}
          disabled={!editModalRegionId}
          hint={!editModalRegionId ? 'Select a region first' : undefined}
          onChange={(val) => {
            editModalSeasonId = val !== 'none' ? parseInt(val) : null;
            if (editingTeam) {
              editingTeam.season = editModalSeasonId
                ? (data.seasons.find((s) => s.id === editModalSeasonId) ?? null)
                : null;
            }
          }}
        />

        <FormSelect
          label="Division"
          name="divisionId"
          value={editingTeam.division?.id ? String(editingTeam.division.id) : 'none'}
          options={modalDivisionOptions}
          disabled={!editModalRegionId}
          hint={!editModalRegionId ? 'Select a region first' : undefined}
          onChange={(val) => {
            if (editingTeam) {
              editingTeam.division =
                val !== 'none'
                  ? (data.divisions.find((d) => d.id === parseInt(val)) ?? null)
                  : null;
            }
          }}
        />

        {#if editingTeam.formatId === FORMAT_1V1}
          <div class="mb-6">
            <span class="block text-sm font-medium text-gray-300 mb-2">Status</span>
            <div class="flex items-center gap-3">
              <span
                class="px-3 py-2 rounded-lg text-sm font-medium {editingTeam.status === 'READY'
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'}"
              >
                {editingTeam.status === 'READY' ? 'Active' : 'Withdrawn'}
              </span>
              <button
                type="button"
                onclick={() => {
                  if (editingTeam) {
                    editingTeam.status = editingTeam.status === 'READY' ? 'DEAD' : 'READY';
                  }
                }}
                class="px-3 py-2 rounded-lg text-sm font-medium transition-colors {editingTeam.status ===
                'READY'
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}"
              >
                {editingTeam.status === 'READY' ? 'Withdraw' : 'Restore'}
              </button>
            </div>
            <input type="hidden" name="status" value={statusToInt[editingTeam.status]} />
          </div>
        {:else}
          <FormSelect
            label="Status"
            name="status"
            value={String(statusToInt[editingTeam.status])}
            options={statusOptions}
          />
        {/if}
      </div>

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          onclick={closeEditModal}
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

<!-- Disband/Withdraw Team Confirmation Modal -->
{#if disbandingTeam}
  {@const disbandTitle =
    disbandingTeam.formatId === FORMAT_1V1 ? 'Withdraw Player' : 'Disband Team'}
  {@const disbandDesc =
    disbandingTeam.formatId === FORMAT_1V1
      ? 'Are you sure you want to withdraw this player from the 1v1 league?'
      : 'Are you sure you want to disband this team? This will mark the team as DEAD and deactivate all players.'}
  <Dialog open={true} title={disbandTitle} onClose={() => (disbandingTeam = null)}>
    <p class="text-gray-400 mb-4">{disbandDesc}</p>

    <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
      <div class="flex items-center gap-3">
        {#if disbandingTeam.avatar}
          <img src={disbandingTeam.avatar} alt="" class="w-10 h-10 rounded" />
        {:else}
          <div
            class="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center text-gray-400 text-sm font-medium"
          >
            {disbandingTeam.acronym?.slice(0, 2) || disbandingTeam.name.slice(0, 2).toUpperCase()}
          </div>
        {/if}
        <div>
          <p class="text-white font-medium">{disbandingTeam.name}</p>
          <p class="text-gray-400 text-sm">
            {disbandingTeam.division?.name || 'No division'} · {disbandingTeam.region?.name ||
              'No region'}
          </p>
        </div>
      </div>
    </div>

    {#snippet footer()}
      <button
        type="button"
        onclick={() => (disbandingTeam = null)}
        class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
      >
        Cancel
      </button>
      <form
        method="POST"
        action="?/disbandTeam"
        use:enhance={() => {
          isDisbanding = true;
          return async ({ update }) => {
            await update();
            isDisbanding = false;
            disbandingTeam = null;
          };
        }}
        class="flex-1"
      >
        <input type="hidden" name="teamId" value={disbandingTeam!.id} />
        <button
          type="submit"
          disabled={isDisbanding}
          class="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if isDisbanding}
            {disbandingTeam!.formatId === FORMAT_1V1 ? 'Withdrawing...' : 'Disbanding...'}
          {:else}
            {disbandingTeam!.formatId === FORMAT_1V1 ? 'Withdraw' : 'Disband Team'}
          {/if}
        </button>
      </form>
    {/snippet}
  </Dialog>
{/if}

<!-- Restore 1v1 Player Confirmation Modal -->
{#if restoringTeam}
  <Dialog open={true} title="Restore Player" onClose={() => (restoringTeam = null)}>
    <p class="text-gray-400 mb-4">
      Are you sure you want to restore this player to the 1v1 league? They will be set back to
      active status.
    </p>

    <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
      <div class="flex items-center gap-3">
        {#if restoringTeam.avatar}
          <img src={restoringTeam.avatar} alt="" class="w-10 h-10 rounded" />
        {:else}
          <div
            class="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center text-gray-400 text-sm font-medium"
          >
            {restoringTeam.name.slice(0, 2).toUpperCase()}
          </div>
        {/if}
        <div>
          <p class="text-white font-medium">{restoringTeam.name}</p>
          <p class="text-gray-400 text-sm">
            {restoringTeam.division?.name || 'No division'} · {restoringTeam.region?.name ||
              'No region'}
          </p>
        </div>
      </div>
    </div>

    {#snippet footer()}
      <button
        type="button"
        onclick={() => (restoringTeam = null)}
        class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
      >
        Cancel
      </button>
      <form
        method="POST"
        action="?/restore1v1"
        use:enhance={() => {
          isRestoring = true;
          return async ({ update }) => {
            await update();
            isRestoring = false;
            restoringTeam = null;
          };
        }}
        class="flex-1"
      >
        <input type="hidden" name="teamId" value={restoringTeam!.id} />
        <button
          type="submit"
          disabled={isRestoring}
          class="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRestoring ? 'Restoring...' : 'Restore'}
        </button>
      </form>
    {/snippet}
  </Dialog>
{/if}

<!-- Hard Delete Team Confirmation Modal -->
{#if deletingTeam}
  {@const hasMatches = deletingTeam.matchCount > 0}
  <Dialog
    open={true}
    title="Permanently Delete Team"
    maxWidth="2xl"
    onClose={() => (deletingTeam = null)}
  >
    <div class="mb-6">
      <div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
        <div class="flex items-center gap-3">
          {#if deletingTeam.avatar}
            <img src={deletingTeam.avatar} alt="" class="w-10 h-10 rounded" />
          {:else}
            <div
              class="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center text-gray-400 text-sm font-medium"
            >
              {deletingTeam.acronym?.slice(0, 2) || deletingTeam.name.slice(0, 2).toUpperCase()}
            </div>
          {/if}
          <div>
            <p class="text-white font-medium">{deletingTeam.name}</p>
            <p class="text-gray-400 text-sm">
              {deletingTeam.division?.name || 'No division'} · {deletingTeam.region?.name ||
                'No region'}
            </p>
          </div>
        </div>
      </div>

      {#if hasMatches}
        <div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg mb-4">
          <p class="text-yellow-400 text-sm font-medium mb-1">
            {deletingTeam.matchCount} match{deletingTeam.matchCount !== 1 ? 'es' : ''} will also be deleted
          </p>
          <p class="text-yellow-300 text-sm">
            The following matches (and their games, demos, comms, map bans) will be permanently
            removed.
          </p>
        </div>

        <div class="max-h-48 overflow-y-auto border border-zinc-700 rounded-lg mb-4">
          <table class="w-full text-sm">
            <thead class="bg-zinc-800 sticky top-0">
              <tr class="text-gray-400 text-left">
                <th class="px-3 py-2">Week</th>
                <th class="px-3 py-2">Match</th>
                <th class="px-3 py-2">Score</th>
                <th class="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-800">
              {#each deletingTeam.matches as match}
                <tr class="text-gray-300">
                  <td class="px-3 py-2 text-gray-500">{match.weekNo ?? '—'}</td>
                  <td class="px-3 py-2">
                    <span
                      class={match.homeTeam === deletingTeam.name ? 'text-white font-medium' : ''}
                      >{match.homeTeam}</span
                    >
                    <span class="text-gray-500 mx-1">vs</span>
                    <span
                      class={match.awayTeam === deletingTeam.name ? 'text-white font-medium' : ''}
                      >{match.awayTeam}</span
                    >
                  </td>
                  <td class="px-3 py-2 font-mono">
                    {#if match.winnerScore != null && match.loserScore != null}
                      {match.winnerScore}-{match.loserScore}
                    {:else}
                      <span class="text-gray-500">—</span>
                    {/if}
                  </td>
                  <td class="px-3 py-2 text-gray-500">{match.status}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg mb-4">
        <p class="text-red-400 text-sm font-medium mb-1">This action cannot be undone</p>
        <p class="text-red-300 text-sm">
          This will permanently remove the team, all roster records, pending players, denied
          players, name history{hasMatches
            ? ', and all matches listed above'
            : ', and team history'} from the database.
        </p>
      </div>
      <div>
        <label for="deleteTeamConfirm" class="block text-sm text-gray-400 mb-1">
          Type <strong class="text-white">DELETE</strong> to confirm
        </label>
        <input
          id="deleteTeamConfirm"
          type="text"
          bind:value={deleteConfirmText}
          placeholder="DELETE"
          class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
        />
      </div>
    </div>

    {#snippet footer()}
      <button
        type="button"
        onclick={() => (deletingTeam = null)}
        class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
      >
        Cancel
      </button>
      <form
        method="POST"
        action="?/hardDeleteTeam"
        use:enhance={() => {
          isDeleting = true;
          return async ({ update }) => {
            await update();
            isDeleting = false;
            deletingTeam = null;
          };
        }}
        class="flex-1"
      >
        <input type="hidden" name="teamId" value={deletingTeam!.id} />
        {#if hasMatches}
          <input type="hidden" name="cascadeMatches" value="true" />
        {/if}
        <button
          type="submit"
          disabled={isDeleting || deleteConfirmText !== 'DELETE'}
          class="w-full px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if isDeleting}
            Deleting...
          {:else if hasMatches}
            Delete Team & {deletingTeam!.matchCount} Match{deletingTeam!.matchCount !== 1
              ? 'es'
              : ''}
          {:else}
            Permanently Delete
          {/if}
        </button>
      </form>
    {/snippet}
  </Dialog>
{/if}
