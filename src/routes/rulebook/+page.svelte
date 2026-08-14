<script lang="ts">
  import { onMount } from 'svelte';
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import RulebookTOC from '$lib/components/markdown/RulebookTOC.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  interface TOCItem {
    id: string;
    text: string;
    level: number;
  }

  let tocItems = $state<TOCItem[]>([]);
  let activeId = $state('');

  // Parse headings from content to build TOC
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

  // Add IDs to headings in the rendered content
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

  // Track active section on scroll
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
    tocItems = parseHeadings(data.content);

    // Wait for markdown to render, then add IDs
    setTimeout(() => {
      addHeadingIds();
      const cleanup = setupScrollSpy();
      return cleanup;
    }, 100);
  });
</script>

<div>
  <PageHero
    title="Rulebook"
    subtitle="Official rules and regulations for MGE.tf"
    maxWidth="max-w-7xl"
    border
  />

  <!-- Content -->
  <div class="max-w-7xl mx-auto px-6 py-8">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <!-- Sidebar TOC -->
      <aside class="lg:col-span-3">
        <div class="lg:sticky lg:top-24">
          <RulebookTOC items={tocItems} {activeId} />
        </div>
      </aside>

      <!-- Main Content -->
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
