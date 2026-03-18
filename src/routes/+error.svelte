<script lang="ts">
  import { page } from '$app/state';

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
  <p class="text-8xl font-black text-orange-500 mb-2 tabular-nums">{page.status}</p>

  <h1 class="text-3xl font-bold text-white mb-3">{config.title}</h1>

  <p class="text-lg text-gray-400 max-w-md mb-8">
    {config.description}
  </p>

  <div class="flex gap-4">
    <a
      href="/"
      class="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-lg transition-colors"
    >
      Go Home
    </a>
    <button
      onclick={() => history.back()}
      class="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-gray-300 font-semibold rounded-lg transition-colors border border-zinc-700"
    >
      Go Back
    </button>
  </div>
</div>
