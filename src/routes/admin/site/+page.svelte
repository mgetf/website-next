<script lang="ts">
import { enhance } from '$app/forms';
import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// Tabs
type Tab = 'settings' | 'homepage' | 'rulebook';
let activeTab = $state<Tab>('settings');

// Form states
let isSubmitting = $state(false);
let successMessage = $state('');
let errorMessage = $state('');

// Content states - initialized from data
let siteTitle = $state(data.settings.siteTitle);
let homepageSubtitle = $state(data.content.homepage_subtitle || '');
let homepageAbout = $state(data.content.homepage_about || '');
let rulebookContent = $state(data.rulebookContent);

// Sync state when data changes (after form submission)
$effect(() => {
  siteTitle = data.settings.siteTitle;
});
$effect(() => {
  homepageSubtitle = data.content.homepage_subtitle || '';
});
$effect(() => {
  homepageAbout = data.content.homepage_about || '';
});
$effect(() => {
  rulebookContent = data.rulebookContent;
});

// Preview toggle for rulebook
let showPreview = $state(false);

function handleEnhance(action: string) {
  return () => {
    isSubmitting = true;
    successMessage = '';
    errorMessage = '';

    return async ({ result, update }: any) => {
      isSubmitting = false;
      if (result.type === 'success') {
        successMessage = result.data?.message || 'Saved successfully';
        setTimeout(() => (successMessage = ''), 3000);
      } else if (result.type === 'failure') {
        errorMessage = result.data?.error || 'Failed to save';
      }
      await update();
    };
  };
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'settings', label: 'Site Settings' },
  { id: 'homepage', label: 'Homepage Content' },
  { id: 'rulebook', label: 'Rulebook' },
];
</script>

<div class="max-w-6xl mx-auto space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold text-white mb-2">Site Management</h1>
		<p class="text-gray-400">Manage site content and settings</p>
	</div>

	<!-- Success/Error Messages -->
	{#if successMessage}
		<div class="bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-green-400">
			{successMessage}
		</div>
	{/if}
	{#if errorMessage}
		<div class="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-400">
			{errorMessage}
		</div>
	{/if}

	<!-- Tabs -->
	<div class="border-b border-zinc-800">
		<nav class="flex gap-4">
			{#each tabs as tab}
				<button
					onclick={() => (activeTab = tab.id)}
					class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === tab.id
						? 'border-blue-500 text-blue-400'
						: 'border-transparent text-gray-400 hover:text-white'}"
				>
					{tab.label}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Tab Content -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		{#if activeTab === 'settings'}
			<!-- Site Settings -->
			<div class="space-y-8">
				<!-- Site Title -->
				<form method="POST" action="?/updateSettings" use:enhance={handleEnhance('settings')}>
					<div class="space-y-6">
						<div>
							<label for="siteTitle" class="block text-sm font-medium text-gray-300 mb-2">
								Site Title
							</label>
							<input
								type="text"
								id="siteTitle"
								name="siteTitle"
								bind:value={siteTitle}
								class="w-full max-w-md bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
								placeholder="MGE.tf"
							/>
							<p class="text-xs text-gray-500 mt-1">Appears in browser tab and site header</p>
						</div>

						{#if !data.isHeadAdmin}
							<div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-400 text-sm">
								Only head admins can modify site settings.
							</div>
						{/if}

						<div class="pt-4">
							<button
								type="submit"
								disabled={isSubmitting || !data.isHeadAdmin}
								class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded-lg transition"
							>
								{isSubmitting ? 'Saving...' : 'Save Settings'}
							</button>
						</div>
					</div>
				</form>

				<!-- Favicon Upload -->
				<div class="border-t border-zinc-800 pt-8">
					<h3 class="text-lg font-semibold text-white mb-4">Favicon</h3>
					
					{#if data.settings.faviconPath}
						<div class="flex items-center gap-4 mb-4">
							<img 
								src={data.settings.faviconPath} 
								alt="Current favicon" 
								class="w-12 h-12 rounded border border-zinc-700"
							/>
							<p class="text-sm text-gray-400">Current favicon</p>
						</div>
					{/if}

					{#if !data.isR2Available}
						<div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-400 text-sm">
							File storage (R2) is not configured. Favicon upload is disabled.
						</div>
					{:else}
						<form 
							method="POST" 
							action="?/uploadFavicon" 
							enctype="multipart/form-data"
							use:enhance={handleEnhance('favicon')}
						>
							<div class="space-y-4">
								<div>
									<label for="favicon" class="block text-sm font-medium text-gray-300 mb-2">
										Upload New Favicon
									</label>
									<input
										type="file"
										id="favicon"
										name="favicon"
										accept="image/png,image/jpeg,image/gif,image/webp,image/x-icon"
										class="block w-full max-w-md text-sm text-gray-400
											file:mr-4 file:py-2 file:px-4
											file:rounded-lg file:border-0
											file:text-sm file:font-medium
											file:bg-zinc-800 file:text-white
											hover:file:bg-zinc-700
											file:cursor-pointer cursor-pointer"
									/>
									<p class="text-xs text-gray-500 mt-1">PNG, JPG, GIF, or WebP. Max 1MB.</p>
								</div>

								{#if !data.isHeadAdmin}
									<div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-400 text-sm">
										Only head admins can update the favicon.
									</div>
								{/if}

								<button
									type="submit"
									disabled={isSubmitting || !data.isHeadAdmin}
									class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded-lg transition"
								>
									{isSubmitting ? 'Uploading...' : 'Upload Favicon'}
								</button>
							</div>
						</form>
					{/if}
				</div>
			</div>

		{:else if activeTab === 'homepage'}
			<!-- Homepage Content -->
			<form method="POST" action="?/updateHomepageContent" use:enhance={handleEnhance('homepage')}>
				<div class="space-y-6">
					<div>
						<label for="subtitle" class="block text-sm font-medium text-gray-300 mb-2">
							Homepage Subtitle
						</label>
						<input
							type="text"
							id="subtitle"
							name="subtitle"
							bind:value={homepageSubtitle}
							class="w-full max-w-lg bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
							placeholder="The Premier MGE League"
						/>
						<p class="text-xs text-gray-500 mt-1">Displayed below the main title on the homepage</p>
					</div>

					<div>
						<label for="about" class="block text-sm font-medium text-gray-300 mb-2">
							"What is MGE?" Section
						</label>
						<textarea
							id="about"
							name="about"
							bind:value={homepageAbout}
							rows="10"
							class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
							placeholder="## What is MGE?&#10;&#10;Write your content here using Markdown..."
						></textarea>
						<p class="text-xs text-gray-500 mt-1">Supports Markdown formatting</p>
					</div>

					{#if homepageAbout.trim()}
						<div>
							<h4 class="text-sm font-medium text-gray-300 mb-2">Preview</h4>
							<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
								<MarkdownRenderer content={homepageAbout} />
							</div>
						</div>
					{/if}

					<div class="pt-4">
						<button
							type="submit"
							disabled={isSubmitting}
							class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg transition"
						>
							{isSubmitting ? 'Saving...' : 'Save Homepage Content'}
						</button>
					</div>
				</div>
			</form>

		{:else if activeTab === 'rulebook'}
			<!-- Rulebook Editor -->
			<form method="POST" action="?/updateRulebook" use:enhance={handleEnhance('rulebook')}>
				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<div>
							<h3 class="text-lg font-semibold text-white">Rulebook Editor</h3>
							<p class="text-sm text-gray-400">Edit the official rulebook using Markdown</p>
						</div>
						<div class="flex items-center gap-3">
							<a
								href="/rulebook"
								target="_blank"
								class="text-sm text-blue-400 hover:text-blue-300"
							>
								View live →
							</a>
							<button
								type="button"
								onclick={() => (showPreview = !showPreview)}
								class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition"
							>
								{showPreview ? 'Hide Preview' : 'Show Preview'}
							</button>
						</div>
					</div>

					<div class="grid grid-cols-1 {showPreview ? 'lg:grid-cols-2' : ''} gap-4">
						<!-- Editor -->
						<div>
							<textarea
								name="content"
								bind:value={rulebookContent}
								rows="30"
								class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y"
								placeholder="# Rulebook&#10;&#10;## Section 1&#10;..."
							></textarea>
						</div>

						<!-- Preview -->
						{#if showPreview}
							<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6 overflow-y-auto max-h-[700px]">
								<MarkdownRenderer content={rulebookContent} />
							</div>
						{/if}
					</div>

					<div class="pt-4 flex items-center gap-4">
						<button
							type="submit"
							disabled={isSubmitting}
							class="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium px-6 py-2 rounded-lg transition"
						>
							{isSubmitting ? 'Saving...' : 'Save Rulebook'}
						</button>
						<span class="text-sm text-gray-500">
							Changes are published immediately
						</span>
					</div>
				</div>
			</form>
		{/if}
	</div>
</div>

