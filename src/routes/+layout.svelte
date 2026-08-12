<script lang="ts">
  import '../app.css';
  import 'flag-icons/css/flag-icons.min.css';
  import type { LayoutData } from './$types';
  import Navigation from '$lib/components/layout/Navigation.svelte';
  import AnnouncementBanner from '$lib/components/layout/AnnouncementBanner.svelte';
  import LoadingBar from '$lib/components/layout/LoadingBar.svelte';
  import DevGate from '$lib/components/layout/DevGate.svelte';
  import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
  import { identifyUser } from '$lib/utils/posthog';
  import { onMount } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';

  let { data, children }: { data: LayoutData; children: any } = $props();

  // Identify user to PostHog when layout mounts
  onMount(() => {
    if (data.user) {
      identifyUser(data.user);
    }
  });

  // Scroll to top on every navigation
  afterNavigate(() => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'instant' });
    }
  });
</script>

<svelte:head>
  <title>{data.siteSettings?.siteTitle || 'MGE.tf'} - Competitive TF2 MGE League</title>
  <meta
    name="description"
    content="MGE.tf is a competitive Team Fortress 2 MGE league platform for 2v2 tournaments and seasonal play"
  />
  <meta name="view-transition" content="same-origin" />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap"
    rel="stylesheet"
  />
  {#if data.siteSettings?.faviconPath}
    <link rel="icon" href={data.siteSettings.faviconPath} />
  {/if}
</svelte:head>

<!-- Global Toast Notifications -->
<ToastContainer />

<!-- Dev/Staging Gate: Show restricted access page for non-admins -->
{#if data.devGated}
  <DevGate user={data.user} />
{:else}
  <!-- Background image layer (fixed, at document root level) -->
  {#if data.siteSettings?.backgroundImagePath}
    <div class="fixed inset-0 z-0 overflow-hidden">
      <img
        src={data.siteSettings.backgroundImagePath}
        alt=""
        class="w-full h-full object-cover"
        style="filter: blur({data.siteSettings.backgroundBlur}px) brightness({data.siteSettings
          .backgroundBrightness}); transform: scale(1.05)"
      />
      <div
        class="absolute inset-0"
        style="background: rgba(9, 9, 11, {data.siteSettings.backgroundOverlay})"
      ></div>
    </div>
  {/if}

  <div
    class="subpixel-antialiased flex flex-col h-full overflow-hidden text-text-label relative z-10 {data
      .siteSettings?.backgroundImagePath
      ? ''
      : 'bg-surface-page'}"
  >
    <LoadingBar />

    <!-- Environment indicator banner for staging (shown to admins) -->
    {#if data.appEnvironment === 'staging'}
      <div class="bg-warning-600 px-4 py-1.5 text-center relative z-20">
        <span class="text-white text-sm font-semibold">
          ⚠️ Development Environment — Changes here are not live
        </span>
      </div>
    {/if}

    <div class="flex flex-col flex-grow overflow-hidden w-full mx-auto">
      <div class="flex flex-col h-full w-full mx-auto">
        <Navigation
          user={data.user}
          notifications={data.notifications}
          notificationCount={data.notificationCount}
          signupClosed={data.signupClosed}
          isInTeam={data.isInTeam}
          userTeam={data.userTeam}
          realtimeEnabled={data.realtimeEnabled}
          formats={data.formats}
        />

        {#if data.announcements.length > 0 && !page.url.pathname.startsWith('/admin')}
          <div class={data.siteSettings?.backgroundImagePath ? 'bg-surface-page/50' : ''}>
            <AnnouncementBanner announcements={data.announcements} />
          </div>
        {/if}

        <div
          id="main-content"
          class="flex-grow overflow-y-auto {data.siteSettings?.backgroundImagePath
            ? 'bg-gradient-to-b from-zinc-950/50 via-zinc-900/30 to-zinc-950/50'
            : 'bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950'}"
        >
          {@render children()}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(html) {
    height: 100%;
    width: 100%;
    font-family: 'Inter', sans-serif;
  }

  :global(body) {
    height: 100%;
    overflow: hidden;
  }
</style>
