type PrismaLikeError = {
  name?: string;
  message?: string;
  code?: string;
  clientVersion?: string;
  meta?: unknown;
  stack?: string;
};

function isPrismaLikeError(value: unknown): value is PrismaLikeError {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as PrismaLikeError;
  return (
    typeof candidate.name === 'string' &&
    candidate.name.startsWith('PrismaClient') &&
    typeof candidate.message === 'string'
  );
}

export function logPrismaError(context: string, err: unknown, extra?: Record<string, unknown>) {
  if (!isPrismaLikeError(err)) return;

  console.error('[prisma] request error', {
    context,
    name: err.name,
    code: err.code ?? null,
    message: err.message,
    clientVersion: err.clientVersion ?? null,
    meta: err.meta ?? null,
    ...(extra ?? {}),
  });
}
