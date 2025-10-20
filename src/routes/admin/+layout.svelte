<script lang="ts">
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	
	// TODO: Re-import dashboardIcon once proper dashboard is implemented
	// import dashboardIcon from '$lib/assets/icons/dashboard.png';
	import trophyIcon from '$lib/assets/icons/trophy.png';
	import groupIcon from '$lib/assets/icons/group.png';
	import battleIcon from '$lib/assets/icons/battle.png';
	import hourglassIcon from '$lib/assets/icons/hourglass.png';
	import videoCameraIcon from '$lib/assets/icons/video-camera.png';
	import maceIcon from '$lib/assets/icons/mace.png';
	import userIcon from '$lib/assets/icons/user.png';
	import webIcon from '$lib/assets/icons/web.png';
	
	let { data, children }: { data: LayoutData; children: any } = $props();
	
	// Determine active page for sidebar highlighting
	const isActive = (path: string) => {
		if (path === '/admin') {
			return page.url.pathname === '/admin';
		}
		return page.url.pathname === path || page.url.pathname.startsWith(path + '/');
	};
	
	// Sidebar menu items
	const menuItems = [
		// TODO: Uncomment Dashboard once proper dashboard is implemented
		// { name: 'Dashboard', path: '/admin', icon: dashboardIcon },
		{ name: 'League', path: '/admin/league', icon: trophyIcon },
		{ name: 'Teams', path: '/admin/teams', icon: groupIcon },
		{ name: 'Matches', path: '/admin/matches', icon: battleIcon },
		{ name: 'Pending Players', path: '/admin/pending-players', icon: hourglassIcon },
		{ name: 'Demos', path: '/admin/demos', icon: videoCameraIcon },
		{ name: 'Disputes', path: '/admin/disputes', icon: maceIcon },
		{ name: 'Users', path: '/admin/users', icon: userIcon },
		{ name: 'Global', path: '/admin/global', icon: webIcon }
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
						<img src={item.icon} alt={item.name} class="w-6 h-6 brightness-0 invert opacity-70" />
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
							<img src={item.icon} alt={item.name} class="w-5 h-5 brightness-0 invert opacity-70" />
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

