<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import { toast } from '$lib/state/toast.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let lastFormResult: ActionData = null;
  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error) {
        toast.error(form.error);
      }
    }
  });

  let editingAnnouncement: (typeof data.announcements)[0] | null = $state(null);
  let deletingAnnouncement: (typeof data.announcements)[0] | null = $state(null);
  let isSubmitting = $state(false);
  let standingsStatuses = $state<string[]>([]);
  $effect(() => {
    standingsStatuses = [...(data.globalSettings?.standingsVisibleStatuses ?? [])];
  });
  let showSeasonAssignmentWarning = $state(false);
  let seasonAssignmentForm: HTMLFormElement | null = $state(null);
  function getRegionsWithSeasonsForFormat(formatId: number) {
    return data.regions.filter((region: { name: string }) => {
      const regionSeasons = data.seasonsByRegion[region.name] || [];
      return regionSeasons.some((s: { formatId: number }) => s.formatId === formatId);
    });
  }

  function getFirstAvailableFormatId(): number {
    const formatWithSeasons = data.formats.find(
      (format: { id: number }) => getRegionsWithSeasonsForFormat(format.id).length > 0,
    );
    return formatWithSeasons?.id || data.formats[0]?.id || 2;
  }

  let selectedFormatId = $state(getFirstAvailableFormatId());

  function getSeasonsForRegionAndFormat(regionName: string, formatId: number) {
    const regionSeasons = data.seasonsByRegion[regionName] || [];
    return regionSeasons.filter((s: { formatId: number }) => s.formatId === formatId);
  }

  function hasAnyRegionsWithSeasons() {
    return data.formats.some(
      (format: { id: number }) => getRegionsWithSeasonsForFormat(format.id).length > 0,
    );
  }

  function toggleEditForm(announcement: (typeof data.announcements)[0]) {
    if (editingAnnouncement?.id === announcement.id) {
      editingAnnouncement = null;
    } else {
      editingAnnouncement = announcement;
    }
  }
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <!-- Page Header -->
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">Global Configuration</h2>
    <p class="text-text-body">Manage site-wide settings and announcements</p>
  </div>

  <!-- Section 1: Global Announcements -->
  <Card padding="none" class="p-6 space-y-6">
    <div class="border-b border-border-default pb-4">
      <h3 class="text-2xl font-bold text-white mb-2">Global Announcements</h3>
      <p class="text-text-body">Manage homepage announcement banners</p>
    </div>

    <!-- Create Announcement Form -->
    <div class="bg-surface-input/50 border border-border-input rounded-lg p-4">
      <form
        method="POST"
        action="?/createAnnouncement"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update }) => {
            await update();
            isSubmitting = false;
          };
        }}
        class="space-y-4"
      >
        <div>
          <label for="content" class="block text-sm font-medium text-text-label mb-2">
            New Announcement
          </label>
          <textarea
            id="content"
            name="content"
            rows="3"
            maxlength="500"
            required
            class="w-full px-3 py-2 bg-surface-card border border-border-input rounded-md text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Enter announcement text (max 500 characters)..."
          ></textarea>
        </div>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Announcement'}
        </Button>
      </form>
    </div>

    <!-- Announcements List -->
    <div class="space-y-3 border-t border-border-default pt-6">
      {#if data.announcements.length === 0}
        <div class="text-center py-12 text-text-muted">
          <p class="text-lg mb-2">No announcements yet</p>
          <p class="text-sm">Create your first announcement above</p>
        </div>
      {:else}
        {#each data.announcements as announcement}
          <div class="bg-surface-input/50 border border-border-input rounded-lg p-4">
            <div class="flex flex-col space-y-3">
              <!-- Announcement Content -->
              <div class="flex items-start justify-between gap-4">
                <p class="text-white flex-1">{announcement.content}</p>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <!-- Toggle Visibility -->
                  <form
                    method="POST"
                    action="?/toggleVisibility"
                    use:enhance={() => {
                      isSubmitting = true;
                      return async ({ update }) => {
                        await update();
                        isSubmitting = false;
                      };
                    }}
                    class="inline"
                  >
                    <input type="hidden" name="id" value={announcement.id} />
                    <input
                      type="hidden"
                      name="visible"
                      value={announcement.visible === 1 ? '0' : '1'}
                    />
                    <Button
                      type="submit"
                      variant={announcement.visible === 1 ? 'success' : 'secondary'}
                      size="sm"
                      disabled={isSubmitting}
                    >
                      {announcement.visible === 1 ? 'Hide' : 'Show'}
                    </Button>
                  </form>

                  <!-- Edit Button -->
                  <Button
                    variant="secondary"
                    size="sm"
                    onclick={() => toggleEditForm(announcement)}
                  >
                    Edit
                  </Button>

                  <!-- Delete Button -->
                  {#if data.isStrictAdmin}
                    <Button
                      variant="danger"
                      size="sm"
                      onclick={() => (deletingAnnouncement = announcement)}
                    >
                      Delete
                    </Button>
                  {/if}
                </div>
              </div>

              <!-- Edit Form (Hidden by default) -->
              {#if editingAnnouncement?.id === announcement.id}
                <form
                  method="POST"
                  action="?/editAnnouncement"
                  use:enhance={() => {
                    isSubmitting = true;
                    return async ({ update }) => {
                      await update();
                      isSubmitting = false;
                      editingAnnouncement = null;
                    };
                  }}
                  class="space-y-3 pt-3 border-t border-border-input"
                >
                  <input type="hidden" name="id" value={announcement.id} />
                  <textarea
                    name="content"
                    rows="3"
                    maxlength="500"
                    required
                    class="w-full px-3 py-2 bg-surface-card border border-border-input rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    value={announcement.content}
                  ></textarea>
                  <div class="flex gap-2">
                    <Button type="submit" variant="primary" size="sm" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onclick={() => (editingAnnouncement = null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </Card>

  <!-- Section 2: Global Settings -->
  <Card padding="none" class="p-6 space-y-6">
    <div class="border-b border-border-default pb-4">
      <h3 class="text-2xl font-bold text-white mb-2">Global Settings</h3>
      <p class="text-text-body">Settings that apply across all seasons</p>
    </div>

    {#if data.globalSettings}
      <!-- League Fees -->
      <div class="bg-surface-input/50 border border-border-input rounded-lg p-4 max-w-md">
        <h4 class="text-lg font-bold text-white mb-3">
          League Fees:
          <span class="text-white">${data.globalSettings.leagueFees ?? 0}</span>
        </h4>
        <p class="text-sm text-text-body mb-4">Default registration fee amount</p>
        {#if data.isStrictAdmin}
          <form
            method="POST"
            action="?/updateFees"
            use:enhance={() => {
              isSubmitting = true;
              return async ({ update }) => {
                await update();
                isSubmitting = false;
              };
            }}
            class="flex gap-2"
          >
            <input
              type="number"
              name="fees"
              min="0"
              step="1"
              value={data.globalSettings.leagueFees ?? 0}
              required
              class="flex-1 px-3 py-2 bg-surface-card border border-border-input rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update'}
            </Button>
          </form>
        {/if}
      </div>

      <!-- Season Assignments and Per-Season Settings -->
      {#if data.isStrictAdmin}
        <div class="bg-surface-input/50 border border-border-input rounded-lg p-6 mt-6">
          <h4 class="text-xl font-bold text-white mb-4">Signup Season Assignments</h4>
          <p class="text-sm text-text-body mb-4">
            Assign which season new teams will be registered to for each region
          </p>
          <div class="bg-warning-500/10 border border-warning-500/30 rounded-lg p-3 mb-6">
            <p class="text-warning-400 text-sm">
              <strong>⚠️ Warning:</strong> Changing season assignments affects which season new signups
              go to. This effectively "ends" signups for the previous season in that region/format.
            </p>
          </div>

          {#if !hasAnyRegionsWithSeasons()}
            <div class="text-center py-8 text-text-body">
              <p>No regions have seasons created yet.</p>
              <p class="text-sm mt-1">Create seasons in the League admin panel first.</p>
            </div>
          {:else}
            <!-- Format Tabs - only show formats that have regions with seasons -->
            <div class="flex border-b border-border-input mb-6">
              {#each data.formats as format}
                {@const regionsForFormat = getRegionsWithSeasonsForFormat(format.id)}
                {#if regionsForFormat.length > 0}
                  <button
                    type="button"
                    onclick={() => (selectedFormatId = format.id)}
                    class="px-6 py-3 font-medium transition-colors relative {selectedFormatId ===
                    format.id
                      ? 'text-primary-400 border-b-2 border-orange-400 -mb-px'
                      : 'text-text-body hover:text-white'}"
                  >
                    {format.code}
                    <span class="ml-1 text-xs text-text-muted">({regionsForFormat.length})</span>
                  </button>
                {/if}
              {/each}
            </div>

            <form
              method="POST"
              action="?/updateSeasonAssignments"
              bind:this={seasonAssignmentForm}
              use:enhance={() => {
                isSubmitting = true;
                return async ({ update }) => {
                  await update();
                  isSubmitting = false;
                  showSeasonAssignmentWarning = false;
                };
              }}
              class="space-y-4"
            >
              <!-- Hidden inputs for non-visible format tabs (to preserve their values) -->
              {#each data.formats as format}
                {#if format.id !== selectedFormatId}
                  {#each getRegionsWithSeasonsForFormat(format.id) as region}
                    {@const fieldName = `season_${region.id}_${format.id}`}
                    {@const currentSeasonId = data.activeSeasonMap[`${region.id}-${format.id}`]}
                    <input type="hidden" name={fieldName} value={currentSeasonId || ''} />
                  {/each}
                {/if}
              {/each}

              <!-- Regions list for selected format -->
              {#if getRegionsWithSeasonsForFormat(selectedFormatId).length === 0}
                <div class="text-center py-8 text-text-body">
                  <p>No seasons created for this format yet.</p>
                </div>
              {:else}
                <div class="space-y-4">
                  {#each getRegionsWithSeasonsForFormat(selectedFormatId) as region}
                    {@const fieldName = `season_${region.id}_${selectedFormatId}`}
                    {@const currentSeasonId =
                      data.activeSeasonMap[`${region.id}-${selectedFormatId}`]}
                    {@const regionSeasons = getSeasonsForRegionAndFormat(
                      region.name,
                      selectedFormatId,
                    )}
                    {@const seasonSettings = currentSeasonId
                      ? data.seasonSettingsMap[currentSeasonId]
                      : null}

                    <div class="bg-surface-card/50 rounded-lg p-4 space-y-3">
                      <!-- Region Header with Season Select -->
                      <div class="flex items-center gap-4">
                        <div class="w-24 text-white font-medium">{region.name}</div>
                        <div class="flex-1">
                          <select
                            id={fieldName}
                            name={fieldName}
                            class="w-full px-3 py-2 bg-surface-card border border-border-input rounded-md text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="">No Season Selected</option>
                            {#each regionSeasons as season}
                              <option value={season.id} selected={currentSeasonId === season.id}>
                                Season {season.seasonNum} ({season._count.teams} teams, {season
                                  ._count.matches} matches)
                              </option>
                            {/each}
                          </select>
                        </div>
                        {#if currentSeasonId}
                          <div class="text-success-400 text-sm">Active</div>
                        {:else}
                          <div class="text-text-muted text-sm">Inactive</div>
                        {/if}
                      </div>

                      <!-- Per-Season Settings (only show if a season is selected) -->
                      {#if currentSeasonId && seasonSettings}
                        <div
                          class="flex flex-wrap items-center gap-3 pt-3 border-t border-border-default"
                        >
                          <!-- Signups Toggle -->
                          <Button
                            type="submit"
                            formaction="?/toggleSeasonSignups"
                            formmethod="POST"
                            name="seasonId"
                            value={currentSeasonId}
                            variant={seasonSettings.signupsOpen ? 'success' : 'danger'}
                            size="sm"
                            disabled={isSubmitting}
                          >
                            Signups: {seasonSettings.signupsOpen ? 'OPEN' : 'CLOSED'}
                          </Button>

                          <!-- Roster Lock Toggle -->
                          <Button
                            type="submit"
                            formaction="?/toggleSeasonRoster"
                            formmethod="POST"
                            name="seasonId"
                            value={currentSeasonId}
                            variant={seasonSettings.rosterLocked ? 'danger' : 'success'}
                            size="sm"
                            disabled={isSubmitting}
                          >
                            Rosters: {seasonSettings.rosterLocked ? 'LOCKED' : 'OPEN'}
                          </Button>

                          <!-- Payment Toggle -->
                          <Button
                            type="submit"
                            formaction="?/toggleSeasonPayment"
                            formmethod="POST"
                            name="seasonId"
                            value={currentSeasonId}
                            variant={seasonSettings.paymentRequired ? 'warning' : 'secondary'}
                            size="sm"
                            disabled={isSubmitting}
                          >
                            Payment: {seasonSettings.paymentRequired ? 'REQUIRED' : 'NOT REQ'}
                          </Button>

                          <!-- Match Week Info -->
                          {#if seasonSettings.matchWeek}
                            <span class="text-xs text-text-muted"
                              >Week {seasonSettings.matchWeek}</span
                            >
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}

              <div class="pt-4 border-t border-border-input">
                <Button
                  type="button"
                  variant="primary"
                  onclick={() => (showSeasonAssignmentWarning = true)}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Updating...' : 'Update Season Assignments'}
                </Button>
              </div>
            </form>
          {/if}
        </div>

        <!-- Season Assignment Confirmation Modal -->
        <ConfirmDialog
          open={showSeasonAssignmentWarning}
          title="Confirm Season Assignment Update"
          description="Are you sure you want to update the season assignments?"
          confirmLabel="Yes, Update Assignments"
          variant="warning"
          onConfirm={() => seasonAssignmentForm?.requestSubmit()}
          onCancel={() => (showSeasonAssignmentWarning = false)}
        >
          {#snippet preview()}
            <p class="text-warning-400 text-sm">
              This action will change which season new team signups are registered to. Teams that
              haven't completed signup for the previous season will need to re-register for the new
              season.
            </p>
          {/snippet}
        </ConfirmDialog>
      {/if}
    {:else}
      <div class="text-center py-12 text-text-muted">
        <p class="text-text-body">Global settings not initialized</p>
      </div>
    {/if}
  </Card>

  <!-- Section 3: League Standings Visibility -->
  {#if data.isStrictAdmin}
    <Card padding="none" class="p-6 space-y-6">
      <div class="border-b border-border-default pb-4">
        <h3 class="text-2xl font-bold text-white mb-2">League Standings Visibility</h3>
        <p class="text-text-body">
          Choose which team statuses are shown in the public league standings pages
        </p>
      </div>

      <form
        method="POST"
        action="?/updateStandingsStatuses"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update }) => {
            await update({ reset: false });
            isSubmitting = false;
          };
        }}
        class="space-y-4"
      >
        <div class="space-y-3">
          {#each [{ value: 'READY', label: 'Ready', description: 'Team has completed signup and is confirmed', colorClass: 'bg-success-500' }, { value: 'PENDING', label: 'Pending', description: 'Team has submitted signup, awaiting admin approval', colorClass: 'bg-warning-500' }, { value: 'UNREADY', label: 'Unready', description: 'Team has signed up but is not ready yet', colorClass: 'bg-danger-500' }, { value: 'PLACEMENT', label: 'Placement', description: 'Team is in placement matches', colorClass: 'bg-info-500' }, { value: 'DEAD', label: 'Dead / Withdrawn', description: 'Team has disbanded or withdrawn (only shown if they played matches)', colorClass: 'bg-text-muted' }] as statusOption}
            <label class="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                name="status_{statusOption.value}"
                value="1"
                checked={standingsStatuses.includes(statusOption.value)}
                onchange={(e) => {
                  if (e.currentTarget.checked) {
                    standingsStatuses = [...standingsStatuses, statusOption.value];
                  } else {
                    standingsStatuses = standingsStatuses.filter((s) => s !== statusOption.value);
                  }
                }}
                class="mt-0.5 w-4 h-4 rounded border-border-input bg-surface-input text-primary-600 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
              />
              <div class="flex items-center gap-2 flex-1">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 {statusOption.colorClass}"
                ></span>
                <div>
                  <span
                    class="text-sm font-medium text-text-label group-hover:text-white transition-colors"
                    >{statusOption.label}</span
                  >
                  <p class="text-xs text-text-muted">{statusOption.description}</p>
                </div>
              </div>
            </label>
          {/each}
        </div>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Visibility Settings'}
        </Button>
      </form>
    </Card>
  {/if}

  <!-- Section 4: Steam Bot Settings -->
  {#if data.isStrictAdmin}
    <Card padding="none" class="p-6 space-y-6">
      <div class="border-b border-border-default pb-4">
        <h3 class="text-2xl font-bold text-white mb-2">Steam Bot Settings</h3>
        <p class="text-text-body">Configure the Steam trading bot for item payments</p>
      </div>

      <form
        method="POST"
        action="?/updateBotSettings"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update }) => {
            await update();
            isSubmitting = false;
          };
        }}
        class="space-y-4 max-w-lg"
      >
        <FormInput
          label="Bot Trade Offer URL"
          name="botTradeOfferUrl"
          type="text"
          value={data.globalSettings?.botTradeOfferUrl ?? ''}
          placeholder="https://steamcommunity.com/tradeoffer/new/?partner=...&token=..."
        />
        <FormInput
          label="Bot Steam ID (SteamID64)"
          name="botSteamId"
          type="text"
          value={data.globalSettings?.botSteamId ?? ''}
          placeholder="76561198012345678"
          hint="Used to display the bot's name and avatar on the checkout page"
        />
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Updating...' : 'Update Bot Settings'}
        </Button>
      </form>
    </Card>

    <!-- Section 4: Steam Items Catalog -->
    <Card padding="none" class="p-6 space-y-6">
      <div class="border-b border-border-default pb-4">
        <h3 class="text-2xl font-bold text-white mb-2">Steam Items Catalog</h3>
        <p class="text-text-body">Manage accepted Steam items for division payments</p>
      </div>

      <!-- Add Item Form -->
      <div class="bg-surface-input/50 border border-border-input rounded-lg p-4">
        <h4 class="text-sm font-semibold text-text-label mb-3">Add New Item</h4>
        <form
          method="POST"
          action="?/createSteamItem"
          use:enhance={() => {
            isSubmitting = true;
            return async ({ update }) => {
              await update();
              isSubmitting = false;
            };
          }}
          class="grid grid-cols-1 md:grid-cols-4 gap-3"
        >
          <input
            name="name"
            type="text"
            required
            placeholder="Item Name"
            class="px-3 py-2 bg-surface-card border border-border-input rounded-md text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            name="appId"
            type="number"
            required
            min="1"
            placeholder="App ID (e.g. 440)"
            class="px-3 py-2 bg-surface-card border border-border-input rounded-md text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <input
            name="marketHashName"
            type="text"
            required
            placeholder="Market Hash Name"
            class="px-3 py-2 bg-surface-card border border-border-input rounded-md text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <Button type="submit" variant="primary" disabled={isSubmitting}>Add</Button>
        </form>
      </div>

      <!-- Items List -->
      {#if data.steamItems.length === 0}
        <div class="text-center py-8 text-text-muted border-t border-border-default">
          <p>No Steam items configured</p>
          <p class="text-sm mt-1">Add items above to enable item payments for divisions</p>
        </div>
      {:else}
        <div class="space-y-2 border-t border-border-default pt-6">
          {#each data.steamItems as item}
            <div
              class="flex items-center justify-between bg-surface-input/50 border border-border-input rounded-lg p-3"
            >
              <div class="flex items-center gap-3">
                {#if item.iconUrl}
                  <img src={item.iconUrl} alt={item.name} class="w-8 h-8 rounded" />
                {:else}
                  <div
                    class="w-8 h-8 rounded bg-surface-hover flex items-center justify-center text-xs text-text-body"
                  >
                    {item.appId}
                  </div>
                {/if}
                <div>
                  <p class="text-white text-sm font-medium">{item.name}</p>
                  <p class="text-text-muted text-xs">{item.marketHashName} (App {item.appId})</p>
                </div>
              </div>
              <form
                method="POST"
                action="?/deleteSteamItem"
                use:enhance={() => {
                  isSubmitting = true;
                  return async ({ update }) => {
                    await update();
                    isSubmitting = false;
                  };
                }}
              >
                <input type="hidden" name="id" value={item.id} />
                <Button type="submit" variant="danger" size="sm" disabled={isSubmitting}>
                  Delete
                </Button>
              </form>
            </div>
          {/each}
        </div>
      {/if}
    </Card>
  {/if}
</div>

<!-- Delete Confirmation Modal -->
<Dialog
  open={!!deletingAnnouncement}
  title="Delete Announcement"
  onClose={() => (deletingAnnouncement = null)}
>
  <p class="text-text-body mb-4">
    Are you sure you want to delete this announcement? This action cannot be undone.
  </p>

  {#if deletingAnnouncement}
    <div class="bg-surface-input border border-border-input rounded-lg p-4 mb-4">
      <p class="text-text-label text-sm">{deletingAnnouncement.content}</p>
    </div>
  {/if}

  {#snippet footer()}
    <Button
      type="button"
      variant="secondary"
      onclick={() => (deletingAnnouncement = null)}
      class="flex-1"
    >
      Cancel
    </Button>
    {#if deletingAnnouncement}
      <form
        method="POST"
        action="?/deleteAnnouncement"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update }) => {
            await update();
            isSubmitting = false;
            deletingAnnouncement = null;
          };
        }}
        class="flex-1"
      >
        <input type="hidden" name="id" value={deletingAnnouncement.id} />
        <Button type="submit" variant="danger" disabled={isSubmitting} class="w-full">
          {isSubmitting ? 'Deleting...' : 'Delete'}
        </Button>
      </form>
    {/if}
  {/snippet}
</Dialog>
