import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = async ({ error, status, message }) => {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}] Client error (${status}):`, error);

  return {
    message,
    code: errorId,
  };
};
