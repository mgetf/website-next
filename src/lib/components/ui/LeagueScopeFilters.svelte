<script lang="ts">
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import {
    filterDivisionsByRegionAndFormat,
    filterRegionsByFormat,
    type DivisionScopeOption,
    type ScopeOption,
  } from '$lib/utils/leagueScope';

  let {
    formats,
    regions,
    divisions,
    regionIdsByFormat = {},
    formatId = $bindable(''),
    regionId = $bindable(''),
    divisionId = $bindable(''),
    showFormat = true,
    onChange,
  }: {
    formats: ScopeOption[];
    regions: ScopeOption[];
    divisions: DivisionScopeOption[];
    regionIdsByFormat?: Record<number, number[]>;
    formatId?: string;
    regionId?: string;
    divisionId?: string;
    showFormat?: boolean;
    onChange?: (next: { formatId: string; regionId: string; divisionId: string }) => void;
  } = $props();

  const formatOptions = $derived(
    formats.map((format) => ({ value: String(format.id), label: format.name })),
  );

  const filteredRegions = $derived(filterRegionsByFormat(regions, formatId, regionIdsByFormat));
  const regionOptions = $derived(
    filteredRegions.map((region) => ({ value: String(region.id), label: region.name })),
  );

  const filteredDivisions = $derived(
    filterDivisionsByRegionAndFormat(divisions, regionId, formatId),
  );
  const divisionOptions = $derived(
    filteredDivisions.map((division) => ({ value: String(division.id), label: division.name })),
  );

  const regionDisabled = $derived(showFormat && formatId !== '' && filteredRegions.length === 0);
  const divisionDisabled = $derived(!regionId || filteredDivisions.length === 0);

  const regionAllLabel = $derived(
    showFormat && !formatId
      ? 'All Regions'
      : regionDisabled
        ? 'No regions for this format'
        : 'All Regions',
  );

  const divisionAllLabel = $derived(!regionId ? 'Pick a region first' : 'All Divisions');

  function emit(next: { formatId: string; regionId: string; divisionId: string }) {
    onChange?.(next);
  }

  function onFormatChange(value: string) {
    formatId = value;
    regionId = '';
    divisionId = '';
    emit({ formatId: value, regionId: '', divisionId: '' });
  }

  function onRegionChange(value: string) {
    regionId = value;
    divisionId = '';
    emit({ formatId, regionId: value, divisionId: '' });
  }

  function onDivisionChange(value: string) {
    divisionId = value;
    emit({ formatId, regionId, divisionId: value });
  }
</script>

{#if showFormat}
  <div class="md:w-40">
    <div class="block text-sm font-medium text-text-body mb-2">Format</div>
    <SelectFilter
      value={formatId}
      options={formatOptions}
      allLabel="All Formats"
      onChange={onFormatChange}
    />
  </div>
{/if}

<div class="md:w-40">
  <div class="block text-sm font-medium text-text-body mb-2">Region</div>
  <SelectFilter
    value={regionId}
    options={regionOptions}
    allLabel={regionAllLabel}
    disabled={regionDisabled}
    onChange={onRegionChange}
  />
</div>

<div class="md:w-44">
  <div class="block text-sm font-medium text-text-body mb-2">Division</div>
  <SelectFilter
    value={divisionId}
    options={divisionOptions}
    allLabel={divisionAllLabel}
    disabled={divisionDisabled}
    onChange={onDivisionChange}
  />
</div>
