const SNOWFLAKE = /^\d{17,20}$/;
const MENTION = /^<@!?(\d{17,20})>$/;
const PROFILE_URL = /^(?:https?:\/\/)?(?:www\.)?discord(?:app)?\.com\/users\/(\d{17,20})\/?$/i;

/**
 * Extract a Discord snowflake from a pasted user ID, mention, or profile URL.
 */
export function parseDiscordUserId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (SNOWFLAKE.test(trimmed)) return trimmed;

  const mention = trimmed.match(MENTION);
  if (mention?.[1]) return mention[1];

  const url = trimmed.match(PROFILE_URL);
  if (url?.[1]) return url[1];

  return null;
}
