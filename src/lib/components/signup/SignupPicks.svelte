<script lang="ts">
  import { goto } from '$app/navigation';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import SignupFeeLabel from '$lib/components/signup/SignupFeeLabel.svelte';
  import { signupPathForFormat } from '$lib/utils/signupPaths';
  import { FREE_DIVISION_ACK_FIELD, isFreeDivision } from '$lib/utils/signupDivision';
  import type { SignupFeeSummary } from '$lib/types/signupFee';

  type FormatOption = {
    id: number;
    name: string;
    code: string;
    isIndividual: boolean;
  };

  type RegionOption = {
    id: number;
    name: string;
    currencySymbol?: string;
  };

  type DivisionOption = {
    id: number;
    name: string;
    signupCost: number;
    regionId: number;
  };

  let {
    formats,
    regions,
    divisions,
    currentFormatId,
    fee,
    teamMode = 'create',
    regionLabel = 'Region',
  }: {
    formats: FormatOption[];
    regions: RegionOption[];
    divisions: DivisionOption[];
    currentFormatId: number;
    fee: SignupFeeSummary;
    teamMode?: 'create' | 'existing';
    regionLabel?: string;
  } = $props();

  let selectedRegionId = $state<number | null>(null);
  let divisionValue = $state('');

  const formatOptions = $derived(
    formats.map((format) => ({ value: format.id.toString(), label: format.name })),
  );

  const regionOptions = $derived(
    regions.map((region) => ({ value: region.id.toString(), label: region.name })),
  );

  const selectedRegion = $derived(regions.find((region) => region.id === selectedRegionId));

  const currencySymbol = $derived(selectedRegion?.currencySymbol ?? '$');

  const filteredDivisions = $derived(
    selectedRegionId ? divisions.filter((division) => division.regionId === selectedRegionId) : [],
  );

  const divisionOptions = $derived(
    filteredDivisions.map((division) => ({
      value: division.id.toString(),
      label: isFreeDivision(division.signupCost)
        ? `${division.name} - FREE`
        : `${division.name} - ${currencySymbol}${division.signupCost.toFixed(2)}`,
    })),
  );

  const selectedDivision = $derived(
    filteredDivisions.find((division) => division.id.toString() === divisionValue) ?? null,
  );

  const selectedIsFree = $derived(
    selectedDivision != null && isFreeDivision(selectedDivision.signupCost),
  );

  function handleFormatChange(value: string) {
    const format = formats.find((entry) => entry.id.toString() === value);
    if (!format || format.id === currentFormatId) return;
    void goto(signupPathForFormat(format, teamMode));
  }

  function handleRegionChange(value: string) {
    selectedRegionId = value ? parseInt(value) : null;
    divisionValue = '';
  }
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6">
  <FormSelect
    label="Format"
    name="formatId"
    value={currentFormatId.toString()}
    options={formatOptions}
    required
    onChange={handleFormatChange}
  />

  <FormSelect
    label={regionLabel}
    name="regionId"
    value={selectedRegionId?.toString() ?? ''}
    options={regionOptions}
    placeholder="Select Region"
    required
    onChange={handleRegionChange}
  />

  <FormSelect
    label="Division"
    name="divisionId"
    bind:value={divisionValue}
    options={divisionOptions}
    placeholder={!selectedRegionId ? 'Select a region first' : 'Select Division'}
    required
    disabled={!selectedRegionId}
  />
</div>

<p class="text-sm text-text-body -mt-2 mb-4">
  Pick a format, region, and division. You can fill out this form again to sign up for another
  format.
</p>

<SignupFeeLabel {fee} {selectedRegionId} align="start" class="mb-6" />

{#if selectedIsFree}
  <div class="mb-6 p-4 bg-warning-500/10 border border-warning-500/30 rounded-lg">
    <label class="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        name={FREE_DIVISION_ACK_FIELD}
        required
        class="mt-1 w-4 h-4 rounded border-border-input bg-surface-input text-primary-600 focus:ring-primary-500"
      />
      <span class="text-sm text-text-label">
        I understand I selected a free division. If administrators later place me in a paid
        division, I must pay to participate.
      </span>
    </label>
  </div>
{/if}
