export const RULEBOOK_MESSAGE_MIN_LENGTH = 10;

export type RulebookPublishValidation =
  { ok: true } | { ok: false; error: string; conflict?: boolean };

export function nextRulebookVersion(currentVersion: number): number {
  return currentVersion + 1;
}

export function validateRulebookPublish(input: {
  content: string;
  message: string;
  currentContent: string;
  currentVersion: number;
  expectedVersion: number;
}): RulebookPublishValidation {
  if (input.expectedVersion !== input.currentVersion) {
    return {
      ok: false,
      conflict: true,
      error: 'The rulebook was published by someone else. Reload and try again.',
    };
  }

  if (!input.content.trim()) {
    return { ok: false, error: 'Rulebook content cannot be empty' };
  }

  if (input.content === input.currentContent) {
    return { ok: false, error: 'No changes to publish' };
  }

  if (input.message.trim().length < RULEBOOK_MESSAGE_MIN_LENGTH) {
    return {
      ok: false,
      error: `Explain the change in at least ${RULEBOOK_MESSAGE_MIN_LENGTH} characters`,
    };
  }

  return { ok: true };
}
