<script lang="ts">
  import { enhance } from '$app/forms';
  import MarkdownEditor from '$lib/components/markdown/MarkdownEditor.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';

  let {
    initialTitle = '',
    initialExcerpt = '',
    initialContent = '',
    initialCoverImage = null,
    isPublished = false,
    errors = {},
  }: {
    initialTitle?: string;
    initialExcerpt?: string;
    initialContent?: string;
    initialCoverImage?: string | null;
    isPublished?: boolean;
    errors?: Record<string, string>;
  } = $props();

  let title = $derived(initialTitle);
  let excerpt = $derived(initialExcerpt);
  let content = $derived(initialContent);
  let coverPreviewUrl = $state<string | null>(null);
  let isSubmitting = $state(false);

  const displayCover = $derived(coverPreviewUrl ?? initialCoverImage);

  function onCoverSelected(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = file ? URL.createObjectURL(file) : null;
  }
</script>

<form
  method="POST"
  enctype="multipart/form-data"
  class="space-y-6"
  use:enhance={() => {
    isSubmitting = true;
    return async ({ update }) => {
      isSubmitting = false;
      await update({ reset: false });
    };
  }}
>
  <FormInput
    label="Title"
    name="title"
    bind:value={title}
    required
    maxlength={200}
    placeholder="Season 12 is live"
    error={errors.title}
  />

  <div>
    <label for="excerpt" class="mb-2 block text-sm font-medium text-text-label"> Excerpt </label>
    <textarea
      id="excerpt"
      name="excerpt"
      rows="3"
      maxlength="500"
      bind:value={excerpt}
      placeholder="A short summary shown on the blog list and social previews"
      class="w-full rounded-lg border border-border-input bg-surface-input px-4 py-3 text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
    ></textarea>
    {#if errors.excerpt}
      <p class="mt-1 text-xs text-danger-400">{errors.excerpt}</p>
    {:else}
      <p class="mt-1 text-xs text-text-muted">Optional. Up to 500 characters.</p>
    {/if}
  </div>

  <div>
    <label for="coverImage" class="mb-2 block text-sm font-medium text-text-label">
      Cover image
    </label>
    {#if displayCover}
      <div class="mb-3 overflow-hidden rounded-lg border border-border-default">
        <img src={displayCover} alt="" class="aspect-video w-full max-w-xl object-cover" />
      </div>
    {/if}
    <input
      type="file"
      id="coverImage"
      name="coverImage"
      accept="image/png,image/jpeg,image/gif,image/webp"
      onchange={onCoverSelected}
      class="block w-full max-w-md cursor-pointer text-sm text-text-body file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface-input file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-surface-hover"
    />
    <p class="mt-1 text-xs text-text-muted">PNG, JPG, GIF, or WebP. Max 5MB. Optional.</p>
  </div>

  <div>
    <label for="content" class="mb-2 block text-sm font-medium text-text-label">
      Body
      <span class="text-danger-500">*</span>
    </label>
    <MarkdownEditor
      id="content"
      name="content"
      bind:value={content}
      minHeight="24rem"
      placeholder="Write your post..."
      required
    />
    {#if errors.content}
      <p class="mt-1 text-xs text-danger-400">{errors.content}</p>
    {/if}
  </div>

  <div class="flex flex-wrap items-center gap-3 border-t border-border-default pt-6">
    <Button type="submit" formaction="?/saveDraft" variant="secondary" disabled={isSubmitting}>
      {isSubmitting ? 'Saving...' : 'Save Draft'}
    </Button>
    <Button type="submit" formaction="?/publish" variant="primary" disabled={isSubmitting}>
      {isSubmitting ? 'Saving...' : isPublished ? 'Save & Publish' : 'Publish'}
    </Button>
    <Button href="/admin/blog" variant="ghost">Cancel</Button>
  </div>
</form>
