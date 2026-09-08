<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import FilterBar from '$lib/components/ui/FilterBar.svelte';
  import SearchInput from '$lib/components/ui/SearchInput.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import StaffAssignmentFields from '$lib/components/admin/StaffAssignmentFields.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import DiscordIcon from '$lib/components/icons/DiscordIcon.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import { getFormatThemeClasses } from '$lib/constants/formats';
  import { getRegionFlagCode } from '$lib/utils/region';
  import { groupStaffRosterByRegion, staffListChips } from '$lib/utils/staffDisplay';
  import type { StaffAssignmentDisplay, StaffSyncStatusDisplay } from '$lib/types/staff';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  type RosterRow = PageData['roster'][number];

  type DesignateTarget = {
    steamId: string;
    steamUsername: string;
    steamAvatar: string | null;
    permissionLevel: string;
    discordUsername: string | null;
    staffAssignments: StaffAssignmentDisplay[];
  };

  let searchInput = $state('');
  let designating: DesignateTarget | null = $state(null);
  let designatePermission = $state('MODERATOR');
  let selectedStaffAssignments: { formatId: number; divisionId: number }[] = $state([]);
  let demoting: DesignateTarget | null = $state(null);
  let isSubmitting = $state(false);
  let lastFormResult: ActionData = null;

  $effect(() => {
    searchInput = data.search;
  });

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error && !designating && !demoting) {
        toast.error(form.error);
      }
    }
  });

  const rosterGroups = $derived(groupStaffRosterByRegion(data.roster, data.regions));

  const columns: Column[] = [
    { key: 'user', label: 'Staff' },
    { key: 'discord', label: 'Discord' },
    { key: 'role', label: 'Role' },
    { key: 'sync', label: 'Sync' },
    { key: 'actions', label: 'Actions', align: 'right' },
  ];

  const permissionNames: Record<string, string> = {
    GUEST: 'Guest',
    MODERATOR: 'Moderator',
    ADMIN: 'Admin',
  };

  function formatTheme(formatId: number) {
    const themeKey = data.formats.find((format) => format.id === formatId)?.themeKey;
    return getFormatThemeClasses(themeKey);
  }

  function permissionBadge(permission: string): 'purple' | 'blue' | 'zinc' {
    if (permission === 'ADMIN') return 'purple';
    if (permission === 'MODERATOR') return 'blue';
    return 'zinc';
  }

  function syncBadge(status: StaffSyncStatusDisplay): 'green' | 'yellow' | 'red' | 'zinc' {
    if (status === 'OK') return 'green';
    if (status === 'PENDING') return 'yellow';
    if (status === 'ERROR') return 'red';
    return 'zinc';
  }

  function needsRetry(row: RosterRow): boolean {
    return (
      row.sourcebansStatus === 'ERROR' ||
      row.sourcebansStatus === 'PENDING' ||
      row.discordStatus === 'ERROR' ||
      row.discordStatus === 'PENDING'
    );
  }

  function handleSearch() {
    const params = new URLSearchParams();
    if (searchInput.trim()) params.set('q', searchInput.trim());
    goto(`/admin/staff${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function openDesignate(user: DesignateTarget) {
    designating = user;
    designatePermission =
      user.permissionLevel === 'ADMIN' || user.permissionLevel === 'MODERATOR'
        ? user.permissionLevel
        : 'MODERATOR';
    selectedStaffAssignments = user.staffAssignments.map((assignment) => ({
      formatId: assignment.formatId,
      divisionId: assignment.divisionId,
    }));
  }

  function closeDesignate() {
    designating = null;
    selectedStaffAssignments = [];
  }
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
      <h2 class="text-3xl font-bold text-white mb-2">Staff</h2>
      <p class="text-text-body">
        Designate site roles, league scope, in-game admin, and Discord roles from one place.
      </p>
    </div>
    <Button variant="secondary" href="/admin/staff/settings">Mappings</Button>
  </div>

  <FilterBar
    onSubmit={handleSearch}
    onClear={() => goto('/admin/staff')}
    hasActiveFilters={!!data.search}
  >
    {#snippet filters()}
      <div class="flex-1">
        <div class="block text-sm font-medium text-text-body mb-2">Find a user</div>
        <SearchInput bind:value={searchInput} placeholder="Search by username or Steam ID..." />
      </div>
    {/snippet}
  </FilterBar>

  {#if data.search}
    <Card>
      {#snippet header()}
        <h3 class="text-lg font-semibold text-white">Search results</h3>
      {/snippet}
      {#if data.searchResults.length === 0}
        <p class="text-text-muted text-sm">No users matched “{data.search}”.</p>
      {:else}
        <ul class="divide-y divide-border-default">
          {#each data.searchResults as user (user.steamId)}
            <li class="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
              <div class="flex items-center gap-2 min-w-0">
                {#if user.steamAvatar}
                  <img src={user.steamAvatar} alt="" class="w-6 h-6 rounded" />
                {/if}
                <div class="min-w-0">
                  <p class="text-white text-sm font-medium truncate">{user.steamUsername}</p>
                  <p class="text-xs text-text-muted font-mono truncate">{user.steamId}</p>
                </div>
                <Badge color={permissionBadge(user.permissionLevel)}>
                  {permissionNames[user.permissionLevel] ?? user.permissionLevel}
                </Badge>
              </div>
              <Button variant="primary" size="sm" onclick={() => openDesignate(user)}>
                {user.isStaff ? 'Edit' : 'Designate'}
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  {/if}

  {#each rosterGroups as group (group.regionId ?? 'none')}
    {@const flagCode = group.regionId ? getRegionFlagCode(group.regionName) : ''}
    <section class="space-y-2">
      <div class="flex items-center gap-2 px-1">
        {#if flagCode}
          <FlagIcon code={flagCode} class="w-5 h-3.5 rounded-sm" />
        {/if}
        <h3 class="text-sm font-semibold text-white">{group.regionName}</h3>
        <span class="text-xs text-text-muted">{group.members.length}</span>
      </div>
      <DataTable data={group.members} {columns} compact>
        {#snippet cell(row, col)}
          {#if col.key === 'user'}
            {@const chips = staffListChips(row.staffAssignments, {
              regionId: group.regionId ?? undefined,
            })}
            <div class="flex items-center gap-2 min-w-0">
              {#if row.steamAvatar}
                <img src={row.steamAvatar} alt="" class="w-6 h-6 rounded shrink-0" />
              {:else}
                <div
                  class="w-6 h-6 bg-surface-hover rounded flex items-center justify-center text-[10px] font-bold text-text-body shrink-0"
                >
                  {row.steamUsername.slice(0, 2).toUpperCase()}
                </div>
              {/if}
              <a
                href="/users/{row.steamId}"
                class="text-white text-sm font-medium hover:text-primary-400 truncate"
              >
                {row.steamUsername}
              </a>
              {#each chips as chip (chip.formatId)}
                {@const theme = formatTheme(chip.formatId)}
                <span
                  class="inline-flex items-center gap-1 rounded-md border bg-surface-input px-1.5 py-0 text-[11px] leading-4 {theme.border500_30} shrink-0"
                  title={chip.title}
                >
                  <span class="font-medium {theme.text400}">{chip.formatName}</span>
                  <span class="text-text-muted">{chip.coverage}</span>
                </span>
              {/each}
            </div>
          {:else if col.key === 'discord'}
            {#if row.discordId}
              <span
                class="inline-flex items-center gap-1.5 text-sm text-text-label min-w-0"
                title={row.discordUsername ?? row.discordId}
              >
                <DiscordIcon size={14} class="shrink-0" />
                <span class="truncate">{row.discordUsername ?? 'Linked'}</span>
              </span>
            {:else}
              <Badge color="yellow">Not linked</Badge>
            {/if}
          {:else if col.key === 'role'}
            <Badge color={permissionBadge(row.permissionLevel)}>
              {permissionNames[row.permissionLevel]}
            </Badge>
          {:else if col.key === 'sync'}
            <div class="flex items-center gap-1">
              <Badge
                color={syncBadge(row.sourcebansStatus)}
                tooltip={row.sourcebansError ?? undefined}
              >
                SB {row.sourcebansStatus.toLowerCase()}
              </Badge>
              <Badge color={syncBadge(row.discordStatus)} tooltip={row.discordError ?? undefined}>
                DC {row.discordStatus.toLowerCase()}
              </Badge>
            </div>
          {:else if col.key === 'actions'}
            <div class="flex justify-end gap-1">
              {#if needsRetry(row)}
                <form
                  method="POST"
                  action="?/retry"
                  use:enhance={() => {
                    isSubmitting = true;
                    return async ({ update }) => {
                      await update();
                      isSubmitting = false;
                    };
                  }}
                >
                  <input type="hidden" name="steamId" value={row.steamId} />
                  <Button type="submit" variant="ghost" size="sm" disabled={isSubmitting}
                    >Retry</Button
                  >
                </form>
              {/if}
              <Button variant="secondary" size="sm" onclick={() => openDesignate(row)}>Edit</Button>
              {#if row.steamId !== data.currentSteamId}
                <Button variant="danger" size="sm" onclick={() => (demoting = row)}>Demote</Button>
              {/if}
            </div>
          {/if}
        {/snippet}
      </DataTable>
    </section>
  {:else}
    <Card>
      <p class="text-text-body text-center py-8">No staff designated yet</p>
    </Card>
  {/each}
</div>

{#if designating}
  <Dialog open={true} title="Designate staff" maxWidth="2xl" onClose={closeDesignate}>
    <FormError error={form?.error} />

    <div class="mb-6 flex items-center gap-3 p-3 bg-surface-input rounded-lg">
      {#if designating.steamAvatar}
        <img src={designating.steamAvatar} alt="" class="w-10 h-10 rounded" />
      {/if}
      <div>
        <p class="text-white font-medium">{designating.steamUsername}</p>
        <p class="text-sm text-text-body font-mono">{designating.steamId}</p>
      </div>
    </div>

    <form
      method="POST"
      action="?/designate"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') closeDesignate();
        };
      }}
    >
      <input type="hidden" name="steamId" value={designating.steamId} />
      {#each selectedStaffAssignments as assignment (`${assignment.formatId}:${assignment.divisionId}`)}
        <input
          type="hidden"
          name="staffAssignments"
          value="{assignment.formatId}:{assignment.divisionId}"
        />
      {/each}

      <FormSelect
        label="Site role"
        name="permissionLevel"
        bind:value={designatePermission}
        options={[
          { value: 'MODERATOR', label: 'Moderator' },
          { value: 'ADMIN', label: 'Admin' },
        ]}
      />

      <div class="mb-6">
        <StaffAssignmentFields
          bind:assignments={selectedStaffAssignments}
          formats={data.formats}
          regions={data.regions}
          divisions={data.divisions}
          regionIdsByFormat={data.regionIdsByFormat}
        />
      </div>

      <div class="flex gap-3 justify-end">
        <Button type="button" variant="secondary" onclick={closeDesignate}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save staff'}
        </Button>
      </div>
    </form>
  </Dialog>
{/if}

<ConfirmDialog
  open={!!demoting}
  title="Demote staff"
  description={demoting
    ? `Remove ${demoting.steamUsername} from site staff, deactivate their SourceBans admin, and strip mapped Discord roles?`
    : ''}
  confirmLabel="Demote"
  variant="danger"
  isLoading={isSubmitting}
  onCancel={() => (demoting = null)}
  onConfirm={() => {
    if (!demoting) return;
    const formEl = document.getElementById('staff-demote-form');
    if (formEl instanceof HTMLFormElement) formEl.requestSubmit();
  }}
/>

<form
  id="staff-demote-form"
  method="POST"
  action="?/demote"
  class="hidden"
  use:enhance={() => {
    isSubmitting = true;
    return async ({ update, result }) => {
      await update();
      isSubmitting = false;
      if (result.type === 'success') demoting = null;
    };
  }}
>
  <input type="hidden" name="steamId" value={demoting?.steamId ?? ''} />
</form>
