<script lang="ts">
  import {
    SIGNUP_CHECKBOX_CLASS,
    SIGNUP_SCOPE_ACK_FIELD,
    signupScopeAckLabel,
  } from '$lib/utils/signupAck';

  let {
    formatName,
    regions,
    selectedRegionId,
  }: {
    formatName: string;
    regions: Array<{ id: number; name: string; seasonNum: number }>;
    selectedRegionId: number | null;
  } = $props();

  const selectedRegion = $derived(regions.find((region) => region.id === selectedRegionId) ?? null);

  const label = $derived(
    signupScopeAckLabel({
      regionName: selectedRegion?.name,
      formatName,
      seasonNum: selectedRegion?.seasonNum,
    }),
  );
</script>

<div class="mb-6">
  <label for="signup-scope-ack" class="flex items-start gap-3 cursor-pointer">
    <input
      id="signup-scope-ack"
      type="checkbox"
      name={SIGNUP_SCOPE_ACK_FIELD}
      required
      class={SIGNUP_CHECKBOX_CLASS}
    />
    <span class="text-sm text-text-label">{label}</span>
  </label>
</div>
