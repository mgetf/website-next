<script lang="ts">
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import { getFormatThemeClasses } from '$lib/constants/formats';
  import { groupStaffByFormatAndRegion } from '$lib/utils/staffDisplay';

  type FormatOption = { id: number; name: string; themeKey: string };
  type RegionOption = { id: number; name: string };
  type DivisionOption = { id: number; name: string; regionId: number; regionName: string };

  let {
    assignments = $bindable([]),
    formats,
    regions,
    divisions,
    regionIdsByFormat,
  }: {
    assignments: { formatId: number; divisionId: number }[];
    formats: FormatOption[];
    regions: RegionOption[];
    divisions: DivisionOption[];
    regionIdsByFormat: Record<number, number[]>;
  } = $props();

  let addFormatId = $state('');
  let addRegionId = $state('');
  let addDivisionId = $state('');

  const addFilteredRegions = $derived(
    addFormatId
      ? regions.filter((region) =>
          (regionIdsByFormat[Number(addFormatId)] ?? []).includes(region.id),
        )
      : [],
  );

  const addFilteredDivisions = $derived(
    addFormatId && addRegionId
      ? divisions.filter(
          (division) =>
            division.regionId === Number(addRegionId) &&
            !assignments.some(
              (assignment) =>
                assignment.formatId === Number(addFormatId) &&
                assignment.divisionId === division.id,
            ),
        )
      : [],
  );

  const formatOptions = $derived(
    formats.map((format) => ({ value: String(format.id), label: format.name })),
  );
  const regionOptions = $derived(
    addFilteredRegions.map((region) => ({ value: String(region.id), label: region.name })),
  );
  const divisionOptions = $derived(
    addFilteredDivisions.map((division) => ({ value: String(division.id), label: division.name })),
  );

  const selectedAssignmentsInfo = $derived(
    assignments.map((assignment) => {
      const format = formats.find((item) => item.id === assignment.formatId);
      const division = divisions.find((item) => item.id === assignment.divisionId);
      return {
        formatId: assignment.formatId,
        divisionId: assignment.divisionId,
        formatName: format?.name ?? 'Unknown',
        regionName: division?.regionName ?? 'Unknown',
        divisionName: division?.name ?? 'Unknown',
      };
    }),
  );

  const selectedGrouped = $derived(groupStaffByFormatAndRegion(selectedAssignmentsInfo));

  function formatTheme(formatId: number) {
    const themeKey = formats.find((format) => format.id === formatId)?.themeKey;
    return getFormatThemeClasses(themeKey);
  }

  const regionPlaceholder = $derived(
    !addFormatId
      ? 'Pick a format first'
      : addFilteredRegions.length === 0
        ? 'No regions for this format'
        : 'Select region...',
  );

  const divisionPlaceholder = $derived(
    !addRegionId
      ? 'Pick a region first'
      : addFilteredDivisions.length === 0
        ? 'No divisions left'
        : 'Select division...',
  );

  function addStaffAssignment(formatId: number, divisionId: number) {
    if (
      !assignments.some(
        (assignment) => assignment.formatId === formatId && assignment.divisionId === divisionId,
      )
    ) {
      assignments = [...assignments, { formatId, divisionId }];
    }
    addRegionId = '';
    addDivisionId = '';
  }

  function removeStaffAssignment(formatId: number, divisionId: number) {
    assignments = assignments.filter(
      (assignment) => !(assignment.formatId === formatId && assignment.divisionId === divisionId),
    );
  }

  function removeFormatAssignments(formatId: number) {
    assignments = assignments.filter((assignment) => assignment.formatId !== formatId);
  }
</script>

<p class="block text-sm font-medium text-text-label mb-2">League assignments</p>

{#if selectedGrouped.length > 0}
  <div class="mb-3 space-y-3 rounded-lg border border-border-default bg-surface-input/50 p-3">
    {#each selectedGrouped as formatGroup (formatGroup.formatId)}
      {@const theme = formatTheme(formatGroup.formatId)}
      <div>
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <p class="text-xs font-semibold uppercase tracking-wide {theme.text400}">
            {formatGroup.formatName}
          </p>
          <button
            type="button"
            onclick={() => removeFormatAssignments(formatGroup.formatId)}
            class="text-[11px] font-medium text-text-muted hover:text-danger-400 transition-colors"
          >
            Clear
          </button>
        </div>
        <div class="space-y-1.5">
          {#each formatGroup.regions as regionGroup (regionGroup.regionName)}
            <div class="grid grid-cols-[2.75rem_1fr] items-start gap-x-2">
              <span class="pt-0.5 text-[11px] font-medium text-text-label">
                {regionGroup.regionName}
              </span>
              <div class="flex flex-wrap gap-1">
                {#each regionGroup.chips as chip (`${chip.formatId}:${chip.divisionId}`)}
                  <span
                    class="inline-flex items-center gap-0.5 rounded-full border border-border-input bg-surface-input py-0.5 pl-2 pr-0.5 text-xs text-white"
                  >
                    {chip.divisionName}
                    <button
                      type="button"
                      onclick={() => removeStaffAssignment(chip.formatId, chip.divisionId)}
                      class="rounded-full px-1 text-text-muted hover:text-danger-400 transition-colors"
                      aria-label="Remove {formatGroup.formatName} {regionGroup.regionName} {chip.divisionName}"
                    >
                      ×
                    </button>
                  </span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{:else}
  <p class="text-sm text-text-muted mb-3">No divisions assigned.</p>
{/if}

<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 [&>div]:mb-0">
  <FormSelect
    label="Format"
    name="addStaffFormat"
    bind:value={addFormatId}
    options={formatOptions}
    placeholder="Select format..."
    onChange={() => {
      addRegionId = '';
      addDivisionId = '';
    }}
  />
  <FormSelect
    label="Region"
    name="addStaffRegion"
    bind:value={addRegionId}
    options={regionOptions}
    placeholder={regionPlaceholder}
    disabled={!addFormatId || addFilteredRegions.length === 0}
    onChange={() => {
      addDivisionId = '';
    }}
  />
  <FormSelect
    label="Division"
    name="addStaffDivision"
    bind:value={addDivisionId}
    options={divisionOptions}
    placeholder={divisionPlaceholder}
    disabled={!addRegionId || addFilteredDivisions.length === 0}
    onChange={(value) => {
      if (value && addFormatId) {
        addStaffAssignment(Number(addFormatId), Number(value));
      }
    }}
  />
</div>
<p class="mt-2 text-sm text-text-muted">
  Format/region/division scope for league pages, Discord rules, and SourceBans servers.
</p>
