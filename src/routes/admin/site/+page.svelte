<script lang="ts">
  import { enhance } from '$app/forms';
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import type { PageData } from './$types';
  import { toast } from '$lib/state/toast.svelte';

  let { data }: { data: PageData } = $props();

  // Tabs
  type Tab = 'settings' | 'homepage' | 'rulebook' | 'apikeys';
  let activeTab = $state<Tab>('settings');

  // Background image state
  let bgBlur = $state(0);
  let bgBrightness = $state(1);
  let bgOverlay = $state(0.85);
  let bgPreviewUrl = $state<string | null>(null);

  $effect(() => {
    bgBlur = data.settings.backgroundBlur;
  });
  $effect(() => {
    bgBrightness = data.settings.backgroundBrightness;
  });
  $effect(() => {
    bgOverlay = data.settings.backgroundOverlay;
  });

  function onBgFileSelected(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      if (bgPreviewUrl) URL.revokeObjectURL(bgPreviewUrl);
      bgPreviewUrl = URL.createObjectURL(file);
    }
  }

  // Form states
  let isSubmitting = $state(false);

  // Content states
  let siteTitle = $state('');
  let homepageSubtitle = $state('');
  let homepageAbout = $state('');
  let rulebookContent = $state('');

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

      return async ({ result, update }: any) => {
        isSubmitting = false;
        if (result.type === 'success') {
          toast.success(result.data?.message || 'Saved successfully');
        } else if (result.type === 'failure') {
          toast.error(result.data?.error || 'Failed to save');
        }
        await update();
      };
    };
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'settings', label: 'Site Settings' },
    { id: 'homepage', label: 'Homepage Content' },
    { id: 'rulebook', label: 'Rulebook' },
    { id: 'apikeys', label: 'API Keys' },
  ];

  // API Keys state
  let newKeyName = $state('');
  let isCreatingKey = $state(false);
  let createdKey = $state<string | null>(null);
  let copiedKeyId = $state<number | null>(null);

  function copyKey(key: string, id: number) {
    navigator.clipboard.writeText(key);
    copiedKeyId = id;
    setTimeout(() => (copiedKeyId = null), 2000);
  }

  function handleApiKeyEnhance(actionName: string) {
    return () => {
      isSubmitting = true;
      return async ({ result, update }: any) => {
        isSubmitting = false;
        if (result.type === 'success') {
          toast.success(result.data?.message || 'Done');
          if (actionName === 'create' && result.data?.newKey) {
            createdKey = result.data.newKey;
            newKeyName = '';
          }
        } else if (result.type === 'failure') {
          toast.error(result.data?.error || 'Action failed');
        }
        await update();
      };
    };
  }
</script>

<div class="max-w-6xl mx-auto space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-3xl font-bold text-white mb-2">Site Management</h1>
    <p class="text-gray-400">Manage site content and settings</p>
  </div>

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

        <!-- Background Image -->
        <div class="border-t border-zinc-800 pt-8">
          <h3 class="text-lg font-semibold text-white mb-1">Background Image</h3>
          <p class="text-sm text-gray-400 mb-6">
            Upload a site-wide background image and tune its appearance. Changes take effect
            immediately for all visitors.
          </p>

          {#if !data.isR2Available}
            <div
              class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-400 text-sm"
            >
              File storage (R2) is not configured. Background image upload is disabled.
            </div>
          {:else}
            <!-- Live Preview -->
            {#if bgPreviewUrl || data.settings.backgroundImagePath}
              <div class="mb-6">
                <p class="text-sm font-medium text-gray-300 mb-2">Preview</p>
                <div class="relative w-full h-56 rounded-lg overflow-hidden border border-zinc-700">
                  <img
                    src={bgPreviewUrl ?? data.settings.backgroundImagePath ?? ''}
                    alt="Background preview"
                    class="w-full h-full object-cover"
                    style="filter: blur({bgBlur}px) brightness({bgBrightness}); transform: scale(1.05)"
                  />
                  <div
                    class="absolute inset-0"
                    style="background: rgba(9, 9, 11, {bgOverlay})"
                  ></div>
                  <div
                    class="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <p class="text-white text-sm font-medium opacity-60 select-none">
                      Site content appears here
                    </p>
                  </div>
                </div>
              </div>
            {/if}

            <form
              method="POST"
              action="?/updateBackground"
              enctype="multipart/form-data"
              use:enhance={handleEnhance('background')}
            >
              <!-- Hidden inputs for slider values -->
              <input type="hidden" name="blur" value={bgBlur} />
              <input type="hidden" name="brightness" value={bgBrightness} />
              <input type="hidden" name="overlay" value={bgOverlay} />

              <div class="space-y-6">
                <!-- File upload -->
                <div>
                  <label for="backgroundImage" class="block text-sm font-medium text-gray-300 mb-2">
                    {data.settings.backgroundImagePath ? 'Replace Image' : 'Upload Image'}
                  </label>
                  <input
                    type="file"
                    id="backgroundImage"
                    name="backgroundImage"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onchange={onBgFileSelected}
                    class="block w-full max-w-md text-sm text-gray-400
											file:mr-4 file:py-2 file:px-4
											file:rounded-lg file:border-0
											file:text-sm file:font-medium
											file:bg-zinc-800 file:text-white
											hover:file:bg-zinc-700
											file:cursor-pointer cursor-pointer"
                  />
                  <p class="text-xs text-gray-500 mt-1">
                    PNG, JPG, GIF, or WebP. Max 5MB. Leave empty to only update filters.
                  </p>
                </div>

                <!-- Sliders -->
                <div class="grid grid-cols-1 gap-5 max-w-lg">
                  <!-- Blur -->
                  <div>
                    <div class="flex justify-between items-center mb-1">
                      <label for="blurSlider" class="text-sm font-medium text-gray-300"
                        >Gaussian Blur</label
                      >
                      <span class="text-sm text-gray-400 tabular-nums">{bgBlur.toFixed(0)}px</span>
                    </div>
                    <input
                      type="range"
                      id="blurSlider"
                      min="0"
                      max="30"
                      step="1"
                      bind:value={bgBlur}
                      class="w-full accent-blue-500"
                    />
                    <div class="flex justify-between text-xs text-gray-600 mt-0.5">
                      <span>None</span>
                      <span>Max (30px)</span>
                    </div>
                  </div>

                  <!-- Brightness -->
                  <div>
                    <div class="flex justify-between items-center mb-1">
                      <label for="brightnessSlider" class="text-sm font-medium text-gray-300"
                        >Brightness</label
                      >
                      <span class="text-sm text-gray-400 tabular-nums"
                        >{bgBrightness.toFixed(2)}</span
                      >
                    </div>
                    <input
                      type="range"
                      id="brightnessSlider"
                      min="0.1"
                      max="1.5"
                      step="0.05"
                      bind:value={bgBrightness}
                      class="w-full accent-blue-500"
                    />
                    <div class="flex justify-between text-xs text-gray-600 mt-0.5">
                      <span>Dark (0.1)</span>
                      <span>Bright (1.5)</span>
                    </div>
                  </div>

                  <!-- Overlay -->
                  <div>
                    <div class="flex justify-between items-center mb-1">
                      <label for="overlaySlider" class="text-sm font-medium text-gray-300"
                        >Dark Overlay</label
                      >
                      <span class="text-sm text-gray-400 tabular-nums"
                        >{Math.round(bgOverlay * 100)}%</span
                      >
                    </div>
                    <input
                      type="range"
                      id="overlaySlider"
                      min="0"
                      max="1"
                      step="0.05"
                      bind:value={bgOverlay}
                      class="w-full accent-blue-500"
                    />
                    <div class="flex justify-between text-xs text-gray-600 mt-0.5">
                      <span>None</span>
                      <span>Full black</span>
                    </div>
                  </div>
                </div>

                <div class="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !data.isHeadAdmin}
                    class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded-lg transition"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Background'}
                  </button>
                </div>
              </div>
            </form>

            <!-- Remove background (separate form) -->
            {#if data.settings.backgroundImagePath}
              <form
                method="POST"
                action="?/removeBackground"
                class="mt-4"
                use:enhance={() => {
                  isSubmitting = true;
                  return async ({ result, update }) => {
                    isSubmitting = false;
                    bgPreviewUrl = null;
                    if (result.type === 'success') {
                      toast.success((result.data as any)?.message || 'Background removed');
                    } else if (result.type === 'failure') {
                      toast.error((result.data as any)?.error || 'Failed to remove background');
                    }
                    await update();
                  };
                }}
              >
                <button
                  type="submit"
                  disabled={isSubmitting || !data.isHeadAdmin}
                  onclick={(e) => {
                    if (!confirm('Remove the background image and restore the default gradient?')) {
                      e.preventDefault();
                    }
                  }}
                  class="bg-zinc-700 hover:bg-red-900/60 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 hover:text-white font-medium px-4 py-2 rounded-lg transition text-sm"
                >
                  Remove Background
                </button>
              </form>
            {/if}
          {/if}
        </div>

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
            <div
              class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-yellow-400 text-sm"
            >
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
              disabled={!data.isHeadAdmin}
              class="w-full max-w-lg bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
              disabled={!data.isHeadAdmin}
              class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
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
              disabled={isSubmitting || !data.isHeadAdmin}
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded-lg transition"
            >
              {isSubmitting ? 'Saving...' : 'Save Homepage Content'}
            </button>
          </div>
        </div>
      </form>
    {:else if activeTab === 'apikeys'}
      <!-- API Keys -->
      <div class="space-y-8">
        <div>
          <h3 class="text-lg font-semibold text-white mb-1">API Keys</h3>
          <p class="text-sm text-gray-400">
            Service-to-service keys used by external integrations (e.g. the Discord verification
            bot). Keys are stored in plaintext — treat them like passwords.
          </p>
        </div>

        <!-- Newly created key banner -->
        {#if createdKey}
          <div class="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-2">
            <p class="text-green-400 text-sm font-medium">
              API key created. Copy it now — it will not be shown again in a special way, but
              remains viewable in the table below.
            </p>
            <div class="flex items-center gap-3">
              <code
                class="flex-1 bg-zinc-800 text-green-300 text-sm px-3 py-2 rounded-lg font-mono break-all"
                >{createdKey}</code
              >
              <button
                type="button"
                onclick={() => {
                  navigator.clipboard.writeText(createdKey!);
                }}
                class="shrink-0 bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-3 py-2 rounded-lg transition"
              >
                Copy
              </button>
              <button
                type="button"
                onclick={() => (createdKey = null)}
                class="shrink-0 text-gray-500 hover:text-gray-300 text-sm transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        {/if}

        <!-- Create new key form -->
        <form method="POST" action="?/createApiKey" use:enhance={handleApiKeyEnhance('create')}>
          <div class="flex items-end gap-3">
            <div class="flex-1 max-w-sm">
              <label for="apiKeyName" class="block text-sm font-medium text-gray-300 mb-2"
                >New API Key Name</label
              >
              <input
                type="text"
                id="apiKeyName"
                name="name"
                bind:value={newKeyName}
                placeholder="e.g. Discord Verification Bot"
                class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !data.isHeadAdmin || !newKeyName.trim()}
              class="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-5 py-2 rounded-lg transition"
            >
              {isSubmitting ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>

        <!-- Keys table -->
        {#if data.apiKeys.length === 0}
          <div class="text-center py-12 text-gray-500 text-sm">No API keys yet.</div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-400 border-b border-zinc-800">
                  <th class="pb-3 pr-4 font-medium">Name</th>
                  <th class="pb-3 pr-4 font-medium">Key</th>
                  <th class="pb-3 pr-4 font-medium">Status</th>
                  <th class="pb-3 pr-4 font-medium">Created by</th>
                  <th class="pb-3 pr-4 font-medium">Last used</th>
                  <th class="pb-3 pr-4 font-medium">Created</th>
                  <th class="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-800">
                {#each data.apiKeys as apiKey (apiKey.id)}
                  <tr class="text-gray-300">
                    <td class="py-3 pr-4 font-medium text-white">{apiKey.name}</td>
                    <td class="py-3 pr-4">
                      <div class="flex items-center gap-2">
                        <code class="font-mono text-xs text-gray-400 max-w-48 truncate"
                          >{apiKey.key}</code
                        >
                        <button
                          type="button"
                          onclick={() => copyKey(apiKey.key, apiKey.id)}
                          class="shrink-0 text-xs text-gray-500 hover:text-gray-200 transition"
                          title="Copy key"
                        >
                          {copiedKeyId === apiKey.id ? '✓' : 'Copy'}
                        </button>
                      </div>
                    </td>
                    <td class="py-3 pr-4">
                      {#if apiKey.active}
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400"
                          >Active</span
                        >
                      {:else}
                        <span
                          class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-700 text-gray-400"
                          >Inactive</span
                        >
                      {/if}
                    </td>
                    <td class="py-3 pr-4 text-gray-400">{apiKey.creator.steamUsername}</td>
                    <td class="py-3 pr-4 text-gray-400">
                      {apiKey.lastUsedAt
                        ? new Date(apiKey.lastUsedAt).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td class="py-3 pr-4 text-gray-400"
                      >{new Date(apiKey.createdAt).toLocaleDateString()}</td
                    >
                    <td class="py-3">
                      <div class="flex items-center gap-2">
                        <!-- Toggle active/inactive -->
                        <form
                          method="POST"
                          action="?/toggleApiKey"
                          use:enhance={handleApiKeyEnhance('toggle')}
                        >
                          <input type="hidden" name="id" value={apiKey.id} />
                          <input type="hidden" name="active" value={String(!apiKey.active)} />
                          <button
                            type="submit"
                            disabled={isSubmitting || !data.isHeadAdmin}
                            class="text-xs px-3 py-1 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed
														{apiKey.active
                              ? 'bg-zinc-700 hover:bg-zinc-600 text-gray-300'
                              : 'bg-green-600/20 hover:bg-green-600/30 text-green-400'}"
                          >
                            {apiKey.active ? 'Disable' : 'Enable'}
                          </button>
                        </form>
                        <!-- Delete -->
                        <form
                          method="POST"
                          action="?/deleteApiKey"
                          use:enhance={handleApiKeyEnhance('delete')}
                        >
                          <input type="hidden" name="id" value={apiKey.id} />
                          <button
                            type="submit"
                            disabled={isSubmitting || !data.isHeadAdmin}
                            onclick={(e) => {
                              if (
                                !confirm(`Delete API key "${apiKey.name}"? This cannot be undone.`)
                              ) {
                                e.preventDefault();
                              }
                            }}
                            class="text-xs px-3 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
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
              <a href="/rulebook" target="_blank" class="text-sm text-blue-400 hover:text-blue-300">
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
                disabled={!data.isHeadAdmin}
                class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="# Rulebook&#10;&#10;## Section 1&#10;..."
              ></textarea>
            </div>

            <!-- Preview -->
            {#if showPreview}
              <div
                class="bg-zinc-800 border border-zinc-700 rounded-lg p-6 overflow-y-auto max-h-[700px]"
              >
                <MarkdownRenderer content={rulebookContent} />
              </div>
            {/if}
          </div>

          <div class="pt-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={isSubmitting || !data.isHeadAdmin}
              class="bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2 rounded-lg transition"
            >
              {isSubmitting ? 'Saving...' : 'Save Rulebook'}
            </button>
            <span class="text-sm text-gray-500"> Changes are published immediately </span>
          </div>
        </div>
      </form>
    {/if}
  </div>
</div>
