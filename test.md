 ■ 🎨 Design QA Report — https://design-to-code-demo.vercel.app/
  
  Summary: 2 critical · 3 serious · 4 moderate · 3 minor issues found across accessibility,
  heuristics, and design-token compliance audits.
  
  ---
  
  ▶ 🔴 Critical
  
  #    Title                                         Location
  Source(s)                            WCAG                         Recommendation
  ───  ────────────────────────────────────────────
  ──────────────────────────────────────────────────────────  ───────────────────────────────────
  ───────────────────────────
  ───────────────────────────────────────────────────────────────────────────────────────────────
  ────────────────────────────────────────────────────────────
  1    Insufficient text contrast — body copy        Hero section paragraph text
  a11y-auditor, design-system-checker  1.4.3 AA (contrast ≥ 4.5:1)  Replace the off-palette grey
  (#9CA3AF) with the design token --color-text-secondary (#6B7280 minimum) or darken to meet
  4.5:1 against the white background.
  2    Missing accessible name on icon-only buttons  "Add to cart" and "Wishlist" icon buttons in
  product cards  a11y-auditor                         4.1.2                        Add aria-label
  (e.g. aria-label="Add to wishlist") or a visually-hidden <span> to every icon-only interactive
  element.                                     
  
  ---
  
  ▶ 🟠 Serious
  
  #    Title                                            Location
  Source(s)                            WCAG                  Recommendation
  ───  ───────────────────────────────────────────────  ───────────────────────────────────────
  ───────────────────────────────────  ────────────────────
  ───────────────────────────────────────────────────────────────────────────────────────────────
  ────────────────────────────────────────────
  3    Contrast failure on CTA button label             Primary "Shop Now" button
  a11y-auditor, design-system-checker  1.4.3 AA              Button background uses #6366F1
  (off-token purple) instead of --color-primary-600; the white label fails 4.5:1. Switch to the
  correct token.
  4    Touch targets below 24 × 24 px                   Navigation icon links (mobile viewport)
  heuristic-critic                     2.5.8 AA (WCAG 2.2)   Ensure all interactive targets meet
  at least 24 × 24 CSS px; recommended minimum is 44 × 44 px per Apple/Google guidelines.
  5    Focus indicator not visible on card hover state  Product cards — keyboard focus ring
  a11y-auditor, heuristic-critic       2.4.11 AA (WCAG 2.2)  Add a visible outline or box-shadow
  focus ring using --color-focus-ring token; do not rely solely on the hover background change.
  
  ---
  
  ▶ 🟡 Moderate
  
  #    Title                                 Location                                  Source(s)
  WCAG   Recommendation
  ───  ────────────────────────────────────  ────────────────────────────────────────
  ──────────────────────────────  ─────
  ───────────────────────────────────────────────────────────────────────────────────────────────
  ────────────────────────────────────────────────────────────────────────────────────────────
  6    Off-token border-radius on cards      Product card component
  design-system-checker           —      Card uses border-radius: 10px; the token is --radius-md:
  8px. Update to the correct token to maintain visual consistency.
  7    Non-token spacing between grid items  Product grid section
  design-system-checker           —      Gap is 20px; closest tokens are --space-4 (16px) or
  --space-6 (24px). Align to one of those to preserve the 4-point grid.
  8    Heading hierarchy skips H2 → H4       "Featured Products" section
  heuristic-critic, a11y-auditor  1.3.1  Replace the <h4> product name headings with <h2> or <h3>
  to maintain a logical, unbroken document outline.
  9    Images lack descriptive alt text      Hero banner image and all product images
  a11y-auditor                    1.1.1  Replace empty or generic alt="" / alt="image" with
  meaningful descriptions (e.g. alt="Blue denim jacket, front view"). Purely decorative images
  should use alt="" with role="presentation".
  
  ---
  
  ▶ 🔵 Minor
  
  #    Title                                                       Location
  Source(s)              WCAG  Recommendation
  ───  ──────────────────────────────────────────────────────────  ───────────────────────
  ─────────────────────  ────
  ───────────────────────────────────────────────────────────────────────────────────────────────
  ───────────────────────────────────────────────────────────────────────────────────
  10   Off-token font-size for price labels                        Product card price text
  design-system-checker  —     Price uses font-size: 15px; the scale has --text-sm: 14px and
  --text-base: 16px. Snap to the nearest token.
  11   Redundant title attribute on links                          Footer navigation links
  heuristic-critic       —     title tooltips repeat the link text verbatim; remove them to
  reduce screen-reader noise.
  12   Low visual hierarchy — CTA competes with secondary actions  Hero section
  heuristic-critic       —     The "Learn More" ghost button is nearly the same visual weight as
  "Shop Now." Reduce the ghost button's prominence (lighter border, smaller size) to reinforce
  the primary action.
  
  ---
  
  ▶ Overlapping Findings Merged
  • Contrast failures (items 1 & 3) were flagged by both a11y-auditor (axe WCAG 1.4.3 violations)
  and design-system-checker (off-palette color tokens) — consolidated into single entries.
  • Focus visibility (item 5) was independently caught by both a11y-auditor (WCAG 2.4.11) and
  heuristic-critic (visual critique) — merged.
  
  ---
  
  │ Next steps: Prioritize items 1–5 for the current sprint (critical/serious). Items 6–9 are
  moderate and should be addressed in the same PR if possible. Items 10–12 are housekeeping-level
  and can be batched.