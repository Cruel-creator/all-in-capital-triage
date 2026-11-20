// pnpm check:contrast: every text/background pair in both themes must meet WCAG AA.
import { PAIRS, contrast, themes, type ThemeName } from "../src/styles/tokens";

let failed = 0;
for (const theme of Object.keys(themes) as ThemeName[]) {
  for (const p of PAIRS) {
    const r = contrast(themes[theme][p.fg], themes[theme][p.bg]);
    const ok = r >= p.min;
    if (!ok) failed++;
    console.log(`${ok ? "OK  " : "FAIL"} ${theme.padEnd(5)} ${p.fg.padEnd(14)} on ${p.bg.padEnd(10)} ${r.toFixed(2).padStart(5)} (min ${p.min}) ${p.use}`);
  }
}
console.log(failed ? `\n${failed} pair(s) fail WCAG AA` : "\nAll pairs pass WCAG AA");
process.exit(failed ? 1 : 0);
