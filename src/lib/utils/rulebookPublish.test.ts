import { describe, expect, it } from 'vitest';
import {
  nextRulebookVersion,
  RULEBOOK_MESSAGE_MIN_LENGTH,
  validateRulebookPublish,
} from './rulebookPublish';

const base = {
  content: '# New rules\n',
  message: 'Clarify forfeit timing',
  currentContent: '# Old rules\n',
  currentVersion: 3,
  expectedVersion: 3,
};

describe('nextRulebookVersion', () => {
  it('increments from the current published version', () => {
    expect(nextRulebookVersion(0)).toBe(1);
    expect(nextRulebookVersion(3)).toBe(4);
  });
});

describe('validateRulebookPublish', () => {
  it('accepts a valid publish payload', () => {
    expect(validateRulebookPublish(base)).toEqual({ ok: true });
  });

  it('rejects a no-op when content is unchanged', () => {
    expect(
      validateRulebookPublish({
        ...base,
        content: base.currentContent,
      }),
    ).toEqual({ ok: false, error: 'No changes to publish' });
  });

  it('rejects an empty rulebook', () => {
    expect(validateRulebookPublish({ ...base, content: '   ' })).toEqual({
      ok: false,
      error: 'Rulebook content cannot be empty',
    });
  });

  it('rejects a short change message', () => {
    expect(validateRulebookPublish({ ...base, message: 'short' })).toEqual({
      ok: false,
      error: `Explain the change in at least ${RULEBOOK_MESSAGE_MIN_LENGTH} characters`,
    });
  });

  it('rejects a stale expected version', () => {
    expect(validateRulebookPublish({ ...base, expectedVersion: 2 })).toEqual({
      ok: false,
      conflict: true,
      error: 'The rulebook was published by someone else. Reload and try again.',
    });
  });
});
