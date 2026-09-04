<script lang="ts">
  import type { SessionUser } from '$lib/types/user';
  import type { Notification } from '$lib/state/notifications.svelte';
  import { EMPTY_LEAGUE_NAV, type LeagueNav } from '$lib/types/league';
  import NotificationDropdown from './NotificationDropdown.svelte';
  import UserDropdown from './UserDropdown.svelte';
  import LeaguesDropdown from './LeaguesDropdown.svelte';
  import LeaguesNavGrid from './LeaguesNavGrid.svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import signInThroughSteam from '$lib/assets/signin-thru-steam.png';
  import YoutubeIcon from '$lib/components/icons/YoutubeIcon.svelte';
  import DiscordIcon from '$lib/components/icons/DiscordIcon.svelte';
  import NewChip from '$lib/components/ui/NewChip.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  type Props = {
    user: SessionUser | null;
    notifications: Notification[];
    notificationCount: number;
    signupClosed?: boolean;
    isInTeam?: boolean;
    userTeam?: { id: number; name: string } | null;
    realtimeEnabled?: boolean;
    leagueNav?: LeagueNav;
  };

  type NavLink = {
    href: string;
    label: string;
    badge?: boolean;
  };

  let {
    user,
    notifications,
    signupClosed = true,
    isInTeam = false,
    userTeam = null,
    realtimeEnabled = true,
    leagueNav = EMPTY_LEAGUE_NAV,
  }: Props = $props();

  let mobileMenuOpen = $state(false);
  let mobileMenuTop = $state(64);

  const loginUrl = $derived(`/auth/login?redirect=${encodeURIComponent(page.url.pathname)}`);

  const canSignUp = $derived(
    !signupClosed && !isInTeam && user?.banStatus !== 'SUSPENDED' && user?.banStatus !== 'BANNED',
  );

  const moreItems: NavLink[] = [
    { href: '/maps', label: 'Maps' },
    { href: '/servers', label: 'Servers' },
    { href: '/logs', label: 'Logs' },
  ];

  const primaryLinks: NavLink[] = [
    { href: '/tournaments', label: 'Tournaments' },
    { href: '/leaderboard', label: 'Leaderboard', badge: true },
    { href: '/blog', label: 'Blog' },
    { href: '/users', label: 'Users' },
    { href: '/teams', label: 'Teams' },
  ];

  function isActive(href: string) {
    const path = page.url.pathname;
    return path === href || path.startsWith(`${href}/`);
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && mobileMenuOpen) {
      closeMobileMenu();
    }
  }

  function navAttachment(node: HTMLElement) {
    const update = () => {
      mobileMenuTop = node.getBoundingClientRect().bottom;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }

  afterNavigate(() => {
    closeMobileMenu();
  });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="relative z-30">
  <nav
    {@attach navAttachment}
    class="bg-zinc-950/90 backdrop-blur-md border-b border-border-default shadow-lg"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <div class="flex items-center gap-6">
          <a href="/" class="flex items-center gap-2 group shrink-0">
            <img src="/mge_transparent_logo.png" alt="MGE Logo" class="h-8 w-auto" />
            <span class="text-2xl font-bold text-white">MGE</span>
          </a>

          <div class="hidden lg:flex items-center gap-0.5">
            {#if leagueNav.formats.length > 0}
              <LeaguesDropdown {leagueNav} />
            {/if}

            {#each primaryLinks as link (link.href)}
              <a
                href={link.href}
                class={[
                  'relative px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap',
                  isActive(link.href)
                    ? 'text-white bg-surface-input/50'
                    : 'text-text-label hover:text-white hover:bg-surface-input/50',
                ]}
              >
                {link.label}
                {#if link.badge}
                  <NewChip />
                {/if}
              </a>
            {/each}

            <div class="relative group">
              <button
                type="button"
                class="px-3 py-2 text-sm font-medium text-text-label hover:text-white hover:bg-surface-input/50 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap"
              >
                More
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
                class="absolute left-0 mt-1 w-40 bg-surface-card border border-border-default rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all z-50"
              >
                {#each moreItems as item, index (item.href)}
                  <a
                    href={item.href}
                    class="block px-4 py-2 text-sm text-text-label hover:text-white hover:bg-surface-input {index ===
                    0
                      ? 'rounded-t-lg'
                      : ''} {index === moreItems.length - 1 ? 'rounded-b-lg' : ''}"
                  >
                    {item.label}
                  </a>
                {/each}
              </div>
            </div>

            <a
              href="/rulebook"
              class={[
                'px-3 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap',
                isActive('/rulebook')
                  ? 'text-white bg-surface-input/50'
                  : 'text-text-label hover:text-white hover:bg-surface-input/50',
              ]}
            >
              Rules
            </a>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="hidden lg:flex items-center gap-1">
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
          {#if canSignUp}
            <Button
              href="/signup"
              variant="primary"
              size="sm"
              class="hidden lg:inline-flex items-center shrink-0 whitespace-nowrap"
            >
              Sign Up
            </Button>
          {/if}

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
              <NotificationDropdown {notifications} userSteamId={user.steamId} {realtimeEnabled} />
            </div>
          {/if}

          <button
            type="button"
            onclick={toggleMobileMenu}
            class="lg:hidden p-2 text-text-body hover:text-white hover:bg-surface-input/50 rounded-lg transition-all"
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav"
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
  </nav>

  {#if mobileMenuOpen}
    <div
      id="mobile-nav"
      class="lg:hidden fixed inset-x-0 bottom-0 z-40 overflow-y-auto bg-surface-card border-t border-border-default"
      style:top="{mobileMenuTop}px"
    >
      <div class="px-3 py-3">
        {#if leagueNav.formats.length > 0}
          <p
            class="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
          >
            Leagues
          </p>
          <div class="px-3 pb-1">
            <LeaguesNavGrid {leagueNav} onNavigate={closeMobileMenu} />
          </div>
        {/if}

        <div class="my-2 border-t border-border-default"></div>

        <div class="flex flex-col">
          {#each primaryLinks as link (link.href)}
            <a
              href={link.href}
              class={[
                'flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg',
                isActive(link.href)
                  ? 'text-white bg-surface-input'
                  : 'text-text-label hover:text-white hover:bg-surface-input',
              ]}
              onclick={closeMobileMenu}
            >
              {link.label}
              {#if link.badge}
                <NewChip inline />
              {/if}
            </a>
          {/each}
        </div>

        <div class="my-2 border-t border-border-default"></div>

        <div class="flex flex-col">
          {#each moreItems as item (item.href)}
            <a
              href={item.href}
              class={[
                'flex w-full items-center px-3 py-2.5 text-sm font-medium rounded-lg',
                isActive(item.href)
                  ? 'text-white bg-surface-input'
                  : 'text-text-label hover:text-white hover:bg-surface-input',
              ]}
              onclick={closeMobileMenu}
            >
              {item.label}
            </a>
          {/each}
          <a
            href="/rulebook"
            class={[
              'flex w-full items-center px-3 py-2.5 text-sm font-medium rounded-lg',
              isActive('/rulebook')
                ? 'text-white bg-surface-input'
                : 'text-text-label hover:text-white hover:bg-surface-input',
            ]}
            onclick={closeMobileMenu}
          >
            Rules
          </a>
        </div>
      </div>

      <div class="border-t border-border-default px-4 py-4 space-y-3">
        {#if canSignUp}
          <Button
            href="/signup"
            variant="primary"
            size="sm"
            class="w-full justify-center whitespace-nowrap"
            onclick={closeMobileMenu}
          >
            Sign Up
          </Button>
        {/if}

        <div class="flex items-center gap-2">
          <a
            href="https://www.youtube.com/channel/UCtVU1Zc_KiIjDAsH0GGRqww"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MGE on YouTube"
            class="p-2 text-text-body hover:text-danger-500 transition-colors rounded-md hover:bg-surface-input"
          >
            <YoutubeIcon />
          </a>
          <a
            href="https://mge.tf/discord"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="MGE Discord"
            class="p-2 text-text-body hover:text-indigo-400 transition-colors rounded-md hover:bg-surface-input"
          >
            <DiscordIcon />
          </a>
        </div>

        {#if user}
          <form method="POST" action="/auth/logout">
            <button
              type="submit"
              class="w-full text-left px-3 py-2.5 text-sm font-medium text-danger-400 hover:text-danger-300 hover:bg-surface-input rounded-lg"
            >
              Sign Out
            </button>
          </form>
        {/if}
      </div>
    </div>
  {/if}
</div>
