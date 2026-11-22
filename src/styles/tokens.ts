// Colour tokens (Direction A, Private Office). Single source: globals.css mirrors these as CSS variables, and
// scripts/check-contrast.ts verifies every text/background pair against WCAG AA.
export const themes = {
  // Direction A, "Private Office": warm ivory paper, espresso ink, a brass accent (light); espresso night (dark)
  light: {
    page: "#f6f1e8",
    canvas: "#fffdf9",
    "surface-1": "#f9f4eb",
    "surface-2": "#f1eadd",
    "surface-3": "#e9e0cf",
    hairline: "#e7ddcb",
    "hairline-strong": "#d4c7ae",
    ink: "#1e1a15",
    "ink-muted": "#463d32",
    "ink-subtle": "#635849",
    "ink-disabled": "#a59a88",
    primary: "#76562a",
    "primary-hover": "#5f4520",
    "on-primary": "#fffdf9",
    solid: "#1e1a15",
    "on-solid": "#f6f1e8",
    "solid-muted": "#d8c39a",
    red: "#9a3426",
    "red-bg": "#f8e8e2",
    amber: "#7c560f",
    "amber-bg": "#f7edd9",
    green: "#3b6427",
    "green-bg": "#ecf2e4",
  },
  dark: {
    page: "#12100d",
    canvas: "#1a1713",
    "surface-1": "#1f1b16",
    "surface-2": "#26211b",
    "surface-3": "#2d2720",
    hairline: "#352e25",
    "hairline-strong": "#4a4033",
    ink: "#f3ecdf",
    "ink-muted": "#d8cebd",
    "ink-subtle": "#ab9f8b",
    "ink-disabled": "#6f6555",
    primary: "#d9b77e",
    "primary-hover": "#e7c993",
    "on-primary": "#1a1713",
    solid: "#efe6d6",
    "on-solid": "#1e1a15",
    "solid-muted": "#6a5634",
    red: "#f0907e",
    "red-bg": "#2f1b16",
    amber: "#e7c26e",
    "amber-bg": "#2c2415",
    green: "#a3cf86",
    "green-bg": "#1d2718",
  },
} as const;

export type ThemeName = keyof typeof themes;
export type Token = keyof (typeof themes)["light"];

/** Text-on-background pairs the UI actually uses. AA: 4.5 for text, 3.0 for large text / UI components. */
export const PAIRS: { fg: Token; bg: Token; min: number; use: string }[] = [
  ...(["page", "canvas", "surface-1", "surface-2", "surface-3"] as const).flatMap((bg) => [
    { fg: "ink" as Token, bg, min: 4.5, use: "body text" },
    { fg: "ink-muted" as Token, bg, min: 4.5, use: "secondary text" },
    { fg: "ink-subtle" as Token, bg, min: 4.5, use: "labels, meta" },
  ]),
  { fg: "primary", bg: "canvas", min: 4.5, use: "links" },
  { fg: "primary", bg: "page", min: 4.5, use: "links and eyebrows on the page" },
  { fg: "on-solid", bg: "solid", min: 4.5, use: "active nav pill, decision seal" },
  { fg: "solid-muted", bg: "solid", min: 4.5, use: "labels on the decision seal" },
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
