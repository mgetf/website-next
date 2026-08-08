/**
 * Curated country flag emojis available for player profiles.
 * Safe to import from both client and server code.
 */

export interface FlagEmojiOption {
  emoji: string;
  name: string;
  code: string;
}

export const FLAG_EMOJI_OPTIONS: FlagEmojiOption[] = [
  { emoji: '🇦🇷', name: 'Argentina', code: 'AR' },
  { emoji: '🇦🇺', name: 'Australia', code: 'AU' },
  { emoji: '🇦🇹', name: 'Austria', code: 'AT' },
  { emoji: '🇧🇾', name: 'Belarus', code: 'BY' },
  { emoji: '🇧🇪', name: 'Belgium', code: 'BE' },
  { emoji: '🇧🇦', name: 'Bosnia and Herzegovina', code: 'BA' },
  { emoji: '🇧🇷', name: 'Brazil', code: 'BR' },
  { emoji: '🇧🇬', name: 'Bulgaria', code: 'BG' },
  { emoji: '🇨🇦', name: 'Canada', code: 'CA' },
  { emoji: '🇨🇱', name: 'Chile', code: 'CL' },
  { emoji: '🇨🇳', name: 'China', code: 'CN' },
  { emoji: '🇨🇴', name: 'Colombia', code: 'CO' },
  { emoji: '🇭🇷', name: 'Croatia', code: 'HR' },
  { emoji: '🇨🇿', name: 'Czechia', code: 'CZ' },
  { emoji: '🇩🇰', name: 'Denmark', code: 'DK' },
  { emoji: '🇪🇪', name: 'Estonia', code: 'EE' },
  { emoji: '🇫🇮', name: 'Finland', code: 'FI' },
  { emoji: '🇫🇷', name: 'France', code: 'FR' },
  { emoji: '🇩🇪', name: 'Germany', code: 'DE' },
  { emoji: '🇬🇷', name: 'Greece', code: 'GR' },
  { emoji: '🇭🇰', name: 'Hong Kong', code: 'HK' },
  { emoji: '🇭🇺', name: 'Hungary', code: 'HU' },
  { emoji: '🇮🇸', name: 'Iceland', code: 'IS' },
  { emoji: '🇮🇳', name: 'India', code: 'IN' },
  { emoji: '🇮🇩', name: 'Indonesia', code: 'ID' },
  { emoji: '🇮🇪', name: 'Ireland', code: 'IE' },
  { emoji: '🇮🇱', name: 'Israel', code: 'IL' },
  { emoji: '🇮🇹', name: 'Italy', code: 'IT' },
  { emoji: '🇯🇵', name: 'Japan', code: 'JP' },
  { emoji: '🇰🇿', name: 'Kazakhstan', code: 'KZ' },
  { emoji: '🇱🇻', name: 'Latvia', code: 'LV' },
  { emoji: '🇱🇹', name: 'Lithuania', code: 'LT' },
  { emoji: '🇱🇺', name: 'Luxembourg', code: 'LU' },
  { emoji: '🇲🇾', name: 'Malaysia', code: 'MY' },
  { emoji: '🇲🇽', name: 'Mexico', code: 'MX' },
  { emoji: '🇲🇩', name: 'Moldova', code: 'MD' },
  { emoji: '🇲🇪', name: 'Montenegro', code: 'ME' },
  { emoji: '🇳🇱', name: 'Netherlands', code: 'NL' },
  { emoji: '🇳🇿', name: 'New Zealand', code: 'NZ' },
  { emoji: '🇲🇰', name: 'North Macedonia', code: 'MK' },
  { emoji: '🇳🇴', name: 'Norway', code: 'NO' },
  { emoji: '🇵🇪', name: 'Peru', code: 'PE' },
  { emoji: '🇵🇭', name: 'Philippines', code: 'PH' },
  { emoji: '🇵🇱', name: 'Poland', code: 'PL' },
  { emoji: '🇵🇹', name: 'Portugal', code: 'PT' },
  { emoji: '🇷🇴', name: 'Romania', code: 'RO' },
  { emoji: '🇷🇺', name: 'Russia', code: 'RU' },
  { emoji: '🇸🇦', name: 'Saudi Arabia', code: 'SA' },
  { emoji: '🇷🇸', name: 'Serbia', code: 'RS' },
  { emoji: '🇸🇬', name: 'Singapore', code: 'SG' },
  { emoji: '🇸🇰', name: 'Slovakia', code: 'SK' },
  { emoji: '🇸🇮', name: 'Slovenia', code: 'SI' },
  { emoji: '🇿🇦', name: 'South Africa', code: 'ZA' },
  { emoji: '🇰🇷', name: 'South Korea', code: 'KR' },
  { emoji: '🇪🇸', name: 'Spain', code: 'ES' },
  { emoji: '🇸🇪', name: 'Sweden', code: 'SE' },
  { emoji: '🇨🇭', name: 'Switzerland', code: 'CH' },
  { emoji: '🇹🇼', name: 'Taiwan', code: 'TW' },
  { emoji: '🇹🇭', name: 'Thailand', code: 'TH' },
  { emoji: '🇹🇷', name: 'Türkiye', code: 'TR' },
  { emoji: '🇺🇦', name: 'Ukraine', code: 'UA' },
  { emoji: '🇦🇪', name: 'United Arab Emirates', code: 'AE' },
  { emoji: '🇬🇧', name: 'United Kingdom', code: 'GB' },
  { emoji: '🇺🇸', name: 'United States', code: 'US' },
  { emoji: '🇺🇾', name: 'Uruguay', code: 'UY' },
  { emoji: '🇺🇿', name: 'Uzbekistan', code: 'UZ' },
  { emoji: '🇻🇳', name: 'Vietnam', code: 'VN' },
];

const FLAG_EMOJI_SET = new Set(FLAG_EMOJI_OPTIONS.map((f) => f.emoji));

export function isValidFlagEmoji(emoji: string | null | undefined): boolean {
  if (emoji == null || emoji === '') return true; // empty clears the flag
  return FLAG_EMOJI_SET.has(emoji);
}

export function getFlagEmojiName(emoji: string | null | undefined): string | null {
  if (!emoji) return null;
  return FLAG_EMOJI_OPTIONS.find((f) => f.emoji === emoji)?.name ?? null;
}
