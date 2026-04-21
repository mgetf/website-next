<script lang="ts">
  import type { ServerStatus } from '$lib/types/servers';

  let { status }: { status: ServerStatus } = $props();

  type StatusConfig = {
    dot: string;
    label: string;
    text: string;
    pulse: boolean;
  };

  const configs: Record<ServerStatus, StatusConfig> = {
    running: {
      dot: 'bg-success-500',
      label: 'Running',
      text: 'text-success-400',
      pulse: false,
    },
    restarting: {
      dot: 'bg-warning-500',
      label: 'Restarting',
      text: 'text-warning-400',
      pulse: true,
    },
    stopped: {
      dot: 'bg-zinc-500',
      label: 'Stopped',
      text: 'text-text-muted',
      pulse: false,
    },
    missing: {
      dot: 'bg-danger-500',
      label: 'Missing',
      text: 'text-danger-400',
      pulse: false,
    },
    unknown: {
      dot: 'bg-danger-500',
      label: 'Unknown',
      text: 'text-danger-400',
      pulse: false,
    },
  };

  const cfg = $derived(configs[status] ?? configs.unknown);
</script>

<span class="inline-flex items-center gap-1.5" aria-label="Status: {cfg.label}">
  <span class="relative flex h-2 w-2 shrink-0">
    {#if cfg.pulse}
      <span
        class="animate-ping absolute inline-flex h-full w-full rounded-full {cfg.dot} opacity-60"
      ></span>
    {/if}
    <span class="relative inline-flex rounded-full h-2 w-2 {cfg.dot}"></span>
  </span>
  <span class="text-xs font-medium {cfg.text}">{cfg.label}</span>
</span>
