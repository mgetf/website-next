import { describe, expect, it } from 'vitest';
import { discordLinkNotice } from './discordLinkError';

describe('discordLinkNotice', () => {
  it('explains a Discord rate limit without blaming the player', () => {
    expect(discordLinkNotice('discord_rate_limited', null)).toEqual({
      tone: 'warning',
      message:
        'Discord is temporarily limiting new account links. Nothing is wrong with your account. Wait a few minutes and try again.',
    });
  });

  it('includes a short wait when Discord says when to retry', () => {
    expect(discordLinkNotice('discord_rate_limited', 180)?.message).toContain(
      'Try again in about 3 minutes.',
    );
  });

  it('tells the player to come back later when the block is long', () => {
    expect(discordLinkNotice('discord_rate_limited', 7200)?.message).toBe(
      'Discord is limiting requests from the site right now. Nothing is wrong with your account. Try again later.',
    );
  });

  it('maps the other linking failures', () => {
    expect(discordLinkNotice('discord_already_linked', null)?.tone).toBe('error');
    expect(discordLinkNotice('discord_auth_cancelled', null)?.message).toBe(
      'Discord linking was cancelled.',
    );
    expect(discordLinkNotice('discord_link_failed', null)?.message).toContain(
      'Could not link your Discord account',
    );
    expect(discordLinkNotice(null, null)).toBeNull();
  });
});
