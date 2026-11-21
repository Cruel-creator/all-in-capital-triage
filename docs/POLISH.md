# Interface polish (make-interfaces-feel-better checklist)

Every change made against the checklist across Phases 3-6, grouped by principle. Principles reviewed with nothing to change are listed at the end.

#### Shadows over borders, and one surface language
| Before | After |
|---|---|
| Pipeline cards with a spotlight glow and a hover lift (`translate: 0 -1px`) | Plain rows inside shadow-edged lane panels; hover changes background colour only |
| Corner radii of 10px and 12px mixed with 8px (`pipeline-board`, `tabs`, criterion cards, calibration, corrections, settings, application header) | One 8px scale for surfaces; 12px only for dialogs (command palette) |

#### Interruptible animations, split and stagger
| Before | After |
|---|---|
| Headline and company name assembled word by word from blur (BlurText) | Plain text; motion kept to a staggered fade for lanes and cards (GSAP, `power3.out`, 60ms apart) |
| Scroll reveals left content invisible if animation frames paused (hidden tab) | Safety net: anything on screen and still invisible after 2s is shown |

#### Scale on press
| Before | After |
|---|---|
| `.press:active { transform: scale(0.96) }` applied to disabled buttons too | `.press:active:not(:disabled)`: only controls that respond give feedback |

#### Focus states
| Before | After |
|---|---|
| `:focus-visible` set `border-radius: var(--radius-sm)`, reshaping cards and pills on focus | Ring is a two-layer `box-shadow` that follows each element's own corners |
| Card links drew a second outline on top of the global ring | One focus ring everywhere |

#### Minimum hit area
| Before | After |
|---|---|
| Override button `h-7` (28px) with no extended hit area | `.hit` pseudo-element extends it to 40×40px |
| Phone menu and close buttons absent / small | 40×40px menu and close buttons |

#### Colour carries meaning, nothing else
| Before | After |
|---|---|
| Middling ratings ("Promising") shown in the accent colour | Neutral ink; colour only for good (green), caution (amber), bad (red) |
| Selected pattern chips, decision choices and applied-correction pills filled with the accent | Neutral fill with a ring, so the email send stays the one primary action on the page |

#### Tabular numbers
| Before | After |
|---|---|
| Lane counts, spend tiles and calibration figures used proportional digits in places | `.num` (`tabular-nums`) on every count, amount and score |

#### Copy that reads like the product, not the build
| Before | After |
|---|---|
| "add Google keys to .env.local", ".example seed sites", raw `deck_vs_form`, `extract_claims`, "Riya to dig" vs "Dig first" | "Google sign-in isn't set up yet", "Nothing found online…", "Deck vs form", "Check the numbers", one label: "Dig first" |

Reviewed, nothing needed: font smoothing (set once on the root), `text-wrap: balance` on headings and `pretty` on body, no `transition: all` anywhere, no `will-change`, no images needing outlines, no AnimatePresence first-render animations.
