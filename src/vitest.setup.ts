/**
 * Shared Vitest setup.
 * Prisma is mocked so modules that import `$lib/server/db` can load without DATABASE_URL.
 */
import { vi } from 'vitest';

process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-chars!!';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-chars!!!!!!';

vi.mock('$lib/server/db', () => ({
  prisma: {
    playerInTeam: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    team: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    apiKey: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    discord: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    global: {
      findFirst: vi.fn(),
    },
    paymentTracker: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    punishment: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
