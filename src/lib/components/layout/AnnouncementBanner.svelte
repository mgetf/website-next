<script lang="ts">
  import { onMount } from 'svelte';

  type Props = {
    announcements: Array<{
      id: number;
      content: string;
      visible: number;
    }>;
  };

  let { announcements }: Props = $props();

  const COOKIE_NAME = 'dismissed_announcements';
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

  let dismissedIds = $state<Set<number>>(new Set());
  let mounted = $state(false);

  function getDismissedFromCookie(): Set<number> {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
    if (!match) return new Set();
    try {
      const ids = match[1]
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n));
      return new Set(ids);
    } catch {
      return new Set();
    }
  }

  function saveDismissedToCookie(ids: Set<number>) {
    const value = [...ids].join(',');
    document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  function dismiss(id: number) {
    dismissedIds = new Set([...dismissedIds, id]);
    saveDismissedToCookie(dismissedIds);
  }

  onMount(() => {
    dismissedIds = getDismissedFromCookie();
    mounted = true;
  });

  let visibleAnnouncements = $derived(
    announcements.filter((a) => a.visible === 1 && !dismissedIds.has(a.id)),
  );
</script>

{#if mounted && visibleAnnouncements.length > 0}
  <div class="w-full px-3 sm:px-4 py-2 sm:py-4 space-y-2">
    <div class="max-w-7xl mx-auto space-y-2">
      {#each visibleAnnouncements as announcement (announcement.id)}
        <div
          class="relative bg-gradient-to-r from-red-800/90 to-red-600/80 rounded-lg px-4 py-3 pr-10 border border-red-700/50"
        >
          <p class="text-gray-100 text-center text-sm sm:text-base font-medium">
            {announcement.content}
          </p>
          <button
            onclick={() => dismiss(announcement.id)}
            class="absolute top-2 right-2 p-1 rounded-md text-red-200/70 hover:text-white hover:bg-red-700/50 transition-colors"
            aria-label="Dismiss announcement"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="size-4"
            >
              <path
                d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
              />
            </svg>
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}
