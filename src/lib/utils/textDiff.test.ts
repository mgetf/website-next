import { describe, expect, it } from 'vitest';
import { diffText, formatHunkHeader } from './textDiff';

describe('diffText', () => {
  it('returns no hunks when the texts are identical', () => {
    expect(diffText('same line\n', 'same line\n')).toEqual([]);
  });

  it('marks added lines', () => {
    const hunks = diffText('alpha\n', 'alpha\nbeta\n');
    const added = hunks.flatMap((hunk) => hunk.lines).filter((line) => line.type === 'added');
    expect(added.map((line) => line.text)).toEqual(['beta']);
  });

  it('marks removed lines', () => {
    const hunks = diffText('alpha\nbeta\n', 'alpha\n');
    const removed = hunks.flatMap((hunk) => hunk.lines).filter((line) => line.type === 'removed');
    expect(removed.map((line) => line.text)).toEqual(['beta']);
  });

  it('marks replaced lines as removed then added', () => {
    const hunks = diffText('alpha\n', 'omega\n');
    const lines = hunks.flatMap((hunk) => hunk.lines);
    expect(lines).toEqual([
      { type: 'removed', text: 'alpha' },
      { type: 'added', text: 'omega' },
    ]);
  });

  it('formats a hunk header', () => {
    expect(
      formatHunkHeader({
        oldStart: 1,
        oldLines: 4,
        newStart: 1,
        newLines: 6,
        lines: [],
      }),
    ).toBe('@@ -1,4 +1,6 @@');
  });
});
