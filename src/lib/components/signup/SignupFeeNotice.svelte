<script lang="ts">
  const mgePrices = [
    { region: 'NA', usd: '$10', keys: '6 keys' },
    { region: 'EU', usd: '$10', keys: '6 keys' },
    { region: 'Asia', usd: '$4', keys: '2 keys' },
    { region: 'AU', usd: '$10', keys: '6 keys' },
    { region: 'SA', usd: '$5', keys: '3 keys' },
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
      <div class="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-text-label">
        {#each mgePrices as { region, usd, keys } (region)}
          <span>
            <span class="font-semibold text-white">{region}</span>: {usd} / {keys}
          </span>
        {/each}
      </div>
      <p class="text-text-label">
        Newcomer division is <span class="font-semibold text-success-400">free</span> to enter!
      </p>
    </div>
  </div>
</div>
