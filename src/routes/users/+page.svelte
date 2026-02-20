<script lang="ts">
import type { PageData } from './$types';
import { goto } from '$app/navigation';
import DataTable from '$lib/components/ui/DataTable.svelte';
import SearchInput from '$lib/components/ui/SearchInput.svelte';
import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
import discordIcon from '$lib/assets/icons/discord.png';

let { data }: { data: PageData } = $props();

let searchInput = $state(data.filters.search);
let roleFilter = $state(data.filters.role || '');

const roleOptions = [
	{ value: 'ADMIN', label: 'Admin' },
	{ value: 'MODERATOR', label: 'Moderator' },
	{ value: 'USER', label: 'User' },
	{ value: 'GUEST', label: 'Guest' }
];

const columns = [
  { key: 'player', label: 'Player' },
  { key: 'discord', label: 'Discord' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
];

const paginationInfo = $derived(
  `Showing ${(data.pagination.currentPage - 1) * data.pagination.perPage + 1} to ${Math.min(data.pagination.currentPage * data.pagination.perPage, data.pagination.totalCount)} of ${data.pagination.totalCount} users`,
);

function handleSearch(event: Event) {
  event.preventDefault();
  updateFilters();
}

function handleRoleChange() {
  updateFilters();
}

function updateFilters() {
  const params = new URLSearchParams();

  if (searchInput) {
    params.set('search', searchInput);
  }

  if (roleFilter) {
    params.set('role', roleFilter);
  }

  params.set('page', '1');

  goto(`/users?${params.toString()}`, { replaceState: true });
}

function changePage(page: number) {
  const params = new URLSearchParams();

  if (data.filters.search) {
    params.set('search', data.filters.search);
  }

  if (data.filters.role) {
    params.set('role', data.filters.role);
  }

  params.set('page', page.toString());

  goto(`/users?${params.toString()}`);
}

function clearFilters() {
  searchInput = '';
  roleFilter = '';
  goto('/users');
}

function getRoleBadge(role: string) {
  if (role === 'ADMIN')
    return 'bg-red-500/20 text-red-300 border border-red-500/30';
  if (role === 'MODERATOR')
    return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
  if (role === 'USER')
    return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
  return 'bg-zinc-800 text-gray-400 border border-zinc-700';
}

function getRoleLabel(role: string) {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'MODERATOR') return 'Moderator';
  if (role === 'USER') return 'User';
  return 'Guest';
}

function getBanBadge(status: string) {
  if (status === 'BANNED')
    return 'bg-red-500/20 text-red-300 border border-red-500/30';
  if (status === 'TEMP_BANNED')
    return 'bg-orange-500/20 text-orange-300 border border-orange-500/30';
  return '';
}

function getBanLabel(status: string) {
  if (status === 'BANNED') return 'Banned';
  if (status === 'TEMP_BANNED') return 'Temp Banned';
  return '';
}
</script>

<svelte:head>
	<title>Users - MGE.tf</title>
	<meta name="description" content="Browse all MGE.tf users and players" />
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-7xl">
	<!-- Page Header -->
	<div class="mb-8">
		<h1 class="text-4xl font-bold text-white mb-2">Users</h1>
		<p class="text-gray-400 text-lg">
			{data.pagination.totalCount.toLocaleString()} registered players
		</p>
	</div>

	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
		<form onsubmit={handleSearch} class="flex flex-col md:flex-row gap-4">
			<div class="flex-1">
				<label for="search" class="block text-sm font-medium text-gray-400 mb-2">
					Search
				</label>
				<SearchInput
					bind:value={searchInput}
					placeholder="Search by username, Steam ID, or Discord..."
				/>
			</div>
			
			<div class="md:w-48">
				<label for="role" class="block text-sm font-medium text-gray-400 mb-2">
					Filter by role
				</label>
				<SelectFilter
					bind:value={roleFilter}
					options={roleOptions}
					allLabel="All Roles"
					onChange={handleRoleChange}
				/>
			</div>
			
			<div class="flex items-end gap-2">
				<button
					type="submit"
					class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
				>
					Search
				</button>
				
				{#if data.filters.search || data.filters.role}
					<button
						type="button"
						onclick={clearFilters}
						class="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
					>
						Clear
					</button>
				{/if}
			</div>
		</form>
	</div>

	<!-- Users Table -->
	<DataTable
		data={data.users}
		{columns}
		emptyMessage="No Users Found"
		emptyIcon="👤"
		pagination={{
			currentPage: data.pagination.currentPage,
			totalPages: data.pagination.totalPages,
			onPageChange: changePage,
			infoText: paginationInfo
		}}
	>
		{#snippet cell(user, col)}
			{#if col.key === 'player'}
				<a href="/users/{user.steamId}" class="flex items-center space-x-2 group whitespace-nowrap">
					<img 
						src={user.steamAvatar || '/default-avatar.png'} 
						alt={user.steamUsername}
						class="w-8 h-8 rounded-full"
					/>
					<span class="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
						{user.steamUsername}
					</span>
				</a>
			{:else if col.key === 'discord'}
				{#if user.discord?.discordUsername}
					<div class="flex items-center space-x-2 whitespace-nowrap">
						<img src={discordIcon} alt="Discord" class="w-4 h-4" />
						<span class="text-sm text-gray-300">
							{user.discord.discordUsername}
						</span>
					</div>
				{:else}
					<span class="text-sm text-gray-500">—</span>
				{/if}
			{:else if col.key === 'role'}
				<span class="px-2 py-1 rounded text-xs font-semibold whitespace-nowrap {getRoleBadge(user.permissionLevel)}">
					{getRoleLabel(user.permissionLevel)}
				</span>
			{:else if col.key === 'status'}
				{#if user.banStatus !== 'NONE'}
					<span class="px-2 py-1 rounded text-xs font-semibold whitespace-nowrap {getBanBadge(user.banStatus)}">
						{getBanLabel(user.banStatus)}
					</span>
				{:else}
					<span class="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs font-semibold border border-green-500/30 whitespace-nowrap">
						Active
					</span>
				{/if}
			{/if}
		{/snippet}
	</DataTable>
</div>
