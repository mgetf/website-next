<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import type { NavUserTeam, SessionUser } from '$lib/types/user';
  import { UserRole } from '$lib/types/user';
  import ChevronDown from '~icons/lucide/chevron-down';
  import ChevronRight from '~icons/lucide/chevron-right';
  import User from '~icons/lucide/user';
  import Users from '~icons/lucide/users';
  import Receipt from '~icons/lucide/receipt';
  import Settings from '~icons/lucide/settings';
  import LogOut from '~icons/lucide/log-out';

  type Props = {
    user: SessionUser;
    userTeams?: NavUserTeam[];
  };

  let { user, userTeams = [] }: Props = $props();

  let open = $state(false);

  const itemClass =
    'flex cursor-pointer select-none items-center gap-3 rounded-md px-4 py-2.5 text-sm text-text-label outline-none data-highlighted:bg-surface-input/50 data-highlighted:text-white';
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
        return { label: 'Admin', classes: 'text-purple-400' };
      case UserRole.MODERATOR:
        return { label: 'Mod', classes: 'text-blue-400' };
      default:
        return null;
    }
  });
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger
    class="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-input/50 rounded-lg transition-all"
    aria-label="User menu"
  >
    <img
      class="h-8 w-8 rounded-full ring-2 ring-zinc-700"
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
            class="h-12 w-12 rounded-full ring-2 ring-zinc-700"
            src={user.steamAvatar}
            alt="User Avatar"
          />
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white truncate">
              {user.steamUsername}
            </p>
            <p
              class="text-xs capitalize {user.permissionLevel === UserRole.ADMIN
                ? 'text-purple-400'
                : user.permissionLevel === UserRole.MODERATOR
                  ? 'text-blue-400'
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

        {#if userTeams.length > 0}
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
                <DropdownMenu.Item class={itemClass}>
                  {#snippet child({ props })}
                    <a href="/teams/{team.id}" {...props}>
                      {#if team.avatar}
                        <img
                          src={team.avatar}
                          alt=""
                          class="w-8 h-8 rounded-md object-cover shrink-0"
                        />
                      {:else}
                        <span
                          class="w-8 h-8 rounded-md bg-surface-hover text-text-body flex items-center justify-center text-sm font-bold shrink-0"
                        >
                          {team.name.charAt(0).toUpperCase()}
                        </span>
                      {/if}
                      <span class="min-w-0">
                        <span class="block truncate text-white">{team.name}</span>
                        <span class="block truncate text-xs text-text-muted">{team.formatName}</span
                        >
                      </span>
                    </a>
                  {/snippet}
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>
        {/if}

        <DropdownMenu.Item class={itemClass}>
          {#snippet child({ props })}
            <a href="/users/{user.steamId}/payments" {...props}>
              <Receipt class="size-5 shrink-0" />
              <span>Payment History</span>
            </a>
          {/snippet}
        </DropdownMenu.Item>

        {#if isAdminUser}
          <DropdownMenu.Item class="{itemClass} text-purple-400 data-highlighted:text-purple-300">
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
          <DropdownMenu.Item class="{itemClass} text-danger-400 data-highlighted:text-danger-300">
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
