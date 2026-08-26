<script lang="ts">
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { formatDateTime } from '$lib/utils/datetime';

  let { data } = $props();

  const post = $derived(data.post);
</script>

<article>
  {#if post.coverImage}
    <div class="relative h-64 overflow-hidden md:h-96">
      <img src={post.coverImage} alt="" class="h-full w-full object-cover" />
      <div
        class="absolute inset-0 bg-gradient-to-t from-surface-page via-surface-page/70 to-transparent"
      ></div>
      <div class="absolute inset-x-0 bottom-0">
        <div class="mx-auto max-w-3xl px-6 pb-8">
          <a
            href="/blog"
            class="mb-4 inline-flex text-sm font-medium text-text-label transition-colors hover:text-white"
          >
            ← Back to Blog
          </a>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            {#if !post.published}
              <Badge color="zinc">Draft</Badge>
            {/if}
            {#if data.canEdit}
              <Button href="/admin/blog/{post.id}/edit" variant="secondary" size="sm">
                Edit post
              </Button>
            {/if}
          </div>
          <h1 class="text-4xl font-black text-white md:text-5xl">{post.title}</h1>
          <div class="mt-4 flex items-center gap-3 text-sm text-text-body">
            {#if post.author}
              <img
                src={post.author.avatar || '/default-avatar.png'}
                alt=""
                class="h-8 w-8 rounded-full"
              />
              <span class="font-medium text-text-label">{post.author.name}</span>
              {#if post.publishedAt}
                <span aria-hidden="true">·</span>
              {/if}
            {/if}
            {#if post.publishedAt}
              <time datetime={post.publishedAt}>{formatDateTime(post.publishedAt)}</time>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {:else}
    <PageHero maxWidth="max-w-3xl" border>
      <a
        href="/blog"
        class="mb-4 inline-flex text-sm font-medium text-text-label transition-colors hover:text-white"
      >
        ← Back to Blog
      </a>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        {#if !post.published}
          <Badge color="zinc">Draft</Badge>
        {/if}
        {#if data.canEdit}
          <Button href="/admin/blog/{post.id}/edit" variant="secondary" size="sm">Edit post</Button>
        {/if}
      </div>
      <h1 class="mb-4 text-4xl font-black text-white md:text-5xl">{post.title}</h1>
      <div class="flex items-center gap-3 text-sm text-text-body">
        {#if post.author}
          <img
            src={post.author.avatar || '/default-avatar.png'}
            alt=""
            class="h-8 w-8 rounded-full"
          />
          <span class="font-medium text-text-label">{post.author.name}</span>
          {#if post.publishedAt}
            <span aria-hidden="true">·</span>
          {/if}
        {/if}
        {#if post.publishedAt}
          <time datetime={post.publishedAt}>{formatDateTime(post.publishedAt)}</time>
        {/if}
      </div>
    </PageHero>
  {/if}

  <div class="mx-auto max-w-3xl px-6 py-10">
    <div
      class="rounded-lg border border-border-default bg-surface-card/80 p-6 backdrop-blur lg:p-10"
    >
      <MarkdownRenderer content={post.content} />
    </div>
  </div>
</article>
