<script lang="ts">
import type { PageData, ActionData } from './$types';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { enhance } from '$app/forms';
import DataTable from '$lib/components/ui/DataTable.svelte';

let { data, form }: { data: PageData; form: ActionData } = $props();

let editingTeam: (typeof data.teams)[0] | null = $state(null);
let disbandingTeam: (typeof data.teams)[0] | null = $state(null);
let restoringTeam: (typeof data.teams)[0] | null = $state(null);
let isSubmitting = $state(false);
let isDisbanding = $state(false);
let isRestoring = $state(false);

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
  if (data.filters.region === 'all') {
    return data.seasons;
  }
  const regionId = parseInt(data.filters.region);
  return data.seasons.filter((s) => s.regionId === regionId);
});

function updateFilters(updates: Record<string, string>) {
  const params = new URLSearchParams(page.url.searchParams);

  if (updates.region !== undefined) {
    const newRegionId =
      updates.region === 'all' ? null : parseInt(updates.region);
    const currentSeasonId = params.get('season');

    if (currentSeasonId && currentSeasonId !== 'all' && newRegionId) {
      const currentSeason = data.seasons.find(
        (s) => s.id === parseInt(currentSeasonId),
      );
      if (currentSeason && currentSeason.regionId !== newRegionId) {
        params.delete('season');
      }
    }
  }

  Object.entries(updates).forEach(([key, value]) => {
    if (value && value !== 'all' && value !== '') {
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
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-3xl font-bold text-white mb-2">Team Management</h2>
			<p class="text-gray-400">View and manage all teams across all divisions</p>
		</div>
		<button class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors">
			+ Create Team
		</button>
	</div>
	
	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<form class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
			<!-- Search -->
			<input
				type="text"
				name="search"
				value={data.filters.search}
				oninput={(e) => updateFilters({ search: e.currentTarget.value })}
				placeholder="Search teams..."
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
			/>
			
			<!-- Season Filter -->
			<select
				name="season"
				value={data.filters.season}
				onchange={(e) => updateFilters({ season: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Seasons</option>
				{#each filteredSeasons() as season}
					<option value={season.id.toString()}>
						Season {season.seasonNum} ({season.region.name})
					</option>
				{/each}
			</select>
			
			<!-- Division Filter -->
			<select
				name="division"
				value={data.filters.division}
				onchange={(e) => updateFilters({ division: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Divisions</option>
				{#each data.divisions as division}
					<option value={division.id.toString()}>{division.name}</option>
				{/each}
			</select>
			
			<!-- Region Filter -->
			<select
				name="region"
				value={data.filters.region}
				onchange={(e) => updateFilters({ region: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Regions</option>
				{#each data.regions as region}
					<option value={region.id.toString()}>{region.name}</option>
				{/each}
			</select>
			
			<!-- Status Filter -->
			<select
				name="status"
				value={data.filters.status}
				onchange={(e) => updateFilters({ status: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Status</option>
				<option value="2">Ready</option>
				<option value="1">Pending</option>
				<option value="0">Unready</option>
				<option value="3">Dead</option>
			</select>
			
			<!-- Clear Filters Button -->
			<button
				type="button"
				onclick={() => goto('/admin/teams')}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-gray-300 hover:text-white transition-colors"
			>
				Clear Filters
			</button>
		</form>
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
	
	<!-- Success/Error Messages -->
	{#if form?.success && form?.message}
		<div class="fixed top-4 right-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg shadow-lg z-50">
			<p class="text-green-400">{form.message}</p>
		</div>
	{/if}
	
	{#if form?.error && !editingTeam}
		<div class="fixed top-4 right-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg shadow-lg z-50">
			<p class="text-red-400">{form.error}</p>
		</div>
	{/if}
</div>

<!-- Edit Modal -->
{#if editingTeam}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={closeEditModal}
		onkeydown={(e) => e.key === 'Escape' && closeEditModal()}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">
					Quick Edit: {editingTeam.name}
					{#if editingTeam.formatId === 1}
						<span class="ml-2 px-2 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-400 rounded">1v1</span>
					{/if}
				</h3>
				<button 
					onclick={closeEditModal}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			{#if form?.error}
				<div class="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
					<p class="text-red-400 text-sm">{form.error}</p>
				</div>
			{/if}
			
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
				
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="md:col-span-2">
						<label for="edit-name" class="block text-sm font-medium text-gray-300 mb-2">
							{editingTeam.formatId === 1 ? 'Player Name' : 'Team Name'}
						</label>
						<input
							id="edit-name"
							name="name"
							type="text"
							bind:value={editingTeam.name}
							required
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						/>
					</div>
					
					{#if editingTeam.formatId !== 1}
						<div class="md:col-span-2">
							<label for="edit-acronym" class="block text-sm font-medium text-gray-300 mb-2">Acronym</label>
							<input
								id="edit-acronym"
								name="acronym"
								type="text"
								bind:value={editingTeam.acronym}
								class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
							/>
						</div>
					{/if}
					
					<div>
						<label for="edit-seasonId" class="block text-sm font-medium text-gray-300 mb-2">Season</label>
						<select
							id="edit-seasonId"
							name="seasonId"
							value={editingTeam.season?.id || 'none'}
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							<option value="none">No Season</option>
							{#each data.seasons as season}
								<option value={season.id}>
									Season {season.seasonNum} ({season.region.name})
								</option>
							{/each}
						</select>
					</div>
					
					<div>
						<label for="edit-divisionId" class="block text-sm font-medium text-gray-300 mb-2">Division</label>
						<select
							id="edit-divisionId"
							name="divisionId"
							value={editingTeam.division?.id || 'none'}
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							<option value="none">No Division</option>
							{#each data.divisions as division}
								<option value={division.id}>{division.name}</option>
							{/each}
						</select>
					</div>
					
					<div>
						<label for="edit-regionId" class="block text-sm font-medium text-gray-300 mb-2">Region</label>
						<select
							id="edit-regionId"
							name="regionId"
							value={editingTeam.region?.id || 'none'}
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							<option value="none">No Region</option>
							{#each data.regions as region}
								<option value={region.id}>{region.name}</option>
							{/each}
						</select>
					</div>
					
				{#if editingTeam.formatId === 1}
					<div>
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
					<div>
						<label for="edit-status" class="block text-sm font-medium text-gray-300 mb-2">Status</label>
						<select
							id="edit-status"
							name="status"
							value={statusToInt[editingTeam.status]}
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							<option value={-1}>Dead</option>
							<option value={0}>Unready</option>
							<option value={1}>Pending</option>
							<option value={2}>Ready</option>
							<option value={3}>Placement</option>
						</select>
					</div>
				{/if}
				</div>
				
				<div class="mt-6 flex gap-3 justify-end">
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
		</div>
	</div>
{/if}

<!-- Disband/Withdraw Team Confirmation Modal -->
{#if disbandingTeam}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full">
			<h3 class="text-xl font-bold text-white mb-4">
				{disbandingTeam.formatId === 1 ? 'Withdraw Player' : 'Disband Team'}
			</h3>
			<p class="text-gray-400 mb-6">
				{#if disbandingTeam.formatId === 1}
					Are you sure you want to withdraw this player from the 1v1 league?
				{:else}
					Are you sure you want to disband this team? This will mark the team as DEAD and deactivate all players.
				{/if}
			</p>
			<div class="bg-zinc-800 border border-zinc-700 rounded p-3 mb-6">
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
			<div class="flex gap-3">
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
					<input type="hidden" name="teamId" value={disbandingTeam.id} />
					<button
						type="submit"
						disabled={isDisbanding}
						class="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-colors disabled:opacity-50"
					>
						{#if isDisbanding}
							{disbandingTeam.formatId === 1 ? 'Withdrawing...' : 'Disbanding...'}
						{:else}
							{disbandingTeam.formatId === 1 ? 'Withdraw' : 'Disband Team'}
						{/if}
					</button>
				</form>
				<button
					type="button"
					onclick={() => disbandingTeam = null}
					class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-md font-medium transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Restore 1v1 Player Confirmation Modal -->
{#if restoringTeam}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full">
			<h3 class="text-xl font-bold text-white mb-4">Restore Player</h3>
			<p class="text-gray-400 mb-6">
				Are you sure you want to restore this player to the 1v1 league? They will be set back to active status.
			</p>
			<div class="bg-zinc-800 border border-zinc-700 rounded p-3 mb-6">
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
			<div class="flex gap-3">
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
					<input type="hidden" name="teamId" value={restoringTeam.id} />
					<button
						type="submit"
						disabled={isRestoring}
						class="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md font-medium transition-colors disabled:opacity-50"
					>
						{isRestoring ? 'Restoring...' : 'Restore'}
					</button>
				</form>
				<button
					type="button"
					onclick={() => restoringTeam = null}
					class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-md font-medium transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}
