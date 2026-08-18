/**
 * Format constants. IDs match the `formats` table.
 * Safe to import from both client and server code.
 */
export const FORMAT_1V1 = 1;
export const FORMAT_2V2 = 2;
export const FORMAT_ULTIDUO = 3;
export const FORMAT_BBALL = 4;

export const TEAM_FORMAT_IDS = [FORMAT_2V2, FORMAT_ULTIDUO, FORMAT_BBALL] as const;

export type TeamFormatId = (typeof TEAM_FORMAT_IDS)[number];
export type FormatCode = '1v1' | '2v2' | 'ultiduo' | 'bball';

export const FORMAT_CODE_TO_ID: Record<FormatCode, number> = {
  '1v1': FORMAT_1V1,
  '2v2': FORMAT_2V2,
  ultiduo: FORMAT_ULTIDUO,
  bball: FORMAT_BBALL,
};

export const FORMAT_ID_TO_CODE: Record<number, FormatCode> = {
  [FORMAT_1V1]: '1v1',
  [FORMAT_2V2]: '2v2',
  [FORMAT_ULTIDUO]: 'ultiduo',
  [FORMAT_BBALL]: 'bball',
};

const TEAM_FORMAT_SET = new Set<number>(TEAM_FORMAT_IDS);

export function isTeamFormatId(formatId: number): boolean {
  return TEAM_FORMAT_SET.has(formatId);
}

export function formatLabel(code: string): string {
  switch (code.toLowerCase()) {
    case '1v1':
      return '1v1';
    case '2v2':
      return '2v2';
    case 'ultiduo':
      return 'Ultiduo';
    case 'bball':
      return 'BBall';
    default:
      return code;
  }
}

export function formatLeagueTitle(code: string): string {
  switch (code.toLowerCase()) {
    case '1v1':
      return '1v1 MGE League';
    case '2v2':
      return '2v2 MGE League';
    case 'ultiduo':
      return 'Ultiduo League';
    case 'bball':
      return 'BBall League';
    default:
      return `${formatLabel(code)} League`;
  }
}

export function parseFormatCode(raw: string | undefined): FormatCode | null {
  if (!raw) return null;
  const code = raw.toLowerCase();
  if (code === '1v1' || code === '2v2' || code === 'ultiduo' || code === 'bball') {
    return code;
  }
  return null;
}

export function parseTeamFormatCode(raw: string | undefined): {
  id: number;
  code: Exclude<FormatCode, '1v1'>;
  label: string;
} | null {
  const code = parseFormatCode(raw);
  if (!code || code === '1v1') return null;
  return { id: FORMAT_CODE_TO_ID[code], code, label: formatLabel(code) };
}
