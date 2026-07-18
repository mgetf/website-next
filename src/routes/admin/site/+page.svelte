<script lang="ts">
  import { enhance } from '$app/forms';
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import type { PageData } from './$types';
  import { toast } from '$lib/state/toast.svelte';

  let { data }: { data: PageData } = $props();

  // Tabs
  type Tab = 'settings' | 'homepage' | 'rulebook' | 'match_message' | 'apikeys';
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
  let matchCreatedMessage = $state('');

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
  $effect(() => {
    matchCreatedMessage = data.matchCreatedMessage;
  });

  // Preview toggles
  let showPreview = $state(false);
  let showMatchMessagePreview = $state(false);

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
    { id: 'match_message', label: 'Match Message' },
    { id: 'apikeys', label: 'API Keys' },
  ];

  // API Keys state
  let newKeyName = $state('');
  let isCreatingKey = $state(false);
  let createdKey = $state<string | null>(null);
  let copiedKeyId = $state<number | null>(null);

  // Confirm dialog state
  let showRemoveBgConfirm = $state(false);
  let removeBgFormEl: HTMLFormElement | null = $state(null);
  let deletingApiKey: { id: number; name: string } | null = $state(null);
  let deleteApiKeyFormEl: HTMLFormElement | null = $state(null);

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
    <p class="text-text-body">Manage site content and settings</p>
  </div>

  <!-- Tabs -->
  <div class="border-b border-border-default">
    <nav class="flex gap-4">
      {#each tabs as tab}
        <button
          onclick={() => (activeTab = tab.id)}
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === tab.id
            ? 'border-primary-500 text-primary-400'
            : 'border-transparent text-text-body hover:text-white'}"
        >
          {tab.label}
        </button>
      {/each}
    </nav>
  </div>

  <!-- Tab Content -->
  <Card padding="none" class="p-6">
    {#if activeTab === 'settings'}
      <!-- Site Settings -->
      <div class="space-y-8">
        <!-- Site Title -->
        <form method="POST" action="?/updateSettings" use:enhance={handleEnhance('settings')}>
          <div class="space-y-6">
            <div>
              <label for="siteTitle" class="block text-sm font-medium text-text-label mb-2">
                Site Title
              </label>
              <input
                type="text"
                id="siteTitle"
                name="siteTitle"
                bind:value={siteTitle}
                class="w-full max-w-md bg-surface-input border border-border-input rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                placeholder="MGE.tf"
              />
              <p class="text-xs text-text-muted mt-1">Appears in browser tab and site header</p>
            </div>

            <div class="pt-4">
              <Button type="submit" variant="primary" disabled={isSubmitting || !data.isHeadAdmin}>
                {isSubmitting ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        </form>

        <!-- Background Image -->
        <div class="border-t border-border-default pt-8">
          <h3 class="text-lg font-semibold text-white mb-1">Background Image</h3>
          <p class="text-sm text-text-body mb-6">
            Upload a site-wide background image and tune its appearance. Changes take effect
            immediately for all visitors.
          </p>

          {#if !data.isR2Available}
            <div
              class="bg-warning-500/10 border border-warning-500/30 rounded-lg p-4 text-warning-400 text-sm"
            >
              File storage (R2) is not configured. Background image upload is disabled.
            </div>
          {:else}
            <!-- Live Preview -->
            {#if bgPreviewUrl || data.settings.backgroundImagePath}
              <div class="mb-6">
                <p class="text-sm font-medium text-text-label mb-2">Preview</p>
                <div
                  class="relative w-full h-56 rounded-lg overflow-hidden border border-border-input"
                >
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
                  <label
                    for="backgroundImage"
                    class="block text-sm font-medium text-text-label mb-2"
                  >
                    {data.settings.backgroundImagePath ? 'Replace Image' : 'Upload Image'}
                  </label>
                  <input
                    type="file"
                    id="backgroundImage"
                    name="backgroundImage"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onchange={onBgFileSelected}
                    class="block w-full max-w-md text-sm text-text-body
										file:mr-4 file:py-2 file:px-4
										file:rounded-lg file:border-0
										file:text-sm file:font-medium
										file:bg-surface-input file:text-white
										hover:file:bg-surface-hover
										file:cursor-pointer cursor-pointer"
                  />
                  <p class="text-xs text-text-muted mt-1">
                    PNG, JPG, GIF, or WebP. Max 5MB. Leave empty to only update filters.
                  </p>
                </div>

                <!-- Sliders -->
                <div class="grid grid-cols-1 gap-5 max-w-lg">
                  <!-- Blur -->
                  <div>
                    <div class="flex justify-between items-center mb-1">
                      <label for="blurSlider" class="text-sm font-medium text-text-label"
                        >Gaussian Blur</label
                      >
                      <span class="text-sm text-text-body tabular-nums">{bgBlur.toFixed(0)}px</span>
                    </div>
                    <input
                      type="range"
                      id="blurSlider"
                      min="0"
                      max="30"
                      step="1"
                      bind:value={bgBlur}
                      class="w-full accent-primary-500"
                    />
                    <div class="flex justify-between text-xs text-text-muted mt-0.5">
                      <span>None</span>
                      <span>Max (30px)</span>
                    </div>
                  </div>

                  <!-- Brightness -->
                  <div>
                    <div class="flex justify-between items-center mb-1">
                      <label for="brightnessSlider" class="text-sm font-medium text-text-label"
                        >Brightness</label
                      >
                      <span class="text-sm text-text-body tabular-nums"
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
                      class="w-full accent-primary-500"
                    />
                    <div class="flex justify-between text-xs text-text-muted mt-0.5">
                      <span>Dark (0.1)</span>
                      <span>Bright (1.5)</span>
                    </div>
                  </div>

                  <!-- Overlay -->
                  <div>
                    <div class="flex justify-between items-center mb-1">
                      <label for="overlaySlider" class="text-sm font-medium text-text-label"
                        >Dark Overlay</label
                      >
                      <span class="text-sm text-text-body tabular-nums"
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
                      class="w-full accent-primary-500"
                    />
                    <div class="flex justify-between text-xs text-text-muted mt-0.5">
                      <span>None</span>
                      <span>Full black</span>
                    </div>
                  </div>
                </div>

                <div class="pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmitting || !data.isHeadAdmin}
                  >
                    {isSubmitting ? 'Saving...' : 'Save Background'}
                  </Button>
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
                bind:this={removeBgFormEl}
              >
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting || !data.isHeadAdmin}
                  onclick={() => (showRemoveBgConfirm = true)}
                >
                  Remove Background
                </Button>
              </form>
            {/if}
          {/if}
        </div>

        <!-- Favicon Upload -->
        <div class="border-t border-border-default pt-8">
          <h3 class="text-lg font-semibold text-white mb-4">Favicon</h3>

          {#if data.settings.faviconPath}
            <div class="flex items-center gap-4 mb-4">
              <img
                src={data.settings.faviconPath}
                alt="Current favicon"
                class="w-12 h-12 rounded border border-border-input"
              />
              <p class="text-sm text-text-body">Current favicon</p>
            </div>
          {/if}

          {#if !data.isR2Available}
            <div
              class="bg-warning-500/10 border border-warning-500/30 rounded-lg p-4 text-warning-400 text-sm"
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
                  <label for="favicon" class="block text-sm font-medium text-text-label mb-2">
                    Upload New Favicon
                  </label>
                  <input
                    type="file"
                    id="favicon"
                    name="favicon"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/x-icon"
                    class="block w-full max-w-md text-sm text-text-body
										file:mr-4 file:py-2 file:px-4
										file:rounded-lg file:border-0
										file:text-sm file:font-medium
										file:bg-surface-input file:text-white
										hover:file:bg-surface-hover
										file:cursor-pointer cursor-pointer"
                  />
                  <p class="text-xs text-text-muted mt-1">PNG, JPG, GIF, or WebP. Max 1MB.</p>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting || !data.isHeadAdmin}
                >
                  {isSubmitting ? 'Uploading...' : 'Upload Favicon'}
                </Button>
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
            <label for="subtitle" class="block text-sm font-medium text-text-label mb-2">
              Homepage Subtitle
            </label>
            <input
              type="text"
              id="subtitle"
              name="subtitle"
              bind:value={homepageSubtitle}
              disabled={!data.isHeadAdmin}
              class="w-full max-w-lg bg-surface-input border border-border-input rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="The Premier MGE League"
            />
            <p class="text-xs text-text-muted mt-1">
              Displayed below the main title on the homepage
            </p>
          </div>

          <div>
            <label for="about" class="block text-sm font-medium text-text-label mb-2">
              "What is MGE?" Section
            </label>
            <textarea
              id="about"
              name="about"
              bind:value={homepageAbout}
              rows="10"
              disabled={!data.isHeadAdmin}
              class="w-full bg-surface-input border border-border-input rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="## What is MGE?&#10;&#10;Write your content here using Markdown..."
            ></textarea>
            <p class="text-xs text-text-muted mt-1">Supports Markdown formatting</p>
          </div>

          {#if homepageAbout.trim()}
            <div>
              <h4 class="text-sm font-medium text-text-label mb-2">Preview</h4>
              <div class="bg-surface-input border border-border-input rounded-lg p-4">
                <MarkdownRenderer content={homepageAbout} />
              </div>
            </div>
          {/if}

          <div class="pt-4">
            <Button type="submit" variant="primary" disabled={isSubmitting || !data.isHeadAdmin}>
              {isSubmitting ? 'Saving...' : 'Save Homepage Content'}
            </Button>
          </div>
        </div>
      </form>
    {:else if activeTab === 'apikeys'}
      <!-- API Keys -->
      <div class="space-y-8">
        <div>
          <h3 class="text-lg font-semibold text-white mb-1">API Keys</h3>
          <p class="text-sm text-text-body">
            Service-to-service keys used by external integrations (e.g. the Discord verification
            bot). Keys are stored in plaintext — treat them like passwords.
          </p>
        </div>

        <!-- Newly created key banner -->
        {#if createdKey}
          <div class="bg-success-500/10 border border-success-500/30 rounded-lg p-4 space-y-2">
            <p class="text-success-400 text-sm font-medium">
              API key created. Copy it now — it will not be shown again in a special way, but
              remains viewable in the table below.
            </p>
            <div class="flex items-center gap-3">
              <code
                class="flex-1 bg-surface-input text-success-300 text-sm px-3 py-2 rounded-lg font-mono break-all"
                >{createdKey}</code
              >
              <button
                type="button"
                onclick={() => {
                  navigator.clipboard.writeText(createdKey!);
                }}
                class="shrink-0 bg-surface-hover hover:bg-surface-input text-white text-sm px-3 py-2 rounded-lg transition"
              >
                Copy
              </button>
              <button
                type="button"
                onclick={() => (createdKey = null)}
                class="shrink-0 text-text-muted hover:text-text-label text-sm transition"
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
              <label for="apiKeyName" class="block text-sm font-medium text-text-label mb-2"
                >New API Key Name</label
              >
              <input
                type="text"
                id="apiKeyName"
                name="name"
                bind:value={newKeyName}
                placeholder="e.g. Discord Verification Bot"
                class="w-full bg-surface-input border border-border-input rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !data.isHeadAdmin || !newKeyName.trim()}
            >
              {isSubmitting ? 'Creating...' : 'Create Key'}
            </Button>
          </div>
        </form>

        <!-- Keys table -->
        {#if data.apiKeys.length === 0}
          <div class="text-center py-12 text-text-muted text-sm">No API keys yet.</div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-text-body border-b border-border-default">
                  <th class="pb-3 pr-4 font-medium">Name</th>
                  <th class="pb-3 pr-4 font-medium">Key</th>
                  <th class="pb-3 pr-4 font-medium">Status</th>
                  <th class="pb-3 pr-4 font-medium">Created by</th>
                  <th class="pb-3 pr-4 font-medium">Last used</th>
                  <th class="pb-3 pr-4 font-medium">Created</th>
                  <th class="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-default">
                {#each data.apiKeys as apiKey (apiKey.id)}
                  <tr class="text-text-label">
                    <td class="py-3 pr-4 font-medium text-white">{apiKey.name}</td>
                    <td class="py-3 pr-4">
                      <div class="flex items-center gap-2">
                        <code class="font-mono text-xs text-text-body max-w-48 truncate"
                          >{apiKey.key}</code
                        >
                        <button
                          type="button"
                          onclick={() => copyKey(apiKey.key, apiKey.id)}
                          class="shrink-0 text-xs text-text-muted hover:text-text-label transition"
                          title="Copy key"
                        >
                          {copiedKeyId === apiKey.id ? '✓' : 'Copy'}
                        </button>
                      </div>
                    </td>
                    <td class="py-3 pr-4">
                      {#if apiKey.active}
                        <Badge color="green">Active</Badge>
                      {:else}
                        <Badge color="zinc">Inactive</Badge>
                      {/if}
                    </td>
                    <td class="py-3 pr-4 text-text-body">{apiKey.creator.steamUsername}</td>
                    <td class="py-3 pr-4 text-text-body">
                      {apiKey.lastUsedAt
                        ? new Date(apiKey.lastUsedAt).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td class="py-3 pr-4 text-text-body"
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
                          <Button
                            type="submit"
                            variant={apiKey.active ? 'secondary' : 'success'}
                            size="sm"
                            disabled={isSubmitting || !data.isHeadAdmin}
                          >
                            {apiKey.active ? 'Disable' : 'Enable'}
                          </Button>
                        </form>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={isSubmitting || !data.isHeadAdmin}
                          onclick={() => (deletingApiKey = { id: apiKey.id, name: apiKey.name })}
                        >
                          Delete
                        </Button>
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
              <p class="text-sm text-text-body">Edit the official rulebook using Markdown</p>
            </div>
            <div class="flex items-center gap-3">
              <a
                href="/rulebook"
                target="_blank"
                class="text-sm text-primary-400 hover:text-primary-300"
              >
                View live →
              </a>
              <button
                type="button"
                onclick={() => (showPreview = !showPreview)}
                class="px-4 py-2 bg-surface-input hover:bg-surface-hover text-white text-sm rounded-lg transition"
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
                class="w-full bg-surface-input border border-border-input rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="# Rulebook&#10;&#10;## Section 1&#10;..."></textarea>
            </div>

            <!-- Preview -->
            {#if showPreview}
              <div
                class="bg-surface-input border border-border-input rounded-lg p-6 overflow-y-auto max-h-[700px]"
              >
                <MarkdownRenderer content={rulebookContent} />
              </div>
            {/if}
          </div>

          <div class="pt-4 flex items-center gap-4">
            <Button type="submit" variant="success" disabled={isSubmitting || !data.isHeadAdmin}>
              {isSubmitting ? 'Saving...' : 'Save Rulebook'}
            </Button>
            <span class="text-sm text-text-muted"> Changes are published immediately </span>
          </div>
        </div>
      </form>
    {:else if activeTab === 'match_message'}
      <!-- Match Created Message Editor -->
      <form
        method="POST"
        action="?/updateMatchCreatedMessage"
        use:enhance={handleEnhance('match_message')}
      >
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-white">Match Created Message</h3>
              <p class="text-sm text-text-body">
                This message is posted as a system comment whenever a new match is created. Supports
                Markdown.
              </p>
            </div>
            <button
              type="button"
              onclick={() => (showMatchMessagePreview = !showMatchMessagePreview)}
              class="px-4 py-2 bg-surface-input hover:bg-surface-hover text-white text-sm rounded-lg transition"
            >
              {showMatchMessagePreview ? 'Hide Preview' : 'Show Preview'}
            </button>
          </div>

          <div class="grid grid-cols-1 {showMatchMessagePreview ? 'lg:grid-cols-2' : ''} gap-4">
            <!-- Editor -->
            <div>
              <textarea
                name="content"
                bind:value={matchCreatedMessage}
                rows="20"
                disabled={!data.isHeadAdmin}
                class="w-full bg-surface-input border border-border-input rounded-lg px-4 py-3 text-white font-mono text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="**Match Created!** ..."></textarea>
            </div>

            <!-- Preview -->
            {#if showMatchMessagePreview}
              <div
                class="bg-surface-input border border-border-input rounded-lg p-6 overflow-y-auto max-h-[500px]"
              >
                <MarkdownRenderer content={matchCreatedMessage} />
              </div>
            {/if}
          </div>

          <div class="pt-4 flex items-center gap-4">
            <Button type="submit" variant="success" disabled={isSubmitting || !data.isHeadAdmin}>
              {isSubmitting ? 'Saving...' : 'Save Message'}
            </Button>
            <span class="text-sm text-text-muted"> Applied to all new matches </span>
          </div>
        </div>
      </form>
    {/if}
  </Card>
</div>

<ConfirmDialog
  open={showRemoveBgConfirm}
  title="Remove Background Image"
  description="Remove the background image and restore the default gradient? This cannot be undone."
  confirmLabel="Remove"
  variant="danger"
  onConfirm={() => {
    showRemoveBgConfirm = false;
    removeBgFormEl?.requestSubmit();
  }}
  onCancel={() => (showRemoveBgConfirm = false)}
/>

<form
  method="POST"
  action="?/deleteApiKey"
  use:enhance={handleApiKeyEnhance('delete')}
  bind:this={deleteApiKeyFormEl}
  class="hidden"
>
  <input type="hidden" name="id" value={deletingApiKey?.id ?? ''} />
</form>

<ConfirmDialog
  open={deletingApiKey !== null}
  title="Delete API Key"
  description={`Delete API key "${deletingApiKey?.name ?? ''}"? This cannot be undone.`}
  confirmLabel="Delete"
  variant="danger"
  onConfirm={() => {
    deleteApiKeyFormEl?.requestSubmit();
    deletingApiKey = null;
  }}
  onCancel={() => (deletingApiKey = null)}
/>
