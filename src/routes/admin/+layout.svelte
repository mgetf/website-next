<script lang="ts">
	import type { LayoutData } from './$types';
	import { page } from '$app/stores';
	
	let { data, children }: { data: LayoutData; children: any } = $props();
	
	// Determine active page for sidebar highlighting
	const isActive = (path: string) => $page.url.pathname === path || $page.url.pathname.startsWith(path + '/');
	
	// Sidebar menu items
	const menuItems = [
		{ name: 'Dashboard', path: '/admin', icon: '📊' },
		{ name: 'Seasons', path: '/admin/seasons', icon: '🏆' },
		{ name: 'Teams', path: '/admin/teams', icon: '👥' },
		{ name: 'Matches', path: '/admin/matches', icon: '⚔️' },
		{ name: 'Pending Players', path: '/admin/pending-players', icon: '⏳' },
		{ name: 'Demos', path: '/admin/demos', icon: '📹' },
		{ name: 'Disputes', path: '/admin/disputes', icon: '⚖️' },
		{ name: 'Users', path: '/admin/users', icon: '🔒' },
		{ name: 'Config', path: '/admin/config', icon: '⚙️' }
	];
	
	// Mobile menu state
	let mobileMenuOpen = $state(false);
</script>

<svelte:head>
	<title>Admin Panel - MGE.tf</title>
</svelte:head>

<div class="min-h-screen bg-zinc-950 text-gray-200 flex">
		<!-- Sidebar -->
		<aside class="hidden lg:block w-64 bg-zinc-900 border-r border-zinc-800 min-h-screen sticky top-0">
			<nav class="p-4 space-y-1">
				<!-- Back to Site Button -->
				<a 
					href="/" 
					class="flex items-center gap-3 px-4 py-3 mb-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-all text-gray-300 hover:text-white"
				>
					<span class="text-xl">←</span>
					<span>Back to Site</span>
				</a>
				
				{#each menuItems as item}
					<a
						href={item.path}
						class="flex items-center gap-3 px-4 py-3 rounded-lg transition-all {
							isActive(item.path)
								? 'bg-orange-500/20 text-orange-400 font-medium'
								: 'text-gray-300 hover:bg-zinc-800 hover:text-white'
						}"
					>
						<span class="text-xl">{item.icon}</span>
						<span>{item.name}</span>
					</a>
				{/each}
			</nav>
		</aside>
		
		<!-- Mobile Menu Toggle (Floating Button) -->
		<button
			onclick={() => mobileMenuOpen = !mobileMenuOpen}
			class="lg:hidden fixed bottom-6 right-6 z-50 p-4 bg-orange-600 hover:bg-orange-500 rounded-full shadow-lg transition-colors"
			aria-label="Toggle menu"
		>
			<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
		
		<!-- Mobile Sidebar -->
		{#if mobileMenuOpen}
			<button 
				class="lg:hidden fixed inset-0 z-40 bg-black/50" 
				onclick={() => mobileMenuOpen = false}
				aria-label="Close menu"
			>
				<div class="w-64 bg-zinc-900 h-full" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
					<nav class="p-4 space-y-1">
						<!-- Back to Site Button -->
						<a 
							href="/" 
							onclick={() => mobileMenuOpen = false}
							class="flex items-center gap-3 px-4 py-3 mb-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-all text-gray-300 hover:text-white"
						>
							<span class="text-xl">←</span>
							<span>Back to Site</span>
						</a>
						{#each menuItems as item}
							<a
								href={item.path}
								onclick={() => mobileMenuOpen = false}
								class="flex items-center gap-3 px-4 py-3 rounded-lg transition-all {
									isActive(item.path)
										? 'bg-orange-500/20 text-orange-400 font-medium'
										: 'text-gray-300 hover:bg-zinc-800 hover:text-white'
								}"
							>
								<span class="text-xl">{item.icon}</span>
								<span>{item.name}</span>
							</a>
						{/each}
					</nav>
				</div>
			</button>
		{/if}
		
	<!-- Main Content -->
	<main class="flex-1 p-6 lg:p-8">
		{@render children()}
	</main>
</div>

