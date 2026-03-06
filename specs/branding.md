# Scene Ready — Brand Style Guide & UI Design System

> **Purpose**: This document is the authoritative reference for all Scene Ready user interface design. When building any UI component, page, or feature for Scene Ready, follow these specifications exactly. Do not deviate from the color values, spacing tokens, typography, or component patterns defined here.

---

## Brand Identity

**Company**: Scene Ready  
**Tagline**: Prepared to Perform.  
**Domain**: sceneready.tech  
**Industries Served**: Fire, EMS, Search & Rescue  
**Product Modules**: Plans, Crew, Gear, Comms

**Brand Attributes**:
- Confident, not arrogant — speak with earned authority
- Direct, not cold — clarity without corporate fluff
- Mission-driven, not preachy — equip, don't lecture
- Professional, not sterile — serious tools, human warmth

**UI Voice & Tone**:
- Use active voice and direct language in all labels and messages
- Use fire/EMS/SAR terminology naturally (e.g., "On Duty" not "Available", "Crew" not "Users", "Apparatus" not "Vehicle")
- Keep error messages specific and actionable (e.g., "Shift end time must be after start time")
- Never use jargon from other industries (e.g., "stakeholders," "synergy," "circle back")
- Never use playful or casual language for error states (no "Oops!" or "Uh oh!" — this is software used during emergencies)
- Confirmations should be clear and professional (e.g., "Preplan saved successfully" not "Nice work!")

---

## Logo — The Chevron Mark

The Scene Ready logo is a pair of upward-pointing chevrons (navy over red) representing forward motion, rank, and readiness. Chevrons are deeply embedded in fire/EMS culture as rank indicators.

**Variants**:
| Variant | Description | Usage |
|---------|-------------|-------|
| Parent Mark | Dual chevron (navy + red) + wordmark | Corporate, shared materials, website header |
| Technology Mark | Dual chevron with data nodes/connections | Software products, tech division |
| Training Mark | Triple chevron (stacked progression) + arrow | Training, certification, education |
| Icon Only | Chevron pair, no wordmark | Favicons, app icons, social avatars, patches |
| Wordmark Only | "SCENE READY" text, no icon | Tight horizontal spaces, email signatures |

**SVG Icon Mark (inline use)**:
```svg
<svg viewBox="0 0 100 100">
  <path d="M 50 10 L 85 40 L 85 55 L 50 25 L 15 55 L 15 40 Z" fill="#1B2A4A"/>
  <path d="M 50 35 L 85 65 L 85 80 L 50 50 L 15 80 L 15 65 Z" fill="#C8102E"/>
</svg>
```

**Reversed (on dark backgrounds)**:
```svg
<svg viewBox="0 0 100 100">
  <path d="M 50 10 L 85 40 L 85 55 L 50 25 L 15 55 L 15 40 Z" fill="#FFFFFF"/>
  <path d="M 50 35 L 85 65 L 85 80 L 50 50 L 15 80 L 15 65 Z" fill="#C8102E"/>
</svg>
```

**Clear Space**: Minimum clear space = height of one chevron on all sides.  
**Minimum Sizes**: Full logo: 160px width. Icon only: 24px. Favicon: 16px.

---

## Color Palette

### Brand Colors

```css
--navy-900: #0F1A30;   /* Darkest navy — dark mode sidebar, deep backgrounds */
--navy-700: #1B2A4A;   /* Primary brand navy — sidebar, headings, primary surfaces */
--navy-500: #2A3F6A;   /* Mid navy — focus rings, hover states, secondary elements */
--navy-300: #4A6491;   /* Light navy — decorative, muted accents */
--navy-100: #C5D0E0;   /* Very light navy — subtle tints, tag backgrounds */
--navy-50:  #E8ECF2;   /* Barely navy — light mode subtle backgrounds */

--red-700:  #C8102E;   /* Primary brand red — CTAs, accent, active states */
--red-500:  #E8334E;   /* Mid red — dark mode accent (lifted for contrast) */
--red-300:  #F28C9A;   /* Light red — decorative, muted accent */
--red-100:  #FCE4E8;   /* Very light red — subtle red backgrounds */
--red-50:   #FFF1F3;   /* Barely red — alert/error tint backgrounds */
```

### Neutral Colors

```css
--gray-900: #111827;   /* Near-black — primary text (light mode) */
--gray-800: #1F2937;   /* Very dark gray — bold secondary text */
--gray-700: #374151;   /* Dark gray — emphasized secondary text */
--gray-600: #6B7280;   /* Mid gray — secondary text, labels, icons */
--gray-500: #9CA3AF;   /* Gray — placeholder text, disabled icons */
--gray-400: #9CA3AF;   /* Same as 500 — tertiary text, timestamps */
--gray-300: #D1D5DB;   /* Light gray — borders, dividers */
--gray-200: #E5E7EB;   /* Lighter gray — card borders, table dividers */
--gray-100: #F3F4F6;   /* Near-white — disabled backgrounds, alternate rows */
--gray-50:  #F9FAFB;   /* Off-white — page background (light mode) */
--white:    #FFFFFF;   /* Pure white — card backgrounds, input backgrounds */
```

### Semantic / Status Colors

```css
/* Success — save confirmed, training complete, equipment passed, on duty */
--success:     #059669;
--success-bg:  #ECFDF5;
--success-light: #34D399;  /* Dark mode lifted variant */

/* Warning — cert expiring, maintenance due, schedule conflict, responding */
--warning:     #D97706;
--warning-bg:  #FFFBEB;
--warning-light: #FBBF24;  /* Dark mode lifted variant */

/* Danger — failed inspection, credential expired, system error, out of service */
--danger:      #DC2626;
--danger-bg:   #FEF2F2;
--danger-light: #F87171;   /* Dark mode lifted variant */

/* Info — new assignment, system update, informational notice, in training */
--info:        #2563EB;
--info-bg:     #EFF6FF;
--info-light:  #60A5FA;    /* Dark mode lifted variant */
```

### Color Usage Ratios

| Color | Ratio | Application |
|-------|-------|-------------|
| White / Gray 50 | 60–70% | Page backgrounds, card backgrounds, content areas |
| Navy 700 | 15–20% | Headers, navigation, sidebar, heading text |
| Gray 600 | 10–15% | Body text, secondary text, borders |
| Red 700 | 5–10% | CTAs, active states, alerts, accent elements |
| Semantic colors | <5% | Status badges, form validation, system alerts only |

### Color Accessibility — Pre-Approved Pairings

| Foreground | Background | Ratio | WCAG |
|------------|------------|-------|------|
| Navy 700 (#1B2A4A) | White (#FFFFFF) | 13.2:1 | AAA |
| White (#FFFFFF) | Navy 700 (#1B2A4A) | 13.2:1 | AAA |
| Red 700 (#C8102E) | White (#FFFFFF) | 5.6:1 | AA |
| White (#FFFFFF) | Red 700 (#C8102E) | 5.6:1 | AA |
| Gray 600 (#6B7280) | White (#FFFFFF) | 5.0:1 | AA |
| Navy 700 (#1B2A4A) | Gray 50 (#F9FAFB) | 12.8:1 | AAA |

**Rules**:
- Never use Red 700 for large background fills
- Never use brand Navy or Red as a status color — use semantic palette
- Never use color alone to communicate state — always include icon + text
- All text must meet minimum 4.5:1 contrast ratio (3:1 for large text 18px+ bold or 24px+)

---

## Typography

### Font Stack

```css
--font-sans:      'Barlow', system-ui, -apple-system, sans-serif;
--font-condensed: 'Barlow Condensed', system-ui, sans-serif;
--font-mono:      'JetBrains Mono', Consolas, Monaco, monospace;
```

**Google Fonts import**:
```html
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Usage**:
- `--font-sans` (Barlow): All UI text — headings, body, buttons, inputs, labels
- `--font-condensed` (Barlow Condensed): Uppercase labels, table headers, tags, badges, metadata, section labels
- `--font-mono` (JetBrains Mono): Numeric data in tables, timestamps, IDs, code, unit numbers

### Type Scale

| Token | Size | Line Height | Weight | Usage |
|-------|------|-------------|--------|-------|
| --text-xs | 12px / 0.75rem | 1.5 (18px) | 400 | Captions, timestamps, fine print |
| --text-sm | 14px / 0.875rem | 1.5 (21px) | 400–500 | Labels, helper text, table cells |
| --text-base | 16px / 1rem | 1.6 (26px) | 400 | Body text, form inputs, paragraphs |
| --text-lg | 18px / 1.125rem | 1.5 (27px) | 500 | Lead paragraphs, emphasized body |
| --text-xl | 20px / 1.25rem | 1.4 (28px) | 600 | Card headings, section labels |
| --text-2xl | 24px / 1.5rem | 1.3 (31px) | 600–700 | Page section headings (H3) |
| --text-3xl | 30px / 1.875rem | 1.25 (38px) | 700 | Page headings (H2) |
| --text-4xl | 36px / 2.25rem | 1.2 (43px) | 700 | Primary page headings (H1) |
| --text-5xl | 48px / 3rem | 1.1 (53px) | 700 | Hero / display headings |

### Text Colors

| Token | Value | Usage |
|-------|-------|-------|
| --text-primary | #111827 | Headings, primary body text |
| --text-secondary | #6B7280 | Supporting text, descriptions, metadata |
| --text-tertiary | #9CA3AF | Placeholders, disabled text, timestamps |
| --text-inverse | #FFFFFF | Text on dark backgrounds (nav, sidebar, dark buttons) |
| --text-brand | #1B2A4A | Branded headings, navigation items |
| --text-accent | #C8102E | Links, CTAs, highlighted terms |

### Typography Rules

- Never use more than two font weights on a single screen (typically Regular 400 for body, SemiBold/Bold 600/700 for headings)
- Headings are always Navy (#1B2A4A) or White — never gray
- Red text is only for links, CTAs, and highlights — never body paragraphs
- Minimum body text size: 14px (below 14px is captions/timestamps only)
- All-caps labels use letter-spacing: 0.05em–0.1em
- Never use italic for emphasis in UI — use SemiBold or color instead

---

## Spacing

### Spacing Scale (4px base unit)

```css
--space-0:  0px;
--space-1:  4px;    /* Tight icon gaps, inline badge padding */
--space-2:  8px;    /* Button icon gap, compact list padding */
--space-3:  12px;   /* Form input padding, small card padding */
--space-4:  16px;   /* Standard card padding, form group gap */
--space-5:  20px;   /* Section padding (small), card body padding */
--space-6:  24px;   /* Standard section gap, modal padding */
--space-8:  32px;   /* Page section separation, large card padding */
--space-10: 40px;   /* Major section breaks */
--space-12: 48px;   /* Page-level vertical padding */
--space-16: 64px;   /* Hero section padding, major landmarks */
--space-20: 80px;   /* Full section vertical padding (desktop) */
--space-24: 96px;   /* Largest section breaks, landing page blocks */
```

Only use values from this scale for all margin, padding, and gap properties.

### Border Radius

```css
--radius-none: 0px;     /* Tables, sharp-edged elements */
--radius-sm:   4px;     /* Badges, tags, small inputs */
--radius-md:   6px;     /* Buttons, form inputs, dropdowns */
--radius-lg:   8px;     /* Cards, modals, panels */
--radius-xl:   12px;    /* Large cards, hero sections, image containers */
--radius-full: 9999px;  /* Avatars, circular buttons, pills, badges */
```

### Shadows

```css
--shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md:  0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
--shadow-lg:  0 4px 12px rgba(0, 0, 0, 0.12);
--shadow-xl:  0 10px 25px rgba(0, 0, 0, 0.15);
--shadow-2xl: 0 20px 60px rgba(0, 0, 0, 0.2);
```

---

## Layout

### Responsive Breakpoints

| Breakpoint | Name | Max Width | Columns | Gutter | Margin |
|------------|------|-----------|---------|--------|--------|
| < 640px | Mobile | 100% | 4 | 16px | 16px |
| 640–767px | Small Tablet | 640px | 8 | 16px | 24px |
| 768–1023px | Tablet | 768px | 8 | 24px | 32px |
| 1024–1279px | Desktop | 1024px | 12 | 24px | 32px |
| 1280–1535px | Large Desktop | 1280px | 12 | 24px | auto |
| ≥ 1536px | Wide | 1440px | 12 | 32px | auto |

### Application Shell

The standard web application layout uses a fixed left sidebar with a scrollable main content area:

```
┌──────────┬─────────────────────────────────────────┐
│          │  Top Bar (64px, white, bottom border)    │
│ Sidebar  ├─────────────────────────────────────────┤
│ Navy 700 │                                         │
│ 256px or │  Main Content Area                      │
│ 64px     │  Background: Gray 50 (#F9FAFB)          │
│          │  Padding: 24px                           │
│          │  Contains cards on white backgrounds     │
│          │                                         │
└──────────┴─────────────────────────────────────────┘
```

| Region | Spec |
|--------|------|
| Sidebar (collapsed) | 64px wide, Navy 700 background, icon-only nav |
| Sidebar (expanded) | 256px wide, Navy 700 background, icon + label nav |
| Top bar | Full remaining width, 64px tall, White background, bottom 1px Gray 200 border |
| Main content | Remaining width, Gray 50 background, 24px padding |
| Content cards | Fluid width, White background, 1px Gray 200 border, 8px radius |

---

## Components

### Buttons

| Variant | Background | Text | Border | Hover State | Usage |
|---------|------------|------|--------|-------------|-------|
| Primary | #C8102E (Red 700) | White | None | #9A0C24 (Red Dark) | Main CTAs: Save, Submit, Confirm |
| Secondary | #1B2A4A (Navy 700) | White | None | #0F1A30 (Navy 900) | Secondary actions: View, Details |
| Outline | Transparent | Navy 700 | 1px Navy 700 | Navy 700 bg, white text | Tertiary: Cancel, Back, Filter |
| Ghost | Transparent | Navy 700 | None | Gray 100 bg | Inline actions, icon buttons |
| Danger | #DC2626 | White | None | #B91C1C | Destructive: Delete, Remove |
| Disabled | Gray 200 | Gray 400 | None | No change (cursor: default) | Any inactive button |

**Button Sizes**:
| Size | Height | Horizontal Padding | Font Size | Radius |
|------|--------|-------------------|-----------|--------|
| Small (sm) | 32px | 12px | 14px / SemiBold | 6px |
| Medium (md) | 40px | 16px | 14px / SemiBold | 6px |
| Large (lg) | 48px | 24px | 16px / SemiBold | 8px |

All buttons use `font-family: var(--font-sans)` and `font-weight: 600`. Icon + text buttons have an 8px gap between icon and label. Icon size in buttons: 16px.

### Form Inputs

| Property | Value |
|----------|-------|
| Height | 40px (md) / 48px (lg) |
| Background | White (#FFFFFF) |
| Border | 1px solid #D1D5DB (Gray 300) |
| Border Radius | 6px |
| Padding | 0 12px |
| Font | 16px / Barlow Regular / --text-primary color |
| Placeholder | --text-tertiary (#9CA3AF) |
| Focus border | 2px solid #2A3F6A (Navy 500) |
| Focus ring | box-shadow: 0 0 0 3px rgba(27, 42, 74, 0.15) |
| Error border | 2px solid #DC2626 (Danger) |
| Error ring | box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15) |
| Error message | 13px, Danger color, displayed below input with 4px top margin |
| Disabled bg | #F3F4F6 (Gray 100) |
| Disabled text | #9CA3AF (Gray 400) |
| Label | 13px / Barlow Medium (500) / --text-secondary / 4px margin-bottom |

### Cards

| Property | Value |
|----------|-------|
| Background | White (#FFFFFF) |
| Border | 1px solid #E5E7EB (Gray 200) |
| Border Radius | 8px |
| Padding | 24px (body) / 16px 24px (header/footer) |
| Shadow | 0 1px 3px rgba(0,0,0,0.08) |
| Hover shadow (if interactive) | 0 4px 12px rgba(0,0,0,0.12) |
| Header | 18px / Barlow SemiBold / Navy 700 / bottom 1px Gray 200 border |
| Section divider within card | 1px solid Gray 200, 16px vertical margin |

### Tables

| Property | Value |
|----------|-------|
| Header bg | Gray 50 (#F9FAFB) |
| Header text | 12px / Barlow Condensed 600 / uppercase / Gray 600 / letter-spacing: 0.05em |
| Row border | bottom 1px solid Gray 200 |
| Row hover | Gray 50 background |
| Cell padding | 12px 16px |
| Cell text | 14px / Barlow Regular / Gray 900 |
| Numeric data | JetBrains Mono 500 |
| Selected row | Navy 700 at 5% opacity background + left 3px Navy 700 border |
| Empty state | Centered, Gray 400 text, 14px, optional icon above at 32px |

### Navigation Sidebar

| Property | Value |
|----------|-------|
| Background | Navy 700 (#1B2A4A) |
| Width expanded | 256px |
| Width collapsed | 64px |
| Nav item height | 44px |
| Nav item padding | 0 16px (expanded) / centered (collapsed) |
| Nav item text | 14px / Barlow Medium / White at 70% opacity |
| Nav item icon | 20px / White at 70% opacity |
| Nav item hover | White at 10% overlay background |
| Nav item active | White text 100%, left 3px solid Red 700 border, white at 10% bg |
| Section divider | 1px solid White at 10% opacity |
| Logo area | 64px height, vertically centered |

### Badges / Status Indicators

```
┌─●──LABEL──┐   (dot + uppercase text inside pill)
└───────────┘
```

| Status | Background | Text/Dot Color | Operational Mapping |
|--------|------------|----------------|---------------------|
| Success | #ECFDF5 | #059669 | On Duty, In Service, Current, Passed |
| Warning | #FFFBEB | #D97706 | Responding, Maintenance Due, Review Needed, Expiring |
| Danger | #FEF2F2 | #DC2626 | Out of Service, Expired, Failed, Overdue |
| Info | #EFF6FF | #2563EB | In Training, New Assignment, Updated |
| Neutral | #F3F4F6 | #6B7280 | Off Duty, Inactive, Archived |
| Brand | navy-700 at 8% | #1B2A4A (dot: #C8102E) | On Scene |

Badge specs: `font-size: 12px; font-weight: 600; font-family: var(--font-condensed); text-transform: uppercase; letter-spacing: 0.03em; padding: 3px 10px; border-radius: 9999px;` with a 6px dot before the label.

### Modals / Dialogs

| Property | Value |
|----------|-------|
| Overlay | Black at 50% opacity |
| Background | White (#FFFFFF) |
| Border radius | 12px |
| Max widths | 480px (sm) / 640px (md) / 800px (lg) |
| Padding | 24px |
| Header | 20px / Barlow Bold / Navy 700 / bottom 1px Gray 200 / padding 16px 24px |
| Footer | Top 1px Gray 200 / padding 16px 24px / right-aligned buttons |
| Shadow | 0 20px 60px rgba(0, 0, 0, 0.2) |
| Entry animation | Fade in + scale 95%→100%, 200ms ease-out |
| Close button | Top-right, Ghost button style, X icon at 20px |

### Toast Notifications

| Property | Value |
|----------|-------|
| Position | Fixed, top-right, 16px from edges |
| Width | 360px max |
| Background | White, left 4px border in semantic color |
| Border radius | 8px |
| Shadow | 0 4px 12px rgba(0,0,0,0.15) |
| Content | Icon (20px, semantic color) + title (14px Bold) + description (13px Gray 600) |
| Dismiss | X button, top-right |
| Auto-dismiss | 5 seconds (success/info), persistent (danger/warning) |
| Animation | Slide in from right, 300ms ease-out |

### Empty States

| Property | Value |
|----------|-------|
| Container | Centered within the parent card/content area |
| Icon | 48px, Gray 300 (#D1D5DB) |
| Heading | 18px / Barlow SemiBold / Gray 700 |
| Description | 14px / Barlow Regular / Gray 500 |
| CTA button | Primary or Outline, centered below description |
| Vertical spacing | 12px between icon→heading→description→button |

---

## Iconography

**Library**: Lucide React (`lucide-react`)  
**Style**: Outlined / stroke only (strokeWidth: 1.5–2). Never filled.  
**Default size**: 20px (nav, tables, buttons)  
**Large size**: 24px (cards, headers, empty states)  
**Color**: Inherit from parent text color  
**Hover (interactive)**: Red 700 or Navy 500 depending on context  
**Touch target**: Minimum 44×44px (add padding to icon buttons)

For domain-specific icons not in Lucide (SCBA mask, Maltese cross, SAR grid), create custom SVGs: 24px viewBox, 1.5px stroke, round caps, round joins, no fill.

---

## Dark Mode

Dark mode is critical for emergency services — used in apparatus cabs, command posts, and nighttime operations.

### Color Mapping

| Element | Light Mode | Dark Mode |
|---------|-----------|-----------|
| Page background | #F9FAFB | #0F1A30 (Navy 900) |
| Card background | #FFFFFF | #1B2A4A (Navy 700) |
| Elevated surface | #FFFFFF | #2A3F6A (Navy 500) |
| Primary text | #111827 | #F3F4F6 (Gray 100) |
| Secondary text | #6B7280 | #9CA3AF (Gray 400) |
| Tertiary text | #9CA3AF | #6B7280 (Gray 600) |
| Borders | #E5E7EB | rgba(255, 255, 255, 0.1) |
| Sidebar | #1B2A4A | #0A1220 (deeper than Navy 900) |
| Input background | #FFFFFF | #1B2A4A (Navy 700) |
| Input border | #D1D5DB | rgba(255, 255, 255, 0.15) |
| Red accent | #C8102E | #E8334E (Red 500, lifted) |
| Success | #059669 | #34D399 (lifted) |
| Warning | #D97706 | #FBBF24 (lifted) |
| Danger | #DC2626 | #F87171 (lifted) |
| Info | #2563EB | #60A5FA (lifted) |
| Shadows | rgba(0,0,0, 0.08–0.15) | rgba(0,0,0, 0.3–0.5) |

### Dark Mode Rules

- Never invert brand colors — Navy stays navy, Red stays red. Only adjust lightness for contrast.
- Surfaces layer by lightness: higher elevation = slightly lighter navy (replaces shadow hierarchy)
- Semantic status colors use lighter tints in dark mode for visual distinction
- Focus rings in dark mode use Red 500 instead of Navy 500: `outline: 2px solid #E8334E; box-shadow: 0 0 0 4px rgba(232, 51, 78, 0.25);`
- Test all states in both modes — especially focus rings, error states, and disabled inputs

---

## Operational Status Mapping

These are the standardized operational states used across the Scene Ready application:

### Personnel Status
| State | Badge Status | Badge Text | Color |
|-------|-------------|------------|-------|
| On Duty / Available | success | ON DUTY | #059669 |
| Responding / En Route | warning | RESPONDING | #D97706 |
| On Scene | brand | ON SCENE | #1B2A4A (dot: #C8102E) |
| Off Duty | neutral | OFF DUTY | #6B7280 |
| In Training | info | IN TRAINING | #2563EB |
| Out of Service | danger | OUT OF SERVICE | #DC2626 |

### Equipment Status
| State | Badge Status | Badge Text |
|-------|-------------|------------|
| In Service | success | IN SERVICE |
| Maintenance Due | warning | MAINT DUE |
| Out of Service | danger | OOS |

### Preplan Status
| State | Badge Status | Badge Text |
|-------|-------------|------------|
| Current | success | CURRENT |
| Review Needed | warning | REVIEW |
| Expired | danger | EXPIRED |

### Certification Status
| State | Badge Status | Badge Text |
|-------|-------------|------------|
| Current | success | CURRENT |
| Expiring Soon | warning | EXPIRING |
| Expired | danger | EXPIRED |

---

## Motion & Animation

```css
--duration-fast:   100ms;  /* Hover states, color transitions, opacity */
--duration-normal: 200ms;  /* Dropdowns, tooltips, focus rings */
--duration-slow:   300ms;  /* Modals, sidebars, page transitions */

--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

**Rules**:
- Respect `prefers-reduced-motion` — all animations must be disableable
- No animation should exceed 300ms
- Page loads should NOT have entrance animations — content must be immediately visible
- Use only `transform` and `opacity` for animations (GPU-accelerated, no layout jank)
- Sidebar expand/collapse: 200ms ease on width
- Modal enter: fade + scale 95%→100%, 200ms ease-out
- Toast enter: slide from right, 300ms ease-out
- Hover transitions: 100ms ease-out on background-color, color, border-color

---

## Accessibility

Scene Ready must meet **WCAG 2.1 Level AA** compliance.

- **Contrast**: All text ≥ 4.5:1 (3:1 for large text 18px+ bold or 24px+)
- **Focus**: All interactive elements must have visible focus ring (2px Navy 500, 2px offset, 4px spread at 15% opacity)
- **Keyboard**: Every function operable via keyboard. Logical tab order.
- **Touch**: Minimum 44×44px touch targets on mobile
- **Screen readers**: All images need alt text. All icons need aria-labels. Form inputs need associated labels.
- **Errors**: Never communicate errors through color alone — always include icon + text message
- **Motion**: All animations respect `prefers-reduced-motion`

**Focus ring CSS**:
```css
:focus-visible {
  outline: 2px solid var(--navy-500);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(42, 63, 106, 0.2);
}

[data-theme='dark'] :focus-visible {
  outline: 2px solid var(--red-500);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(232, 51, 78, 0.25);
}
```

---

## Complete CSS Variables Block

Copy this into the application root stylesheet. All component styles must reference these tokens.

```css
:root {
  /* Brand */
  --navy-900: #0F1A30;
  --navy-700: #1B2A4A;
  --navy-500: #2A3F6A;
  --navy-300: #4A6491;
  --navy-100: #C5D0E0;
  --navy-50:  #E8ECF2;

  --red-700:  #C8102E;
  --red-500:  #E8334E;
  --red-300:  #F28C9A;
  --red-100:  #FCE4E8;
  --red-50:   #FFF1F3;

  /* Neutrals */
  --gray-900: #111827;
  --gray-800: #1F2937;
  --gray-700: #374151;
  --gray-600: #6B7280;
  --gray-500: #9CA3AF;
  --gray-400: #9CA3AF;
  --gray-300: #D1D5DB;
  --gray-200: #E5E7EB;
  --gray-100: #F3F4F6;
  --gray-50:  #F9FAFB;
  --white:    #FFFFFF;

  /* Semantic */
  --success:     #059669;
  --success-bg:  #ECFDF5;
  --warning:     #D97706;
  --warning-bg:  #FFFBEB;
  --danger:      #DC2626;
  --danger-bg:   #FEF2F2;
  --info:        #2563EB;
  --info-bg:     #EFF6FF;

  /* Typography */
  --font-sans:      'Barlow', system-ui, -apple-system, sans-serif;
  --font-condensed: 'Barlow Condensed', system-ui, sans-serif;
  --font-mono:      'JetBrains Mono', Consolas, Monaco, monospace;

  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-4xl:  2.25rem;
  --text-5xl:  3rem;

  /* Spacing */
  --space-1:  4px;   --space-2:  8px;
  --space-3:  12px;  --space-4:  16px;
  --space-5:  20px;  --space-6:  24px;
  --space-8:  32px;  --space-10: 40px;
  --space-12: 48px;  --space-16: 64px;
  --space-20: 80px;  --space-24: 96px;

  /* Radius */
  --radius-sm:   4px;
  --radius-md:   6px;
  --radius-lg:   8px;
  --radius-xl:   12px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md:  0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-lg:  0 4px 12px rgba(0, 0, 0, 0.12);
  --shadow-xl:  0 10px 25px rgba(0, 0, 0, 0.15);
  --shadow-2xl: 0 20px 60px rgba(0, 0, 0, 0.2);

  /* Motion */
  --duration-fast:   100ms;
  --duration-normal: 200ms;
  --duration-slow:   300ms;
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

  /* Layout */
  --sidebar-width:     256px;
  --sidebar-collapsed: 64px;
  --topbar-height:     64px;
  --content-max-width: 1280px;
}
```

---

## Do's and Don'ts

### Logo
- ✓ Use official assets only
- ✓ Maintain clear space (one chevron height)
- ✓ Use reversed version on dark backgrounds
- ✗ Never rotate, skew, or distort
- ✗ Never change chevron colors
- ✗ Never place on busy photos without 60%+ dark overlay
- ✗ Never add shadows or effects to the logo

### Color
- ✓ Navy dominant, Red accent
- ✓ Semantic colors only for their purpose
- ✓ Verify contrast for every new pairing
- ✗ Never Red 700 for large background fills
- ✗ Never brand colors as status indicators
- ✗ Never more than one semantic color per component

### Typography
- ✓ Barlow for all UI text
- ✓ Stick to the type scale — no custom sizes
- ✓ Barlow Condensed for uppercase labels/tags
- ✗ Never more than two weights per screen
- ✗ Never body text below 14px
- ✗ Never italic for UI emphasis

### Components
- ✓ Use the spacing scale for all padding/margin
- ✓ Consistent border radius within component context
- ✓ Loading states for all async operations
- ✗ Never mix rounded and sharp corners in the same card
- ✗ Never color-only state communication
- ✗ Never animate layout properties — use transform/opacity only