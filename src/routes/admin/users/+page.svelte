<script lang="ts">
import type { PageData, ActionData } from './$types';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { enhance } from '$app/forms';

let { data, form }: { data: PageData; form: ActionData } = $props();

let editingUser: (typeof data.users)[0] | null = $state(null);
let banningUser: (typeof data.users)[0] | null = $state(null);
let isSubmitting = $state(false);

// Build filter URL
function updateFilters(updates: Record<string, string>) {
  const params = new URLSearchParams(page.url.searchParams);

  // Update/remove parameters
  Object.entries(updates).forEach(([key, value]) => {
    if (value && value !== 'all' && value !== '') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  });

  // Reset to page 1 when filters change
  if (!updates.page) {
    params.delete('page');
  }

  goto(`?${params.toString()}`, { keepFocus: true, replaceState: true });
}

// Permission level names
const permissionNames: Record<string, string> = {
  GUEST: 'Guest',
  USER: 'User',
  MODERATOR: 'Moderator',
  ADMIN: 'Admin',
};

// Ban status names
const banStatusNames: Record<string, string> = {
  NONE: 'None',
  WARNING: 'Warning',
  SUSPENDED: 'Suspended',
  BANNED: 'Banned',
};

function getPermissionColor(permission: string) {
  if (permission === 'ADMIN') return 'bg-red-500/20 text-red-400';
  if (permission === 'MODERATOR') return 'bg-purple-500/20 text-purple-400';
  if (permission === 'USER') return 'bg-blue-500/20 text-blue-400';
  return 'bg-gray-500/20 text-gray-400';
}

function getBanStatusColor(status: string) {
  if (status === 'BANNED') return 'bg-red-500/20 text-red-400';
  if (status === 'SUSPENDED') return 'bg-orange-500/20 text-orange-400';
  if (status === 'WARNING') return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-green-500/20 text-green-400';
}

// Pagination
function goToPage(pageNum: number) {
  updateFilters({ page: pageNum.toString() });
}

// Modal functions
function openEditModal(user: (typeof data.users)[0]) {
  editingUser = { ...user };
}

function closeEditModal() {
  editingUser = null;
}

function openBanModal(user: (typeof data.users)[0]) {
  banningUser = user;
}

function closeBanModal() {
  banningUser = null;
}

// Generate page numbers for pagination
const pageNumbers = $derived(() => {
  const { page, totalPages } = data.pagination;
  const pages: (number | string)[] = [];

  if (totalPages <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    if (page > 3) {
      pages.push('...');
    }

    // Show pages around current page
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(totalPages - 1, page + 1);
      i++
    ) {
      pages.push(i);
    }

    if (page < totalPages - 2) {
      pages.push('...');
    }

    // Always show last page
    pages.push(totalPages);
  }

  return pages;
});
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">User Management</h2>
		<p class="text-gray-400">Manage user accounts, roles, and permissions</p>
	</div>
	
	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<form class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<!-- Search -->
			<input
				type="text"
				name="search"
				value={data.filters.search}
				oninput={(e) => updateFilters({ search: e.currentTarget.value })}
				placeholder="Search by username or Steam ID..."
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
			/>
			
			<!-- Permission Level Filter -->
			<select
				name="permissionLevel"
				value={data.filters.permissionLevel}
				onchange={(e) => updateFilters({ permissionLevel: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Permissions</option>
				<option value="GUEST">Guest</option>
				<option value="USER">User</option>
				<option value="MODERATOR">Moderator</option>
				<option value="ADMIN">Admin</option>
			</select>
			
			<!-- Ban Status Filter -->
			<select
				name="banStatus"
				value={data.filters.banStatus}
				onchange={(e) => updateFilters({ banStatus: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Status</option>
				<option value="NONE">Active</option>
				<option value="WARNING">Warning</option>
				<option value="SUSPENDED">Suspended</option>
				<option value="BANNED">Banned</option>
			</select>
			
			<!-- Clear Filters Button -->
			<button
				type="button"
				onclick={() => goto('/admin/users')}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-gray-300 hover:text-white transition-colors"
			>
				Clear Filters
			</button>
		</form>
	</div>
	
	<!-- Users Table -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-zinc-950 border-b border-zinc-800">
					<tr>
						<th class="px-4 py-3 text-left text-xs font-semibold text-gray-300">User</th>
						<th class="px-4 py-3 text-left text-xs font-semibold text-gray-300">Discord</th>
						<th class="px-4 py-3 text-left text-xs font-semibold text-gray-300">Role</th>
						<th class="px-4 py-3 text-left text-xs font-semibold text-gray-300">Status</th>
						<th class="px-4 py-3 text-right text-xs font-semibold text-gray-300">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-zinc-800">
					{#each data.users as user}
						<tr class="hover:bg-zinc-800/50 transition-colors">
							<td class="px-4 py-2">
								<div class="flex items-center gap-2">
									{#if user.steamAvatar}
										<img src={user.steamAvatar} alt={user.steamUsername} class="w-8 h-8 rounded" />
									{:else}
										<div class="w-8 h-8 bg-zinc-700 rounded flex items-center justify-center text-xs font-bold text-gray-400">
											{user.steamUsername.slice(0, 2).toUpperCase()}
										</div>
									{/if}
									<div class="min-w-0">
										<a href="/users/{user.steamId}" class="text-white text-sm font-medium hover:text-orange-400 block truncate">
											{user.steamUsername}
										</a>
										{#if user.isModerator}
											<p class="text-xs text-purple-400 truncate">
												Staff{user.moderatorDivision ? ` • ${user.moderatorDivision}` : ''}
											</p>
										{/if}
									</div>
								</div>
							</td>
							<td class="px-4 py-2">
								{#if user.discordLinked && user.discordUsername}
									<span class="text-green-400 text-xs truncate block max-w-[120px]" title={user.discordUsername}>
										{user.discordUsername}
									</span>
								{:else if user.discordLinked}
									<span class="text-green-400 text-xs">✓</span>
								{:else}
									<span class="text-gray-500 text-xs">—</span>
								{/if}
							</td>
							<td class="px-4 py-2">
								<span class="px-2 py-0.5 rounded text-xs font-medium {getPermissionColor(user.permissionLevel)}">
									{permissionNames[user.permissionLevel]}
								</span>
							</td>
							<td class="px-4 py-2">
								<span class="px-2 py-0.5 rounded text-xs font-medium {getBanStatusColor(user.banStatus)}">
									{banStatusNames[user.banStatus]}
								</span>
							</td>
							<td class="px-4 py-2">
								<div class="flex items-center justify-end gap-1">
								<a 
									href="/users/{user.steamId}"
									class="px-2 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-xs transition-colors"
								>
										View
									</a>
									<button 
										onclick={() => openEditModal(user)}
										class="px-2 py-1 bg-zinc-700 text-gray-300 hover:bg-zinc-600 rounded text-xs transition-colors"
									>
										Edit
									</button>
									<button 
										onclick={() => openBanModal(user)}
										class="px-2 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-xs transition-colors"
									>
										Punish
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		
		{#if data.users.length === 0}
			<div class="py-12 text-center">
				<p class="text-gray-400">No users found matching your filters</p>
			</div>
		{/if}
	</div>
	
	<!-- Pagination -->
	{#if data.pagination.totalPages > 1}
		<div class="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-4">
			<div class="text-sm text-gray-400">
				Showing {((data.pagination.page - 1) * data.pagination.pageSize) + 1} to {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalUsers)} of {data.pagination.totalUsers} users
			</div>
			
			<div class="flex items-center gap-2">
				<!-- Previous Button -->
				<button
					onclick={() => goToPage(data.pagination.page - 1)}
					disabled={data.pagination.page === 1}
					class="px-3 py-1 bg-zinc-800 text-gray-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
				>
					← Previous
				</button>
				
				<!-- Page Numbers -->
				{#each pageNumbers() as pageNum}
					{#if pageNum === '...'}
						<span class="px-2 text-gray-500">...</span>
					{:else}
						<button
							onclick={() => goToPage(pageNum as number)}
							class="px-3 py-1 rounded transition-colors {
								pageNum === data.pagination.page
									? 'bg-orange-500 text-white font-medium'
									: 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'
							}"
						>
							{pageNum}
						</button>
					{/if}
				{/each}
				
				<!-- Next Button -->
				<button
					onclick={() => goToPage(data.pagination.page + 1)}
					disabled={data.pagination.page === data.pagination.totalPages}
					class="px-3 py-1 bg-zinc-800 text-gray-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
				>
					Next →
				</button>
			</div>
		</div>
	{:else}
		<!-- Summary (when no pagination needed) -->
		<div class="text-sm text-gray-400">
			Showing {data.users.length} of {data.pagination.totalUsers} users
		</div>
	{/if}
	
	<!-- Success/Error Messages -->
	{#if form?.success && form?.message}
		<div class="fixed top-4 right-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg shadow-lg z-50">
			<p class="text-green-400">{form.message}</p>
		</div>
	{/if}
	
	{#if form?.error && !editingUser && !banningUser}
		<div class="fixed top-4 right-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg shadow-lg z-50">
			<p class="text-red-400">{form.error}</p>
		</div>
	{/if}
</div>

<!-- Edit User Modal -->
{#if editingUser}
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
				<h3 class="text-xl font-bold text-white">Edit User: {editingUser.steamUsername}</h3>
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
				action="?/updateUser"
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
				<input type="hidden" name="steamId" value={editingUser.steamId} />
				
				<div class="space-y-4">
					<div>
						<label for="edit-permissionLevel" class="block text-sm font-medium text-gray-300 mb-2">Permission Level</label>
						<select
							id="edit-permissionLevel"
							name="permissionLevel"
							bind:value={editingUser.permissionLevel}
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							<option value="GUEST">Guest</option>
							<option value="USER">User</option>
							<option value="MODERATOR">Moderator</option>
							<option value="ADMIN">Admin</option>
						</select>
						<p class="text-xs text-gray-500 mt-1">
							Guests cannot sign up for leagues. Users can create teams. Moderators have staff access. Admins have full access.
						</p>
					</div>
					
					<div>
						<label for="edit-banStatus" class="block text-sm font-medium text-gray-300 mb-2">Ban Status</label>
						<select
							id="edit-banStatus"
							name="banStatus"
							bind:value={editingUser.banStatus}
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							<option value="NONE">None (Active)</option>
							<option value="WARNING">Warning</option>
							<option value="SUSPENDED">Suspended</option>
							<option value="BANNED">Banned</option>
						</select>
						<p class="text-xs text-gray-500 mt-1">
							Use the Ban button to add a ban with a reason. This field is for quick status changes.
						</p>
					</div>
					
					<div>
						<label for="edit-nameOverride" class="block text-sm font-medium text-gray-300 mb-2">Name Override</label>
						<select
							id="edit-nameOverride"
							name="nameOverride"
							bind:value={editingUser.nameOverride}
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							<option value={0}>Disabled (Use Steam Name)</option>
							<option value={1}>Enabled (Lock Current Name)</option>
						</select>
						<p class="text-xs text-gray-500 mt-1">
							When enabled, the user's display name will not update automatically from Steam.
						</p>
					</div>
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

<!-- Punish User Modal -->
{#if banningUser}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={closeBanModal}
		onkeydown={(e) => e.key === 'Escape' && closeBanModal()}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">Punish User</h3>
				<button 
					onclick={closeBanModal}
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
			
			<div class="mb-6">
				<div class="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
					{#if banningUser.steamAvatar}
						<img src={banningUser.steamAvatar} alt={banningUser.steamUsername} class="w-10 h-10 rounded" />
					{:else}
						<div class="w-10 h-10 bg-zinc-700 rounded flex items-center justify-center text-sm font-bold text-gray-400">
							{banningUser.steamUsername.slice(0, 2).toUpperCase()}
						</div>
					{/if}
					<div>
						<p class="text-white font-medium">{banningUser.steamUsername}</p>
						<p class="text-sm text-gray-400 font-mono">{banningUser.steamId}</p>
					</div>
				</div>
			</div>
			
			<form 
				method="POST" 
				action="?/banUser"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							closeBanModal();
						}
					};
				}}
			>
				<input type="hidden" name="steamId" value={banningUser.steamId} />
				
				<div class="space-y-4">
					<div>
						<label for="ban-severity" class="block text-sm font-medium text-gray-300 mb-2">Severity *</label>
						<select
							id="ban-severity"
							name="severity"
							required
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							<option value="">Select severity...</option>
							<option value="WARNING">Warning</option>
							<option value="SUSPENDED">Suspended</option>
							<option value="BANNED">Banned</option>
						</select>
					</div>
					
					<div>
						<label for="ban-duration" class="block text-sm font-medium text-gray-300 mb-2">Duration (days)</label>
						<input
							id="ban-duration"
							name="duration"
							type="number"
							min="0"
							placeholder="Leave empty for permanent"
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						/>
						<p class="text-xs text-gray-500 mt-1">
							Leave empty for permanent punishment
						</p>
					</div>
					
					<div>
						<label for="ban-reason" class="block text-sm font-medium text-gray-300 mb-2">Reason *</label>
						<textarea
							id="ban-reason"
							name="reason"
							rows="4"
							required
							placeholder="Explain why this user is being punished..."
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500 resize-none"
						></textarea>
					</div>
					
					<div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
						<p class="text-red-400 text-sm">
							⚠️ This will create a punishment record and update the user's status.
						</p>
					</div>
				</div>
				
				<div class="mt-6 flex gap-3 justify-end">
					<button 
						type="button"
						onclick={closeBanModal}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting}
						class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Processing...' : 'Apply Punishment'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
