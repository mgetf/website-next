<script lang="ts">
  import Tooltip from '#lib/components/ui/Tooltip.svelte';
  import { ALL_DIVISIONS_LABEL, ALL_FORMATS_LABEL } from '#lib/utils/staffDisplay.js';

  type StaffRole = 'ADMIN' | 'MODERATOR';

  type StaffAssignment = {
    formatName: string | null;
    divisionName: string | null;
    regionName: string;
  };

  type RegionGroup = {
    regionName: string;
    formats: { formatName: string; divisions: string[] }[];
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

  function groupAssignments(items: StaffAssignment[]): RegionGroup[] {
    const regions: RegionGroup[] = [];
    for (const item of items) {
      let region = regions.find((row) => row.regionName === item.regionName);
      if (!region) {
        region = { regionName: item.regionName, formats: [] };
        regions.push(region);
      }
      const formatName = item.formatName ?? ALL_FORMATS_LABEL;
      let format = region.formats.find((row) => row.formatName === formatName);
      if (!format) {
        format = { formatName, divisions: [] };
        region.formats.push(format);
      }
      if (item.formatName == null) continue;
      const divisionName = item.divisionName ?? ALL_DIVISIONS_LABEL;
      if (!format.divisions.includes(divisionName)) {
        format.divisions.push(divisionName);
      }
    }
    return regions;
  }
</script>

<Tooltip>
  {#snippet content()}
    {#if groups.length === 0}
      <p class="mt-1.5 text-xs text-text-body">No regions assigned</p>
    {:else}
      <div class="mt-2 space-y-2">
        {#each groups as group (group.regionName)}
          <div>
            <p class="text-xs font-semibold text-text-heading">{group.regionName}</p>
            {#each group.formats as format (`${group.regionName}-${format.formatName}`)}
              <p class="text-xs text-text-body">
                {format.formatName}{#if format.divisions.length > 0}<span class="text-text-muted">
                    · {format.divisions.join(', ')}</span
                  >{/if}
              </p>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  {/snippet}
  <span
    aria-label="{label}. Hover for assigned regions"
    class="inline-flex cursor-help items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold {isAdmin
      ? 'border-staff-admin/40 bg-staff-admin/20 text-staff-admin shadow-[0_0_10px_color-mix(in_oklab,var(--color-staff-admin)_25%,transparent)]'
      : 'border-staff-moderator/40 bg-staff-moderator/20 text-staff-moderator shadow-[0_0_10px_color-mix(in_oklab,var(--color-staff-moderator)_30%,transparent)]'}"
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
