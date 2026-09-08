<script lang="ts">
  import type { SessionUser } from '$lib/types/user';
  import { UserRole } from '$lib/types/user';
  import ChevronDown from '~icons/lucide/chevron-down';
  import User from '~icons/lucide/user';
  import Users from '~icons/lucide/users';
  import Receipt from '~icons/lucide/receipt';
  import Settings from '~icons/lucide/settings';
  import LogOut from '~icons/lucide/log-out';

  type Props = {
    user: SessionUser;
    userTeam?: { id: number; name: string } | null;
  };

  let { user, userTeam = null }: Props = $props();

  // Dropdown state
  let dropdownOpen = $state(false);

  // User display name truncation for main button
  let displayName = $derived.by(() => {
    const maxLength = 15;
    return user.steamUsername.length > maxLength
      ? user.steamUsername.slice(0, maxLength) + '...'
      : user.steamUsername;
  });

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-dropdown-container')) {
      dropdownOpen = false;
    }
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

<svelte:window onclick={handleClickOutside} />

<div class="user-dropdown-container relative">
  <!-- User Button -->
  <button
    onclick={toggleDropdown}
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
    <!-- Chevron Icon -->
    <ChevronDown
      class="size-4 text-text-body transition-transform {dropdownOpen ? 'rotate-180' : ''}"
    />
  </button>

  <!-- Dropdown Menu -->
  {#if dropdownOpen}
    <div
      class="absolute right-0 mt-2 w-64 bg-surface-card border border-border-default rounded-lg shadow-xl overflow-hidden z-50"
    >
      <!-- User Info Header -->
      <div class="px-4 py-3 border-b border-border-default bg-surface-input/50">
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

      <!-- Menu Items -->
      <div class="py-2">
        <a
          href="/users/{user.steamId}"
          class="flex items-center gap-3 px-4 py-2.5 text-sm text-text-label hover:bg-surface-input/50 hover:text-white transition-all"
          onclick={() => (dropdownOpen = false)}
        >
          <User class="size-5 shrink-0" />
          <span>My Profile</span>
        </a>

        {#if userTeam}
          <a
            href="/teams/{userTeam.id}"
            class="flex items-center gap-3 px-4 py-2.5 text-sm text-text-label hover:bg-surface-input/50 hover:text-white transition-all"
            onclick={() => (dropdownOpen = false)}
          >
            <Users class="size-5 shrink-0" />
            <span>My Team: {userTeam.name}</span>
          </a>
        {/if}

        <a
          href="/users/{user.steamId}/payments"
          class="flex items-center gap-3 px-4 py-2.5 text-sm text-text-label hover:bg-surface-input/50 hover:text-white transition-all"
          onclick={() => (dropdownOpen = false)}
        >
          <Receipt class="size-5 shrink-0" />
          <span>Payment History</span>
        </a>

        {#if isAdminUser}
          <a
            href="/admin"
            class="flex items-center gap-3 px-4 py-2.5 text-sm text-purple-400 hover:bg-surface-input/50 hover:text-purple-300 transition-all"
            onclick={() => (dropdownOpen = false)}
          >
            <Settings class="size-5 shrink-0" />
            <span>Admin Panel</span>
          </a>
        {/if}

        <div class="my-2 border-t border-border-default"></div>

        <!-- Logout Form -->
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
  /* Ensure dropdown appears above other elements */
  .user-dropdown-container {
    z-index: 50;
  }
</style>
