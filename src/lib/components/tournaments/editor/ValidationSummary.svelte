<script lang="ts">
  import type { ValidationIssue } from '$lib/types/tournament-editor';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { issues }: { issues: ValidationIssue[] } = $props();

  const errors = $derived(issues.filter((issue) => issue.severity === 'error').length);
  const warnings = $derived(issues.filter((issue) => issue.severity === 'warning').length);
</script>

<Card>
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h2 class="text-xl font-semibold text-white">Validation</h2>
    <div class="flex gap-2">
      <Badge color={errors > 0 ? 'red' : 'green'}>{errors} errors</Badge>
      <Badge color={warnings > 0 ? 'yellow' : 'zinc'}>{warnings} warnings</Badge>
    </div>
  </div>

  {#if issues.length === 0}
    <p class="text-sm text-success-400">The draft is structurally valid.</p>
  {:else}
    <ul class="space-y-3">
      {#each issues as issue (`${issue.path}:${issue.message}`)}
        <li class="rounded-lg border border-border-default bg-surface-input p-3">
          <div class="flex items-start gap-3">
            <Badge color={issue.severity === 'error' ? 'red' : 'yellow'}>
              {issue.severity}
            </Badge>
            <div class="min-w-0">
              <p class="text-sm text-text-label">{issue.message}</p>
              <p class="mt-1 break-all text-xs text-text-muted">{issue.path}</p>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</Card>
