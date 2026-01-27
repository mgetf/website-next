<script lang="ts">
import Markdown from 'svelte-exmarkdown';
import { gfmPlugin } from 'svelte-exmarkdown/gfm';

interface Props {
  content: string;
  class?: string;
}

let { content, class: className = '' }: Props = $props();

const plugins = [gfmPlugin()];
</script>

<div class="markdown-content prose prose-invert max-w-none {className}">
	<Markdown md={content} {plugins} />
</div>

<style>
	.markdown-content :global(h1) {
		font-size: 2rem;
		font-weight: 800;
		color: white;
		margin-top: 2rem;
		margin-bottom: 1rem;
		padding-bottom: 0.5rem;
		border-bottom: 2px solid #3f3f46;
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
		color: #e4e4e7;
		margin-top: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.markdown-content :global(h4) {
		font-size: 1.1rem;
		font-weight: 600;
		color: #d4d4d8;
		margin-top: 1.25rem;
		margin-bottom: 0.5rem;
	}

	.markdown-content :global(p) {
		color: #a1a1aa;
		line-height: 1.75;
		margin-bottom: 1rem;
	}

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		color: #a1a1aa;
		margin-left: 1.5rem;
		margin-bottom: 1rem;
	}

	.markdown-content :global(li) {
		margin-bottom: 0.25rem;
	}

	.markdown-content :global(a) {
		color: #60a5fa;
		text-decoration: underline;
		transition: color 0.15s;
	}

	.markdown-content :global(a:hover) {
		color: #93c5fd;
	}

	.markdown-content :global(code) {
		background: #27272a;
		color: #f4f4f5;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-size: 0.875em;
	}

	.markdown-content :global(pre) {
		background: #18181b;
		border: 1px solid #3f3f46;
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
		border-left: 4px solid #3b82f6;
		padding-left: 1rem;
		margin-left: 0;
		color: #a1a1aa;
		font-style: italic;
		margin-bottom: 1rem;
	}

	.markdown-content :global(hr) {
		border: none;
		border-top: 1px solid #3f3f46;
		margin: 2rem 0;
	}

	.markdown-content :global(table) {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 1rem;
	}

	.markdown-content :global(th),
	.markdown-content :global(td) {
		border: 1px solid #3f3f46;
		padding: 0.5rem 0.75rem;
		text-align: left;
	}

	.markdown-content :global(th) {
		background: #27272a;
		color: white;
		font-weight: 600;
	}

	.markdown-content :global(td) {
		color: #a1a1aa;
	}

	.markdown-content :global(img) {
		max-width: 100%;
		border-radius: 0.5rem;
	}

	/* Add IDs to headings for anchor links */
	.markdown-content :global(h1),
	.markdown-content :global(h2),
	.markdown-content :global(h3),
	.markdown-content :global(h4) {
		scroll-margin-top: 5rem;
	}
</style>

