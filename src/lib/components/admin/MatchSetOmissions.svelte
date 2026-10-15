<script lang="ts">
  import type { MatchSetOmission } from '#lib/types/matchSetDraft.js';

  let { omissions }: { omissions: MatchSetOmission[] } = $props();
</script>

{#if omissions.length > 0}
  <div class="mt-4 rounded-lg border border-warning-500/30 bg-warning-500/10 p-3">
    <p class="mb-2 text-sm font-medium text-warning-300">Left out of this match set</p>
    <ul class="space-y-2">
      {#each omissions as entry (entry.id)}
        <li class="text-sm text-text-body">
          <span class="font-medium text-white">{entry.name}</span>
          — {entry.reason}
        </li>
      {/each}
    </ul>
  </div>
{/if}
