# All In Capital Triage — UI Review (retroactive, 6-pillar)

**Audited:** 2026-11-21
**Baseline:** DESIGN.md (Linear-derived, light-first) + owner intent (working dashboard, opinion-first, keyboard-first, WCAG AA)
**Screenshots:** not captured. Dev server answered 200 on :3000, but both `npx playwright screenshot` runs (desktop 1440, mobile 375) failed. This audit is from code only.
**Interaction captures:** off

---

## Pillar Scores

| Pillar | Score | Key Finding |
|---|---|---|
| 1. Copywriting | 3/4 | Strong verdict copy. Leaks: dev/seed text in prod UI, raw enum labels, a hardcoded "Ledgerly" row |
| 2. Visuals / hierarchy | 2/4 | Board of spotlight cards, blur-in headlines and lifting lane tiles reads as a showcase, which DESIGN.md bans |
| 3. Color | 3/4 | Tokens are clean and status always comes with a word. But the accent is spent on the "OK" rating, the spotlight glow and pattern chips |
| 4. Typography | 3/4 | Mostly on scale. Off-scale 18/19/32px, ad-hoc tracking, and `text-[11px]` used for content |
| 5. Spacing / layout | 2/4 | 10px radius is used everywhere (not on the scale). On mobile there is no nav. Lane tiles repeat the lane headers |
| 6. Experience design | 2/4 | Keyboard promises break on the default view, mobile navigation is missing, and the palette is missing screens. Error/disabled states are good |

**Overall: 15/24**

---

## Top Priority Fixes

1. **BLOCKER: no navigation below 768px.** `shell.tsx` `Rail` is `hidden md:flex`, and `MobileBar` holds only the brand and the theme toggle. On a phone, Calibration, Corrections, Portfolio and Settings can't be reached. Fix: add a menu button in `MobileBar` that opens the NAV in a `<dialog>` sheet, or a horizontal scroll nav.
2. **BLOCKER: keyboard promises are broken on the default view.** The rail says "/ to search", and DESIGN.md requires j/k + Enter. But `/` and j/k are wired only in `pipeline-table.tsx` (List view). The default Board (`pipeline-board.tsx:103`, `data-search`) has no listener, so `/` does nothing. Fix: move the key handler into `PipelineBoard` (focus `[data-search]` on `/`, j/k across card links in lane order). Also persist the board/list choice.
3. **WARNING: the command palette is missing screens.** `layout.tsx` items = Pipeline + applications only, yet the placeholder says "or screen". Fix: add Calibration, Corrections, Portfolio and Settings. Also add an Esc reset and wrap-around on arrow keys.
4. **WARNING: showcase effects against DESIGN.md "Don't: gradients, glows, spotlight cards".** `globals.css .spotlight` (a radial-gradient glow), `.lift` hover translate, `SpotlightCard` in board and criterion cards, and `BlurText` on the page headline and company name. Fix: remove the spotlight and lift, and drop BlurText for plain `h1`/`p`.
5. **WARNING: accent misuse.** In `pipeline-board.tsx:24` the `TONE.neutral → text-primary` mapping paints every mid rating in the accent, so the accent stops meaning "actionable". `override.tsx` pattern chips use a `bg-primary` fill, and applied corrections use `bg-primary/10`. Fix: use neutral → `text-ink-muted`, selected chips → `bg-surface-3 text-ink` with a ring, and applied corrections → `bg-surface-1`.
6. **WARNING: radius off-scale.** `rounded-[10px]` is used on board cards, lane tiles, tabs, criterion cards, calibration, corrections and settings panels, and the alert. Fix: replace it globally with `rounded-[8px]`. The header band at `rounded-[12px]` should also be 8px (12 is reserved for dialogs).
7. **WARNING: lane tiles duplicate the lanes.** `pipeline-board.tsx:84-99` renders 4 tiles (title + count + hint), and then each lane header repeats the title + hint. This costs about 120px above the fold. Fix (MANUAL): a compact segmented filter with counts, with hints only in the lane headers.
8. **WARNING: dev and seed copy leaks into the UI.** "Gmail: add Google keys to .env.local" (`shell.tsx:19`), "The seed applications use placeholder (.example) sites" (`page.tsx` Dossier), the "Run" tab with raw job steps, and a hardcoded Ledgerly row in `calibration/page.tsx`. Fix: gate these behind dev, or move them to Settings.
9. **WARNING: raw enum strings shown to users.** `String(f.check).replace(/_/g," ")`, `x.purpose.replace(...)`, `j.step` and `current_step.replace("_"," ")`, which only replaces the first underscore. Fix: use label maps like `EVENT`.
10. **WARNING: focus ring conflict.** `pipeline-board.tsx:42` card link adds `focus-visible:outline-2 outline-primary` on top of the global box-shadow ring, which gives a double ring with mismatched radius (card 10 vs ring 6). Fix: remove the outline classes and set `rounded-[inherit]`.

Further minor items: `window.prompt` for "Save view"; view delete has no undo; tabpanels lack `tabIndex={0}`; the Timeline tab renders an empty panel when there are no events; Override `h-7` (28px) has no `.hit` wrapper; the "/ search" placeholder in list view uses an arbitrary double space; and below 768px, touch targets of `h-8` are under 44px.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)
- Good: the headline sentence (`page.tsx` `headline()`), lane hints, "Our take / For it / Against it / What would change our mind", the gap panel ("Searched N sources, nothing found"), and empty states with next actions (corrections → "Go to the pipeline"). These meet the opinion-first intent.
- `page.tsx` header right side: "Every line cites its source. Nothing moves without Kushal." This is a tagline, not dashboard info. It repeats on every load. Consider dropping it.
- The List view still leads with numeric scores (`Score` + ScoreBar) and "Evidence %", which contradicts "words not numbers". Use Meter + word in the list and keep the number in the title. (MANUAL)
- `CouldntFind` renders "(scored 6.0, Med confidence)", a number outside Calibration.
- The `ACTION.dig` label is "Riya to dig" in `ui.tsx`, "Dig first" on the board lane and in calibration. Pick one.
- Generic labels: "Cancel" and "Save override" are acceptable. "Check for replies" was fine.

### Pillar 2: Visuals (2/4)
- The focal point is clear (headline + lanes). But SpotlightCard + lift + BlurText + Reveal-on-scroll stagger on every screen give it "design showcase" motion. That runs against the owner's intent and DESIGN.md Don'ts.
- DESIGN.md says "Pipeline: a table, not cards". The default is a card board. This is an intentional product deviation, so DESIGN.md should be updated or the default flipped. (MANUAL)
- The detail header band stacks breadcrumb, a 28px name, badges, verdict, pros/cons, meter, view toggle, gates and the decision bar in one card. It is dense but works. The `Meter` without a number is fine, but DESIGN.md says "Score: never a lone number / always breakdown". The header dropped the ScoreBar, which is a deviation.
- Icon-only controls: "×" delete-view has an aria-label (good). The brand SVG is aria-hidden (good).

### Pillar 3: Color (3/4)
- Tokens match DESIGN.md exactly (light + dark), and there are no hex colours in TSX apart from tokens. Status badges always carry a word.
- Accent use counted beyond spec: Meter "OK" rating, `.spotlight` glow, `::selection`, the override pattern chip fill, `bg-primary/10` correction pills, the processing pulse dot, and a primary-filled "Go to the pipeline" (fine as the one primary).
- The detail page can show several primary-filled buttons at once (Composer review/send, DecisionBar submit, Override save, pending approve). DESIGN.md says "one primary per view". (MANUAL priority call)
- `dialog::backdrop rgb(0 0 0/.32)` plus `backdrop:bg-black/30` is a duplicate definition.
- Calibration matrix: `bg-green-bg/red-bg` with numbers and an aria-label is acceptable. Colour is backed by the row and column headers.

### Pillar 4: Typography (3/4)
- Sizes in use: 11, 12, 13, 14, 15, 18, 19, 20, 28, 32. Spec scale: 11/12/13/14/15/20/28. The off-scale ones are 18 (lane counts, calibration cells), 19 (verdict), and 32 (agreement).
- Weights are 400/500/600 only, which is compliant.
- `text-[11px]` is used for content in places (query font-mono, formula, pattern chips). 11px is eyebrow-only in the spec.
- `tabular-nums` (`.num`) is applied consistently. The corrections score delta and calibration are good.

### Pillar 5: Spacing / layout (2/4)
- Radii: `rounded-[10px]` appears in about 12 places, and the spec has no 10. The `rounded-[4px]` segmented buttons inside 6px containers are concentric (good).
- Gutters match the spec (px-4 / md:px-6). `max-w` differs by page (720/960/1080/1440), which is acceptable.
- Responsive: the detail grid stacks at `lg` (spec 1024, good). The rail doesn't collapse to icons at 1024, as the spec requires. It is either 220px or gone. The table drops columns well. Below 768px there is no nav (BLOCKER above).
- Lane tiles plus lane headers double the vertical cost.

### Pillar 6: Experience design (2/4)
- States, good: empty pipeline and no-filter-match (with "Clear filters"), "Still reading this one…", needs-attention alerts with `role="alert"`, server-action errors in `role="alert"`, a live autosave status (`aria-live`), disabled Send until Gmail is connected, a send confirmation naming the recipient and slots, a required reason for overrides and decisions, and live refresh while processing.
- Keyboard: tabs have correct roving tabindex. The palette is a combobox with activedescendant. The skip link is present. Broken: `/` and j/k on the Board (default). The palette has no screens. List j/k row highlight only follows focus; the Enter hint relies on native link behaviour (OK).
- A11y: the global focus ring is good. The BlurText aria-label on a `p` is not a reliable name for a generic element, so screen readers may read nothing for the headline. Render the text in an sr-only span instead. Table rows have `onClick` (mouse only), and the link inside is the keyboard path (OK). `ScoreBar` `role="img"` with a full label is good.
- Destructive/irreversible: Send has a confirm (good). Dismissing a pending reply has no confirm or undo. View delete has no undo.
- Reduced motion is respected globally and in BlurText.

Registry audit: no shadcn `components.json` was found, so it was skipped. React Bits pieces are vendored locally (`src/components/bits`).

---

## Files Audited
DESIGN.md, src/app/globals.css, src/app/layout.tsx, src/app/page.tsx, src/app/applications/[id]/page.tsx, src/app/calibration/page.tsx, src/app/corrections/page.tsx, src/app/portfolio/page.tsx, src/app/settings/page.tsx, src/components/{shell,ui,pipeline-board,pipeline-table,command-palette,tabs,override,composer,outreach,source-drawer}.tsx, src/components/bits/blur-text.tsx
