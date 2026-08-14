/**
 * Format ID constants for known seeded formats.
 * Prefer lookups by Format.code / Format config from the DB when possible.
 * Safe to import from both client and server code.
 */
export const FORMAT_1V1 = 1;
export const FORMAT_2V2 = 2;

/** Closed set of visual themes mapped to CSS design tokens. */
export const FORMAT_THEME_KEYS = ['blue', 'purple', 'primary', 'orange', 'zinc'] as const;
export type FormatThemeKey = (typeof FORMAT_THEME_KEYS)[number];

export function isFormatThemeKey(value: string): value is FormatThemeKey {
  return (FORMAT_THEME_KEYS as readonly string[]).includes(value);
}

export function normalizeFormatThemeKey(value: string | null | undefined): FormatThemeKey {
  if (value && isFormatThemeKey(value)) return value;
  return 'primary';
}

export type FormatThemeClasses = {
  text400: string;
  text300: string;
  bg400: string;
  bg500: string;
  bg600: string;
  border400: string;
  border500: string;
  border500_30: string;
  hoverBorder500: string;
  hoverText400: string;
  bg500_10: string;
  bg500_20: string;
  shadow500_25: string;
  shadow500_40: string;
  button: string;
  badge: string;
};

const THEME_CLASS_MAP: Record<FormatThemeKey, FormatThemeClasses> = {
  blue: {
    text400: 'text-theme-blue-400',
    text300: 'text-theme-blue-300',
    bg400: 'bg-theme-blue-400',
    bg500: 'bg-theme-blue-500',
    bg600: 'bg-theme-blue-600',
    border400: 'border-theme-blue-400',
    border500: 'border-theme-blue-500',
    border500_30: 'border-theme-blue-500/30',
    hoverBorder500: 'hover:border-theme-blue-500',
    hoverText400: 'hover:text-theme-blue-400',
    bg500_10: 'bg-theme-blue-500/10',
    bg500_20: 'bg-theme-blue-500/20',
    shadow500_25: 'shadow-theme-blue-500/25',
    shadow500_40: 'shadow-theme-blue-500/40',
    button:
      'bg-theme-blue-600 hover:bg-theme-blue-500 text-white disabled:bg-theme-blue-600/50 disabled:cursor-not-allowed',
    badge: 'bg-theme-blue-500/20 text-theme-blue-400 border border-theme-blue-500/30',
  },
  purple: {
    text400: 'text-theme-purple-400',
    text300: 'text-theme-purple-300',
    bg400: 'bg-theme-purple-400',
    bg500: 'bg-theme-purple-500',
    bg600: 'bg-theme-purple-600',
    border400: 'border-theme-purple-400',
    border500: 'border-theme-purple-500',
    border500_30: 'border-theme-purple-500/30',
    hoverBorder500: 'hover:border-theme-purple-500',
    hoverText400: 'hover:text-theme-purple-400',
    bg500_10: 'bg-theme-purple-500/10',
    bg500_20: 'bg-theme-purple-500/20',
    shadow500_25: 'shadow-theme-purple-500/25',
    shadow500_40: 'shadow-theme-purple-500/40',
    button:
      'bg-theme-purple-600 hover:bg-theme-purple-500 text-white disabled:bg-theme-purple-600/50 disabled:cursor-not-allowed',
    badge: 'bg-theme-purple-500/20 text-theme-purple-400 border border-theme-purple-500/30',
  },
  primary: {
    text400: 'text-primary-400',
    text300: 'text-primary-300',
    bg400: 'bg-primary-400',
    bg500: 'bg-primary-500',
    bg600: 'bg-primary-600',
    border400: 'border-primary-400',
    border500: 'border-primary-500',
    border500_30: 'border-primary-500/30',
    hoverBorder500: 'hover:border-primary-500',
    hoverText400: 'hover:text-primary-400',
    bg500_10: 'bg-primary-500/10',
    bg500_20: 'bg-primary-500/20',
    shadow500_25: 'shadow-primary-500/25',
    shadow500_40: 'shadow-primary-500/40',
    button:
      'bg-primary-600 hover:bg-primary-500 text-white disabled:bg-primary-600/50 disabled:cursor-not-allowed',
    badge: 'bg-primary-500/20 text-primary-400 border border-primary-500/30',
  },
  orange: {
    text400: 'text-primary-400',
    text300: 'text-primary-300',
    bg400: 'bg-primary-400',
    bg500: 'bg-primary-500',
    bg600: 'bg-primary-600',
    border400: 'border-primary-400',
    border500: 'border-primary-500',
    border500_30: 'border-primary-500/30',
    hoverBorder500: 'hover:border-primary-500',
    hoverText400: 'hover:text-primary-400',
    bg500_10: 'bg-primary-500/10',
    bg500_20: 'bg-primary-500/20',
    shadow500_25: 'shadow-primary-500/25',
    shadow500_40: 'shadow-primary-500/40',
    button:
      'bg-primary-600 hover:bg-primary-500 text-white disabled:bg-primary-600/50 disabled:cursor-not-allowed',
    badge: 'bg-primary-500/20 text-primary-400 border border-primary-500/30',
  },
  zinc: {
    text400: 'text-text-body',
    text300: 'text-text-label',
    bg400: 'bg-surface-hover',
    bg500: 'bg-surface-input',
    bg600: 'bg-surface-card',
    border400: 'border-border-input',
    border500: 'border-border-default',
    border500_30: 'border-border-default',
    hoverBorder500: 'hover:border-border-input',
    hoverText400: 'hover:text-text-label',
    bg500_10: 'bg-surface-hover/50',
    bg500_20: 'bg-surface-hover',
    shadow500_25: 'shadow-black/25',
    shadow500_40: 'shadow-black/40',
    button:
      'bg-surface-input hover:bg-surface-hover text-white border border-border-input disabled:opacity-50 disabled:cursor-not-allowed',
    badge: 'bg-surface-hover text-text-body border border-border-default',
  },
};

export function getFormatThemeClasses(themeKey: string | null | undefined): FormatThemeClasses {
  return THEME_CLASS_MAP[normalizeFormatThemeKey(themeKey)];
}
