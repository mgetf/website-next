import { describe, expect, it } from 'vitest';
import { repairUtf8Mojibake } from './textEncoding';

describe('repairUtf8Mojibake', () => {
  it('repairs São Paulo stored as Latin-1-read UTF-8', () => {
    expect(repairUtf8Mojibake('mge.tf | sÃ£o paulo #1 | triumph')).toBe(
      'mge.tf | são paulo #1 | triumph',
    );
  });

  it('leaves correct Portuguese alone', () => {
    expect(repairUtf8Mojibake('mge.tf | são paulo #1 | triumph')).toBe(
      'mge.tf | são paulo #1 | triumph',
    );
  });

  it('leaves ASCII alone', () => {
    expect(repairUtf8Mojibake('mge.tf | buenos aires #1 | triumph')).toBe(
      'mge.tf | buenos aires #1 | triumph',
    );
  });
});
