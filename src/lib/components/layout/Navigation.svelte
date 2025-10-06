<script lang="ts">
	import type { SessionUser } from '$lib/types/user';
	import NotificationDropdown from './NotificationDropdown.svelte';
	import UserDropdown from './UserDropdown.svelte';
	import { page } from '$app/stores';
	
	type Props = {
		user: SessionUser | null;
		notifications: Array<{
			id: number;
			type: number;
			url: string;
			createdAt: Date;
		}>;
		notificationCount: number;
	};
	
	let { user, notifications, notificationCount }: Props = $props();
	
	// Mobile menu state
	let mobileMenuOpen = $state(false);
	
	// Get current page path for redirect after login
	const loginUrl = $derived(`/auth/login?redirect=${encodeURIComponent($page.url.pathname)}`);
	
	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}
</script>

<!-- Modern Navigation Bar with great contrast -->
<nav class="bg-zinc-950 border-b border-zinc-800 shadow-lg">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-16">
			<!-- Left: Logo + Main Navigation -->
			<div class="flex items-center gap-8">
				<!-- Logo -->
				<a href="/" class="flex items-center gap-2 group">
					<span class="text-2xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
						MGE.tf
					</span>
				</a>
				
				<!-- Desktop Navigation Links -->
				<div class="hidden md:flex items-center gap-1">
					<a href="/" class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all">
						Home
					</a>
					<a href="/leagues/2v2" class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all">
						2v2 League
					</a>
					<a href="/tournaments" class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all">
						1v1 Tournaments
					</a>
					<a href="/WorldChampionships" class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all">
						Championship
					</a>
					<a href="/rulebook" class="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all">
						Rules
					</a>
				</div>
			</div>
			
			<!-- Right: Actions -->
			<div class="flex items-center gap-3">
				<!-- User Section -->
				{#if !user}
					<a 
						href={loginUrl}
						class="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
					>
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
						</svg>
						<span class="hidden sm:inline">Sign in with Steam</span>
						<span class="sm:hidden">Sign in</span>
					</a>
				{:else}
					<div class="flex items-center gap-3">
						<UserDropdown {user} />
						<NotificationDropdown {notifications} {notificationCount} />
					</div>
				{/if}
				
				<!-- Mobile Menu Button -->
				<button
					onclick={toggleMobileMenu}
					class="md:hidden p-2 text-gray-400 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all"
					aria-label="Toggle menu"
				>
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						{#if mobileMenuOpen}
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						{:else}
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
						{/if}
					</svg>
				</button>
			</div>
		</div>
	</div>
	
	<!-- Mobile Menu -->
	{#if mobileMenuOpen}
		<div class="md:hidden border-t border-zinc-800 bg-zinc-900">
			<div class="px-4 py-3 space-y-1">
				<a href="/" class="block px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800 rounded-lg">
					Home
				</a>
				<a href="/leagues/2v2" class="block px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800 rounded-lg">
					2v2 League
				</a>
				<a href="/tournaments" class="block px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800 rounded-lg">
					1v1 Tournaments
				</a>
				<a href="/WorldChampionships" class="block px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800 rounded-lg">
					Championship
				</a>
				<a href="/rulebook" class="block px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800 rounded-lg">
					Rules
				</a>
				
				{#if user}
					<div class="pt-3 border-t border-zinc-800">
						<form method="POST" action="/auth/logout">
							<button 
								type="submit"
								class="w-full text-left px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-zinc-800 rounded-lg"
							>
								Sign Out
							</button>
						</form>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</nav>

