<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import FilterBar from '$lib/components/ui/FilterBar.svelte';
  import SearchInput from '$lib/components/ui/SearchInput.svelte';
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import DiscordIcon from '$lib/components/icons/DiscordIcon.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let editingUser: (typeof data.users)[0] | null = $state(null);
  let banningUser: (typeof data.users)[0] | null = $state(null);
  let unlinkingDiscordUser: (typeof data.users)[0] | null = $state(null);
  let isSubmitting = $state(false);
  let lastFormResult: ActionData = null;
  let selectedStaffDivisionIds: number[] = $state([]);
  let addRegionId: number | null = $state(null);

  const addFilteredDivisions = $derived(
    addRegionId
      ? data.divisions.filter(
          (d: (typeof data.divisions)[0]) =>
            d.regionId === addRegionId && !selectedStaffDivisionIds.includes(d.id),
        )
      : [],
  );

  function selectedDivisionsInfo() {
    return selectedStaffDivisionIds
      .map((id) => data.divisions.find((d) => d.id === id))
      .filter(Boolean) as (typeof data.divisions)[number][];
  }

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error && !editingUser && !banningUser) {
        toast.error(form.error);
      }
    }
  });

  const columns = [
    { key: 'user', label: 'User' },
    { key: 'discord', label: 'Discord' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: 'Actions', align: 'right' as const },
  ];

  const paginationInfo = $derived(
    `Showing ${(data.pagination.page - 1) * data.pagination.pageSize + 1} to ${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalUsers)} of ${data.pagination.totalUsers} users`,
  );

  let searchInput = $state('');

  $effect(() => {
    searchInput = data.filters.search;
  });

  const hasActiveFilters = $derived(
    !!(data.filters.search || data.filters.permissionLevel || data.filters.banStatus),
  );

  function handleSearch() {
    updateFilters({ search: searchInput });
  }

  function clearFilters() {
    searchInput = '';
    goto('/admin/users');
  }

  function updateFilters(updates: Record<string, string>) {
    const params = new URLSearchParams(page.url.searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    if (!updates.page) {
      params.delete('page');
    }

    goto(`?${params.toString()}`, { keepFocus: true, replaceState: true });
  }

  const permissionNames: Record<string, string> = {
    GUEST: 'Guest',
    MODERATOR: 'Moderator',
    ADMIN: 'Admin',
  };

  const permissionOptions = [
    { value: 'GUEST', label: 'Guest' },
    { value: 'MODERATOR', label: 'Moderator' },
    { value: 'ADMIN', label: 'Admin' },
  ];

  const banStatusOptions = [
    { value: 'NONE', label: 'Active' },
    { value: 'WARNING', label: 'Warning' },
    { value: 'SUSPENDED', label: 'Suspended' },
    { value: 'BANNED', label: 'Banned' },
  ];

  const banStatusNames: Record<string, string> = {
    NONE: 'None',
    WARNING: 'Warning',
    SUSPENDED: 'Suspended',
    BANNED: 'Banned',
  };

  function getPermissionColor(permission: string) {
    if (permission === 'ADMIN') return 'bg-purple-500/20 text-purple-400';
    if (permission === 'MODERATOR') return 'bg-info-500/20 text-info-400';
    return 'bg-gray-500/20 text-text-body';
  }

  function getBanStatusColor(status: string) {
    if (status === 'BANNED') return 'bg-danger-500/20 text-danger-400';
    if (status === 'SUSPENDED') return 'bg-orange-500/20 text-primary-400';
    if (status === 'WARNING') return 'bg-warning-500/20 text-warning-400';
    return 'bg-success-500/20 text-success-400';
  }

  function getPermissionBadgeColor(permission: string): 'purple' | 'blue' | 'zinc' {
    if (permission === 'ADMIN') return 'purple';
    if (permission === 'MODERATOR') return 'blue';
    return 'zinc';
  }

  function getBanStatusBadgeColor(status: string): 'red' | 'orange' | 'yellow' | 'green' {
    if (status === 'BANNED') return 'red';
    if (status === 'SUSPENDED') return 'orange';
    if (status === 'WARNING') return 'yellow';
    return 'green';
  }

  function goToPage(pageNum: number) {
    updateFilters({ page: pageNum.toString() });
  }

  function openEditModal(user: (typeof data.users)[0]) {
    editingUser = { ...user };
    selectedStaffDivisionIds = user.staffDivisions.map((d) => d.id);
    addRegionId = null;
  }

  function closeEditModal() {
    editingUser = null;
    selectedStaffDivisionIds = [];
    addRegionId = null;
  }

  function addStaffDivision(divisionId: number) {
    if (!selectedStaffDivisionIds.includes(divisionId)) {
      selectedStaffDivisionIds = [...selectedStaffDivisionIds, divisionId];
    }
    addRegionId = null;
  }

  function removeStaffDivision(divisionId: number) {
    selectedStaffDivisionIds = selectedStaffDivisionIds.filter((id) => id !== divisionId);
  }

  function openBanModal(user: (typeof data.users)[0]) {
    banningUser = user;
  }

  function closeBanModal() {
    banningUser = null;
  }
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <!-- Page Header -->
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">User Management</h2>
    <p class="text-text-body">Manage user accounts, roles, and permissions</p>
  </div>

  <!-- Filters -->
  <FilterBar onSubmit={handleSearch} onClear={clearFilters} {hasActiveFilters}>
    {#snippet filters()}
      <div class="flex-1">
        <label for="search" class="block text-sm font-medium text-text-body mb-2">Search</label>
        <SearchInput bind:value={searchInput} placeholder="Search by username or Steam ID..." />
      </div>

      <div class="md:w-48">
        <label for="permissionLevel" class="block text-sm font-medium text-text-body mb-2"
          >Permission</label
        >
        <SelectFilter
          value={data.filters.permissionLevel}
          options={permissionOptions}
          allLabel="All Permissions"
          onChange={(v) => updateFilters({ permissionLevel: v })}
        />
      </div>

      <div class="md:w-48">
        <label for="banStatus" class="block text-sm font-medium text-text-body mb-2">Status</label>
        <SelectFilter
          value={data.filters.banStatus}
          options={banStatusOptions}
          allLabel="All Status"
          onChange={(v) => updateFilters({ banStatus: v })}
        />
      </div>
    {/snippet}
  </FilterBar>

  <!-- Users Table -->
  <DataTable
    data={data.users}
    {columns}
    emptyMessage="No users found matching your filters"
    pagination={{
      currentPage: data.pagination.page,
      totalPages: data.pagination.totalPages,
      onPageChange: goToPage,
      infoText: paginationInfo,
    }}
  >
    {#snippet cell(user, col)}
      {#if col.key === 'user'}
        <div class="flex items-center gap-2">
          {#if user.steamAvatar}
            <img src={user.steamAvatar} alt={user.steamUsername} class="w-8 h-8 rounded" />
          {:else}
            <div
              class="w-8 h-8 bg-surface-hover rounded flex items-center justify-center text-xs font-bold text-text-body"
            >
              {user.steamUsername.slice(0, 2).toUpperCase()}
            </div>
          {/if}
          {#if user.flagEmoji}
            <span class="leading-none shrink-0" aria-hidden="true">{user.flagEmoji}</span>
          {/if}
          <div class="min-w-0">
            <a
              href="/users/{user.steamId}"
              class="text-white text-sm font-medium hover:text-primary-400 block truncate"
            >
              {user.steamUsername}
            </a>
            {#if user.permissionLevel === 'MODERATOR' || user.permissionLevel === 'ADMIN'}
              <p
                class="text-xs truncate {user.permissionLevel === 'ADMIN'
                  ? 'text-purple-400'
                  : 'text-info-400'}"
              >
                Staff{user.staffDivisions.length > 0
                  ? ` • ${user.staffDivisions.map((d) => d.name).join(', ')}`
                  : ''}
              </p>
            {/if}
          </div>
        </div>
      {:else if col.key === 'discord'}
        {#if user.discordLinked && user.discordUsername}
          <span
            class="text-success-400 text-xs truncate block max-w-[120px]"
            title={user.discordUsername}
          >
            {user.discordUsername}
          </span>
        {:else if user.discordLinked}
          <span class="text-success-400 text-xs">✓</span>
        {:else}
          <span class="text-text-muted text-xs">—</span>
        {/if}
      {:else if col.key === 'role'}
        <Badge color={getPermissionBadgeColor(user.permissionLevel)}>
          {permissionNames[user.permissionLevel]}
        </Badge>
      {:else if col.key === 'status'}
        <Badge color={getBanStatusBadgeColor(user.banStatus)}>
          {banStatusNames[user.banStatus]}
        </Badge>
      {:else if col.key === 'actions'}
        <div class="flex items-center justify-end gap-1">
          <Button variant="primary" size="sm" href="/users/{user.steamId}">View</Button>
          <Button variant="secondary" size="sm" onclick={() => openEditModal(user)}>Edit</Button>
          <Button variant="danger" size="sm" onclick={() => openBanModal(user)}>Punish</Button>
        </div>
      {/if}
    {/snippet}
  </DataTable>
</div>

<!-- Edit User Modal -->
{#if editingUser}
  <Dialog
    open={true}
    title="Edit User: {editingUser.steamUsername}"
    maxWidth="2xl"
    onClose={closeEditModal}
  >
    <FormError error={form?.error} />

    <form
      method="POST"
      action="?/updateUser"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            closeEditModal();
          }
        };
      }}
    >
      <input type="hidden" name="steamId" value={editingUser.steamId} />
      {#each selectedStaffDivisionIds as divId}
        <input type="hidden" name="staffDivisionIds" value={divId} />
      {/each}

      {#if data.isStrictAdmin}
        <FormSelect
          label="Permission Level"
          name="permissionLevel"
          bind:value={editingUser.permissionLevel}
          options={permissionOptions}
        />
      {:else}
        <input type="hidden" name="permissionLevel" value="" />
        <div class="mb-6">
          <p class="block text-sm font-medium text-text-label mb-1">Permission Level</p>
          <div class="px-4 py-3 bg-surface-input border border-border-input rounded-lg">
            <Badge color={getPermissionBadgeColor(editingUser.permissionLevel)}>
              {permissionNames[editingUser.permissionLevel]}
            </Badge>
          </div>
        </div>
      {/if}

      {#if editingUser.permissionLevel === 'MODERATOR' || editingUser.permissionLevel === 'ADMIN'}
        <div class="mb-6">
          <p class="block text-sm font-medium text-text-label mb-2">Staff Assignments</p>

          {#if selectedStaffDivisionIds.length > 0}
            <div class="space-y-2 mb-3">
              {#each selectedDivisionsInfo() as div}
                <div
                  class="flex items-center justify-between px-3 py-2 bg-surface-input border border-border-input rounded-lg"
                >
                  <span class="text-sm text-white">
                    {div.regionName} · {div.name}
                  </span>
                  <button
                    type="button"
                    onclick={() => removeStaffDivision(div.id)}
                    class="text-danger-400 hover:text-danger-300 text-xs font-medium transition-colors"
                  >
                    Remove
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-sm text-text-muted mb-3">No divisions assigned.</p>
          {/if}

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="sr-only" for="addStaffRegion">Region</label>
              <select
                id="addStaffRegion"
                class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors"
                value={addRegionId ?? ''}
                onchange={(e) => {
                  const val = e.currentTarget.value;
                  addRegionId = val ? parseInt(val) : null;
                }}
              >
                <option value="">Select region...</option>
                {#each data.regions as region}
                  <option value={region.id}>{region.name}</option>
                {/each}
              </select>
            </div>
            <div>
              <label class="sr-only" for="addStaffDivision">Division</label>
              <select
                id="addStaffDivision"
                class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!addRegionId || addFilteredDivisions.length === 0}
                value=""
                onchange={(e) => {
                  const val = e.currentTarget.value;
                  if (val) addStaffDivision(parseInt(val));
                }}
              >
                <option value=""
                  >{addRegionId ? 'Select division...' : 'Pick a region first'}</option
                >
                {#each addFilteredDivisions as division}
                  <option value={division.id}>{division.name}</option>
                {/each}
              </select>
            </div>
          </div>
          <p class="mt-2 text-sm text-text-muted">
            Which region/division(s) this staff member is assigned to (for display on league pages).
          </p>
        </div>
      {/if}

      <FormSelect
        label="Ban Status"
        name="banStatus"
        bind:value={editingUser.banStatus}
        options={[
          { value: 'NONE', label: 'None (Active)' },
          { value: 'WARNING', label: 'Warning' },
          { value: 'SUSPENDED', label: 'Suspended' },
          { value: 'BANNED', label: 'Banned' },
        ]}
        hint="Use the Punish button to add a ban with a reason. This field is for quick status changes."
      />

      <FormSelect
        label="Name Override"
        name="nameOverride"
        value={String(editingUser.nameOverride)}
        options={[
          { value: '0', label: 'Disabled (Use Steam Name)' },
          { value: '1', label: 'Enabled (Lock Current Name)' },
        ]}
        hint="When enabled, the user's display name will not update automatically from Steam."
      />

      <div class="flex gap-3 justify-end">
        <Button type="button" variant="secondary" onclick={closeEditModal}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>

    {#if editingUser.discordLinked}
      <div class="pt-4 mt-4 border-t border-border-default">
        <p class="block text-sm font-medium text-text-label mb-2">Discord Account</p>
        <div class="flex items-center justify-between p-3 bg-surface-input rounded-lg">
          <div class="flex items-center gap-2">
            <DiscordIcon size={16} />
            <span class="text-success-400 text-sm">{editingUser.discordUsername || 'Linked'}</span>
          </div>
          <button
            type="button"
            onclick={() => (unlinkingDiscordUser = editingUser)}
            disabled={isSubmitting}
            class="text-xs text-danger-400 hover:text-danger-300 hover:underline transition-colors disabled:opacity-50"
          >
            Unlink
          </button>
        </div>
      </div>
    {/if}
  </Dialog>
{/if}

<!-- Unlink Discord Confirmation Modal -->
{#if unlinkingDiscordUser}
  <Dialog open={true} title="Unlink Discord Account" onClose={() => (unlinkingDiscordUser = null)}>
    <p class="text-text-body mb-4">
      Are you sure you want to unlink <span class="text-white font-medium"
        >{unlinkingDiscordUser.steamUsername}</span
      >'s Discord account?
    </p>

    <div class="bg-surface-input border border-border-input rounded-lg p-4 mb-4">
      <div class="flex items-center gap-2">
        <DiscordIcon size={16} />
        <span class="text-success-400 text-sm"
          >{unlinkingDiscordUser.discordUsername || 'Linked'}</span
        >
      </div>
    </div>

    {#snippet footer()}
      <button
        type="button"
        onclick={() => (unlinkingDiscordUser = null)}
        class="flex-1 px-4 py-2 bg-surface-input hover:bg-surface-hover text-text-label rounded-lg font-medium transition-colors"
      >
        Cancel
      </button>
      <form
        method="POST"
        action="?/unlinkDiscord"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update, result }) => {
            await update();
            isSubmitting = false;
            if (result.type === 'success') {
              unlinkingDiscordUser = null;
              closeEditModal();
            }
          };
        }}
        class="flex-1"
      >
        <input type="hidden" name="steamId" value={unlinkingDiscordUser!.steamId} />
        <Button type="submit" variant="danger" disabled={isSubmitting} class="w-full">
          {isSubmitting ? 'Unlinking...' : 'Unlink Discord'}
        </Button>
      </form>
    {/snippet}
  </Dialog>
{/if}

<!-- Punish User Modal -->
{#if banningUser}
  <Dialog open={true} title="Punish User" onClose={closeBanModal}>
    <FormError error={form?.error} />

    <div class="mb-6">
      <div class="flex items-center gap-3 p-3 bg-surface-input rounded-lg">
        {#if banningUser.steamAvatar}
          <img
            src={banningUser.steamAvatar}
            alt={banningUser.steamUsername}
            class="w-10 h-10 rounded"
          />
        {:else}
          <div
            class="w-10 h-10 bg-surface-hover rounded flex items-center justify-center text-sm font-bold text-text-body"
          >
            {banningUser.steamUsername.slice(0, 2).toUpperCase()}
          </div>
        {/if}
        <div>
          <p class="text-white font-medium">{banningUser.steamUsername}</p>
          <p class="text-sm text-text-body font-mono">{banningUser.steamId}</p>
        </div>
      </div>
    </div>

    <form
      method="POST"
      action="?/banUser"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') {
            closeBanModal();
          }
        };
      }}
    >
      <input type="hidden" name="steamId" value={banningUser.steamId} />

      <FormSelect
        label="Severity"
        name="severity"
        required
        options={[
          { value: 'WARNING', label: 'Warning' },
          { value: 'SUSPENDED', label: 'Suspended' },
          { value: 'BANNED', label: 'Banned' },
        ]}
        placeholder="Select severity..."
      />

      <FormInput
        label="Duration (days)"
        name="duration"
        type="number"
        placeholder="Leave empty for permanent"
        hint="Leave empty for permanent punishment"
      />

      <div class="mb-6">
        <label for="ban-reason" class="block text-sm font-medium text-text-label mb-2">
          Reason <span class="text-danger-400">*</span>
        </label>
        <textarea
          id="ban-reason"
          name="reason"
          rows="4"
          required
          placeholder="Explain why this user is being punished..."
          class="w-full px-4 py-3 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors resize-none"
        ></textarea>
      </div>

      <div class="p-4 bg-danger-500/20 border border-danger-500/50 rounded-lg mb-6">
        <p class="text-danger-400 text-sm">
          This will create a punishment record and update the user's status.
        </p>
      </div>

      <div class="flex gap-3 justify-end">
        <Button type="button" variant="secondary" onclick={closeBanModal}>Cancel</Button>
        <Button type="submit" variant="danger" disabled={isSubmitting}>
          {isSubmitting ? 'Processing...' : 'Apply Punishment'}
        </Button>
      </div>
    </form>
  </Dialog>
{/if}
