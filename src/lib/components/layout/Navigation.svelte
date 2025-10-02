<script lang="ts">
	import type { SessionUser } from '$lib/server/session';
	import NotificationDropdown from './NotificationDropdown.svelte';
	
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
	
	// User display name truncation
	let displayName = $derived(() => {
		if (!user) return '';
		const maxLength = 15;
		return user.steamUsername.length > maxLength 
			? user.steamUsername.slice(0, maxLength) + '...' 
			: user.steamUsername;
	});
	
	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}
	
	// Copy server command
	let copiedServer = $state(false);
	async function copyServerCommand() {
		await navigator.clipboard.writeText('connect mge.tf');
		copiedServer = true;
		setTimeout(() => {
			copiedServer = false;
		}, 2000);
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
				<!-- Server Actions (Desktop) -->
				<div class="hidden lg:flex items-center gap-2">
					<button
						onclick={copyServerCommand}
						class="px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-all border border-zinc-700 flex items-center gap-2"
						title="Copy server address"
					>
						{#if copiedServer}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
							<span class="text-green-400">Copied!</span>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
							</svg>
							<span>Copy IP</span>
						{/if}
					</button>
					
					<a 
						href="steam://connect/108.61.178.103" 
						class="px-3 py-1.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-500 rounded-lg transition-all flex items-center gap-2"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
						</svg>
						Connect
					</a>
				</div>
				
				<!-- Social Links (Desktop) -->
				<div class="hidden md:flex items-center gap-2">
					<a 
						href="https://discord.gg/j6kDYSpYbs" 
						target="_blank"
						class="p-2 text-gray-400 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all"
						title="Join Discord"
					>
						<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
						</svg>
					</a>
					<a 
						href="https://www.youtube.com/@mge.tf.1v1" 
						target="_blank"
						class="p-2 text-gray-400 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all"
						title="YouTube Channel"
					>
						<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
							<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
						</svg>
					</a>
				</div>
				
				<!-- User Section -->
				{#if !user}
					<a 
						href="/init-openid" 
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
						<NotificationDropdown {notifications} {notificationCount} />
						
						<a href="/player_page/{user.steamId}" class="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/50 rounded-lg transition-all">
							<img class="h-8 w-8 rounded-full ring-2 ring-zinc-700" src={user.steamAvatar} alt="User Avatar" />
							<span class="hidden md:inline text-sm font-medium text-gray-300">{displayName()}</span>
						</a>
						
						{#if user.permissionLevel === 3 || user.permissionLevel === 2}
							<a href="/admin" class="px-3 py-1.5 text-sm font-medium text-purple-400 hover:text-purple-300 hover:bg-zinc-800/50 rounded-lg transition-all">
								Admin
							</a>
						{/if}
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
				
				<div class="pt-3 border-t border-zinc-800">
					<button
						onclick={copyServerCommand}
						class="w-full px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-zinc-800 rounded-lg text-left"
					>
						{copiedServer ? '✓ Copied IP!' : 'Copy Server IP'}
					</button>
					<a href="steam://connect/108.61.178.103" class="block px-4 py-2 text-sm font-medium text-orange-400 hover:text-orange-300 hover:bg-zinc-800 rounded-lg">
						Connect to Server
					</a>
				</div>
				
				{#if user}
					<div class="pt-3 border-t border-zinc-800">
						<a href="/logout" class="block px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-zinc-800 rounded-lg">
							Logout
						</a>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</nav>

