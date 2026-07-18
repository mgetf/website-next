<script lang="ts">
  import type { LayoutData } from './$types';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';

  import dashboardIcon from '$lib/assets/icons/dashboard.png';
  import trophyIcon from '$lib/assets/icons/trophy.png';
  import groupIcon from '$lib/assets/icons/group.png';
  import battleIcon from '$lib/assets/icons/battle.png';
  import hourglassIcon from '$lib/assets/icons/hourglass.png';
  import videoCameraIcon from '$lib/assets/icons/video-camera.png';
  import maceIcon from '$lib/assets/icons/mace.png';
  import userIcon from '$lib/assets/icons/user.png';
  import webIcon from '$lib/assets/icons/web.png';
  import settingIcon from '$lib/assets/icons/setting.png';
  import auditIcon from '$lib/assets/icons/audit.png';
  import mapIcon from '$lib/assets/icons/location.png';

  let { data, children }: { data: LayoutData; children: any } = $props();

  // Determine active page for sidebar highlighting
  const isActive = (path: string) => {
    if (path === '/admin') {
      return page.url.pathname === '/admin';
    }
    return page.url.pathname === path || page.url.pathname.startsWith(path + '/');
  };

  // Sidebar menu items
  const allMenuItems = [
    { name: 'Dashboard', path: '/admin', icon: dashboardIcon, adminOnly: false, badge: '' },
    { name: 'League', path: '/admin/league', icon: trophyIcon, adminOnly: false, badge: '' },
    {
      name: 'Tournaments',
      path: '/admin/tournaments',
      icon: trophyIcon,
      adminOnly: true,
      badge: '',
    },
    { name: 'Teams', path: '/admin/teams', icon: groupIcon, adminOnly: false, badge: '' },
    { name: 'Matches', path: '/admin/matches', icon: battleIcon, adminOnly: false, badge: '' },
    {
      name: 'Pending Players',
      path: '/admin/pending-players',
      icon: hourglassIcon,
      adminOnly: false,
      badge: '',
    },
    { name: 'Demos', path: '/admin/demos', icon: videoCameraIcon, adminOnly: false, badge: '' },
    { name: 'Maps', path: '/admin/maps', icon: mapIcon, adminOnly: false, badge: '' },
    { name: 'Disputes', path: '/admin/disputes', icon: maceIcon, adminOnly: false, badge: '' },
    { name: 'Users', path: '/admin/users', icon: userIcon, adminOnly: false, badge: '' },
    { name: 'Global', path: '/admin/global', icon: webIcon, adminOnly: false, badge: '' },
    {
      name: 'Item Orders',
      path: '/admin/item-payments',
      icon: hourglassIcon,
      adminOnly: false,
      badge: '',
    },
    { name: 'Site', path: '/admin/site', icon: settingIcon, adminOnly: false, badge: '' },
    { name: 'Audit Logs', path: '/admin/audit-logs', icon: auditIcon, adminOnly: true, badge: '' },
  ] as const;

  const menuItems = $derived(allMenuItems.filter((item) => !item.adminOnly || data.isStrictAdmin));

  // Mobile menu state
  let mobileMenuOpen = $state(false);
</script>

<svelte:head>
  <title>Admin Panel - MGE.tf</title>
</svelte:head>

<div class="min-h-screen bg-surface-page text-text-label flex">
  <!-- Sidebar -->
  <aside
    class="hidden lg:block w-64 bg-surface-card border-r border-border-default min-h-screen sticky top-0"
  >
    <nav class="p-4 space-y-1">
      <!-- Back to Site Button -->
      <a
        href={resolve('/')}
        class="flex items-center gap-3 px-4 py-3 mb-4 bg-surface-input hover:bg-surface-hover rounded-lg transition-all text-text-label hover:text-white"
      >
        <span class="text-xl">←</span>
        <span>Back to Site</span>
      </a>

      {#each menuItems as item (item.path)}
        <a
          href={resolve(item.path)}
          class="relative flex items-center gap-3 px-4 py-3 rounded-lg transition-all {isActive(
            item.path,
          )
            ? 'bg-primary-500/20 text-primary-400 font-medium'
            : 'text-text-label hover:bg-surface-input hover:text-white'}"
        >
          <img src={item.icon} alt={item.name} class="w-6 h-6 brightness-0 invert opacity-70" />
          <span>{item.name}</span>
          {#if item.badge}
            <span
              class="ml-auto text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full bg-danger-500 text-white leading-none"
              >{item.badge}</span
            >
          {/if}
        </a>
      {/each}
    </nav>
  </aside>

  <!-- Mobile Menu Toggle (Floating Button) -->
  <Button
    variant="primary"
    onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
    aria-label="Toggle menu"
    class="lg:hidden fixed bottom-6 right-6 z-50 p-4! rounded-full! shadow-lg"
  >
    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  </Button>

  <!-- Mobile Sidebar -->
  {#if mobileMenuOpen}
    <button
      class="lg:hidden fixed inset-0 z-40 bg-surface-page/80"
      onclick={() => (mobileMenuOpen = false)}
      aria-label="Close menu"
    >
      <div
        class="w-64 bg-surface-card h-full"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        tabindex="-1"
      >
        <nav class="p-4 space-y-1">
          <!-- Back to Site Button -->
          <a
            href={resolve('/')}
            onclick={() => (mobileMenuOpen = false)}
            class="flex items-center gap-3 px-4 py-3 mb-4 bg-surface-input hover:bg-surface-hover rounded-lg transition-all text-text-label hover:text-white"
          >
            <span class="text-xl">←</span>
            <span>Back to Site</span>
          </a>
          {#each menuItems as item (item.path)}
            <a
              href={resolve(item.path)}
              onclick={() => (mobileMenuOpen = false)}
              class="relative flex items-center gap-3 px-4 py-3 rounded-lg transition-all {isActive(
                item.path,
              )
                ? 'bg-primary-500/20 text-primary-400 font-medium'
                : 'text-text-label hover:bg-surface-input hover:text-white'}"
            >
              <img src={item.icon} alt={item.name} class="w-5 h-5 brightness-0 invert opacity-70" />
              <span>{item.name}</span>
              {#if item.badge}
                <span
                  class="ml-auto text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full bg-danger-500 text-white leading-none"
                  >{item.badge}</span
                >
              {/if}
            </a>
          {/each}
        </nav>
      </div>
    </button>
  {/if}

  <!-- Main Content -->
  <main class="flex-1 p-6 lg:p-8">
    {@render children()}
  </main>
</div>
