<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';

  const mgePrices = [
    { region: 'NA', amount: '$10' },
    { region: 'EU', amount: '$10' },
    { region: 'Asia', amount: '$4' },
    { region: 'AU', amount: '$10' },
    { region: 'SA', amount: '$5' },
  ] as const;
</script>

<div class="mb-6 p-4 bg-warning-500/10 border border-warning-500/40 rounded-lg text-left">
  <h4 class="text-warning-400 font-semibold mb-3">Signup fees</h4>

  <div class="space-y-4 text-sm">
    <div>
      <p class="font-semibold text-white mb-1">Ultiduo &amp; BBall</p>
      <p class="text-text-label">
        <span class="font-semibold text-success-400">Free</span> to enter this season!
      </p>
    </div>

    <div>
      <p class="font-semibold text-white mb-2">MGE 1v1 &amp; 2v2</p>
      <div class="flex flex-wrap gap-2 mb-2">
        {#each mgePrices as { region, amount } (region)}
          <Badge color="zinc">{region}: {amount}</Badge>
        {/each}
      </div>
      <p class="text-text-label">
        Newcomer division is <span class="font-semibold text-success-400">free</span> to enter!
      </p>
    </div>
  </div>
</div>
