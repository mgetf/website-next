<script lang="ts">
  import Tooltip from '#lib/components/ui/Tooltip.svelte';

  type StaffRole = 'ADMIN' | 'MODERATOR';

  let { role }: { role: StaffRole } = $props();

  const isAdmin = $derived(role === 'ADMIN');
  const label = $derived(isAdmin ? 'Admin' : 'Moderator');
</script>

<Tooltip text={label}>
  <svg
    class="size-3.5 shrink-0 {isAdmin ? 'text-staff-admin' : 'text-staff-moderator'}"
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-label={label}
    role="img"
  >
    <path
      fill-rule="evenodd"
      d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Z"
      clip-rule="evenodd"
    />
  </svg>
</Tooltip>
