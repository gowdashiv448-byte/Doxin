import { DEFAULT_THEME_COLOR, THEME_COLORS, type ThemeColor } from "@doxin/shared";

const STORAGE_KEY = "doxin.themeColor";

export const THEME_SWATCHES: Record<ThemeColor, string> = {
  orange: "#E8590C",
  green: "#15803D",
  blue: "#1D4ED8",
  purple: "#7E22CE",
};

export function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === "string" && (THEME_COLORS as readonly string[]).includes(value);
}

export function readStoredTheme(): ThemeColor {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeColor(stored) ? stored : DEFAULT_THEME_COLOR;
  } catch {
    return DEFAULT_THEME_COLOR;
  }
}

export function applyTheme(theme: ThemeColor): void {
  document.documentElement.dataset.colorTheme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* localStorage can be unavailable in private or restricted contexts */
  }
}
