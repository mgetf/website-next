<script lang="ts">
  import type { LayoutData } from './$types';
  import type { Component } from 'svelte';
  import type { SvelteHTMLElements } from 'svelte/elements';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';
  import ArrowLeft from '~icons/lucide/arrow-left';
  import LayoutDashboard from '~icons/lucide/layout-dashboard';
  import Trophy from '~icons/lucide/trophy';
  import Medal from '~icons/lucide/medal';
  import Users from '~icons/lucide/users';
  import Swords from '~icons/lucide/swords';
  import Hourglass from '~icons/lucide/hourglass';
  import Video from '~icons/lucide/video';
  import Map from '~icons/lucide/map';
  import Gavel from '~icons/lucide/gavel';
  import User from '~icons/lucide/user';
  import UserCog from '~icons/lucide/user-cog';
  import Globe from '~icons/lucide/globe';
  import Newspaper from '~icons/lucide/newspaper';
  import Package from '~icons/lucide/package';
  import Settings from '~icons/lucide/settings';
  import ClipboardList from '~icons/lucide/clipboard-list';
  import Menu from '~icons/lucide/menu';

  let { data, children }: { data: LayoutData; children: any } = $props();

  type Icon = Component<SvelteHTMLElements['svg']>;

  // Determine active page for sidebar highlighting
  const isActive = (path: string) => {
    if (path === '/admin') {
      return page.url.pathname === '/admin';
    }
    return page.url.pathname === path || page.url.pathname.startsWith(path + '/');
  };

  const allMenuItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard, adminOnly: false, badge: '' },
    { name: 'League', path: '/admin/league', icon: Trophy, adminOnly: false, badge: '' },
    { name: 'Tournaments', path: '/admin/tournaments', icon: Medal, adminOnly: true, badge: '' },
    { name: 'Teams', path: '/admin/teams', icon: Users, adminOnly: false, badge: '' },
    { name: 'Matches', path: '/admin/matches', icon: Swords, adminOnly: false, badge: '' },
    {
      name: 'Pending Players',
      path: '/admin/pending-players',
      icon: Hourglass,
      adminOnly: false,
      badge: '',
    },
    { name: 'Demos', path: '/admin/demos', icon: Video, adminOnly: false, badge: '' },
    { name: 'Maps', path: '/admin/maps', icon: Map, adminOnly: false, badge: '' },
    { name: 'Disputes', path: '/admin/disputes', icon: Gavel, adminOnly: false, badge: '' },
    { name: 'Users', path: '/admin/users', icon: User, adminOnly: false, badge: '' },
    { name: 'Staff', path: '/admin/staff', icon: UserCog, adminOnly: true, badge: '' },
    { name: 'Global', path: '/admin/global', icon: Globe, adminOnly: false, badge: '' },
    { name: 'Blog', path: '/admin/blog', icon: Newspaper, adminOnly: false, badge: '' },
    {
      name: 'Item Orders',
      path: '/admin/item-payments',
      icon: Package,
      adminOnly: false,
      badge: '',
    },
    { name: 'Site', path: '/admin/site', icon: Settings, adminOnly: false, badge: '' },
    {
      name: 'Audit Logs',
      path: '/admin/audit-logs',
      icon: ClipboardList,
      adminOnly: true,
      badge: '',
    },
  ] as const satisfies readonly {
    name: string;
    path: string;
    icon: Icon;
    adminOnly: boolean;
    badge: string;
  }[];

  type MenuItem = (typeof allMenuItems)[number];

  const menuItems = $derived(allMenuItems.filter((item) => !item.adminOnly || data.isStrictAdmin));

  // Mobile menu state
  let mobileMenuOpen = $state(false);
</script>

<svelte:head>
  <title>Admin Panel - MGE.tf</title>
</svelte:head>

{#snippet navItem(item: MenuItem, closeMobile = false)}
  <a
    href={resolve(item.path)}
    onclick={() => {
      if (closeMobile) mobileMenuOpen = false;
    }}
    class="relative flex items-center gap-3 px-4 py-3 rounded-lg transition-all {isActive(item.path)
      ? 'bg-primary-500/20 text-primary-400 font-medium'
      : 'text-text-label hover:bg-surface-input hover:text-white'}"
  >
    <item.icon class="size-5 shrink-0" />
    <span>{item.name}</span>
    {#if item.badge}
      <span
        class="ml-auto text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full bg-danger-500 text-white leading-none"
        >{item.badge}</span
      >
    {/if}
  </a>
{/snippet}

{#snippet backToSite(closeMobile = false)}
  <a
    href={resolve('/')}
    onclick={() => {
      if (closeMobile) mobileMenuOpen = false;
    }}
    class="flex items-center gap-3 px-4 py-3 mb-4 bg-surface-input hover:bg-surface-hover rounded-lg transition-all text-text-label hover:text-white"
  >
    <ArrowLeft class="size-5 shrink-0" />
    <span>Back to Site</span>
  </a>
{/snippet}

<div class="min-h-screen bg-surface-page text-text-label flex">
  <!-- Sidebar -->
  <aside
    class="hidden lg:block w-64 bg-surface-card border-r border-border-default min-h-screen sticky top-0"
  >
    <nav class="p-4 space-y-1">
      {@render backToSite()}
      {#each menuItems as item (item.path)}
        {@render navItem(item)}
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
    <Menu class="size-6 text-white" />
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
          {@render backToSite(true)}
          {#each menuItems as item (item.path)}
            {@render navItem(item, true)}
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
