<script lang="ts">
	import type { SessionUser } from '$lib/types/user';
	import { UserRole } from '$lib/types/user';
	
	type Props = {
		user: SessionUser;
		userTeam?: { id: number; name: string } | null;
	};
	
	let { user, userTeam = null }: Props = $props();
	
	// Dropdown state
	let dropdownOpen = $state(false);
	
	// User display name truncation for main button
	let displayName = $derived(() => {
		const maxLength = 15;
		return user.steamUsername.length > maxLength 
			? user.steamUsername.slice(0, maxLength) + '...' 
			: user.steamUsername;
	});
	
	function toggleDropdown() {
		dropdownOpen = !dropdownOpen;
	}
	
	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.user-dropdown-container')) {
			dropdownOpen = false;
		}
	}
	
	// Show admin link if user is moderator or admin
	const isAdminUser = $derived(
		user.permissionLevel === UserRole.ADMIN || 
		user.permissionLevel === UserRole.MODERATOR
	);
</script>

<svelte:window onclick={handleClickOutside} />

<div class="user-dropdown-container relative">
	<!-- User Button -->
	<button 
		onclick={toggleDropdown}
		class="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/50 rounded-lg transition-all"
		aria-label="User menu"
	>
		<img 
			class="h-8 w-8 rounded-full ring-2 ring-zinc-700" 
			src={user.steamAvatar} 
			alt="User Avatar" 
		/>
		<span class="hidden md:inline text-sm font-medium text-gray-300">
			{displayName()}
		</span>
		<!-- Chevron Icon -->
		<svg 
			class="w-4 h-4 text-gray-400 transition-transform {dropdownOpen ? 'rotate-180' : ''}" 
			fill="none" 
			stroke="currentColor" 
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>
	
	<!-- Dropdown Menu -->
	{#if dropdownOpen}
		<div class="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50">
			<!-- User Info Header -->
			<div class="px-4 py-3 border-b border-zinc-800 bg-zinc-800/50">
				<div class="flex items-center gap-3">
					<img 
						class="h-12 w-12 rounded-full ring-2 ring-zinc-700" 
						src={user.steamAvatar} 
						alt="User Avatar" 
					/>
					<div class="flex-1 min-w-0">
						<p class="text-sm font-semibold text-white truncate">
							{user.steamUsername}
						</p>
						<p class="text-xs text-gray-400 capitalize">
							{user.permissionLevel.toLowerCase()}
						</p>
					</div>
				</div>
			</div>
			
			<!-- Menu Items -->
			<div class="py-2">
				<a 
					href="/player/{user.steamId}" 
					class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-zinc-800/50 hover:text-white transition-all"
					onclick={() => dropdownOpen = false}
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
					</svg>
					<span>My Profile</span>
				</a>
				
				{#if userTeam}
					<a 
						href="/teams/{userTeam.id}" 
						class="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:bg-zinc-800/50 hover:text-white transition-all"
						onclick={() => dropdownOpen = false}
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
						</svg>
						<span>My Team: {userTeam.name}</span>
					</a>
				{/if}
				
				{#if isAdminUser}
					<a 
						href="/admin" 
						class="flex items-center gap-3 px-4 py-2.5 text-sm text-purple-400 hover:bg-zinc-800/50 hover:text-purple-300 transition-all"
						onclick={() => dropdownOpen = false}
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						<span>Admin Panel</span>
					</a>
				{/if}
				
				<div class="my-2 border-t border-zinc-800"></div>
				
				<!-- Logout Form -->
				<form method="POST" action="/auth/logout">
					<button 
						type="submit"
						class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800/50 hover:text-red-300 transition-all text-left"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
						</svg>
						<span>Sign Out</span>
					</button>
				</form>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Ensure dropdown appears above other elements */
	.user-dropdown-container {
		z-index: 50;
	}
</style>

