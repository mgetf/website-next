<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import BlogPostForm from '../../_components/BlogPostForm.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import { toast } from '$lib/state/toast.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let lastFormResult: ActionData = null;
  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.error) {
        toast.error(form.error);
      }
    }
  });

  const errors = $derived(form && 'errors' in form ? (form.errors ?? {}) : {});
</script>

<div class="mx-auto max-w-4xl space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="mb-2 text-3xl font-bold text-white">Edit Post</h2>
      <p class="text-text-body">Update the draft or publish changes</p>
    </div>
    {#if data.post.published}
      <Badge color="green">Published</Badge>
    {:else}
      <Badge color="zinc">Draft</Badge>
    {/if}
  </div>

  <BlogPostForm
    initialTitle={data.post.title}
    initialExcerpt={data.post.excerpt ?? ''}
    initialContent={data.post.content}
    initialCoverImage={data.post.coverImage}
    isPublished={data.post.published}
    {errors}
  />
</div>
