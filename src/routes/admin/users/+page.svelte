<script lang="ts">
import type { PageData, ActionData } from './$types';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { enhance } from '$app/forms';
import DataTable from '$lib/components/ui/DataTable.svelte';
import SearchInput from '$lib/components/ui/SearchInput.svelte';
import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
import Dialog from '$lib/components/ui/Dialog.svelte';
import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
import FormInput from '$lib/components/ui/form/FormInput.svelte';
import FormError from '$lib/components/ui/form/FormError.svelte';
import { toast } from '$lib/state/toast.svelte';
import discordIcon from '$lib/assets/icons/discord.png';

let { data, form }: { data: PageData; form: ActionData } = $props();

let editingUser: (typeof data.users)[0] | null = $state(null);
let banningUser: (typeof data.users)[0] | null = $state(null);
let unlinkingDiscordUser: (typeof data.users)[0] | null = $state(null);
let isSubmitting = $state(false);
let lastFormResult: ActionData = null;
let selectedStaffRegionId: number | null = $state(null);

const filteredDivisions = $derived(
	selectedStaffRegionId
		? data.divisions.filter((d: typeof data.divisions[0]) => d.regionId === selectedStaffRegionId)
		: []
);

$effect(() => {
	if (form && form !== lastFormResult) {
		lastFormResult = form;
		if (form.success && form.message) {
			toast.success(form.message);
		} else if (form.error && !editingUser && !banningUser) {
			toast.error(form.error);
		}
	}
});

const columns = [
	{ key: 'user', label: 'User' },
	{ key: 'discord', label: 'Discord' },
	{ key: 'role', label: 'Role' },
	{ key: 'status', label: 'Status' },
	{ key: 'actions', label: 'Actions', align: 'right' as const }
];

const paginationInfo = $derived(
	`Showing ${((data.pagination.page - 1) * data.pagination.pageSize) + 1} to ${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalUsers)} of ${data.pagination.totalUsers} users`
);

function updateFilters(updates: Record<string, string>) {
  const params = new URLSearchParams(page.url.searchParams);

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

const permissionNames: Record<string, string> = {
  GUEST: 'Guest',
  MODERATOR: 'Moderator',
  ADMIN: 'Admin',
};

const permissionOptions = [
  { value: 'GUEST', label: 'Guest' },
  { value: 'MODERATOR', label: 'Moderator' },
  { value: 'ADMIN', label: 'Admin' }
];

const banStatusOptions = [
  { value: 'NONE', label: 'Active' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'BANNED', label: 'Banned' }
];

const banStatusNames: Record<string, string> = {
  NONE: 'None',
  WARNING: 'Warning',
  SUSPENDED: 'Suspended',
  BANNED: 'Banned',
};

function getPermissionColor(permission: string) {
  if (permission === 'ADMIN') return 'bg-red-500/20 text-red-400';
  if (permission === 'MODERATOR') return 'bg-purple-500/20 text-purple-400';
  return 'bg-gray-500/20 text-gray-400';
}

function getBanStatusColor(status: string) {
  if (status === 'BANNED') return 'bg-red-500/20 text-red-400';
  if (status === 'SUSPENDED') return 'bg-orange-500/20 text-orange-400';
  if (status === 'WARNING') return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-green-500/20 text-green-400';
}

function goToPage(pageNum: number) {
  updateFilters({ page: pageNum.toString() });
}

function openEditModal(user: (typeof data.users)[0]) {
  editingUser = { ...user };
  selectedStaffRegionId = user.staffRegionId ?? null;
}

function closeEditModal() {
  editingUser = null;
  selectedStaffRegionId = null;
}

function openBanModal(user: (typeof data.users)[0]) {
  banningUser = user;
}

function closeBanModal() {
  banningUser = null;
}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">User Management</h2>
		<p class="text-gray-400">Manage user accounts, roles, and permissions</p>
	</div>
	
	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<SearchInput
				value={data.filters.search}
				placeholder="Search by username or Steam ID..."
				onSearch={(v) => updateFilters({ search: v })}
			/>
			
			<SelectFilter
				value={data.filters.permissionLevel}
				options={permissionOptions}
				allLabel="All Permissions"
				onChange={(v) => updateFilters({ permissionLevel: v })}
			/>
			
			<SelectFilter
				value={data.filters.banStatus}
				options={banStatusOptions}
				allLabel="All Status"
				onChange={(v) => updateFilters({ banStatus: v })}
			/>
			
			<button
				type="button"
				onclick={() => goto('/admin/users')}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-gray-300 hover:text-white transition-colors"
			>
				Clear Filters
			</button>
		</div>
	</div>
	
	<!-- Users Table -->
	<DataTable
		data={data.users}
		{columns}
		emptyMessage="No users found matching your filters"
		pagination={{
			currentPage: data.pagination.page,
			totalPages: data.pagination.totalPages,
			onPageChange: goToPage,
			infoText: paginationInfo
		}}
	>
		{#snippet cell(user, col)}
			{#if col.key === 'user'}
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
						{#if user.permissionLevel === 'MODERATOR' || user.permissionLevel === 'ADMIN'}
							<p class="text-xs text-purple-400 truncate">
								Staff{user.staffDivisionName ? ` • ${user.staffDivisionName}` : ''}
							</p>
						{/if}
					</div>
				</div>
			{:else if col.key === 'discord'}
				{#if user.discordLinked && user.discordUsername}
					<span class="text-green-400 text-xs truncate block max-w-[120px]" title={user.discordUsername}>
						{user.discordUsername}
					</span>
				{:else if user.discordLinked}
					<span class="text-green-400 text-xs">✓</span>
				{:else}
					<span class="text-gray-500 text-xs">—</span>
				{/if}
			{:else if col.key === 'role'}
				<span class="px-2 py-1 rounded text-xs font-medium {getPermissionColor(user.permissionLevel)}">
					{permissionNames[user.permissionLevel]}
				</span>
			{:else if col.key === 'status'}
				<span class="px-2 py-1 rounded text-xs font-medium {getBanStatusColor(user.banStatus)}">
					{banStatusNames[user.banStatus]}
				</span>
			{:else if col.key === 'actions'}
				<div class="flex items-center justify-end gap-1">
					<a 
						href="/users/{user.steamId}"
						class="px-3 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-sm transition-colors"
					>
						View
					</a>
					<button 
						onclick={() => openEditModal(user)}
						class="px-3 py-1 bg-zinc-700 text-gray-300 hover:bg-zinc-600 rounded text-sm transition-colors"
					>
						Edit
					</button>
					<button 
						onclick={() => openBanModal(user)}
						class="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-sm transition-colors"
					>
						Punish
					</button>
				</div>
			{/if}
		{/snippet}
	</DataTable>
	
</div>

<!-- Edit User Modal -->
{#if editingUser}
	<Dialog
		open={true}
		title="Edit User: {editingUser.steamUsername}"
		maxWidth="2xl"
		onClose={closeEditModal}
	>
		<FormError error={form?.error} />

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
			{#if editingUser.permissionLevel !== 'MODERATOR' && editingUser.permissionLevel !== 'ADMIN'}
				<input type="hidden" name="staffDivisionId" value="" />
			{/if}

			<FormSelect
				label="Permission Level"
				name="permissionLevel"
				bind:value={editingUser.permissionLevel}
				options={permissionOptions}
			/>

			{#if editingUser.permissionLevel === 'MODERATOR' || editingUser.permissionLevel === 'ADMIN'}
				<div class="mb-6">
					<p class="block text-sm font-medium text-gray-300 mb-2">Staff Assignment</p>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="sr-only" for="staffRegion">Region</label>
							<select
								id="staffRegion"
								class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
								value={selectedStaffRegionId ?? ''}
								onchange={(e) => {
									const val = e.currentTarget.value;
									selectedStaffRegionId = val ? parseInt(val) : null;
									if (editingUser) editingUser.staffDivisionId = null;
								}}
							>
								<option value="">No region</option>
								{#each data.regions as region}
									<option value={region.id}>{region.name}</option>
								{/each}
							</select>
						</div>
						<div>
							<label class="sr-only" for="staffDivision">Division</label>
							<select
								id="staffDivision"
								name="staffDivisionId"
								class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={!selectedStaffRegionId}
								value={editingUser.staffDivisionId ?? ''}
								onchange={(e) => {
									const val = e.currentTarget.value;
									if (editingUser) editingUser.staffDivisionId = val ? parseInt(val) : null;
								}}
							>
								<option value="">No division</option>
								{#each filteredDivisions as division}
									<option value={division.id}>{division.name}</option>
								{/each}
							</select>
						</div>
					</div>
					<p class="mt-2 text-sm text-gray-500">Which region/division this staff member is assigned to (for display on league page).</p>
				</div>
			{/if}

			<FormSelect
				label="Ban Status"
				name="banStatus"
				bind:value={editingUser.banStatus}
				options={[
					{ value: 'NONE', label: 'None (Active)' },
					{ value: 'WARNING', label: 'Warning' },
					{ value: 'SUSPENDED', label: 'Suspended' },
					{ value: 'BANNED', label: 'Banned' }
				]}
				hint="Use the Punish button to add a ban with a reason. This field is for quick status changes."
			/>

		<FormSelect
			label="Name Override"
			name="nameOverride"
			value={String(editingUser.nameOverride)}
			options={[
				{ value: '0', label: 'Disabled (Use Steam Name)' },
				{ value: '1', label: 'Enabled (Lock Current Name)' }
			]}
			hint="When enabled, the user's display name will not update automatically from Steam."
		/>

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

		{#if editingUser.discordLinked}
			<div class="pt-4 mt-4 border-t border-zinc-800">
				<p class="block text-sm font-medium text-gray-300 mb-2">Discord Account</p>
				<div class="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
					<div class="flex items-center gap-2">
						<img src={discordIcon} alt="Discord" class="w-4 h-4" />
						<span class="text-green-400 text-sm">{editingUser.discordUsername || 'Linked'}</span>
					</div>
					<button
						type="button"
						onclick={() => unlinkingDiscordUser = editingUser}
						disabled={isSubmitting}
						class="text-xs text-red-400 hover:text-red-300 hover:underline transition-colors disabled:opacity-50"
					>
						Unlink
					</button>
				</div>
			</div>
		{/if}
	</Dialog>
{/if}

<!-- Unlink Discord Confirmation Modal -->
{#if unlinkingDiscordUser}
	<Dialog
		open={true}
		title="Unlink Discord Account"
		onClose={() => unlinkingDiscordUser = null}
	>
		<p class="text-gray-400 mb-4">
			Are you sure you want to unlink <span class="text-white font-medium">{unlinkingDiscordUser.steamUsername}</span>'s Discord account?
		</p>

		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
			<div class="flex items-center gap-2">
				<img src={discordIcon} alt="Discord" class="w-4 h-4" />
				<span class="text-green-400 text-sm">{unlinkingDiscordUser.discordUsername || 'Linked'}</span>
			</div>
		</div>

		{#snippet footer()}
			<button
				type="button"
				onclick={() => unlinkingDiscordUser = null}
				class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
			>
				Cancel
			</button>
			<form
				method="POST"
				action="?/unlinkDiscord"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							unlinkingDiscordUser = null;
							closeEditModal();
						}
					};
				}}
				class="flex-1"
			>
				<input type="hidden" name="steamId" value={unlinkingDiscordUser!.steamId} />
				<button
					type="submit"
					disabled={isSubmitting}
					class="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? 'Unlinking...' : 'Unlink Discord'}
				</button>
			</form>
		{/snippet}
	</Dialog>
{/if}

<!-- Punish User Modal -->
{#if banningUser}
	<Dialog
		open={true}
		title="Punish User"
		onClose={closeBanModal}
	>
		<FormError error={form?.error} />

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

			<FormSelect
				label="Severity"
				name="severity"
				required
				options={[
					{ value: 'WARNING', label: 'Warning' },
					{ value: 'SUSPENDED', label: 'Suspended' },
					{ value: 'BANNED', label: 'Banned' }
				]}
				placeholder="Select severity..."
			/>

			<FormInput
				label="Duration (days)"
				name="duration"
				type="number"
				placeholder="Leave empty for permanent"
				hint="Leave empty for permanent punishment"
			/>

			<div class="mb-6">
				<label for="ban-reason" class="block text-sm font-medium text-gray-300 mb-2">
					Reason <span class="text-red-500">*</span>
				</label>
				<textarea
					id="ban-reason"
					name="reason"
					rows="4"
					required
					placeholder="Explain why this user is being punished..."
					class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors resize-none"
				></textarea>
			</div>

			<div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg mb-6">
				<p class="text-red-400 text-sm">
					This will create a punishment record and update the user's status.
				</p>
			</div>

			<div class="flex gap-3 justify-end">
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
	</Dialog>
{/if}
