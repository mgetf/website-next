<script lang="ts">
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

  let dropdownOpen = $state(false);
  let teamsMenuOpen = $state(false);
  let teamsMenuAlign = $state<'left' | 'right'>('right');
  let teamsHoverCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let teamsItemEl: HTMLDivElement | undefined = $state();

  const TEAMS_SUBMENU_WIDTH = 232;

  let displayName = $derived.by(() => {
    const maxLength = 15;
    return user.steamUsername.length > maxLength
      ? user.steamUsername.slice(0, maxLength) + '...'
      : user.steamUsername;
  });

  function closeDropdown() {
    dropdownOpen = false;
    teamsMenuOpen = false;
    clearTeamsHoverClose();
  }

  function toggleDropdown() {
    if (dropdownOpen) {
      closeDropdown();
    } else {
      dropdownOpen = true;
    }
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-dropdown-container')) {
      closeDropdown();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !dropdownOpen) return;
    if (teamsMenuOpen) {
      teamsMenuOpen = false;
      return;
    }
    closeDropdown();
  }

  function clearTeamsHoverClose() {
    if (teamsHoverCloseTimer) {
      clearTimeout(teamsHoverCloseTimer);
      teamsHoverCloseTimer = null;
    }
  }

  function updateTeamsMenuAlign() {
    if (!teamsItemEl) return;
    const rect = teamsItemEl.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    teamsMenuAlign = spaceRight >= TEAMS_SUBMENU_WIDTH ? 'right' : 'left';
  }

  function openTeamsMenu() {
    updateTeamsMenuAlign();
    teamsMenuOpen = true;
  }

  function toggleTeamsMenu() {
    if (teamsMenuOpen) {
      teamsMenuOpen = false;
      return;
    }
    openTeamsMenu();
  }

  function canHover() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  function openTeamsOnHover() {
    if (!canHover()) return;
    clearTeamsHoverClose();
    openTeamsMenu();
  }

  function closeTeamsOnHover() {
    if (!canHover()) return;
    clearTeamsHoverClose();
    teamsHoverCloseTimer = setTimeout(() => {
      teamsMenuOpen = false;
      teamsHoverCloseTimer = null;
    }, 150);
  }

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

<svelte:window
  onclick={handleClickOutside}
  onkeydown={handleKeydown}
  onresize={() => {
    if (teamsMenuOpen) updateTeamsMenuAlign();
  }}
/>

<div class="user-dropdown-container relative">
  <button
    onclick={toggleDropdown}
    class="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-input/50 rounded-lg transition-all"
    aria-label="User menu"
    aria-expanded={dropdownOpen}
    aria-haspopup="menu"
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
    <ChevronDown
      class="size-4 text-text-body transition-transform {dropdownOpen ? 'rotate-180' : ''}"
    />
  </button>

  {#if dropdownOpen}
    <div
      class="absolute right-0 mt-2 w-64 bg-surface-card border border-border-default rounded-lg shadow-xl z-50"
    >
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
        <a
          href="/users/{user.steamId}"
          class="flex items-center gap-3 px-4 py-2.5 text-sm text-text-label hover:bg-surface-input/50 hover:text-white transition-all"
          onclick={closeDropdown}
        >
          <User class="size-5 shrink-0" />
          <span>My Profile</span>
        </a>

        {#if userTeams.length > 0}
          <div
            bind:this={teamsItemEl}
            class="relative"
            role="group"
            aria-label="My teams"
            onmouseenter={openTeamsOnHover}
            onmouseleave={closeTeamsOnHover}
          >
            <button
              type="button"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-label hover:bg-surface-input/50 hover:text-white transition-all text-left"
              aria-expanded={teamsMenuOpen}
              aria-haspopup="menu"
              onclick={toggleTeamsMenu}
            >
              <Users class="size-5 shrink-0" />
              <span class="flex-1">My Teams</span>
              <ChevronRight class="size-4 shrink-0 text-text-muted" />
            </button>

            {#if teamsMenuOpen}
              <div
                class="absolute top-0 w-56 bg-surface-card border border-border-default rounded-lg shadow-xl py-1 z-50 {teamsMenuAlign ===
                'right'
                  ? 'left-full ml-1'
                  : 'right-full mr-1'}"
                role="menu"
              >
                {#each userTeams as team (team.id)}
                  <a
                    href="/teams/{team.id}"
                    class="flex items-center gap-3 px-3 py-2 text-sm text-text-label hover:bg-surface-input/50 hover:text-white transition-all"
                    role="menuitem"
                    onclick={closeDropdown}
                  >
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
                      <span class="block truncate text-xs text-text-muted">{team.formatName}</span>
                    </span>
                  </a>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <a
          href="/users/{user.steamId}/payments"
          class="flex items-center gap-3 px-4 py-2.5 text-sm text-text-label hover:bg-surface-input/50 hover:text-white transition-all"
          onclick={closeDropdown}
        >
          <Receipt class="size-5 shrink-0" />
          <span>Payment History</span>
        </a>

        {#if isAdminUser}
          <a
            href="/admin"
            class="flex items-center gap-3 px-4 py-2.5 text-sm text-purple-400 hover:bg-surface-input/50 hover:text-purple-300 transition-all"
            onclick={closeDropdown}
          >
            <Settings class="size-5 shrink-0" />
            <span>Admin Panel</span>
          </a>
        {/if}

        <div class="my-2 border-t border-border-default"></div>

        <form method="POST" action="/auth/logout">
          <button
            type="submit"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger-400 hover:bg-surface-input/50 hover:text-danger-300 transition-all text-left"
          >
            <LogOut class="size-5 shrink-0" />
            <span>Sign Out</span>
          </button>
        </form>
      </div>
    </div>
  {/if}
</div>

<style>
  .user-dropdown-container {
    z-index: 50;
  }
</style>
