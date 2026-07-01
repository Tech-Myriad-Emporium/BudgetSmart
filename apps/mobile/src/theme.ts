// Neon design tokens for the React Native app. Mirrors @budgetsmart/shared
// design tokens, expressed for RN StyleSheet (no CSS variables on native).
export const theme = {
  colors: {
    bg: "#000000",
    surface: "#0A0A0A",
    surfaceAlt: "#111111",
    fg: "#FFFFFF",
    fgMuted: "#9CA3AF",
    fgFaint: "#5A5A5A",
    accent: "#00FF41",
    accentDim: "#00B82F",
    border: "#1C1C1C",
    error: "#FF0033",
    warning: "#FFD600",
  },
  radius: { sm: 6, md: 8, lg: 12, pill: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  font: {
    sans: "Inter",
    mono: "JetBrainsMono",
  },
} as const;
