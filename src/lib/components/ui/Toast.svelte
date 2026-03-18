<script lang="ts">
  import type { ToastType } from '$lib/state/toast.svelte';

  let {
    type,
    message,
    dismissible = true,
    onDismiss,
  }: {
    type: ToastType;
    message: string;
    dismissible?: boolean;
    onDismiss?: () => void;
  } = $props();

  const typeStyles: Record<ToastType, { border: string; icon: string; iconColor: string }> = {
    success: {
      border: 'border-l-emerald-400',
      iconColor: 'text-emerald-400',
      icon: '✓',
    },
    error: {
      border: 'border-l-red-400',
      iconColor: 'text-red-400',
      icon: '✕',
    },
    info: {
      border: 'border-l-blue-400',
      iconColor: 'text-blue-400',
      icon: 'ℹ',
    },
    warning: {
      border: 'border-l-amber-400',
      iconColor: 'text-amber-400',
      icon: '⚠',
    },
  };

  const style = $derived(typeStyles[type]);
</script>

<div
  class="flex items-center gap-3 border-l-[3px] {style.border} bg-zinc-900/95 backdrop-blur-sm rounded-lg shadow-lg shadow-black/20 ring-1 ring-white/[0.06] max-w-sm px-4 py-3 animate-slide-up"
  role="alert"
>
  <span class="{style.iconColor} text-base flex-shrink-0 leading-none">{style.icon}</span>
  <p class="text-zinc-100 flex-1 text-sm font-medium leading-snug">{message}</p>
  {#if dismissible && onDismiss}
    <button
      onclick={onDismiss}
      class="text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0 ml-1"
      aria-label="Dismiss notification"
    >
      ✕
    </button>
  {/if}
</div>

<style>
  @keyframes slide-up {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  :global(.animate-slide-up) {
    animation: slide-up 0.3s ease-out;
  }
</style>
