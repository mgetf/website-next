<script lang="ts">
import type { PageData, ActionData } from './$types';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { enhance } from '$app/forms';
import DataTable from '$lib/components/ui/DataTable.svelte';
import SearchInput from '$lib/components/ui/SearchInput.svelte';
import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
import Dialog from '$lib/components/ui/Dialog.svelte';
import FormInput from '$lib/components/ui/form/FormInput.svelte';
import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
import FormError from '$lib/components/ui/form/FormError.svelte';
import { toast } from '$lib/state/toast.svelte';

let { data, form }: { data: PageData; form: ActionData } = $props();

let editingTeam: (typeof data.teams)[0] | null = $state(null);
let disbandingTeam: (typeof data.teams)[0] | null = $state(null);
let restoringTeam: (typeof data.teams)[0] | null = $state(null);
let isSubmitting = $state(false);
let isDisbanding = $state(false);
let isRestoring = $state(false);
let lastFormResult: ActionData = null;

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
	{ key: 'season', label: 'Season' },
	{ key: 'division', label: 'Division' },
	{ key: 'region', label: 'Region' },
	{ key: 'record', label: 'Record' },
	{ key: 'status', label: 'Status' },
	{ key: 'payment', label: 'Payment' },
	{ key: 'actions', label: 'Actions', align: 'right' as const }
];

const paginationInfo = $derived(
	`Showing ${((data.pagination.page - 1) * data.pagination.pageSize) + 1} to ${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalTeams)} of ${data.pagination.totalTeams} teams`
);

const filteredSeasons = $derived(() => {
  if (!data.filters.region) {
    return data.seasons;
  }
  const regionId = parseInt(data.filters.region);
  return data.seasons.filter((s) => s.regionId === regionId);
});

const seasonOptions = $derived(
  filteredSeasons().map((s) => ({
    value: s.id.toString(),
    label: `Season ${s.seasonNum} (${s.region.name})`
  }))
);

const divisionOptions = $derived(
  data.divisions.map((d) => ({ value: d.id.toString(), label: d.name }))
);

const regionOptions = $derived(
  data.regions.map((r) => ({ value: r.id.toString(), label: r.name }))
);

const statusOptions = [
  { value: '2', label: 'Ready' },
  { value: '1', label: 'Pending' },
  { value: '0', label: 'Unready' },
  { value: '3', label: 'Dead' }
];

function updateFilters(updates: Record<string, string>) {
  const params = new URLSearchParams(page.url.searchParams);

  if (updates.region !== undefined) {
    const newRegionId = updates.region ? parseInt(updates.region) : null;
    const currentSeasonId = params.get('season');

    if (currentSeasonId && newRegionId) {
      const currentSeason = data.seasons.find(
        (s) => s.id === parseInt(currentSeasonId),
      );
      if (currentSeason && currentSeason.regionId !== newRegionId) {
        params.delete('season');
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
}

function closeEditModal() {
  editingTeam = null;
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
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
			<SearchInput
				value={data.filters.search}
				placeholder="Search teams..."
				onSearch={(v) => updateFilters({ search: v })}
			/>
			
			<SelectFilter
				value={data.filters.season}
				options={seasonOptions}
				allLabel="All Seasons"
				onChange={(v) => updateFilters({ season: v })}
			/>
			
			<SelectFilter
				value={data.filters.division}
				options={divisionOptions}
				allLabel="All Divisions"
				onChange={(v) => updateFilters({ division: v })}
			/>
			
			<SelectFilter
				value={data.filters.region}
				options={regionOptions}
				allLabel="All Regions"
				onChange={(v) => updateFilters({ region: v })}
			/>
			
			<SelectFilter
				value={data.filters.status}
				options={statusOptions}
				allLabel="All Status"
				onChange={(v) => updateFilters({ status: v })}
			/>
			
			<button
				type="button"
				onclick={() => goto('/admin/teams')}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-gray-300 hover:text-white transition-colors"
			>
				Clear Filters
			</button>
		</div>
	</div>
	
	<!-- Teams Table -->
	<DataTable
		data={data.teams}
		{columns}
		emptyMessage="No teams found matching your filters"
		pagination={{
			currentPage: data.pagination.page,
			totalPages: data.pagination.totalPages,
			onPageChange: goToPage,
			infoText: paginationInfo
		}}
	>
		{#snippet cell(team, col)}
			{#if col.key === 'team'}
				<div class="flex items-center gap-3">
					{#if team.avatar}
						<img src={team.avatar} alt={team.name} class="w-8 h-8 rounded" />
					{:else}
						<div class="w-8 h-8 bg-zinc-700 rounded flex items-center justify-center text-xs font-bold text-gray-400">
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
							title={team.formatId === 1 ? "Withdraw player from 1v1 league" : "Disband team (mark as dead and remove all players)"}
							onclick={() => disbandingTeam = team}
						>
							{team.formatId === 1 ? 'Withdraw' : 'Disband'}
						</button>
					{:else if team.formatId === 1}
						<button 
							type="button"
							class="px-3 py-1 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded text-sm transition-colors"
							title="Restore player to 1v1 league"
							onclick={() => restoringTeam = team}
						>
							Restore
						</button>
					{/if}
				</div>
			{/if}
		{/snippet}
	</DataTable>
	
</div>

<!-- Edit Modal -->
{#if editingTeam}
	{@const editTitle = `Quick Edit: ${editingTeam.name}${editingTeam.formatId === 1 ? ' (1v1)' : ''}`}
	<Dialog
		open={true}
		title={editTitle}
		maxWidth="2xl"
		onClose={closeEditModal}
	>
		<FormError error={form?.error} />

		{@const seasonOptions = [
			{ value: 'none', label: 'No Season' },
			...data.seasons.map(s => ({ value: String(s.id), label: `Season ${s.seasonNum} (${s.region.name})` }))
		]}
		{@const divisionOptions = [
			{ value: 'none', label: 'No Division' },
			...data.divisions.map(d => ({ value: String(d.id), label: d.name }))
		]}
		{@const regionOptions = [
			{ value: 'none', label: 'No Region' },
			...data.regions.map(r => ({ value: String(r.id), label: r.name }))
		]}
		{@const statusOptions = [
			{ value: '-1', label: 'Dead' },
			{ value: '0', label: 'Unready' },
			{ value: '1', label: 'Pending' },
			{ value: '2', label: 'Ready' },
			{ value: '3', label: 'Placement' }
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
				label={editingTeam.formatId === 1 ? 'Player Name' : 'Team Name'}
				name="name"
				bind:value={editingTeam.name}
				required
			/>

			{#if editingTeam.formatId !== 1}
				<FormInput
					label="Acronym"
					name="acronym"
					bind:value={editingTeam.acronym}
				/>
			{/if}

			<div class="grid grid-cols-1 md:grid-cols-2 gap-x-4">
				<FormSelect
					label="Season"
					name="seasonId"
					value={String(editingTeam.season?.id || 'none')}
					options={seasonOptions}
				/>

				<FormSelect
					label="Division"
					name="divisionId"
					value={String(editingTeam.division?.id || 'none')}
					options={divisionOptions}
				/>

				<FormSelect
					label="Region"
					name="regionId"
					value={String(editingTeam.region?.id || 'none')}
					options={regionOptions}
				/>

				{#if editingTeam.formatId === 1}
					<div class="mb-6">
						<span class="block text-sm font-medium text-gray-300 mb-2">Status</span>
						<div class="flex items-center gap-3">
							<span class="px-3 py-2 rounded-lg text-sm font-medium {editingTeam.status === 'READY' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
								{editingTeam.status === 'READY' ? 'Active' : 'Withdrawn'}
							</span>
							<button
								type="button"
								onclick={() => {
									if (editingTeam) {
										editingTeam.status = editingTeam.status === 'READY' ? 'DEAD' : 'READY';
									}
								}}
								class="px-3 py-2 rounded-lg text-sm font-medium transition-colors {editingTeam.status === 'READY' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}"
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
	{@const disbandTitle = disbandingTeam.formatId === 1 ? 'Withdraw Player' : 'Disband Team'}
	{@const disbandDesc = disbandingTeam.formatId === 1
		? 'Are you sure you want to withdraw this player from the 1v1 league?'
		: 'Are you sure you want to disband this team? This will mark the team as DEAD and deactivate all players.'}
	<Dialog
		open={true}
		title={disbandTitle}
		onClose={() => disbandingTeam = null}
	>
		<p class="text-gray-400 mb-4">{disbandDesc}</p>

		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
			<div class="flex items-center gap-3">
				{#if disbandingTeam.avatar}
					<img src={disbandingTeam.avatar} alt="" class="w-10 h-10 rounded" />
				{:else}
					<div class="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center text-gray-400 text-sm font-medium">
						{disbandingTeam.acronym?.slice(0, 2) || disbandingTeam.name.slice(0, 2).toUpperCase()}
					</div>
				{/if}
				<div>
					<p class="text-white font-medium">{disbandingTeam.name}</p>
					<p class="text-gray-400 text-sm">
						{disbandingTeam.division?.name || 'No division'} · {disbandingTeam.region?.name || 'No region'}
					</p>
				</div>
			</div>
		</div>

		{#snippet footer()}
			<button
				type="button"
				onclick={() => disbandingTeam = null}
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
						{disbandingTeam!.formatId === 1 ? 'Withdrawing...' : 'Disbanding...'}
					{:else}
						{disbandingTeam!.formatId === 1 ? 'Withdraw' : 'Disband Team'}
					{/if}
				</button>
			</form>
		{/snippet}
	</Dialog>
{/if}

<!-- Restore 1v1 Player Confirmation Modal -->
{#if restoringTeam}
	<Dialog
		open={true}
		title="Restore Player"
		onClose={() => restoringTeam = null}
	>
		<p class="text-gray-400 mb-4">
			Are you sure you want to restore this player to the 1v1 league? They will be set back to active status.
		</p>

		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
			<div class="flex items-center gap-3">
				{#if restoringTeam.avatar}
					<img src={restoringTeam.avatar} alt="" class="w-10 h-10 rounded" />
				{:else}
					<div class="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center text-gray-400 text-sm font-medium">
						{restoringTeam.name.slice(0, 2).toUpperCase()}
					</div>
				{/if}
				<div>
					<p class="text-white font-medium">{restoringTeam.name}</p>
					<p class="text-gray-400 text-sm">
						{restoringTeam.division?.name || 'No division'} · {restoringTeam.region?.name || 'No region'}
					</p>
				</div>
			</div>
		</div>

		{#snippet footer()}
			<button
				type="button"
				onclick={() => restoringTeam = null}
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
