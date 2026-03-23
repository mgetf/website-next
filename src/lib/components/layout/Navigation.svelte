<script lang="ts">
  import type { SessionUser } from '$lib/types/user';
  import type { Notification } from '$lib/state/notifications.svelte';
  import NotificationDropdown from './NotificationDropdown.svelte';
  import UserDropdown from './UserDropdown.svelte';
  import { page } from '$app/state';
  import signInThroughSteam from '$lib/assets/signin-thru-steam.png';
  import YoutubeIcon from '$lib/components/icons/YoutubeIcon.svelte';
  import DiscordIcon from '$lib/components/icons/DiscordIcon.svelte';

  type Props = {
    user: SessionUser | null;
    notifications: Notification[];
    notificationCount: number;
    signupClosed?: boolean;
    isInTeam?: boolean;
    userTeam?: { id: number; name: string } | null;
  };

  let {
    user,
    notifications,
    notificationCount,
    signupClosed = true,
    isInTeam = false,
    userTeam = null,
  }: Props = $props();

  // Mobile menu state
  let mobileMenuOpen = $state(false);

  const loginUrl = $derived(`/auth/login?redirect=${encodeURIComponent(page.url.pathname)}`);
  const signupHref = $derived(user ? '/signup' : '/auth/login?redirect=%2Fsignup');

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }
</script>

<!-- Modern Navigation Bar with great contrast -->
<nav class="bg-zinc-950/90 backdrop-blur-md border-b border-border-default shadow-lg relative z-30">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16">
      <!-- Left: Logo + Main Navigation -->
      <div class="flex items-center gap-8">
        <!-- Logo -->
        <a href="/" class="flex items-center gap-2 group">
          <img src="/mge_transparent_logo.png" alt="MGE Logo" class="h-8 w-auto" />
          <span class="text-2xl font-bold text-white">MGE</span>
        </a>

        <!-- Desktop Navigation Links -->
        <div class="hidden md:flex items-center gap-1">
          <!-- Leagues Dropdown -->
          <div class="relative group">
            <button
              class="px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input/50 rounded-lg transition-all flex items-center gap-1"
            >
              Leagues
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            <div
              class="absolute left-0 mt-1 w-40 bg-surface-card border border-border-default rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50"
            >
              <a
                href="/leagues/2v2"
                class="block px-4 py-2 text-sm text-text-label hover:text-white hover:bg-surface-input rounded-t-lg"
              >
                2v2 League
              </a>
              <a
                href="/leagues/1v1"
                class="block px-4 py-2 text-sm text-text-label hover:text-white hover:bg-surface-input rounded-b-lg"
              >
                1v1 League
              </a>
            </div>
          </div>
          <a
            href="/tournaments"
            class="px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input/50 rounded-lg transition-all"
          >
            Tournaments
          </a>
          <a
            href="/users"
            class="px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input/50 rounded-lg transition-all"
          >
            Users
          </a>
          <a
            href="/teams"
            class="px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input/50 rounded-lg transition-all"
          >
            Teams
          </a>
          <a
            href="/rulebook"
            class="px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input/50 rounded-lg transition-all"
          >
            Rules
          </a>
        </div>
      </div>

      <!-- Right: Actions -->
      <div class="flex items-center gap-3">
        <!-- Social Links -->
        <div class="hidden md:flex items-center gap-1">
          <a
            href="https://www.youtube.com/channel/UCtVU1Zc_KiIjDAsH0GGRqww"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MGE on YouTube"
            class="p-1.5 text-text-body hover:text-danger-500 transition-colors rounded-md hover:bg-surface-input/50"
          >
            <YoutubeIcon />
          </a>
          <a
            href="https://mge.tf/discord"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MGE Discord"
            class="p-1.5 text-text-body hover:text-indigo-400 transition-colors rounded-md hover:bg-surface-input/50"
          >
            <DiscordIcon />
          </a>
        </div>
        {#if user && !signupClosed && !isInTeam}
          <a
            href="/signup"
            class="hidden md:block px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Sign Up
          </a>
        {/if}

        <!-- User Section -->
        {#if !user}
          <a
            href={loginUrl}
            class="block hover:opacity-80 transition-opacity"
            title="Sign in through Steam"
          >
            <img src={signInThroughSteam} alt="Sign in through Steam" class="h-6" />
          </a>
        {:else}
          <div class="flex items-center gap-3">
            <UserDropdown {user} {userTeam} />
            <NotificationDropdown {notifications} userSteamId={user.steamId} />
          </div>
        {/if}

        <!-- Mobile Menu Button -->
        <button
          onclick={toggleMobileMenu}
          class="md:hidden p-2 text-text-body hover:text-white hover:bg-surface-input/50 rounded-lg transition-all"
          aria-label="Toggle menu"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {#if mobileMenuOpen}
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            {:else}
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            {/if}
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Mobile Menu -->
  {#if mobileMenuOpen}
    <div class="md:hidden border-t border-border-default bg-surface-card">
      <div class="px-4 py-3 space-y-1">
        <a
          href="/leagues/2v2"
          class="block px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input rounded-lg"
        >
          2v2 League
        </a>
        <a
          href="/leagues/1v1"
          class="block px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input rounded-lg"
        >
          1v1 League
        </a>
        <a
          href="/tournaments"
          class="block px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input rounded-lg"
        >
          Tournaments
        </a>
        <a
          href="/users"
          class="block px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input rounded-lg"
        >
          Users
        </a>
        <a
          href="/teams"
          class="block px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input rounded-lg"
        >
          Teams
        </a>
        <a
          href="/rulebook"
          class="block px-4 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input rounded-lg"
        >
          Rules
        </a>

        {#if user && !signupClosed && !isInTeam}
          <a
            href="/signup"
            class="block px-4 py-2 text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-center"
          >
            Sign Up
          </a>
        {/if}

        <div class="pt-3 border-t border-border-default">
          {#if user}
            <form method="POST" action="/auth/logout">
              <button
                type="submit"
                class="w-full text-left px-4 py-2 text-sm font-medium text-danger-400 hover:text-danger-300 hover:bg-surface-input rounded-lg"
              >
                Sign Out
              </button>
            </form>
          {:else}
            <a href={loginUrl} class="block px-4 py-2 hover:opacity-80 transition-opacity">
              <img src={signInThroughSteam} alt="Sign in through Steam" class="h-6" />
            </a>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</nav>
