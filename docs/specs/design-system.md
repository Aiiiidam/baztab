---
version: alpha
name: Emza
description: |
  Emza's design system embodies a modern, tech-forward aesthetic grounded in a
  confident purple brand identity. The palette combines deep purples with clean,
  light neutrals to create an interface that feels simultaneously professional
  and approachable. Generative shapes and illustrative elements (visible in the
  hero sections with laptop and mobile device visualizations) balance the
  geometric precision of UI components. The overall mood is accessible and
  trustworthy, reflecting its positioning as a digital certification platform.
  The use of generous whitespace, smooth rounded corners on interactive
  elements, and a carefully graduated neutral scale convey a sense of clarity
  and control.
source:
  url: "https://emza.me/%d8%af%d8%b1%db%8c%d8%a7%d9%81%d8%aa-%da%af%d9%88%d8%a7%d9%87%db%8c-%d8%a7%d9%85%d8%b6%d8%a7-%d8%af%db%8c%d8%ac%db%8c%d8%aa%d8%a7%d9%84/"
  pagesAnalyzed: 1
  extractedAt: 2026-11-26
  tokensMeasured: true
colors:
  primary: "#7B38C1"
  canvas: "#FFFFFF"
  on-primary: "#FFFFFF"
  ink: "#5A6174"
  body: "#777777"
  hairline: "#333333"
  info: "#364163"
  neutral-1: "#848484"
typography:
  heading-sm:
    fontFamily: yekanbakh
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0px
  heading-xs:
    fontFamily: yekanbakh
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0px
    textTransform: uppercase
  body-lg:
    fontFamily: yekanbakh
    fontSize: 18px
    fontWeight: 100
    lineHeight: 1.6
    letterSpacing: 0px
  body-lg-strong:
    fontFamily: yekanbakh
    fontSize: 18px
    fontWeight: 200
    lineHeight: 1.6
    letterSpacing: 0px
  body-lg-2:
    fontFamily: yekanbakh
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: 0px
  body-md:
    fontFamily: yekanbakh
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: 0px
  body-md-loose:
    fontFamily: yekanbakh
    fontSize: 16px
    fontWeight: 400
    lineHeight: 2
    letterSpacing: 0px
  body-md-tight:
    fontFamily: yekanbakh
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: 0px
rounded:
  none: 0px
  xs: 5px
  sm: 12px
spacing:
  xxs: 4px
  xs: 12px
  sm: 16px
  md: 20px
  lg: 28px
  xl: 32px
  xxl: 40px
  xxxl: 84px
  section: 108px
shadows:
  sm: "rgba(0, 0, 0, 0.15) 0px 0px 3px 0px"
elevationStrategy: single-tier
themes:
  derived: dark   # the other theme is the site's measured palette
  light:
    bg: "#FFFFFF"
    surface: "#F7F7F7"
    surfaceRaised: "#F1F1F2"
    text: "#5A6174"
    textMuted: "#777777"
    border: "#333333"
    accent: "#7B38C1"
    accentFg: "#FFFFFF"
    focusRing: "#7B38C1"
    elevation: shadow
  dark:
    bg: "#0F0C13"
    surface: "#1D1B21"
    surfaceRaised: "#29272D"
    text: "#FAF7FD"
    textMuted: "#A19EA4"
    border: "#353339"
    accent: "#9A64D2"
    accentFg: "#0B0B0C"
    focusRing: "#8545C9"
    elevation: "border+surface"
  contrastFailures:
    - "light: muted on bg = 4.48:1 (needs 4.5:1)"
components:
  button-primary:
    textColor: "{colors.on-primary}"
    height: 42px
    padding: "12px 20px 12px 20px"
    fontSize: 13px
    fontFamily: yekanbakh
    fontWeight: 600
    lineHeight: 1.38
    rounded: "{rounded.xs}"
    backgroundColor: "{colors.primary}"
  button-primary-2:
    textColor: "{colors.on-primary}"
    height: 42px
    padding: "12px 20px 12px 20px"
    fontSize: 13px
    fontFamily: yekanbakh
    fontWeight: 600
    lineHeight: 1.38
    rounded: "{rounded.sm}"
    backgroundColor: "{colors.primary}"
  card:
    typography: "{typography.body-md}"
    textColor: "{colors.info}"
  navigation:
    typography: "{typography.body-md}"
    textColor: "{colors.info}"
    height: 40px
    padding: "0px 10px 0px 10px"
  footer:
    typography: "{typography.body-md}"
    textColor: "{colors.body}"
    backgroundColor: "rgb(250, 247, 255)"
  link:
    textColor: "{colors.hairline}"
    padding: "5px 20px 5px 55px"
    fontSize: 13px
    fontFamily: yekanbakh
    fontWeight: 600
    lineHeight: 1.2
  link-sm:
    textColor: "{colors.hairline}"
    padding: "0px 10px 0px 10px"
    fontSize: 15px
    fontFamily: yekanbakh
    fontWeight: 400
    lineHeight: 1.2
states:
  other-hover:
    target: other
    state: hover
    transform: "rotate(180deg)"
  other-focus:
    target: other
    state: focus
    outline: none
  input-focus:
    target: input
    state: focus
    outline: none
  button-active:
    target: button
    state: active
    textDecoration: none
  button-hover:
    target: button
    state: hover
    textDecoration: none
  button-disabled:
    target: button
    state: disabled
    opacity: 0.5
    boxShadow: none
  link-active:
    target: link
    state: active
    transform: "scale(0.98)"
  other-active:
    target: other
    state: active
    transform: "scale(0.98)"
  input-hover:
    target: input
    state: hover
    backgroundColor: "rgba(0, 0, 0, 0)"
breakpoints:
  - width: 375
    containerWidth: 345
    gridColumns: 1
    navLinksVisible: 0
    menuToggleVisible: false
    headingPx: 0
    bodyPx: 16
    sectionPaddingX: 0
  - width: 768
    containerWidth: 738
    gridColumns: 3
    navLinksVisible: 0
    menuToggleVisible: false
    headingPx: 0
    bodyPx: 16
    sectionPaddingX: 0
  - width: 1024
    containerWidth: 994
    gridColumns: 3
    navLinksVisible: 0
    menuToggleVisible: false
    headingPx: 0
    bodyPx: 16
    sectionPaddingX: 0
  - width: 1280
    containerWidth: 1222
    gridColumns: 6
    navLinksVisible: 6
    menuToggleVisible: false
    headingPx: 0
    bodyPx: 16
    sectionPaddingX: 0
  - width: 1440
    containerWidth: 1222
    gridColumns: 3
    navLinksVisible: 6
    menuToggleVisible: false
    headingPx: 0
    bodyPx: 16
    sectionPaddingX: 0
coverage:
  statesFound: 61
  gradientsFound: 0
  rolesUnassigned: 1
  archetypesUnnamed: 0
  archetypesDetected: 0
  responsiveMeasured: true
  stylesheetsBlocked: false
  semanticRampDeclared: true
---

# Design System Inspired by Emza

```yaml
tokens:
  colors:
    primary: "#7B38C1"
    canvas: "#FFFFFF"
    ink: "#5A6174"
    body: "#777777"
    hairline: "#333333"
    neutral-1: "#848484"
    info: "#364163"
  typography:
    heading-sm:
      fontSize: 22px
      fontWeight: 600
      lineHeight: 1.4
      letterSpacing: 0px
    heading-xs:
      fontSize: 16px
      fontWeight: 700
      lineHeight: 1.4
      letterSpacing: 0px
      textTransform: uppercase
    body-md:
      fontSize: 16px
      fontWeight: 400
      lineHeight: 1.6
      letterSpacing: 0px
    body-lg-strong:
      fontSize: 18px
      fontWeight: 200
      lineHeight: 1.6
      letterSpacing: 0px
    body-lg:
      fontSize: 18px
      fontWeight: 100
      lineHeight: 1.6
      letterSpacing: 0px
    body-md-loose:
      fontSize: 16px
      fontWeight: 400
      lineHeight: 2
      letterSpacing: 0px
    body-md-tight:
      fontSize: 16px
      fontWeight: 400
      lineHeight: 1.2
      letterSpacing: 0px
    body-lg-2:
      fontSize: 18px
      fontWeight: 600
      lineHeight: 1.6
      letterSpacing: 0px
  spacing:
    xxs: 4px
    xs: 12px
    sm: 16px
    md: 20px
    lg: 28px
    xl: 32px
    xxl: 40px
    xxxl: 84px
    section: 108px
  rounded:
    none: 0px
    xs: 5px
    sm: 12px
  shadows:
    sm: "rgba(0, 0, 0, 0.15) 0px 0px 3px 0px"
  opacity:
    high: 0.99
  zIndex:
    sticky-1: 350
    sticky-2: 380
    sticky-3: 390
    sticky-4: 400
    sticky-5: 500
```

## 1. Visual Theme & Atmosphere

Emza's design system embodies a modern, tech-forward aesthetic grounded in a confident purple brand identity. The palette combines deep purples with clean, light neutrals to create an interface that feels simultaneously professional and approachable. Generative shapes and illustrative elements (visible in the hero sections with laptop and mobile device visualizations) balance the geometric precision of UI components. The overall mood is accessible and trustworthy, reflecting its positioning as a digital certification platform. The use of generous whitespace, smooth rounded corners on interactive elements, and a carefully graduated neutral scale convey a sense of clarity and control.

**Key Characteristics**
- Primary accent in deep purple (`{colors.primary}` — `#7B38C1`) establishes brand recognition across CTAs and interactive states
- High-contrast text hierarchy using `{colors.ink}` (`#5A6174`) for headings and `{colors.body}` (`#777777`) for body copy ensures legibility without harshness
- Light, clean canvas (`{colors.canvas}` — `#FFFFFF`) maximizes content focus and reduces cognitive load
- Minimal use of shadows; depth is created through color blocking and strategic use of rounded corners
- Right-to-left typography support (Persian/Farsi) integrated into all layout and spacing systems

## 2. Color Palette & Roles

### Primary
- **Brand Primary** (`{colors.primary}` — `#7B38C1`): Primary call-to-action buttons, brand accent, active/focus states, link highlights, hero accents

### Interactive
- **On Primary Surface** (`{colors.canvas}` — `#FFFFFF`): Text, labels, and icons rendered on brand-colored backgrounds; default page canvas

### Neutral Scale
- **Ink** (`{colors.ink}` — `#5A6174`): Primary headings, section titles, high-emphasis text
- **Body** (`{colors.body}` — `#777777`): Body copy, descriptions, secondary text
- **Hairline** (`{colors.hairline}` — `#333333`): 1px borders, dividers, fine lines
- **Neutral Decorative** (`{colors.neutral-1}` — `#848484`): Decorative accents, unassigned role

### Semantic / Status
- **Info** (`{colors.info}` — `#364163`): Informational text, secondary headings in footer and content areas

## 3. Typography Rules

### Font Family
**Primary:** yekanbakh (all weights)  
**Fallback:** -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Heading Small | yekanbakh | 22px | 600 | 1.4 | 0px | Section headings, card titles |
| Heading XS | yekanbakh | 16px | 700 | 1.4 | 0px | Uppercase labels, metadata |
| Body Large (Strong) | yekanbakh | 18px | 200 | 1.6 | 0px | Descriptive text, feature highlights |
| Body Large | yekanbakh | 18px | 100 | 1.6 | 0px | Light-weight body, secondary content |
| Body Large (Bold) | yekanbakh | 18px | 600 | 1.6 | 0px | Emphatic body text, featured descriptions |
| Body Medium | yekanbakh | 16px | 400 | 1.6 | 0px | Standard body copy, default text size |
| Body Medium (Loose) | yekanbakh | 16px | 400 | 2 | 0px | Body with extra line spacing for readability |
| Body Medium (Tight) | yekanbakh | 16px | 400 | 1.2 | 0px | Compact body text for dense layouts |
| Button / Link | yekanbakh | 13–15px | 600 | 1.5–1.8 | 0px | Interactive element text |

### Principles
- **Hierarchical clarity:** Weight and size work together to establish visual priority; body text uses regular weight (400) for neutral baseline
- **RTL-ready:** All typography is designed to flow right-to-left; fallback stack ensures compatibility across Persian/Farsi text rendering
- **Line spacing:** Generous line heights (1.6–2) maximize legibility and reduce cognitive strain in longer passages
- **Semantic weight:** Font weight shifts indicate importance; body light (100–200) is reserved for secondary content, bold (600–700) for primary/button text

## 4. Component Stylings

### Buttons

**Primary Button**
- Background: `{colors.primary}` (`#7B38C1`)
- Text Color: `{colors.canvas}` (`#FFFFFF`)
- Font: yekanbakh, 13px, weight 600, line-height 1.38 (18px)
- Padding: `{spacing.xs}` (`12px`) vertical, `{spacing.md}` (`20px`) horizontal
- Border Radius: `{rounded.xs}` (`5px`)
- Border: none
- Box Shadow: none
- Height: 42px
- Hover State: Text color `#FFFFFF`, background remains `{colors.primary}`, **no text decoration**
- Active State: **Scale 0.98** (slight press effect), text decoration none
- Disabled State: Opacity 0.5, box shadow none

**Primary Button (Rounded Variant)**
- Background: `{colors.primary}` (`#7B38C1`)
- Text Color: `{colors.canvas}` (`#FFFFFF`)
- Font: yekanbakh, 13px, weight 600, line-height 1.38 (18px)
- Padding: `{spacing.xs}` (`12px`) vertical, `{spacing.md}` (`20px`) horizontal
- Border Radius: `{rounded.sm}` (`12px`)
- Border: none
- Box Shadow: none
- Height: 42px
- Hover State: Text color `#FFFFFF`, background remains `{colors.primary}`, **no text decoration**
- Active State: **Scale 0.98**
- Disabled State: Opacity 0.5, box shadow none

### Navigation

**Navigation Bar (Header)**
- Background: `{colors.canvas}` (`#FFFFFF`)
- Text Color: `{colors.info}` (`#364163`)
- Font: yekanbakh, 16px, weight 400, line-height 1.6 (25.6px)
- Padding: 0px vertical, `{spacing.xs}` (`12px`) horizontal
- Height: 40px
- Border: none
- Box Shadow: none
- Border Radius: none

### Cards & Containers

**Card (Default)**
- Background: transparent
- Border: none
- Border Radius: `{rounded.none}` (`0px`)
- Text Color: `{colors.info}` (`#364163`)
- Font: yekanbakh, 16px, weight 400, line-height 1.6 (25.6px)
- Padding: none
- Box Shadow: none

### Links

**Link (Default)**
- Text Color: `{colors.hairline}` (`#333333`)
- Font: yekanbakh, 13px, weight 600, line-height 1.2 (15.6px)
- Padding: `{spacing.xs}` (`5px`) vertical, `{spacing.md}` (`20px`) horizontal (left), `{spacing.md}` (`55px`) padding-left
- Background: transparent
- Border: none
- Box Shadow: none
- Hover State: Background `{colors.primary}` with ~0.9 opacity, text color `#FFFFFF}`, **no text decoration**
- Active State: **Scale 0.98**, text decoration none

**Link (Small)**
- Text Color: `{colors.hairline}` (`#333333`)
- Font: yekanbakh, 15px, weight 400, line-height 1.2 (18px)
- Padding: 0px vertical, `{spacing.xs}` (`12px`) horizontal
- Background: transparent
- Border: none
- Box Shadow: none
- Hover State: Background `{colors.primary}` with opacity applied
- Active State: **Scale 0.98**

### Footer

**Footer Section**
- Background: `#F5F7FF` (light purple tint; derived from `{colors.primary}` with high transparency)
- Text Color: `{colors.body}` (`#777777`)
- Font: yekanbakh, 16px, weight 400, line-height 1.6 (25.6px)
- Border: none
- Box Shadow: none
- Border Radius: `{rounded.none}` (`0px`)
- Padding: none

## 5. Layout Principles

### Spacing System

Base unit: `{spacing.xs}` = `12px`

**Scale:**
- `{spacing.xxs}` = 4px — micro spacing (icon padding, tight components)
- `{spacing.xs}` = 12px — small spacing (button padding, form field padding)
- `{spacing.sm}` = 16px — standard spacing (component margins, container padding)
- `{spacing.md}` = 20px — medium spacing (section gutters, card spacing)
- `{spacing.lg}` = 28px — large spacing (feature spacing, block separators)
- `{spacing.xl}` = 32px — extra-large spacing (major section breaks)
- `{spacing.xxl}` = 40px — double extra-large spacing (prominent separators)
- `{spacing.xxxl}` = 84px — hero section spacing
- `{spacing.section}` = 108px — full section vertical padding/margin

### Grid & Container

- **Desktop (1280px+):** 1222px max-width, 6-column grid layout
- **Tablet (768–1024px):** 738px–994px content width, 3-column grid
- **Mobile (375px):** 345px content width, single-column layout
- **Section padding:** Consistent `{spacing.sm}` (`16px`) horizontal padding maintained across all breakpoints

### Whitespace Philosophy

Emza uses generous whitespace to emphasize key content and reduce visual clutter. Sections are separated by substantial vertical spacing (`{spacing.section}` = 108px) to create breathing room. Horizontal padding remains consistent (`{spacing.sm}` = 16px) even at mobile scales, prioritizing safe tap targets and readable line lengths over edge-to-edge expansion.

### Border Radius Scale

- `{rounded.none}` = 0px: Cards, containers, overlays, full-width sections
- `{rounded.xs}` = 5px: Primary buttons, small CTAs
- `{rounded.sm}` = 12px: Rounded button variants, slightly softened elements

### Border Widths

No explicit border-width scale was measured. All measured components use `0px` or `none` for borders. Hairline dividers and decorative lines are implied via the `{colors.hairline}` (`#333333`) color role but no specific stroke width was extracted.

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| Flat (Base) | No shadow, background color blocking | Cards, containers, default state |
| Dropdown | `rgba(0, 0, 0, 0.15) 0px 0px 3px 0px` | Overlay elements, floating menus |

**Shadow Philosophy**

Emza prioritizes simplicity in depth layering. Rather than a progressive cascade of shadows, the system uses a single-tier approach: most components sit flat (`0px` shadow), while dropdown and floating elements receive a subtle 3px blur at 15% opacity. This minimal shadow vocabulary keeps the interface visually lightweight while maintaining clear layer separation.

### Opacity Levels

- `0.99` (99%): Nearly opaque hover states and transitions
- `0.5`: Disabled button state
- Transparent (0): Default background for interactive elements

### Z-index / Layering

| Layer | Z-index | Context |
|---|---|---|
| Sticky Base | 350 | Standard sticky positioning |
| Sticky Level 2 | 380 | Elevated sticky elements |
| Sticky Level 3 | 390 | Further elevated sticky content |
| Sticky Level 4 | 400 | High-priority sticky |
| Sticky Level 5 | 500 | Top-most sticky / modal overlay |

The system uses a sticky-focused layering model with five distinct z-indices reserved for persistent elements (headers, navigation). No explicit modal or toast layers are defined in the extracted data.

## 7. Do's and Don'ts

### Do
- Use `{colors.primary}` (`#7B38C1`) for all primary call-to-action buttons and interactive highlights
- Maintain consistent `{spacing.sm}` (`16px`) horizontal padding on all sections, regardless of viewport width
- Apply `{rounded.xs}` (`5px`) to button elements for a subtle, modern finish
- Use `{colors.ink}` (`#5A6174`) for heading text and `{colors.body}` (`#777777`) for body copy to maintain clear hierarchy
- Implement **no text-decoration** on button hover and active states; rely on background color and scale transforms instead
- Stack sections with `{spacing.section}` (`108px`) vertical spacing for major content breaks
- Support right-to-left (RTL) text flow natively in all layout calculations and padding rules
- Apply opacity `0.5` to disabled buttons; do not use a separate disabled color

### Don't
- Do not use shadows for depth layering beyond the single-tier dropdown shadow (`rgba(0, 0, 0, 0.15) 0px 0px 3px 0px`)
- Do not apply text-decoration on button interactions; use background color and transform instead
- Do not add borders to cards or containers; rely on whitespace and color blocking
- Do not scale buttons beyond `0.98` on active state (avoid aggressive press effects)
- Do not invent new semantic colors (error, success, warning); the system does not expose a status ramp
- Do not apply rounded corners beyond `{rounded.sm}` (`12px`) to button elements
- Do not override the native font stack (yekanbakh with system fallbacks) without explicit specification
- Do not use more than one shadow effect on a single element

## 8. Responsive Behavior

### Breakpoints

| Viewport Width | Content Width | Grid Columns | Key Changes |
|---|---|---|---|
| 375px (Mobile) | 345px | 1 | Single-column layout, all sections stack vertically |
| 768px (Tablet) | 738px | 3 | Multi-column grid introduced, horizontal navigation remains hidden |
| 1024px (Tablet Large) | 994px | 3 | Increased content width, 3-column grid consistent |
| 1280px (Desktop) | 1222px | 6 | 6-column grid available, full horizontal navigation visible |
| 1440px (Desktop Large) | 1222px | 3 | Content width capped, layout stabilizes |

Navigation collapse point: Below 1280px, horizontal nav links are hidden; no mobile menu toggle is present in the measured extraction.

### Touch Targets

- **Minimum height:** 42px (observed on all button components)
- **Minimum horizontal padding:** `{spacing.md}` (`20px`) on button elements
- **Minimum clickable area:** 42px × 42px for primary buttons
- Hover states activate on desktop; tap targets remain minimum 42px for mobile accessibility

### Collapsing Strategy

- **Mobile (375px):** Content flows in a single column; sections collapse to full width with `{spacing.sm}` (`16px`) padding on each side, retaining safe margins
- **Tablet (768–1024px):** Content expands to 738–994px with 3-column grid; navigation remains collapsed
- **Desktop (1280px+):** Full 1222px content width, 6-column grid, horizontal navigation visible
- **Large Desktop (1440px):** Content width remains capped at 1222px; excess space is distributed as margins

Padding-left and padding-right remain `{spacing.sm}` (`16px`) consistently across all breakpoints.

## 9. Agent Prompt Guide

### Quick Color Reference

- **Primary CTA:** Brand Primary (`{colors.primary}` — `#7B38C1`)
- **Background:** Canvas (`{colors.canvas}` — `#FFFFFF`)
- **Heading Text:** Ink (`{colors.ink}` — `#5A6174`)
- **Body Text:** Body (`{colors.body}` — `#777777`)
- **Borders & Dividers:** Hairline (`{colors.hairline}` — `#333333`)
- **Informational Text:** Info (`{colors.info}` — `#364163`)
- **Text on Brand Surfaces:** Canvas (`{colors.canvas}` — `#FFFFFF`)

### Iteration Guide

1. **Button styling:** All primary buttons use `{colors.primary}` background, `{colors.canvas}` text, 42px height, `{spacing.xs}` vertical + `{spacing.md}` horizontal padding, `{rounded.xs}` border radius
2. **Hover interactions:** Apply background opacity shifts and **scale(0.98)** on active; never add text-decoration
3. **Typography hierarchy:** Use `{typography.heading-sm}` (22px, weight 600) for major titles, `{typography.body-md}` (16px, weight 400) for standard copy
4. **Spacing:** Sections are separated by `{spacing.section}` (108px); components use `{spacing.md}` (20px) gutters
5. **Responsive collapse:** At 1280px breakpoint, navigation becomes visible; below that, all layouts are single-column or 3-column grid
6. **Shadows:** Only apply dropdown shadow `rgba(0, 0, 0, 0.15) 0px 0px 3px 0px`; leave all other components flat
7. **RTL support:** Ensure all padding and margin calculations mirror for right-to-left text flow
8. **Disabled state:** Apply opacity 0.5; do not create a separate disabled color variant

## 10. Known Gaps

- No gradient or decorative mesh patterns were extracted from the site
- One color (`{colors.neutral-1}` — `#848484`) had no measurable semantic role and is described as a decorative accent only
- No explicit error, success, warning, or destructive color roles were measured; the system does not expose a semantic status ramp
- No dark mode or theme variant was detected; the extracted system represents light mode only
- Interaction states (`:hover`, `:focus`, `:active`, `:disabled`) for form inputs and other controls exist in the stylesheet but were not comprehensively mapped to all component types
- No gradient or blur effects on shadows were observed (all shadows are flat rgba values)
- Z-index scale is sticky-focused; no explicit modal, toast, or dropdown layer definitions were found
- Only one page was analysed; authenticated surfaces, dashboard views, and application interiors were not visited
- Border styling on inputs and form fields was not fully extracted; only button and container border data is complete
- No animation or transition duration values were measured
- Accent color usage in link hover states and other interactive contexts may vary; the primary accent is confirmed, but secondary accent colors were not distinguished