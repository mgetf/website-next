export type ColorTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'mge-theme';

function readDocumentTheme(): ColorTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: ColorTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore quota / private-mode failures; the in-memory theme still applies.
  }
}

class ThemeState {
  current = $state<ColorTheme>(readDocumentTheme());

  toggle = () => {
    this.current = this.current === 'light' ? 'dark' : 'light';
    applyTheme(this.current);
  };
}

export const theme = new ThemeState();

function cssVar(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function themeChartColors() {
  return {
    surfacePage: cssVar('--color-surface-page'),
    textHeading: cssVar('--color-text-heading'),
    textBody: cssVar('--color-text-body'),
    textLabel: cssVar('--color-text-label'),
    borderDefault: cssVar('--color-border-default'),
    info: cssVar('--color-info-500'),
    success: cssVar('--color-success-500'),
    danger: cssVar('--color-danger-500'),
  };
}
