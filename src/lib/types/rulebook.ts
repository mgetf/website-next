export type DiffLineType = 'added' | 'removed' | 'context';

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface PublishedRulebook {
  content: string;
  version: number | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface RulebookRevisionSummary {
  version: number;
  message: string;
  publishedAt: string;
  publishedBySteamId: string | null;
  publishedByName: string | null;
}

export interface RulebookRevisionDetail extends RulebookRevisionSummary {
  content: string;
  previousVersion: number | null;
  nextVersion: number | null;
  hunks: DiffHunk[];
}
