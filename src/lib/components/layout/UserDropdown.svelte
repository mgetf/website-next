<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import { MediaQuery } from 'svelte/reactivity';
  import type { NavUserTeam, SessionUser } from '#lib/types/user.js';
  import { UserRole } from '#lib/types/user.js';
  import ChevronDown from '~icons/lucide/chevron-down';
  import ChevronRight from '~icons/lucide/chevron-right';
  import User from '~icons/lucide/user';
  import Users from '~icons/lucide/users';
  import Settings from '~icons/lucide/settings';
  import LogOut from '~icons/lucide/log-out';
  import ShoppingCart from '~icons/lucide/shopping-cart';

  type Props = {
    user: SessionUser;
    userTeams?: NavUserTeam[];
    cartCount?: number;
  };

  let { user, userTeams = [], cartCount = 0 }: Props = $props();

  let open = $state(false);
  let teamsOpen = $state(false);
  const inlineTeams = new MediaQuery('(max-width: 767px)');

  function handleOpenChange(next: boolean) {
    open = next;
    if (!next) teamsOpen = false;
  }

  const itemClass =
    'flex cursor-pointer select-none items-center gap-3 rounded-md px-4 py-2.5 text-sm text-text-label outline-none data-highlighted:bg-surface-input/50 data-highlighted:text-text-heading';
  const nestedItemClass =
    'flex cursor-pointer select-none items-center gap-3 rounded-md py-2.5 pr-4 pl-12 text-sm text-text-label outline-none data-highlighted:bg-surface-input/50 data-highlighted:text-text-heading';
  const contentClass =
    'z-50 w-64 rounded-lg border border-border-default bg-surface-card p-0 shadow-xl outline-none';

  let displayName = $derived.by(() => {
    const maxLength = 15;
    return user.steamUsername.length > maxLength
      ? user.steamUsername.slice(0, maxLength) + '...'
      : user.steamUsername;
  });

  const isAdminUser = $derived(
    user.permissionLevel === UserRole.ADMIN || user.permissionLevel === UserRole.MODERATOR,
  );

  const roleBadge = $derived.by(() => {
    switch (user.permissionLevel) {
      case UserRole.ADMIN:
        return { label: 'Admin', classes: 'text-theme-purple-ink' };
      case UserRole.MODERATOR:
        return { label: 'Mod', classes: 'text-info-ink' };
      default:
        return null;
    }
  });
</script>

<DropdownMenu.Root bind:open onOpenChange={handleOpenChange}>
  <DropdownMenu.Trigger
    class="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-input/50 rounded-lg transition-all"
    aria-label="User menu"
  >
    <img
      class="h-8 w-8 rounded-full ring-2 ring-border-input"
      src={user.steamAvatar}
      alt="User Avatar"
    />
    <div class="hidden lg:flex flex-col items-start leading-tight">
      <span class="text-sm font-medium text-text-label">{displayName}</span>
      {#if roleBadge}
        <span class="text-[10px] font-medium {roleBadge.classes}">{roleBadge.label}</span>
      {/if}
    </div>
    <ChevronDown class="size-4 text-text-body transition-transform {open ? 'rotate-180' : ''}" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class={contentClass} align="end" sideOffset={8}>
      <div class="px-4 py-3 border-b border-border-default bg-surface-input/50 rounded-t-lg">
        <div class="flex items-center gap-3">
          <img
            class="h-12 w-12 rounded-full ring-2 ring-border-input"
            src={user.steamAvatar}
            alt="User Avatar"
          />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-text-heading truncate">
              {user.steamUsername}
            </p>
            <p
              class="text-xs capitalize {user.permissionLevel === UserRole.ADMIN
                ? 'text-theme-purple-ink'
                : user.permissionLevel === UserRole.MODERATOR
                  ? 'text-info-ink'
                  : 'text-text-body'}"
            >
              {user.permissionLevel.toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      <div class="py-2">
        <DropdownMenu.Item class={itemClass}>
          {#snippet child({ props })}
            <a href="/users/{user.steamId}" {...props}>
              <User class="size-5 shrink-0" />
              <span>My Profile</span>
            </a>
          {/snippet}
        </DropdownMenu.Item>

        <DropdownMenu.Item class={itemClass}>
          {#snippet child({ props })}
            <a href="/checkout" {...props}>
              <ShoppingCart class="size-5 shrink-0" />
              <span>Cart</span>
              {#if cartCount > 0}
                <span
                  class="ml-auto rounded-full bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white"
                >
                  {cartCount}
                </span>
              {/if}
            </a>
          {/snippet}
        </DropdownMenu.Item>

        {#if userTeams.length > 0}
          {#if inlineTeams.current}
            <DropdownMenu.Item
              class="{itemClass} justify-between"
              closeOnSelect={false}
              aria-expanded={teamsOpen}
              onSelect={() => (teamsOpen = !teamsOpen)}
            >
              <span class="flex items-center gap-3">
                <Users class="size-5 shrink-0" />
                <span>My Teams</span>
              </span>
              <ChevronDown
                class="size-4 shrink-0 text-text-muted transition-transform {teamsOpen
                  ? 'rotate-180'
                  : ''}"
              />
            </DropdownMenu.Item>
            {#if teamsOpen}
              {#each userTeams as team (team.id)}
                {@render teamItem(team, true)}
              {/each}
            {/if}
          {:else}
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger class="{itemClass} justify-between">
                <span class="flex items-center gap-3">
                  <Users class="size-5 shrink-0" />
                  <span>My Teams</span>
                </span>
                <ChevronRight class="size-4 shrink-0 text-text-muted" />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.SubContent class="{contentClass} w-56 py-1" sideOffset={6}>
                {#each userTeams as team (team.id)}
                  {@render teamItem(team, false)}
                {/each}
              </DropdownMenu.SubContent>
            </DropdownMenu.Sub>
          {/if}
        {/if}

        {#if isAdminUser}
          <DropdownMenu.Item
            class="{itemClass} text-theme-purple-ink data-highlighted:text-purple-300"
          >
            {#snippet child({ props })}
              <a href="/admin" {...props}>
                <Settings class="size-5 shrink-0" />
                <span>Admin Panel</span>
              </a>
            {/snippet}
          </DropdownMenu.Item>
        {/if}

        <DropdownMenu.Separator class="my-2 h-px bg-border-default" />

        <form method="POST" action="/auth/logout">
          <DropdownMenu.Item class="{itemClass} text-danger-ink data-highlighted:text-danger-300">
            {#snippet child({ props })}
              <button type="submit" {...props}>
                <LogOut class="size-5 shrink-0" />
                <span>Sign Out</span>
              </button>
            {/snippet}
          </DropdownMenu.Item>
        </form>
      </div>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

{#snippet teamItem(team: NavUserTeam, nested: boolean)}
  <DropdownMenu.Item class={nested ? nestedItemClass : itemClass}>
    {#snippet child({ props })}
      <a href="/teams/{team.id}" {...props}>
        {#if team.avatar}
          <img src={team.avatar} alt="" class="size-8 shrink-0 rounded-md object-cover" />
        {:else}
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-hover text-sm font-bold text-text-body"
          >
            {team.name.charAt(0).toUpperCase()}
          </span>
        {/if}
        <span class="min-w-0">
          <span class="block truncate text-text-heading">{team.name}</span>
          <span class="block truncate text-xs text-text-muted">{team.formatName}</span>
        </span>
      </a>
    {/snippet}
  </DropdownMenu.Item>
{/snippet}
