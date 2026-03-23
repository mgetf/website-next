<script lang="ts">
  import { page } from '$app/state';
  import Button from '$lib/components/ui/Button.svelte';

  const errorConfig: Record<number, { title: string; description: string }> = {
    400: {
      title: 'Bad Request',
      description:
        "The server couldn't understand that request. Double-check the URL or try again.",
    },
    401: {
      title: 'Unauthorized',
      description: 'You need to log in to access this page.',
    },
    403: {
      title: 'Access Denied',
      description: "You don't have permission to view this page.",
    },
    404: {
      title: 'Page Not Found',
      description: "The page you're looking for doesn't exist or may have been moved.",
    },
    500: {
      title: 'Server Error',
      description: 'Something went wrong on our end. Please try again later.',
    },
  };

  const fallback = {
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred. Please try again later.',
  };

  let config = $derived(errorConfig[page.status] ?? fallback);
</script>

<div class="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
  <p class="text-8xl font-black text-primary-500 mb-2 tabular-nums">{page.status}</p>

  <h1 class="text-3xl font-bold text-white mb-3">{config.title}</h1>

  <p class="text-lg text-text-body max-w-md mb-8">
    {config.description}
  </p>

  <div class="flex gap-4">
    <Button href="/" variant="primary" size="lg">Go Home</Button>
    <Button variant="secondary" size="lg" onclick={() => history.back()}>Go Back</Button>
  </div>
</div>
