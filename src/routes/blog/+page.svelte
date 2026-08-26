<script lang="ts">
  import { goto } from '$app/navigation';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Paginator from '$lib/components/ui/Paginator.svelte';
  import { formatDateTime } from '$lib/utils/datetime';

  let { data } = $props();

  function changePage(nextPage: number) {
    goto(`?page=${nextPage}`);
  }
</script>

<PageHero
  title="Blog"
  subtitle="News, updates, and behind-the-scenes from the MGE.tf team"
  maxWidth="max-w-7xl"
  border
/>

<div class="mx-auto max-w-7xl px-6 py-10">
  {#if data.posts.length === 0}
    <Card class="py-10 text-center">
      <p class="mb-1 text-lg text-white">No posts yet</p>
      <p class="text-sm text-text-body">
        Check back soon for news and updates from the MGE.tf team.
      </p>
    </Card>
  {:else}
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {#each data.posts as post (post.id)}
        <a href="/blog/{post.id}" class="group block h-full">
          <Card
            padding="none"
            class="h-full overflow-hidden transition-colors group-hover:border-primary-500/50"
          >
            <div class="aspect-video overflow-hidden bg-surface-input">
              {#if post.coverImage}
                <img
                  src={post.coverImage}
                  alt=""
                  class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              {:else}
                <div
                  class="h-full w-full bg-gradient-to-br from-primary-900/50 via-surface-card to-surface-input"
                ></div>
              {/if}
            </div>
            <div class="p-5">
              <h2
                class="text-lg font-bold text-white transition-colors group-hover:text-primary-400"
              >
                {post.title}
              </h2>
              {#if post.excerpt}
                <p class="mt-2 line-clamp-3 text-sm text-text-body">{post.excerpt}</p>
              {/if}
              <div class="mt-4 flex items-center gap-2 text-xs text-text-muted">
                {#if post.author}
                  <img
                    src={post.author.avatar || '/default-avatar.png'}
                    alt=""
                    class="h-6 w-6 rounded-full"
                  />
                  <span class="text-text-label">{post.author.name}</span>
                  {#if post.publishedAt}
                    <span aria-hidden="true">·</span>
                  {/if}
                {/if}
                {#if post.publishedAt}
                  <time datetime={post.publishedAt}>{formatDateTime(post.publishedAt)}</time>
                {/if}
              </div>
            </div>
          </Card>
        </a>
      {/each}
    </div>

    {#if data.pagination.totalPages > 1}
      <div class="mt-10">
        <Paginator
          currentPage={data.pagination.page}
          totalPages={data.pagination.totalPages}
          onPageChange={changePage}
          infoText="Page {data.pagination.page} of {data.pagination.totalPages}"
        />
      </div>
    {/if}
  {/if}
</div>
