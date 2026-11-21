## Accessibility Audit: All In Capital triage
**Standard:** WCAG 2.1 AA | **Date:** 21 Nov 2026 | **Screens:** pipeline, application, calibration, corrections, portfolio, settings, cost & ops, sign-in

### Summary
**Issues found:** 5 | **Critical:** 0 | **Major:** 2 | **Minor:** 3 (all fixed; two notes at the end)

Method: an axe-core scan of all 8 screens in light and dark (16 page views); a reflow check at 320px; a scripted keyboard-only pass; the project's contrast checker over every token pair. Automated tools catch about a third of issues, so manual screen-reader testing (NVDA, VoiceOver) is still worth doing.

### Findings

#### Perceivable
| # | Issue | WCAG Criterion | Severity | Fix |
|---|-------|---------------|----------|-----|
| 1 | Application page overflowed 407px at 320px wide (long search queries in "What we couldn't find", citation chip groups that couldn't wrap, grid columns that couldn't shrink) | 1.4.10 Reflow | 🟡 Major | Columns `min-w-0`, query table scrolls inside its panel with long strings breaking, chip groups wrap. **Fixed** |
| 2 | Pipeline search and layout toggle overflowed 13px at 320px | 1.4.10 Reflow | 🟢 Minor | Search takes the remaining width on small screens. **Fixed** |

#### Operable
| # | Issue | WCAG Criterion | Severity | Fix |
|---|-------|---------------|----------|-----|
| 3 | Focus ring changed an element's corner radius when it took focus | 2.4.7 Focus Visible | 🟢 Minor | Ring follows the element's own corners. **Fixed** |

#### Robust
| # | Issue | WCAG Criterion | Severity | Fix |
|---|-------|---------------|----------|-----|
| 4 | Pipeline rows were announced as run-together text ("StockSathiLending fintechB2B…") | 4.1.2 Name, Role, Value | 🟡 Major | Each row has a spoken label: company, sector, the take, the rating word, any gates. **Fixed** |
| 5 | Disabled buttons still animated on press, implying they respond | 4.1.2 (state) | 🟢 Minor | Press feedback only on enabled controls. **Fixed** |

### Color Contrast Check
Every text and focus-ring pair in both themes passes AA (`pnpm check:contrast`, and axe found no contrast violations). Status colour is always paired with a word, never colour alone.

### Keyboard Navigation (verified by script)
| Element | Behaviour |
|---------|-----------|
| First Tab | "Skip to content" link, then the sidebar |
| `/` | Focuses pipeline search |
| `j` / `k`, Enter | Move between pipeline rows; Enter opens the application |
| ⌘K / Ctrl+K, Escape | Opens and closes the command palette, focus in its search box |
| Tabs (evidence) | Arrow keys move between tabs; panels are focusable |
| Dialogs (source drawer, palette, phone menu) | Native `<dialog>`: focus is held inside, Escape closes |

### Screen Reader
| Element | Announced As |
|---------|-------------|
| Pipeline row | "StockSathi, Lending fintech. Strongest on founder-market fit; thinnest on speed of execution. Rated mixed. Gates: Regulatory risk, Portfolio conflict, Integrity." |
| Rating meter | The word ("Mixed"); the tick marks are hidden from assistive tech |
| Lane filters | Toggle buttons with pressed state and count |
| Errors and saves | `role="alert"` for errors, `aria-live` for "Saving… / Saved" |

### Notes, not fixed
- **Touch targets:** most controls are 32-40px. That meets WCAG 2.2's 24px AA target, but not the 44px AAA target. The lane filter chips sit 6px apart, so enlarging their hit areas would make them overlap.
- **Real assistive tech:** not yet tested with NVDA or VoiceOver.
