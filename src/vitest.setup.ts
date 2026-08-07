/**
 * Shared Vitest setup.
 * Prisma is mocked so modules that import `$lib/server/db` can load without DATABASE_URL.
 */
import { vi } from 'vitest';

vi.mock('$lib/server/db', () => ({
  prisma: {
    playerInTeam: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));
