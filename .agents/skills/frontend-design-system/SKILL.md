---
name: frontend-design-system
description: >-
  Use this skill whenever creating or modifying UI components, CSS stylesheets, themes,
  typography, layouts, modals, topbar, hero, or Social/Ranking/Tracker views in Atlas (47 Picos & 196 Países).
---

# Front-End Design System & Visual Identity (Atlas)

This skill documents the canonical visual identity, CSS architecture, color tokens, typography, and layout patterns of **Atlas (47 Picos & 196 Países)**.

---

## 1. Design Philosophy

Atlas combines the tactile aesthetic of an **editorial field journal / expedition log** with a responsive Next.js SPA:
1. **Warm Paper Canvas**: Avoid stark `#ffffff` page backgrounds; use `--paper` (`#faf8f1` / `#faf8fc` / `#11111b` in dark experiences mode).
2. **Editorial Typographic Hierarchy**: `Playfair Display` for display titles, `Fraunces` for hero counters and ranking numbers, `DM Sans` for UI copy/navigation, and `DM Mono` for uppercase eyebrows, coordinates, and technical tags.
3. **Subtle Geometry**: Crisp 1px borders (`--line`), compact radii (`--radius: 3px`), and smooth transitions (`0.22s ease`).

---

## 2. Modular CSS Architecture & Color Tokens

`app/globals.css` orchestrates 10 modular stylesheets in `styles/`, alongside feature sheets:
- `styles/tokens.css` — Color palettes and font variable mappings (`--font-sans`, `--font-mono`, `--font-serif`, `--font-display`)
- `styles/base.css`, `navigation.css`, `hero.css`, `maps.css`, `item-list.css`, `detail-panel.css`, `media-viewer.css`, `modals.css`, `social-feed.css`
- Feature stylesheets: `components/ranking.css`, `components/stats-modal.css`, `components/maps/collective-map.css`

### Mode Palettes (`styles/tokens.css`)
- **Peaks (default / `.mode-peaks`)**: `--ink: #18342d`, `--pine: #245f52`, `--sage: #5c9b7d`, `--paper: #faf8f1`, `--sand: #f0eadc`, `--line: #dce4da`, `--muted: #62716b`, `--amber: #d2a54b`, `--danger: #a34f3d`.
- **Countries (`.mode-countries`)**: `--ink: #2a1f3d`, `--pine: #5b3a8c`, `--sage: #9570c7`, `--paper: #faf8fc`, `--sand: #f0e8f4`, `--line: #ddd4e8`, `--muted: #6b5f7a`.
- **Experiences Dark Mode (`.mode-experiences`)**: `--ink: #ffffff`, `--pine: #cba6f7`, `--sage: #a6adc8`, `--paper: #11111b`, `--sand: #181825`, `--line: #313244`, `--muted: #a6adc8`.

---

## 3. Typography (`next/font/google` in `app/layout.tsx`)

| Role | Font Family | CSS Variable | Canonical Usage |
| :--- | :--- | :--- | :--- |
| **Display Titles** | `Playfair Display` | `--font-display` | `h1`, `h2`, collective map headers |
| **Figures & Ranks** | `Fraunces` | `--font-serif` | Hero stats (`.hero-stat strong`), `.ranking-rank-num` |
| **Body & Controls** | `DM Sans` | `--font-sans` | Navigation, buttons, feed cards, inputs |
| **Technical Labels** | `DM Mono` | `--font-mono` | Province codes, dates, tags, metadata |

---

## 4. Canonical Layout & Component Contracts

### Topbar (`components/layout/app-topbar.tsx`, `styles/navigation.css`)
- Sticky (`position: sticky; top: 0; z-index: 20;`), 76px height, glass background.
- Centered `.app-mode-switch` pill (`47 Picos` / `196 Países`) resides exclusively in `.topbar` (always hidden inside `.hero`).
- `.account-button` renders **only** the circular avatar image or initial letter (`?`) — never email or username text.

### Hero (`components/tracker/tracker-hero.tsx`, `components/social/social-hero.tsx`, `styles/hero.css`)
- Desktop: 2-column layout with editorial motto on left (`hero-title-wrap--motto`) and `.hero-stat` ratio + progress bar on right.
- Mobile & tablet (`<= 1023px`): mottos (`.hero-title-wrap--motto.hide-on-mobile`) are strictly hidden; only numeric ratio and progress bar appear.
- Social hero on mobile (`<= 700px`): fixed 2-column grid (`1fr 1fr`, `max-width: 380px`) keeping profile block anchored across mode switches.

### Social & Ranking Alignment (`components/social-tab.tsx`, `components/ranking-tab.tsx`)
- Both use `.page-container` (`paddingTop: '14px'`, `paddingBottom: '70px'`, `paddingLeft: '16px'`, `paddingRight: '16px'`; `padding-top: 8px` on `<= 768px`) and inner `maxWidth: '680px'` wrapper so `.social-feed-controls` align identically with `.map-section`.
- Search inputs hide native `::-webkit-search-cancel-button` in favor of Atlas's clear button.
- Top-3 podium `.ranking-avatar` keeps `margin: 4px` so `outline` rings never clip; `html, body` keep `scrollbar-gutter: stable`.
- Compare button (`.map-floating-btn`) and diff legend (`.diff-legend`) keep invariant colors even when `.mode-experiences` is active.
