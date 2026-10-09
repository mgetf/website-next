export type DiscordLinkNotice = {
  tone: 'error' | 'warning';
  message: string;
};

function waitPhrase(retrySeconds: number | null): string {
  if (retrySeconds == null || !Number.isFinite(retrySeconds) || retrySeconds < 0) {
    return 'Wait a few minutes and try again.';
  }
  if (retrySeconds < 15) return 'Try again in a moment.';
  if (retrySeconds <= 90) return 'Try again in about a minute.';
  if (retrySeconds <= 3600) {
    const minutes = Math.ceil(retrySeconds / 60);
    return `Try again in about ${minutes} minutes.`;
  }
  return 'Try again later.';
}

/** Player-facing copy for Discord OAuth redirects on the profile page. */
export function discordLinkNotice(
  code: string | null,
  retrySeconds: number | null,
): DiscordLinkNotice | null {
  if (code === 'discord_rate_limited') {
    const wait = waitPhrase(retrySeconds);
    const later = retrySeconds != null && retrySeconds > 3600;
    const lead = later
      ? 'Discord is limiting requests from the site right now.'
      : 'Discord is temporarily limiting new account links.';
    return {
      tone: 'warning',
      message: `${lead} Nothing is wrong with your account. ${wait}`,
    };
  }

  if (code === 'discord_link_failed' || code === 'discord_auth_failed') {
    return {
      tone: 'error',
      message: 'Could not link your Discord account. Try again in a moment.',
    };
  }

  if (code === 'discord_already_linked') {
    return {
      tone: 'error',
      message: 'That Discord account is already linked to another player.',
    };
  }

  if (code === 'discord_auth_cancelled') {
    return {
      tone: 'warning',
      message: 'Discord linking was cancelled.',
    };
  }

  return null;
}
