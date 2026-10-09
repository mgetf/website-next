import type { HandleClientError } from '@sveltejs/kit/hooks';

export const handleError: HandleClientError = async ({ error, kind }) => {
  if (kind === 'app') {
    return error;
  }

  const errorId = crypto.randomUUID();

  if (kind === 'framework') {
    return { ...error, code: errorId };
  }

  console.error(`[${errorId}] Client error:`, error);

  return {
    message: 'Internal Error',
    code: errorId,
  };
};
