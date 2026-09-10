<script lang="ts">
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import SignupFeeLabel from '$lib/components/signup/SignupFeeLabel.svelte';
  import { isFreeDivision, needsFreeDivisionAcknowledgment } from '$lib/utils/signupDivision';
  import type { SignupFeeSummary } from '$lib/types/signupFee';

  type RegionOption = {
    id: number;
    name: string;
    currencySymbol?: string;
    seasonNum: number;
  };

  type DivisionOption = {
    id: number;
    name: string;
    signupCost: number;
    regionId: number;
  };

  let {
    regions,
    divisions,
    fee,
    regionLabel = 'Region',
    selectedRegionId = $bindable<number | null>(null),
    needsFreeDivisionAck = $bindable(false),
  }: {
    regions: RegionOption[];
    divisions: DivisionOption[];
    fee: SignupFeeSummary;
    regionLabel?: string;
    selectedRegionId?: number | null;
    needsFreeDivisionAck?: boolean;
  } = $props();

  let divisionValue = $state('');

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

  function syncFreeDivisionAck(divisionId: string) {
    const selected = filteredDivisions.find((division) => division.id.toString() === divisionId);
    needsFreeDivisionAck = needsFreeDivisionAcknowledgment(
      selected?.signupCost,
      filteredDivisions.map((division) => division.signupCost),
    );
  }

  function handleRegionChange(value: string) {
    selectedRegionId = value ? parseInt(value) : null;
    divisionValue = '';
    syncFreeDivisionAck('');
  }
</script>

<div class="grid grid-cols-1 md:grid-cols-2 gap-x-6">
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
    onChange={syncFreeDivisionAck}
  />
</div>

<p class="text-sm text-text-body -mt-2 mb-4">Pick a region and division.</p>

<SignupFeeLabel {fee} {selectedRegionId} align="start" class="mb-6" />
