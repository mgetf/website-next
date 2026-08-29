<script lang="ts">
  import { page } from '$app/state';
  import MarkdownRenderer from '$lib/components/markdown/MarkdownRenderer.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import CommentSection from '../_components/CommentSection.svelte';
  import LikeButton from '../_components/LikeButton.svelte';
  import { formatDateTime } from '$lib/utils/datetime';

  let { data } = $props();

  const post = $derived(data.post);
</script>

<article class="mx-auto max-w-4xl px-6 py-10">
  <a
    href="/blog"
    class="mb-6 inline-flex text-sm font-medium text-text-label transition-colors hover:text-white"
  >
    ← Back to Blog
  </a>

  <div
    class="overflow-hidden rounded-lg border border-border-default bg-surface-card/80 backdrop-blur"
  >
    {#if post.coverImage}
      <figure>
        <img
          src={post.coverImage}
          alt={post.coverImageCaption ?? ''}
          class="aspect-video w-full object-cover"
        />
        {#if post.coverImageCaption}
          <figcaption class="px-6 pt-3 text-center text-xs text-text-muted lg:px-10">
            {post.coverImageCaption}
          </figcaption>
        {/if}
      </figure>
    {/if}

    <div class="p-6 lg:p-10">
      {#if !post.published || data.canEdit}
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
      {/if}

      <h1 class="mb-4 text-4xl font-black text-white md:text-5xl">{post.title}</h1>

      <div
        class="mb-8 flex items-center gap-3 border-b border-border-default pb-6 text-sm text-text-body"
      >
        {#if post.author}
          <a
            href="/users/{post.author.steamId}"
            class="flex items-center gap-2 transition-colors hover:text-white"
          >
            <img
              src={post.author.avatar || '/default-avatar.png'}
              alt=""
              class="h-8 w-8 rounded-full"
            />
            <span class="font-medium text-text-label">{post.author.name}</span>
          </a>
          {#if post.publishedAt}
            <span aria-hidden="true">·</span>
          {/if}
        {/if}
        {#if post.publishedAt}
          <time datetime={post.publishedAt}>{formatDateTime(post.publishedAt)}</time>
        {/if}
        <div class="ml-auto">
          <LikeButton
            action="?/togglePostLike"
            fieldName="postId"
            fieldValue={post.id}
            likeCount={post.likeCount}
            likedByMe={post.likedByMe}
            isLoggedIn={Boolean(page.data.user)}
          />
        </div>
      </div>

      <MarkdownRenderer content={post.content} />
    </div>
  </div>

  <div class="mt-8">
    <CommentSection
      postId={post.id}
      comments={data.comments}
      isLoggedIn={Boolean(page.data.user)}
    />
  </div>
</article>
