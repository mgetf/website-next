<script lang="ts">
import type { PageData } from './$types';
import { goto } from '$app/navigation';

let { data }: { data: PageData } = $props();

let searchInput = $state(data.filters.search);
let roleFilter = $state(data.filters.role);

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
				<input
					type="text"
					id="search"
					bind:value={searchInput}
					placeholder="Search by username, Steam ID, or Discord..."
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>
			
			<div class="md:w-48">
				<label for="role" class="block text-sm font-medium text-gray-400 mb-2">
					Filter by role
				</label>
				<select
					id="role"
					bind:value={roleFilter}
					onchange={handleRoleChange}
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
				>
					<option value="">All Roles</option>
					<option value="ADMIN">Admin</option>
					<option value="MODERATOR">Moderator</option>
					<option value="USER">User</option>
					<option value="GUEST">Guest</option>
				</select>
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
	{#if data.users.length === 0}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
			<div class="text-6xl mb-4">👤</div>
			<h3 class="text-xl font-bold text-white mb-2">No Users Found</h3>
			<p class="text-gray-400">Try adjusting your search filters</p>
		</div>
	{:else}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-zinc-800">
					<thead class="bg-zinc-800/50">
						<tr>
							<th scope="col" class="px-6 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Player
							</th>
							<th scope="col" class="px-6 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Discord
							</th>
							<th scope="col" class="px-6 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Role
							</th>
							<th scope="col" class="px-6 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Status
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-zinc-800">
						{#each data.users as user}
							<tr class="hover:bg-zinc-800/30 transition-colors">
								<td class="px-6 py-2 whitespace-nowrap">
									<a href="/users/{user.steamId}" class="flex items-center space-x-2 group">
										<img 
											src={user.steamAvatar || '/default-avatar.png'} 
											alt={user.steamUsername}
											class="w-8 h-8 rounded-full"
										/>
										<span class="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
											{user.steamUsername}
										</span>
									</a>
								</td>
								<td class="px-6 py-2 whitespace-nowrap">
									{#if user.discord?.discordUsername}
										<div class="flex items-center space-x-2">
											<svg class="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24">
												<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
											</svg>
											<span class="text-sm text-gray-300">
												{user.discord.discordUsername}
											</span>
										</div>
									{:else}
										<span class="text-sm text-gray-500">—</span>
									{/if}
								</td>
								<td class="px-6 py-2 whitespace-nowrap">
									<span class="px-2 py-1 rounded text-xs font-semibold {getRoleBadge(user.permissionLevel)}">
										{getRoleLabel(user.permissionLevel)}
									</span>
								</td>
								<td class="px-6 py-2 whitespace-nowrap">
									{#if user.banStatus !== 'NONE'}
										<span class="px-2 py-1 rounded text-xs font-semibold {getBanBadge(user.banStatus)}">
											{getBanLabel(user.banStatus)}
										</span>
									{:else}
										<span class="px-2 py-1 bg-green-500/20 text-green-300 rounded text-xs font-semibold border border-green-500/30">
											Active
										</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Pagination -->
		{#if data.pagination.totalPages > 1}
			<div class="mt-6 flex items-center justify-between">
				<div class="text-sm text-gray-400">
					Showing {((data.pagination.currentPage - 1) * data.pagination.perPage) + 1} to {Math.min(data.pagination.currentPage * data.pagination.perPage, data.pagination.totalCount)} of {data.pagination.totalCount} users
				</div>
				
				<div class="flex items-center gap-2">
					<button
						onclick={() => changePage(data.pagination.currentPage - 1)}
						disabled={!data.pagination.hasPreviousPage}
						class="px-4 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						Previous
					</button>
					
					<div class="flex items-center gap-1">
						{#each Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1) as pageNum}
							{#if pageNum === 1 || pageNum === data.pagination.totalPages || (pageNum >= data.pagination.currentPage - 2 && pageNum <= data.pagination.currentPage + 2)}
								<button
									onclick={() => changePage(pageNum)}
									class="px-3 py-2 rounded-lg transition-colors {pageNum === data.pagination.currentPage ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-800 border border-zinc-700 text-gray-300 hover:bg-zinc-700'}"
								>
									{pageNum}
								</button>
							{:else if pageNum === data.pagination.currentPage - 3 || pageNum === data.pagination.currentPage + 3}
								<span class="px-2 text-gray-500">...</span>
							{/if}
						{/each}
					</div>
					
					<button
						onclick={() => changePage(data.pagination.currentPage + 1)}
						disabled={!data.pagination.hasNextPage}
						class="px-4 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						Next
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

