import { structuredPatch } from 'diff';
import type { DiffHunk, DiffLine } from '$lib/types/rulebook';

function toDiffLine(raw: string): DiffLine | null {
  if (raw.startsWith('\\')) {
    return null;
  }

  const prefix = raw[0];
  const text = raw.slice(1);

  if (prefix === '+') {
    return { type: 'added', text };
  }
  if (prefix === '-') {
    return { type: 'removed', text };
  }
  return { type: 'context', text };
}

export function diffText(oldText: string, newText: string, context = 3): DiffHunk[] {
  const patch = structuredPatch('old', 'new', oldText, newText, undefined, undefined, {
    context,
  });

  return patch.hunks.map((hunk) => ({
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: hunk.lines.flatMap((line) => {
      const parsed = toDiffLine(line);
      return parsed ? [parsed] : [];
    }),
  }));
}

export function formatHunkHeader(hunk: DiffHunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
}
