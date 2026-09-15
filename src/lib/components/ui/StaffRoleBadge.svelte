<script lang="ts">
  import Tooltip from '$lib/components/ui/Tooltip.svelte';

  type StaffRole = 'ADMIN' | 'MODERATOR';

  type StaffAssignment = {
    formatName: string;
    divisionName: string;
    regionName: string;
  };

  type FormatGroup = {
    formatName: string;
    regions: { regionName: string; divisions: string[] }[];
  };

  let {
    role,
    assignments = [],
  }: {
    role: StaffRole;
    assignments?: StaffAssignment[];
  } = $props();

  const isAdmin = $derived(role === 'ADMIN');
  const label = $derived(isAdmin ? 'Admin' : 'Moderator');
  const groups = $derived(groupAssignments(assignments));

  function groupAssignments(items: StaffAssignment[]): FormatGroup[] {
    const formats: FormatGroup[] = [];
    for (const item of items) {
      let format = formats.find((row) => row.formatName === item.formatName);
      if (!format) {
        format = { formatName: item.formatName, regions: [] };
        formats.push(format);
      }
      let region = format.regions.find((row) => row.regionName === item.regionName);
      if (!region) {
        region = { regionName: item.regionName, divisions: [] };
        format.regions.push(region);
      }
      if (!region.divisions.includes(item.divisionName)) {
        region.divisions.push(item.divisionName);
      }
    }
    return formats;
  }
</script>

<Tooltip>
  {#snippet content()}
    {#if groups.length === 0}
      <p class="mt-1.5 text-xs text-text-body">No divisions assigned</p>
    {:else}
      <div class="mt-2 space-y-2">
        {#each groups as group (group.formatName)}
          <div>
            <p class="text-xs font-semibold text-white">{group.formatName}</p>
            {#each group.regions as region (`${group.formatName}-${region.regionName}`)}
              <p class="text-xs text-text-body">
                {region.regionName}<span class="text-text-muted">
                  · {region.divisions.join(', ')}</span
                >
              </p>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  {/snippet}
  <span
    aria-label="{label}. Hover for assigned divisions"
    class="inline-flex cursor-help items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold {isAdmin
      ? 'border-staff-admin/40 bg-staff-admin/20 text-staff-admin shadow-[0_0_10px_rgba(169,201,255,0.25)]'
      : 'border-staff-moderator/40 bg-staff-moderator/20 text-staff-moderator shadow-[0_0_10px_rgba(155,89,182,0.3)]'}"
  >
    <svg class="size-3 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill-rule="evenodd"
        d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 0 0-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08Z"
        clip-rule="evenodd"
      />
    </svg>
    {label}
  </span>
</Tooltip>
