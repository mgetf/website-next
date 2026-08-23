import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      $lib: path.resolve(root, 'src/lib'),
      $prisma: path.resolve(root, 'prisma/generated'),
      '$app/environment': path.resolve(root, 'src/test-mocks/app-environment.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/vitest.setup.ts'],
    // Zod 4's `export { z }` is dropped when Vitest evaluates the module under
    // Bun (`z.string` is undefined). Inlining makes Vite transform zod itself.
    server: {
      deps: {
        inline: ['zod'],
      },
    },
  },
});
