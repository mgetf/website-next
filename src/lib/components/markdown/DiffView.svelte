<script lang="ts">
  import type { DiffHunk, DiffLineType } from '$lib/types/rulebook';
  import { formatHunkHeader } from '$lib/utils/textDiff';

  let { hunks }: { hunks: DiffHunk[] } = $props();

  function lineClass(type: DiffLineType): string {
    switch (type) {
      case 'added':
        return 'bg-success-600/15 text-success-400';
      case 'removed':
        return 'bg-danger-600/15 text-danger-400';
      default:
        return 'text-text-muted';
    }
  }

  function linePrefix(type: DiffLineType): string {
    switch (type) {
      case 'added':
        return '+';
      case 'removed':
        return '-';
      default:
        return ' ';
    }
  }
</script>

{#if hunks.length === 0}
  <p class="text-sm text-text-muted">No changes</p>
{:else}
  <div
    class="overflow-x-auto rounded-lg border border-border-default bg-surface-input font-mono text-xs"
  >
    {#each hunks as hunk, hunkIndex (hunkIndex)}
      <div class="border-b border-border-default last:border-b-0">
        <div class="bg-surface-hover px-3 py-1 text-text-muted">{formatHunkHeader(hunk)}</div>
        {#each hunk.lines as line, lineIndex (`${hunkIndex}-${lineIndex}`)}
          <div class="whitespace-pre-wrap px-3 py-0.5 {lineClass(line.type)}">
            {linePrefix(line.type)}{line.text}
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}
