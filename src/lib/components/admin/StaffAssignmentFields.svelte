<script lang="ts">
  import Button from '#lib/components/ui/Button.svelte';
  import FormSelect from '#lib/components/ui/form/FormSelect.svelte';
  import { getFormatThemeClasses } from '#lib/constants/formats.js';
  import type { StaffAssignmentScope } from '#lib/types/staff.js';
  import {
    filterDivisionsByRegionAndFormat,
    filterFormatsByRegion,
  } from '#lib/utils/leagueScope.js';
  import {
    ALL_DIVISIONS_LABEL,
    ALL_FORMATS_LABEL,
    groupStaffByRegionAndFormat,
  } from '#lib/utils/staffDisplay.js';
  import { collapseStaffAssignments } from '#lib/utils/staffScope.js';

  type FormatOption = { id: number; name: string; themeKey: string };
  type RegionOption = { id: number; name: string };
  type DivisionOption = {
    id: number;
    name: string;
    regionId: number;
    regionName: string;
    formatId: number;
  };

  let {
    assignments = $bindable([]),
    formats,
    regions,
    divisions,
    regionIdsByFormat,
  }: {
    assignments: StaffAssignmentScope[];
    formats: FormatOption[];
    regions: RegionOption[];
    divisions: DivisionOption[];
    regionIdsByFormat: Record<number, number[]>;
  } = $props();

  let addRegionId = $state('');
  let addFormatId = $state('');
  let addDivisionId = $state('');

  const addFilteredFormats = $derived(
    addRegionId ? filterFormatsByRegion(formats, addRegionId, regionIdsByFormat) : [],
  );

  const addFilteredDivisions = $derived(
    addRegionId && addFormatId
      ? filterDivisionsByRegionAndFormat(divisions, addRegionId, addFormatId)
      : [],
  );

  const regionOptions = $derived(
    regions.map((region) => ({ value: String(region.id), label: region.name })),
  );
  const formatOptions = $derived(
    addFilteredFormats.map((format) => ({ value: String(format.id), label: format.name })),
  );
  const divisionOptions = $derived(
    addFilteredDivisions.map((division) => ({ value: String(division.id), label: division.name })),
  );

  const selectedAssignmentsInfo = $derived(
    assignments.map((assignment) => {
      const region = regions.find((item) => item.id === assignment.regionId);
      const format =
        assignment.formatId != null
          ? formats.find((item) => item.id === assignment.formatId)
          : null;
      const division =
        assignment.divisionId != null
          ? divisions.find((item) => item.id === assignment.divisionId)
          : null;
      return {
        regionId: assignment.regionId,
        regionName: region?.name ?? 'Unknown',
        formatId: assignment.formatId,
        formatName: format?.name ?? null,
        divisionId: assignment.divisionId,
        divisionName: division?.name ?? null,
      };
    }),
  );

  const selectedGrouped = $derived(groupStaffByRegionAndFormat(selectedAssignmentsInfo));

  function formatTheme(formatId: number | null) {
    const themeKey =
      formatId == null ? undefined : formats.find((format) => format.id === formatId)?.themeKey;
    return getFormatThemeClasses(themeKey);
  }

  const formatPlaceholder = $derived(
    !addRegionId
      ? 'Pick a region first'
      : addFilteredFormats.length === 0
        ? 'No formats for this region'
        : ALL_FORMATS_LABEL,
  );

  const divisionPlaceholder = $derived(
    !addFormatId
      ? ALL_DIVISIONS_LABEL
      : addFilteredDivisions.length === 0
        ? 'No divisions'
        : ALL_DIVISIONS_LABEL,
  );

  function addStaffAssignment() {
    if (!addRegionId) return;
    assignments = collapseStaffAssignments([
      ...assignments,
      {
        regionId: Number(addRegionId),
        formatId: addFormatId ? Number(addFormatId) : null,
        divisionId: addDivisionId ? Number(addDivisionId) : null,
      },
    ]);
    addFormatId = '';
    addDivisionId = '';
  }

  function removeStaffAssignment(
    regionId: number,
    formatId: number | null,
    divisionId: number | null,
  ) {
    assignments = assignments.filter(
      (assignment) =>
        !(
          assignment.regionId === regionId &&
          assignment.formatId === formatId &&
          assignment.divisionId === divisionId
        ),
    );
  }

  function removeRegionAssignments(regionId: number) {
    assignments = assignments.filter((assignment) => assignment.regionId !== regionId);
  }
</script>

<p class="block text-sm font-medium text-text-label mb-2">League assignments</p>

{#if selectedGrouped.length > 0}
  <div class="mb-3 space-y-3 rounded-lg border border-border-default bg-surface-input/50 p-3">
    {#each selectedGrouped as regionGroup (regionGroup.regionId)}
      <div>
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-text-label">
            {regionGroup.regionName}
          </p>
          <button
            type="button"
            onclick={() => removeRegionAssignments(regionGroup.regionId)}
            class="text-[11px] font-medium text-text-muted hover:text-danger-400 transition-colors"
          >
            Clear
          </button>
        </div>
        <div class="space-y-1.5">
          {#each regionGroup.formats as formatGroup (`${regionGroup.regionId}:${formatGroup.formatId ?? 'all'}`)}
            {@const theme = formatTheme(formatGroup.formatId)}
            <div class="grid grid-cols-[2.75rem_1fr] items-start gap-x-2">
              <span class="pt-0.5 text-[11px] font-medium {theme.text400}">
                {formatGroup.formatId == null ? 'All' : formatGroup.formatName}
              </span>
              <div class="flex flex-wrap gap-1">
                {#each formatGroup.chips as chip (`${chip.regionId}:${chip.formatId ?? ''}:${chip.divisionId ?? ''}`)}
                  <span
                    class="inline-flex items-center gap-0.5 rounded-full border border-border-input bg-surface-input py-0.5 pl-2 pr-0.5 text-xs text-white"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onclick={() =>
                        removeStaffAssignment(chip.regionId, chip.formatId, chip.divisionId)}
                      class="rounded-full px-1 text-text-muted hover:text-danger-400 transition-colors"
                      aria-label="Remove {regionGroup.regionName} {chip.label}"
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
  <p class="text-sm text-text-muted mb-3">No regions assigned.</p>
{/if}

<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 [&>div]:mb-0">
  <FormSelect
    label="Region"
    name="addStaffRegion"
    bind:value={addRegionId}
    options={regionOptions}
    placeholder="Select region..."
    onChange={() => {
      addFormatId = '';
      addDivisionId = '';
    }}
  />
  <FormSelect
    label="Format"
    name="addStaffFormat"
    bind:value={addFormatId}
    options={formatOptions}
    placeholder={formatPlaceholder}
    disabled={!addRegionId || addFilteredFormats.length === 0}
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
    disabled={!addFormatId || addFilteredDivisions.length === 0}
  />
</div>
<div class="mt-3">
  <Button
    type="button"
    variant="secondary"
    size="sm"
    disabled={!addRegionId}
    onclick={addStaffAssignment}
  >
    Add
  </Button>
</div>
<p class="mt-2 text-sm text-text-muted">
  Region is required. Format and division are optional; leave them as All to cover every league in
  that region.
</p>
