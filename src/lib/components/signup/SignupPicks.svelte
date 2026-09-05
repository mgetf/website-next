<script lang="ts">
  import { goto } from '$app/navigation';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import SignupFeeNotice from '$lib/components/signup/SignupFeeNotice.svelte';
  import { signupPathForFormat } from '$lib/utils/signupPaths';

  type FormatOption = {
    id: number;
    name: string;
    code: string;
    isIndividual: boolean;
  };

  type RegionOption = {
    id: number;
    name: string;
  };

  let {
    formats,
    regions,
    currentFormatId,
    teamMode = 'create',
    regionLabel = 'Region',
  }: {
    formats: FormatOption[];
    regions: RegionOption[];
    currentFormatId: number;
    teamMode?: 'create' | 'existing';
    regionLabel?: string;
  } = $props();

  let selectedRegionId = $state<number | null>(null);

  const formatOptions = $derived(
    formats.map((format) => ({ value: format.id.toString(), label: format.name })),
  );

  const regionOptions = $derived(
    regions.map((region) => ({ value: region.id.toString(), label: region.name })),
  );

  function handleFormatChange(value: string) {
    const format = formats.find((entry) => entry.id.toString() === value);
    if (!format || format.id === currentFormatId) return;
    void goto(signupPathForFormat(format, teamMode));
  }

  function handleRegionChange(value: string) {
    selectedRegionId = value ? parseInt(value) : null;
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
</div>

<p class="text-sm text-text-body -mt-2 mb-6">
  Pick any format and region combination. You can fill out this form again to sign up for another
  format.
</p>

<SignupFeeNotice />
