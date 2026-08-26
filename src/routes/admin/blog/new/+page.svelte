<script lang="ts">
  import type { ActionData } from './$types';
  import BlogPostForm from '../_components/BlogPostForm.svelte';
  import { toast } from '$lib/state/toast.svelte';

  let { form }: { form: ActionData } = $props();

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
  <div>
    <h2 class="mb-2 text-3xl font-bold text-white">New Post</h2>
    <p class="text-text-body">Write a draft or publish immediately</p>
  </div>

  <BlogPostForm {errors} />
</div>
