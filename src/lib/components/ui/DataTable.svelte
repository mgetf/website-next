<script lang="ts" module>
  export type Column = {
    key: string;
    label: string;
    align?: 'left' | 'center' | 'right';
    width?: string;
    srOnly?: boolean;
  };
</script>

<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import Paginator from './Paginator.svelte';

  type PaginationConfig = {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    infoText?: string;
  };

  let {
    data,
    columns,
    cell,
    emptyMessage = 'No data found',
    emptyIcon = '',
    pagination,
    onRowClick,
    rowClass,
    headerClass = '',
    compact = false,
    expandedRow,
    expandedContent,
  }: {
    data: T[];
    columns: Column[];
    cell: Snippet<[T, Column]>;
    emptyMessage?: string;
    emptyIcon?: string;
    pagination?: PaginationConfig;
    onRowClick?: (row: T) => void;
    rowClass?: (row: T) => string;
    headerClass?: string;
    compact?: boolean;
    expandedRow?: (row: T) => boolean;
    expandedContent?: Snippet<[T]>;
  } = $props();

  function getAlignClass(align?: 'left' | 'center' | 'right'): string {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      default:
        return 'text-left';
    }
  }

  function handleRowClick(row: T) {
    if (onRowClick) {
      onRowClick(row);
    }
  }

  const cellPadding = $derived(compact ? 'px-4 py-1.5' : 'px-4 py-3');
  const headPadding = $derived(compact ? 'px-4 py-2' : 'px-4 py-3');
</script>

{#if data.length === 0}
  <div class="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-lg py-12 text-center">
    {#if emptyIcon}
      <div class="text-5xl mb-4">{emptyIcon}</div>
    {/if}
    <p class="text-gray-400">{emptyMessage}</p>
  </div>
{:else}
  <div class="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-lg overflow-hidden">
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="{headerClass || 'bg-zinc-900/80'} border-b border-zinc-800">
          <tr>
            {#each columns as col}
              <th
                scope="col"
                class="{headPadding} text-sm font-semibold text-gray-300 {getAlignClass(col.align)}"
                style={col.width ? `width: ${col.width}` : undefined}
              >
                {#if col.srOnly}
                  <span class="sr-only">{col.label}</span>
                {:else}
                  {col.label}
                {/if}
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800">
          {#each data as row}
            <tr
              class="hover:bg-zinc-800/50 transition-colors {onRowClick
                ? 'cursor-pointer'
                : ''} {rowClass ? rowClass(row) : ''}"
              onclick={() => handleRowClick(row)}
            >
              {#each columns as col}
                <td class="{cellPadding} {getAlignClass(col.align)}">
                  {@render cell(row, col)}
                </td>
              {/each}
            </tr>
            {#if expandedRow?.(row) && expandedContent}
              <tr class="bg-zinc-800/30">
                <td colspan={columns.length} class="px-4 py-3">
                  {@render expandedContent(row)}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  {#if pagination && pagination.totalPages > 1}
    <div class="mt-6">
      <Paginator
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        onPageChange={pagination.onPageChange}
        infoText={pagination.infoText}
      />
    </div>
  {/if}
{/if}
