<script lang="ts">
  import { onMount } from 'svelte';
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import RulebookTOC from '$lib/components/markdown/RulebookTOC.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { formatDateTime } from '$lib/utils/datetime';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  interface TOCItem {
    id: string;
    text: string;
    level: number;
  }

  let activeId = $state('');

  const tocItems = $derived(parseHeadings(data.content));

  function parseHeadings(markdown: string): TOCItem[] {
    const headingRegex = /^(#{1,4})\s+(.+)$/gm;
    const items: TOCItem[] = [];
    let match;

    while ((match = headingRegex.exec(markdown)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');

      items.push({ id, text, level });
    }

    return items;
  }

  function addHeadingIds() {
    const container = document.querySelector('.rulebook-content');
    if (!container) return;

    const headings = container.querySelectorAll('h1, h2, h3, h4');
    headings.forEach((heading) => {
      const text = heading.textContent || '';
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      heading.id = id;
    });
  }

  function setupScrollSpy() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            activeId = entry.target.id;
          }
        });
      },
      {
        rootMargin: '-20% 0px -70% 0px',
      },
    );

    const container = document.querySelector('.rulebook-content');
    if (!container) return;

    const headings = container.querySelectorAll('h1, h2, h3, h4');
    headings.forEach((heading) => {
      if (heading.id) {
        observer.observe(heading);
      }
    });

    return () => observer.disconnect();
  }

  onMount(() => {
    let disconnect: (() => void) | undefined;
    const timeout = setTimeout(() => {
      addHeadingIds();
      disconnect = setupScrollSpy();
    }, 100);

    return () => {
      clearTimeout(timeout);
      disconnect?.();
    };
  });
</script>

<div>
  <PageHero maxWidth="max-w-7xl" border>
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="text-5xl font-black text-white mb-2">Rulebook</h1>
        <p class="text-xl text-text-body">Official rules and regulations for MGE.tf</p>
      </div>
      <div class="flex flex-col items-start gap-2 sm:items-end">
        {#if data.updatedAt}
          <p class="text-sm text-text-muted">Last updated {formatDateTime(data.updatedAt)}</p>
        {/if}
        <Button variant="secondary" size="sm" href="/rulebook/history">Change history</Button>
      </div>
    </div>
  </PageHero>

  <div class="max-w-7xl mx-auto px-6 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <aside class="lg:col-span-3">
        <div class="lg:sticky lg:top-24">
          <RulebookTOC items={tocItems} {activeId} />
        </div>
      </aside>

      <main class="lg:col-span-9">
        <div
          class="rulebook-content bg-surface-card/80 backdrop-blur border border-border-default rounded-lg p-6 lg:p-10"
        >
          <MarkdownRenderer content={data.content} />
        </div>
      </main>
    </div>
  </div>
</div>
