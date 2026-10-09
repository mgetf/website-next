import { describe, expect, it } from 'vitest';
import { describeDiscordRequest, readDiscordRateLimit } from './discordRateLimit';

function rateLimitedResponse(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status: 429, headers });
}

describe('readDiscordRateLimit', () => {
  it('prefers the JSON retry_after and reads rate-limit headers', () => {
    const info = readDiscordRateLimit(
      rateLimitedResponse(
        { message: 'You are being rate limited.', retry_after: 2.5, global: true },
        {
          'Retry-After': '3',
          'X-RateLimit-Scope': 'global',
          'X-RateLimit-Bucket': 'abc',
          'X-RateLimit-Limit': '1',
          'X-RateLimit-Remaining': '0',
        },
      ),
      { message: 'You are being rate limited.', retry_after: 2.5, global: true },
    );

    expect(info).toEqual({
      retryAfterSeconds: 2.5,
      global: true,
      scope: 'global',
      bucket: 'abc',
      limit: '1',
      remaining: '0',
      message: 'You are being rate limited.',
    });
  });

  it('falls back to the Retry-After header', () => {
    const info = readDiscordRateLimit(rateLimitedResponse({}, { 'Retry-After': '8' }), {});
    expect(info.retryAfterSeconds).toBe(8);
    expect(info.global).toBe(false);
  });
});

describe('describeDiscordRequest', () => {
  it('names the account-linking and staff calls that share this server IP', () => {
    expect(describeDiscordRequest('POST', '/oauth2/token')).toBe(
      'account linking: exchange authorization code',
    );
    expect(describeDiscordRequest('GET', '/users/@me')).toBe(
      'account linking: read Discord profile',
    );
    expect(describeDiscordRequest('GET', '/guilds/99/members?limit=1000')).toBe(
      'admin staff page: list every server member',
    );
    expect(describeDiscordRequest('PATCH', '/guilds/99/members/42')).toBe(
      'role sync: update member roles',
    );
    expect(describeDiscordRequest('GET', '/users/42')).toBe('admin: look up Discord user');
  });
});
