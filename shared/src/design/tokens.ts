/**
 * BudgetSmart design tokens — the single source of truth for the
 * black / white / neon-green cyber-terminal aesthetic.
 *
 * The frontend mirrors these into CSS custom properties (see theme.css),
 * but charts and inline styles read them from here so there is exactly
 * one place that defines the look.
 */

export const colors = {
  /** Pure black canvas. */
  bg: "#000000",
  /** Deep charcoal for raised surfaces / cards. */
  surface: "#0A0A0A",
  surfaceAlt: "#111111",
  /** Pure white — information text. */
  fg: "#FFFFFF",
  /** Muted white for secondary text. */
  fgMuted: "#9CA3AF",
  fgFaint: "#5A5A5A",
  /** Neon green — action, focus, success. */
  accent: "#00FF41",
  accentDim: "#00B82F",
  accentGlow: "rgba(0, 255, 65, 0.35)",
  /** Borders / outlines. */
  border: "#1C1C1C",
  borderAccent: "#00FF41",
  /** Status. */
  error: "#FF0033",
  warning: "#FFD600",
  success: "#00FF41",
  info: "#00FF41",
} as const;

export const radius = {
  sm: "6px",
  md: "8px",
  lg: "12px",
  pill: "999px",
} as const;

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
} as const;

export const typography = {
  sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", "Fira Code", ui-monospace, monospace',
  weights: { regular: 400, medium: 500, semibold: 600 },
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
} as const;

/** Snappy, digital, no bounce. */
export const motion = {
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
  fast: "120ms",
  base: "180ms",
  slow: "260ms",
} as const;

export const shadow = {
  card: "0 1px 2px rgba(0,0,0,0.6)",
  glow: "0 0 12px rgba(0, 255, 65, 0.35)",
  glowStrong: "0 0 24px rgba(0, 255, 65, 0.5)",
} as const;

/** Ordered palette for category swatches — all on-brand neon/charcoal range. */
export const categoryPalette = [
  "#00FF41",
  "#00E0FF",
  "#FFD600",
  "#FF0033",
  "#B388FF",
  "#FF7A00",
  "#00FFB2",
  "#FF00AA",
] as const;

export const designTokens = {
  colors,
  radius,
  spacing,
  typography,
  motion,
  shadow,
  categoryPalette,
} as const;

export type DesignTokens = typeof designTokens;
