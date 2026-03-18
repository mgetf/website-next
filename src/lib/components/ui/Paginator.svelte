<script lang="ts">
  let {
    currentPage,
    totalPages,
    onPageChange,
    showInfo = true,
    infoText = '',
  }: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    showInfo?: boolean;
    infoText?: string;
  } = $props();

  const pageNumbers = $derived.by(() => {
    const pages: (number | '...')[] = [];

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      for (
        let i = Math.max(2, currentPage - 1);
        i <= Math.min(totalPages - 1, currentPage + 1);
        i++
      ) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  });

  function handlePrevious() {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  }

  function handleNext() {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  }

  function handlePageClick(page: number | '...') {
    if (page !== '...') {
      onPageChange(page);
    }
  }
</script>

{#if totalPages > 1}
  <div class="flex items-center justify-between">
    {#if showInfo && infoText}
      <div class="text-sm text-gray-400">
        {infoText}
      </div>
    {:else}
      <div></div>
    {/if}

    <div class="flex items-center gap-2">
      <button
        onclick={handlePrevious}
        disabled={currentPage === 1}
        class="px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-gray-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-sm"
      >
        Previous
      </button>

      <div class="flex items-center gap-1">
        {#each pageNumbers as pageNum}
          {#if pageNum === '...'}
            <span class="px-2 text-gray-500">...</span>
          {:else}
            <button
              onclick={() => handlePageClick(pageNum)}
              class="px-3 py-1.5 rounded-lg transition-colors text-sm {pageNum === currentPage
                ? 'bg-orange-600 text-white font-medium'
                : 'bg-zinc-800 border border-zinc-700 text-gray-300 hover:bg-zinc-700'}"
            >
              {pageNum}
            </button>
          {/if}
        {/each}
      </div>

      <button
        onclick={handleNext}
        disabled={currentPage === totalPages}
        class="px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-gray-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-sm"
      >
        Next
      </button>
    </div>
  </div>
{/if}
