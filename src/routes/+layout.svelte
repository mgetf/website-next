<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';
	import Navigation from '$lib/components/layout/Navigation.svelte';
	import AnnouncementBanner from '$lib/components/layout/AnnouncementBanner.svelte';
	import LoadingBar from '$lib/components/layout/LoadingBar.svelte';
	import { identifyUser } from '$lib/utils/posthog';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';

	let { data, children }: { data: LayoutData; children: any } = $props();
	
	// Identify user to PostHog when layout mounts
	onMount(() => {
		if (data.user) {
			identifyUser(data.user);
		}
	});

	// Scroll to top on every navigation
	afterNavigate(() => {
		const mainContent = document.getElementById('main-content');
		if (mainContent) {
			mainContent.scrollTo({ top: 0, behavior: 'instant' });
		}
	});
</script>

<svelte:head>
	<title>MGE.tf - Competitive TF2 MGE League</title>
	<meta name="description" content="MGE.tf is a competitive Team Fortress 2 MGE league platform for 2v2 tournaments and seasonal play" />
	<meta name="view-transition" content="same-origin" />
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
</svelte:head>

<div class="subpixel-antialiased flex flex-col h-full overflow-hidden bg-zinc-950 text-gray-200">
	<LoadingBar />
	
	<div class="flex flex-col flex-grow overflow-hidden w-full mx-auto">
		<div class="flex flex-col h-full w-full mx-auto">
			<Navigation 
				user={data.user} 
				notifications={data.notifications} 
				notificationCount={data.notificationCount}
				signupClosed={data.signupClosed}
				isInTeam={data.isInTeam}
				userTeam={data.userTeam}
			/>
			
		{#if data.announcements.length > 0}
			<AnnouncementBanner announcements={data.announcements} />
		{/if}
			
			<div id="main-content" class="flex-grow overflow-y-auto bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950">
				{@render children()}
			</div>
		</div>
	</div>
</div>

<style>
	:global(html) {
		height: 100%;
		width: 100%;
		font-family: 'Inter', sans-serif;
	}
	
	:global(body) {
		height: 100%;
		overflow: hidden;
	}
</style>

