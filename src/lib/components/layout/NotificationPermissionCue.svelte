<script lang="ts">
  import { fade } from 'svelte/transition';
  import { notificationPermissionCue } from '#lib/state/notificationPermissionCue.svelte.js';
</script>

{#if notificationPermissionCue.visible}
  <!-- Chrome hangs this bubble from the address bar, over the top-left of the page. -->
  <div
    class="pointer-events-none fixed inset-0 z-[80] bg-black/45 backdrop-blur-sm"
    role="status"
    in:fade={{ duration: 180 }}
  >
    <div
      class="absolute top-[7.75rem] left-[14.5rem] flex w-44 flex-col items-center gap-1.5 text-center"
    >
      <svg
        class="permission-arrow h-16 w-10 text-white drop-shadow-md"
        viewBox="0 0 48 72"
        fill="none"
        aria-hidden="true"
      >
        <path d="M24 66 V11" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        <path
          d="M8 30 L24 8 L40 30"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <p class="text-sm font-medium text-white drop-shadow-md">Allow notifications</p>
      <p class="text-xs text-white/80 drop-shadow-md">Your browser is asking up here.</p>
    </div>
  </div>
{/if}

<style>
  .permission-arrow {
    animation: permission-nudge 1.15s ease-in-out infinite;
  }

  @keyframes permission-nudge {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-0.55rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .permission-arrow {
      animation: none;
    }
  }
</style>
