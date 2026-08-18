<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import SearchInput from '$lib/components/ui/SearchInput.svelte';
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import DiscordIcon from '$lib/components/icons/DiscordIcon.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { data }: { data: PageData } = $props();

  let searchInput = $state('');
  let roleFilter = $state('');

  $effect(() => {
    searchInput = data.filters.search;
    roleFilter = data.filters.role || '';
  });

  const roleOptions = [
    { value: 'ADMIN', label: 'Admin' },
    { value: 'MODERATOR', label: 'Moderator' },
    { value: 'GUEST', label: 'Guest' },
  ];

  const columns = [
    { key: 'player', label: 'Player' },
    { key: 'discord', label: 'Discord' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
  ];

  const paginationInfo = $derived(
    `Showing ${(data.pagination.currentPage - 1) * data.pagination.perPage + 1} to ${Math.min(data.pagination.currentPage * data.pagination.perPage, data.pagination.totalCount)} of ${data.pagination.totalCount} users`,
  );

  function handleSearch(event: Event) {
    event.preventDefault();
    updateFilters();
  }

  function handleRoleChange() {
    updateFilters();
  }

  function updateFilters() {
    const params = new URLSearchParams();

    if (searchInput) {
      params.set('search', searchInput);
    }

    if (roleFilter) {
      params.set('role', roleFilter);
    }

    params.set('page', '1');

    goto(`/users?${params.toString()}`, { replaceState: true });
  }

  function changePage(page: number) {
    const params = new URLSearchParams();

    if (data.filters.search) {
      params.set('search', data.filters.search);
    }

    if (data.filters.role) {
      params.set('role', data.filters.role);
    }

    params.set('page', page.toString());

    goto(`/users?${params.toString()}`);
  }

  function clearFilters() {
    searchInput = '';
    roleFilter = '';
    goto('/users');
  }

  function getRoleBadgeColor(role: string): 'purple' | 'blue' | 'zinc' {
    if (role === 'ADMIN') return 'purple';
    if (role === 'MODERATOR') return 'blue';
    return 'zinc';
  }

  function getRoleLabel(role: string) {
    if (role === 'ADMIN') return 'Admin';
    if (role === 'MODERATOR') return 'Moderator';
    return 'Guest';
  }

  function getBanBadgeColor(status: string): 'red' | 'orange' | null {
    if (status === 'BANNED') return 'red';
    if (status === 'TEMP_BANNED') return 'orange';
    return null;
  }

  function getBanLabel(status: string) {
    if (status === 'BANNED') return 'Banned';
    if (status === 'TEMP_BANNED') return 'Temp Banned';
    return '';
  }
</script>

<div>
  <PageHero
    title="Users"
    subtitle="{data.pagination.totalCount.toLocaleString()} registered players"
    maxWidth="max-w-7xl"
    border
  />
  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <Card padding="lg" class="mb-6">
      <form onsubmit={handleSearch} class="flex flex-col md:flex-row gap-4">
        <div class="flex-1">
          <label for="search" class="block text-sm font-medium text-text-body mb-2">Search</label>
          <SearchInput
            bind:value={searchInput}
            placeholder="Search by username, Steam ID, or Discord..."
          />
        </div>

        <div class="md:w-48">
          <label for="role" class="block text-sm font-medium text-text-body mb-2">
            Filter by role
          </label>
          <SelectFilter
            bind:value={roleFilter}
            options={roleOptions}
            allLabel="All Roles"
            onChange={handleRoleChange}
          />
        </div>

        <div class="flex items-end gap-2">
          <Button type="submit">Search</Button>

          {#if data.filters.search || data.filters.role}
            <Button type="button" variant="secondary" onclick={clearFilters}>Clear</Button>
          {/if}
        </div>
      </form>
    </Card>

    <DataTable
      data={data.users}
      {columns}
      emptyMessage="No Users Found"
      emptyIcon="👤"
      pagination={{
        currentPage: data.pagination.currentPage,
        totalPages: data.pagination.totalPages,
        onPageChange: changePage,
        infoText: paginationInfo,
      }}
    >
      {#snippet cell(user, col)}
        {#if col.key === 'player'}
          <a
            href="/users/{user.steamId}"
            class="flex items-center space-x-2 group whitespace-nowrap"
          >
            <img
              src={user.steamAvatar || '/default-avatar.png'}
              alt={user.steamUsername}
              class="w-8 h-8 rounded-full"
            />
            <span
              class="text-sm font-medium text-white group-hover:text-primary-400 transition-colors"
            >
              {user.steamUsername}
            </span>
          </a>
        {:else if col.key === 'discord'}
          {#if user.discord?.discordUsername}
            <div class="flex items-center space-x-2 whitespace-nowrap">
              <DiscordIcon size={16} />
              <span class="text-sm text-text-label">
                {user.discord.discordUsername}
              </span>
            </div>
          {:else}
            <span class="text-sm text-text-muted">—</span>
          {/if}
        {:else if col.key === 'role'}
          <Badge color={getRoleBadgeColor(user.permissionLevel)} class="whitespace-nowrap">
            {getRoleLabel(user.permissionLevel)}
          </Badge>
        {:else if col.key === 'status'}
          {#if user.banStatus !== 'NONE'}
            {@const banColor = getBanBadgeColor(user.banStatus)}
            {#if banColor}
              <Badge color={banColor} class="whitespace-nowrap">
                {getBanLabel(user.banStatus)}
              </Badge>
            {/if}
          {:else}
            <Badge color="green" class="whitespace-nowrap">Active</Badge>
          {/if}
        {/if}
      {/snippet}
    </DataTable>
  </div>
</div>
