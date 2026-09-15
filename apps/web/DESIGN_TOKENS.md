# Design Tokens — SafeCrib Frontend

## Base

- **Background**: `#050505` → `#0d0d0d` gradient, never flat black
- **Color palette**: Black + white-at-low-opacity (glass) + neutral grays only
- No accent colors. No color-coded status. Use contrast/opacity/iconography for hierarchy.

### Landing Page Exception

The marketing landing page uses a **white background** (`#ffffff`) with inverted glass variants. This is the only page that breaks the dark theme rule. The dashboard and all authenticated routes remain dark.

## Glass System — Dark (Dashboard)

All "light" surfaces on the dashboard use the glass material. Built via CSS custom properties in `globals.css` and Tailwind utilities.

### Opacity Levels

| Token | Value | Use |
|---|---|---|
| `--glass-bg` | `rgba(255,255,255,0.04)` | Default surface |
| `--glass-bg-subtle` | `rgba(255,255,255,0.02)` | Inputs, dividers |
| `--glass-bg-heavy` | `rgba(255,255,255,0.08)` | Elevated surfaces |

### Blur Values

| Class | Blur | Use |
|---|---|---|
| `glass-subtle` | `8px` | Inputs, small panels |
| `glass-panel` (default) | `12px` | Cards, modals |
| `glass-heavy` | `20px` | Hero sections, overlays |
| `glass-sidebar` | `24px` | Dashboard nav sidebar |
| `glass-navbar` | `32px` | Marketing navbar (most premium) |

### Navbar Premium Tier

The navbar uses a standalone `.glass-navbar` class rather than `GlassPanel` because it needs fixed positioning and a distinct border treatment:

- **Background**: `rgba(12, 12, 12, 0.7)` — slightly darker and more opaque than default glass
- **Blur**: `32px` — strongest in the system
- **Saturation**: `200%` — premium frosted appearance
- **Border**: `1px solid rgba(255,255,255,0.1)` bottom edge only — cleaner than the gradient border used elsewhere
- **Inset highlight**: `0 1px 0 rgba(255,255,255,0.04) inset` — subtle top-edge light catch
- **Shadow**: `0 8px 32px rgba(0,0,0,0.5)` — stronger than default for depth against the background

## Glass System — Light (Landing Page)

The marketing landing page uses inverted glass variants designed for a white background.

### Light Glass Classes

| Class | Background | Border | Blur | Shadow |
|---|---|---|---|---|
| `.glass-panel-light` | `rgba(0,0,0,0.02)` | `rgba(0,0,0,0.06)` | `12px` | `0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)` |
| `.glass-navbar-light` | `rgba(255,255,255,0.72)` | `rgba(0,0,0,0.06)` bottom | `24px` | `0 1px 0 rgba(0,0,0,0.02) inset, 0 4px 16px rgba(0,0,0,0.04)` |

### Light Button Variants

- `.btn-primary-light`: `#111` background, white text — solid, high contrast
- `.btn-secondary-light`: transparent with `rgba(0,0,0,0.1)` border, `rgba(0,0,0,0.6)` text

### Light Text Utilities

- `.text-dark`: `#111` — primary text on white
- `.text-dark-secondary`: `rgba(0,0,0,0.5)` — secondary/muted text on white

### Border Treatment

Every glass surface has a gradient border via `::before` pseudo-element:
- Top edge: `rgba(255,255,255,0.12)` (catches light)
- Fades to `rgba(255,255,255,0.0)` at bottom
- Creates the classic "light-edge glass" effect

Border opacity by intensity:
- `--glass-border`: `0.08` (default)
- `--glass-border-subtle`: `0.04`
- `--glass-border-heavy`: `0.15`

### Shadow

`--glass-shadow`: `0 8px 32px rgba(0,0,0,0.4)` — soft, diffuse, dark-appropriate.

### Radius

`--glass-radius`: `16px` — used consistently across panels, cards, inputs.

## Component Variants

### GlassPanel
- `intensity="subtle"` — minimal blur + opacity
- `intensity="default"` — standard glass
- `intensity="heavy"` — max blur + opacity + heavier border

### Card
- Built on `GlassPanel` with `intensity="default"`
- Includes title/description slots

### Button
- `primary` — filled glass with hover lift
- `secondary` — outlined glass
- `ghost` — transparent with hover state

## Typography

- Font: Inter (via `next/font/google`)
- Weights used: 400 (body), 500 (nav), 600 (headings)
- Tracking: `-0.01em` on headings, normal on body

## Motion

- Framer Motion for all transitions
- Easing: `[0.16, 1, 0.3, 1]` (fast-out, slow-in)
- Durations: 200–400ms for UI, 400–600ms for panels
- Transform/opacity only — no layout-triggering animations

## Spacing

- Sidebar inset: `12px` from viewport edges, `w-56` (224px)
- Content area: `ml-[240px]` offset, `p-6` padding
- Panel padding: `p-6` (24px)
- Nav item padding: `px-3 py-2`
