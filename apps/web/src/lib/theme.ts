/**
 * Theme preference: "system" follows the OS, or force "light" / "dark".
 * The resolved theme is stamped on <html data-theme> which theme.css keys off.
 */
export type ThemePref = "system" | "light" | "dark";

const KEY = "bs_theme_pref";
const media = () => window.matchMedia("(prefers-color-scheme: light)");

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref === "system") return media().matches ? "light" : "dark";
  return pref;
}

function apply(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolve(pref);
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* private mode — session-only is fine */
  }
  apply(pref);
}

/** Apply the saved preference now and track OS changes while on "system". */
export function initTheme(): void {
  apply(getThemePref());
  media().addEventListener?.("change", () => {
    if (getThemePref() === "system") apply("system");
  });
}
