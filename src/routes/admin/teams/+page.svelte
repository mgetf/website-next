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
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
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

  function getStatusBadgeColor(status: string): 'green' | 'yellow' | 'red' | 'zinc' {
    if (status === 'READY') return 'green';
    if (status === 'PENDING') return 'yellow';
    if (status === 'DEAD') return 'red';
    return 'zinc';
  }

  function getPaymentBadgeColor(payment: number): 'green' | 'blue' | 'red' {
    if (payment === 1) return 'green';
    if (payment === 2) return 'blue';
    return 'red';
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
    <p class="text-text-body">View and manage all teams across all divisions</p>
  </div>

  <!-- Filters -->
  <FilterBar onSubmit={handleSearch} onClear={clearFilters} {hasActiveFilters}>
    {#snippet filters()}
      <div class="flex-1">
        <label for="search" class="block text-sm font-medium text-text-body mb-2">Search</label>
        <SearchInput bind:value={searchInput} placeholder="Search teams..." />
      </div>

      <div class="md:w-40">
        <label for="format" class="block text-sm font-medium text-text-body mb-2">Format</label>
        <SelectFilter
          value={data.filters.format}
          options={formatOptions}
          allLabel="All Formats"
          onChange={(v) => updateFilters({ format: v })}
        />
      </div>

      <div class="md:w-40">
        <label for="region" class="block text-sm font-medium text-text-body mb-2">Region</label>
        <SelectFilter
          value={data.filters.region}
          options={regionOptions}
          allLabel="All Regions"
          onChange={(v) => updateFilters({ region: v })}
        />
      </div>

      <div class="md:w-44">
        <label for="season" class="block text-sm font-medium text-text-body mb-2">Season</label>
        <SelectFilter
          value={data.filters.season}
          options={seasonOptions}
          allLabel="All Seasons"
          onChange={(v) => updateFilters({ season: v })}
        />
      </div>

      <div class="md:w-44">
        <label for="division" class="block text-sm font-medium text-text-body mb-2">Division</label>
        <SelectFilter
          value={data.filters.division}
          options={divisionOptions}
          allLabel="All Divisions"
          onChange={(v) => updateFilters({ division: v })}
        />
      </div>

      <div class="md:w-40">
        <label for="status" class="block text-sm font-medium text-text-body mb-2">Status</label>
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
              class="w-8 h-8 bg-surface-hover rounded flex items-center justify-center text-xs font-bold text-text-body"
            >
              {team.acronym?.slice(0, 2) || team.name.slice(0, 2).toUpperCase()}
            </div>
          {/if}
          <div>
            <a href="/teams/{team.id}" class="text-white font-medium hover:text-primary-400">
              {team.name}
            </a>
            <p class="text-sm text-text-body">{team.acronym}</p>
          </div>
        </div>
      {:else if col.key === 'format'}
        {@const format = data.formats?.find((f) => f.id === team.formatId)}
        <Badge color={team.formatId === FORMAT_1V1 ? 'purple' : 'blue'}>
          {format?.name ?? team.formatId}
        </Badge>
      {:else if col.key === 'season'}
        {#if team.season}
          <span class="text-text-label">S{team.season.seasonNum}</span>
        {:else}
          <span class="text-text-muted">—</span>
        {/if}
      {:else if col.key === 'division'}
        <span class="text-text-label">{team.division?.name || '—'}</span>
      {:else if col.key === 'region'}
        <span class="text-text-label">{team.region?.name || '—'}</span>
      {:else if col.key === 'record'}
        <span class="text-white font-mono">{team.record}</span>
      {:else if col.key === 'status'}
        <Badge color={getStatusBadgeColor(team.status)}>
          {statusNames[team.status]}
        </Badge>
      {:else if col.key === 'payment'}
        <Badge color={getPaymentBadgeColor(team.paymentStatus)}>
          {paymentNames[team.paymentStatus]}
        </Badge>
      {:else if col.key === 'actions'}
        <div class="flex items-center justify-end gap-2 whitespace-nowrap">
          {#if team.formatId !== 1}
            <Button
              variant="primary"
              size="sm"
              href="/teams/{team.id}"
              title="View team page with full management access (roster, status, deletion)"
            >
              Manage Team
            </Button>
          {/if}
          <Button
            variant="secondary"
            size="sm"
            onclick={() => openEditModal(team)}
            title="Quick edit team metadata"
          >
            Quick Edit
          </Button>
          {#if team.status !== 'DEAD'}
            <Button
              variant="danger"
              size="sm"
              title={team.formatId === FORMAT_1V1
                ? 'Withdraw player from 1v1 league'
                : 'Disband team (mark as dead and remove all players)'}
              onclick={() => (disbandingTeam = team)}
            >
              {team.formatId === FORMAT_1V1 ? 'Withdraw' : 'Disband'}
            </Button>
          {:else if team.formatId === FORMAT_1V1}
            <Button
              variant="success"
              size="sm"
              title="Restore player to 1v1 league"
              onclick={() => (restoringTeam = team)}
            >
              Restore
            </Button>
          {/if}
          {#if data.isStrictAdmin}
            <Button
              variant="danger"
              size="sm"
              title="Permanently delete team and all related data"
              onclick={() => {
                deletingTeam = team;
                deleteConfirmText = '';
              }}
            >
              Delete
            </Button>
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
            <span class="block text-sm font-medium text-text-label mb-2">Status</span>
            <div class="flex items-center gap-3">
              <Badge color={editingTeam.status === 'READY' ? 'green' : 'red'} size="md">
                {editingTeam.status === 'READY' ? 'Active' : 'Withdrawn'}
              </Badge>
              <Button
                type="button"
                variant={editingTeam.status === 'READY' ? 'danger' : 'success'}
                size="sm"
                onclick={() => {
                  if (editingTeam) {
                    editingTeam.status = editingTeam.status === 'READY' ? 'DEAD' : 'READY';
                  }
                }}
              >
                {editingTeam.status === 'READY' ? 'Withdraw' : 'Restore'}
              </Button>
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
        <Button type="button" variant="secondary" onclick={closeEditModal}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
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
    <p class="text-text-body mb-4">{disbandDesc}</p>

    <div class="bg-surface-input border border-border-input rounded-lg p-4 mb-4">
      <div class="flex items-center gap-3">
        {#if disbandingTeam.avatar}
          <img src={disbandingTeam.avatar} alt="" class="w-10 h-10 rounded" />
        {:else}
          <div
            class="w-10 h-10 rounded bg-surface-hover flex items-center justify-center text-text-body text-sm font-medium"
          >
            {disbandingTeam.acronym?.slice(0, 2) || disbandingTeam.name.slice(0, 2).toUpperCase()}
          </div>
        {/if}
        <div>
          <p class="text-white font-medium">{disbandingTeam.name}</p>
          <p class="text-text-body text-sm">
            {disbandingTeam.division?.name || 'No division'} · {disbandingTeam.region?.name ||
              'No region'}
          </p>
        </div>
      </div>
    </div>

    {#snippet footer()}
      <Button
        type="button"
        variant="secondary"
        onclick={() => (disbandingTeam = null)}
        class="flex-1"
      >
        Cancel
      </Button>
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
        <Button type="submit" variant="danger" disabled={isDisbanding} class="w-full">
          {#if isDisbanding}
            {disbandingTeam!.formatId === FORMAT_1V1 ? 'Withdrawing...' : 'Disbanding...'}
          {:else}
            {disbandingTeam!.formatId === FORMAT_1V1 ? 'Withdraw' : 'Disband Team'}
          {/if}
        </Button>
      </form>
    {/snippet}
  </Dialog>
{/if}

<!-- Restore 1v1 Player Confirmation Modal -->
{#if restoringTeam}
  <Dialog open={true} title="Restore Player" onClose={() => (restoringTeam = null)}>
    <p class="text-text-body mb-4">
      Are you sure you want to restore this player to the 1v1 league? They will be set back to
      active status.
    </p>

    <div class="bg-surface-input border border-border-input rounded-lg p-4 mb-4">
      <div class="flex items-center gap-3">
        {#if restoringTeam.avatar}
          <img src={restoringTeam.avatar} alt="" class="w-10 h-10 rounded" />
        {:else}
          <div
            class="w-10 h-10 rounded bg-surface-hover flex items-center justify-center text-text-body text-sm font-medium"
          >
            {restoringTeam.name.slice(0, 2).toUpperCase()}
          </div>
        {/if}
        <div>
          <p class="text-white font-medium">{restoringTeam.name}</p>
          <p class="text-text-body text-sm">
            {restoringTeam.division?.name || 'No division'} · {restoringTeam.region?.name ||
              'No region'}
          </p>
        </div>
      </div>
    </div>

    {#snippet footer()}
      <Button
        type="button"
        variant="secondary"
        onclick={() => (restoringTeam = null)}
        class="flex-1"
      >
        Cancel
      </Button>
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
        <Button type="submit" variant="success" disabled={isRestoring} class="w-full">
          {isRestoring ? 'Restoring...' : 'Restore'}
        </Button>
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
      <div class="bg-surface-input border border-border-input rounded-lg p-4 mb-4">
        <div class="flex items-center gap-3">
          {#if deletingTeam.avatar}
            <img src={deletingTeam.avatar} alt="" class="w-10 h-10 rounded" />
          {:else}
            <div
              class="w-10 h-10 rounded bg-surface-hover flex items-center justify-center text-text-body text-sm font-medium"
            >
              {deletingTeam.acronym?.slice(0, 2) || deletingTeam.name.slice(0, 2).toUpperCase()}
            </div>
          {/if}
          <div>
            <p class="text-white font-medium">{deletingTeam.name}</p>
            <p class="text-text-body text-sm">
              {deletingTeam.division?.name || 'No division'} · {deletingTeam.region?.name ||
                'No region'}
            </p>
          </div>
        </div>
      </div>

      {#if hasMatches}
        <div class="p-4 bg-warning-500/20 border border-warning-500/50 rounded-lg mb-4">
          <p class="text-warning-400 text-sm font-medium mb-1">
            {deletingTeam.matchCount} match{deletingTeam.matchCount !== 1 ? 'es' : ''} will also be deleted
          </p>
          <p class="text-warning-300 text-sm">
            The following matches (and their games, demos, comms, map bans) will be permanently
            removed.
          </p>
        </div>

        <div class="max-h-48 overflow-y-auto border border-border-input rounded-lg mb-4">
          <table class="w-full text-sm">
            <thead class="bg-surface-input sticky top-0">
              <tr class="text-text-body text-left">
                <th class="px-3 py-2">Week</th>
                <th class="px-3 py-2">Match</th>
                <th class="px-3 py-2">Score</th>
                <th class="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-default">
              {#each deletingTeam.matches as match}
                <tr class="text-text-label">
                  <td class="px-3 py-2 text-text-muted">{match.weekNo ?? '—'}</td>
                  <td class="px-3 py-2">
                    <span
                      class={match.homeTeam === deletingTeam.name ? 'text-white font-medium' : ''}
                      >{match.homeTeam}</span
                    >
                    <span class="text-text-muted mx-1">vs</span>
                    <span
                      class={match.awayTeam === deletingTeam.name ? 'text-white font-medium' : ''}
                      >{match.awayTeam}</span
                    >
                  </td>
                  <td class="px-3 py-2 font-mono">
                    {#if match.winnerScore != null && match.loserScore != null}
                      {match.winnerScore}-{match.loserScore}
                    {:else}
                      <span class="text-text-muted">—</span>
                    {/if}
                  </td>
                  <td class="px-3 py-2 text-text-muted">{match.status}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="p-4 bg-danger-500/20 border border-danger-500/50 rounded-lg mb-4">
        <p class="text-danger-400 text-sm font-medium mb-1">This action cannot be undone</p>
        <p class="text-danger-300 text-sm">
          This will permanently remove the team, all roster records, pending players, denied
          players, name history{hasMatches
            ? ', and all matches listed above'
            : ', and team history'} from the database.
        </p>
      </div>
      <div>
        <label for="deleteTeamConfirm" class="block text-sm text-text-body mb-1">
          Type <strong class="text-white">DELETE</strong> to confirm
        </label>
        <input
          id="deleteTeamConfirm"
          type="text"
          bind:value={deleteConfirmText}
          placeholder="DELETE"
          class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-danger-500/50"
        />
      </div>
    </div>

    {#snippet footer()}
      <Button
        type="button"
        variant="secondary"
        onclick={() => (deletingTeam = null)}
        class="flex-1"
      >
        Cancel
      </Button>
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
        <Button
          type="submit"
          variant="danger"
          disabled={isDeleting || deleteConfirmText !== 'DELETE'}
          class="w-full"
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
        </Button>
      </form>
    {/snippet}
  </Dialog>
{/if}
