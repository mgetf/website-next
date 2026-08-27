<script lang="ts">
  import Markdown from 'svelte-exmarkdown';
  import { gfmPlugin } from 'svelte-exmarkdown/gfm';
  import rehypeRaw from 'rehype-raw';
  import type { HTMLImgAttributes } from 'svelte/elements';
  import { rehypeSanitizeUrls } from '$lib/utils/markdownSanitize';

  interface Props {
    content: string;
    class?: string;
  }

  let { content, class: className = '' }: Props = $props();

  // Pass the plugin factory (not the return value) — unified calls it as an attacher.
  // rehypeRaw turns embedded raw HTML (e.g. the `<br />` Milkdown emits for blank
  // lines) into real elements instead of literal escaped text.
  const plugins = [gfmPlugin(), { rehypePlugin: rehypeRaw }, { rehypePlugin: rehypeSanitizeUrls }];
</script>

{#snippet imgWithCaption(props: HTMLImgAttributes)}
  {#if props.title}
    <figure class="markdown-image-figure">
      <img src={props.src} alt={props.title} />
      <figcaption>{props.title}</figcaption>
    </figure>
  {:else}
    <img src={props.src} alt={props.alt ?? ''} />
  {/if}
{/snippet}

<div class="markdown-content max-w-none {className}">
  <Markdown md={content} {plugins} img={imgWithCaption} />
</div>

<style>
  .markdown-content :global(h1) {
    font-size: 2rem;
    font-weight: 800;
    color: white;
    margin-top: 2rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--color-border-default);
  }

  .markdown-content :global(h2) {
    font-size: 1.5rem;
    font-weight: 700;
    color: white;
    margin-top: 1.75rem;
    margin-bottom: 0.75rem;
  }

  .markdown-content :global(h3) {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-zinc-200);
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .markdown-content :global(h4) {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-zinc-300);
    margin-top: 1.25rem;
    margin-bottom: 0.5rem;
  }

  .markdown-content :global(p) {
    color: var(--color-zinc-400);
    line-height: 1.75;
    margin-bottom: 1rem;
  }

  .markdown-content :global(ul) {
    list-style-type: disc;
    color: var(--color-zinc-400);
    margin-left: 1.5rem;
    margin-bottom: 1rem;
  }

  .markdown-content :global(ol) {
    list-style-type: decimal;
    color: var(--color-zinc-400);
    margin-left: 1.5rem;
    margin-bottom: 1rem;
  }

  .markdown-content :global(li) {
    display: list-item;
    margin-bottom: 0.25rem;
  }

  .markdown-content :global(li)::marker {
    color: var(--color-zinc-500);
  }

  .markdown-content :global(a) {
    color: var(--color-blue-400);
    text-decoration: underline;
    transition: color 0.15s;
  }

  .markdown-content :global(a:hover) {
    color: var(--color-blue-300);
  }

  .markdown-content :global(code) {
    background: var(--color-surface-input);
    color: var(--color-zinc-100);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
  }

  .markdown-content :global(pre) {
    background: var(--color-surface-page);
    border: 1px solid var(--color-border-default);
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
    margin-bottom: 1rem;
  }

  .markdown-content :global(pre code) {
    background: transparent;
    padding: 0;
  }

  .markdown-content :global(blockquote) {
    border-left: 4px solid var(--color-blue-500);
    padding-left: 1rem;
    margin-left: 0;
    color: var(--color-zinc-400);
    font-style: italic;
    margin-bottom: 1rem;
  }

  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border-default);
    margin: 2rem 0;
  }

  .markdown-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1rem;
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    border: 1px solid var(--color-border-default);
    padding: 0.5rem 0.75rem;
    text-align: left;
  }

  .markdown-content :global(th) {
    background: var(--color-surface-input);
    color: white;
    font-weight: 600;
  }

  .markdown-content :global(td) {
    color: var(--color-zinc-400);
  }

  .markdown-content :global(img) {
    max-width: 100%;
    border-radius: 0.5rem;
  }

  .markdown-content :global(.markdown-image-figure) {
    margin-bottom: 1rem;
  }

  .markdown-content :global(.markdown-image-figure img) {
    margin-bottom: 0;
  }

  .markdown-content :global(.markdown-image-figure figcaption) {
    margin-top: 0.5rem;
    color: var(--color-text-muted);
    font-size: 0.75rem;
    text-align: center;
  }

  /* Add IDs to headings for anchor links */
  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4) {
    scroll-margin-top: 5rem;
  }
</style>
