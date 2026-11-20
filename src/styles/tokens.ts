// Colour tokens from DESIGN.md. Single source: globals.css mirrors these as CSS variables, and
// scripts/check-contrast.ts verifies every text/background pair against WCAG AA.
export const themes = {
  light: {
    canvas: "#ffffff",
    "surface-1": "#f7f8f8",
    "surface-2": "#f1f2f3",
    "surface-3": "#e9ebed",
    hairline: "#e4e6e9",
    "hairline-strong": "#d0d4d9",
    ink: "#0f1011",
    "ink-muted": "#3c4047",
    "ink-subtle": "#62666d",
    "ink-disabled": "#9ba0a8",
    primary: "#5763cc", // Linear's #5e6ad2 darkened one step: AA (≥4.5) as link text on surface-1
    "primary-hover": "#4853bd",
    "on-primary": "#ffffff",
    red: "#c4372c",
    "red-bg": "#fdf0ef",
    amber: "#8a5a00",
    "amber-bg": "#fdf6e7",
    green: "#1f7a3a",
    "green-bg": "#eef7f0",
  },
  dark: {
    canvas: "#0b0c0d",
    "surface-1": "#0f1011",
    "surface-2": "#141516",
    "surface-3": "#191a1b",
    hairline: "#23252a",
    "hairline-strong": "#34343a",
    ink: "#f7f8f8",
    "ink-muted": "#d0d6e0",
    "ink-subtle": "#8a8f98",
    "ink-disabled": "#62666d",
    primary: "#7c86e6",
    "primary-hover": "#959efa",
    "on-primary": "#0b0c0d",
    red: "#f0776d",
    "red-bg": "#2a1513",
    amber: "#e3b341",
    "amber-bg": "#2a2110",
    green: "#5cc27a",
    "green-bg": "#12251a",
  },
} as const;

export type ThemeName = keyof typeof themes;
export type Token = keyof (typeof themes)["light"];

/** Text-on-background pairs the UI actually uses. AA: 4.5 for text, 3.0 for large text / UI components. */
export const PAIRS: { fg: Token; bg: Token; min: number; use: string }[] = [
  ...(["canvas", "surface-1", "surface-2", "surface-3"] as const).flatMap((bg) => [
    { fg: "ink" as Token, bg, min: 4.5, use: "body text" },
    { fg: "ink-muted" as Token, bg, min: 4.5, use: "secondary text" },
    { fg: "ink-subtle" as Token, bg, min: 4.5, use: "labels, meta" },
  ]),
  { fg: "primary", bg: "canvas", min: 4.5, use: "links" },
  { fg: "primary", bg: "surface-1", min: 4.5, use: "links on rails" },
  { fg: "on-primary", bg: "primary", min: 4.5, use: "primary button label" },
  { fg: "on-primary", bg: "primary-hover", min: 4.5, use: "primary button hover" },
  { fg: "red", bg: "red-bg", min: 4.5, use: "gate badge" },
  { fg: "red", bg: "canvas", min: 4.5, use: "red flag text" },
  { fg: "amber", bg: "amber-bg", min: 4.5, use: "warn badge" },
  { fg: "amber", bg: "canvas", min: 4.5, use: "warn text" },
  { fg: "green", bg: "green-bg", min: 4.5, use: "clear badge" },
  { fg: "green", bg: "canvas", min: 4.5, use: "take-the-call text" },
  { fg: "primary", bg: "canvas", min: 3, use: "focus ring (non-text)" },
];

const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
