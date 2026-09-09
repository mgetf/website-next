import { describe, expect, it } from 'vitest';
import { parseDiscordUserId } from './discordId';

describe('parseDiscordUserId', () => {
  it('accepts a snowflake', () => {
    expect(parseDiscordUserId('123456789012345678')).toBe('123456789012345678');
  });

  it('trims whitespace', () => {
    expect(parseDiscordUserId('  123456789012345678  ')).toBe('123456789012345678');
  });

  it('accepts a mention', () => {
    expect(parseDiscordUserId('<@123456789012345678>')).toBe('123456789012345678');
    expect(parseDiscordUserId('<@!123456789012345678>')).toBe('123456789012345678');
  });

  it('accepts a Discord profile URL', () => {
    expect(parseDiscordUserId('https://discord.com/users/123456789012345678')).toBe(
      '123456789012345678',
    );
    expect(parseDiscordUserId('https://discordapp.com/users/123456789012345678/')).toBe(
      '123456789012345678',
    );
  });

  it('rejects empty and malformed values', () => {
    expect(parseDiscordUserId('')).toBeNull();
    expect(parseDiscordUserId('not-an-id')).toBeNull();
    expect(parseDiscordUserId('12345')).toBeNull();
    expect(parseDiscordUserId('<@abc>')).toBeNull();
  });
});
