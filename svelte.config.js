import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    adapter: adapter({
      out: 'build',
      bodySize: 250 * 1024 * 1024, // 250 MB — needed for map BSP uploads (up to 200 MB)
    }),
    alias: {
      $prisma: './prisma/generated',
    },
  },
};

export default config;
