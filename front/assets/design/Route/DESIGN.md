# Design System: The Kinetic Editorial

## 1. Overview & Creative North Star
**Creative North Star: "The Precision Navigator"**

This design system rejects the cluttered, "utility-first" aesthetic of traditional transit apps in favor of a high-end editorial experience. We treat movement through a city as a premium journey, not a chore. The system breaks the "standard template" look by utilizing **Intentional Asymmetry** and **Tonal Depth**. 

Instead of rigid grids, we use generous white space and extreme typographic scale shifts to guide the eye instantly. We prioritize "Outdoor Legibility" by pairing a stark `#ffffff` (Surface Lowest) foundation with high-contrast `primary` elements, ensuring the UI remains crisp even under direct sunlight at a bus stop.

---

## 2. Colors & Surface Philosophy
Our palette is anchored in high-contrast functionality, utilizing deep navies and vibrant "Action Blues" to define the path forward.

### The "No-Line" Rule
**Traditional 1px borders are strictly prohibited.** Boundaries between sections must be defined solely through background color shifts. For example, a search bar (Surface Container High) sits directly on the main map view (Surface) without a stroke. This creates a seamless, modern feel that reduces visual noise.

### Surface Hierarchy & Nesting
Depth is achieved through a "Physical Sheet" metaphor. 
- **Base Layer:** `surface` (#faf9fc) or `surface_container_lowest` (#ffffff) for the primary background.
- **Nested Content:** Use `surface_container` (#eeedf0) for grouped information like "Recent Trips."
- **Floating Elements:** Use `surface_bright` with a **Glassmorphism** effect (Backdrop Blur: 20px, Opacity: 80%) for top navigation bars or floating action buttons to allow the map to "bleed" through the UI.

### Signature Textures
For main CTAs (e.g., "Start Route"), do not use flat fills. Use a subtle linear gradient from `primary` (#003ec7) to `primary_container` (#0052ff) at a 135-degree angle. This adds a "soul" to the button, making it feel tactile and energized.

---

## 3. Typography
We use **Inter** for its geometric clarity and **Public Sans** for data-heavy labels to ensure maximum readability "on the move."

- **Display & Headline (Inter):** Used for "Time to Arrival" or "Destination Name." Use `display-lg` (3.5rem) for the primary arrival time to create a clear focal point.
- **Title & Body (Inter):** High-contrast `on_surface` (#1a1c1e) for primary info; `on_surface_variant` (#434656) for secondary details like "via 5th Ave."
- **Labels (Public Sans):** Used for micro-copy like "WALK" or "4 MIN DELAY." These should always be uppercase with a +5% letter spacing to enhance legibility at small sizes.

---

## 4. Elevation & Depth
In this system, elevation is a product of light and tone, not heavy shadows.

- **Tonal Layering:** To lift a card, move it one step up the surface scale (e.g., placing a `surface_container_highest` card on a `surface_container_low` background).
- **Ambient Shadows:** For floating elements like Bottom Sheets, use a shadow with a 32px blur, 0px offset, and 6% opacity using the `on_surface` color. It should feel like a soft glow of shadow, not a hard drop.
- **The Ghost Border:** If a boundary is required for accessibility (e.g., in high-glare environments), use `outline_variant` at **15% opacity**. Never use 100% opaque lines.

---

## 5. Components

### Buttons (The Kinetic Triggers)
- **Primary:** Gradient fill (`primary` to `primary_container`), `xl` (1.5rem) corner radius. Height: 64px for one-handed thumb access.
- **Secondary:** `surface_container_high` fill with `primary` text. No border.
- **Tertiary:** Pure text in `primary` with `label-md` styling.

### Cards & Lists (The Editorial Feed)
- **Rule:** **Forbid the use of divider lines.** 
- To separate bus routes in a list, use a `3.5` (1.2rem) vertical spacing gap.
- Use a background shift to `surface_container_low` on tap/active states. 
- Group transit modes using semantic containers: a Green (`tertiary`) bar for walking, a Blue (`primary`) bar for trains.

### Rounded Bottom Sheets
- **Radius:** Always `xl` (1.5rem) on top-left and top-right.
- **Handle:** A subtle `outline_variant` bar, 40px wide, 4px tall. 
- **Interaction:** Must support "rubber-banding" on scroll to feel fluid and premium.

### Input Fields
- **Search:** `surface_container_high` fill, no border, `md` (0.75rem) radius. 
- **Typography:** `title-md` for the input text to ensure it's readable while walking.

---

## 6. Do's and Don'ts

### Do
- **Do** use `display-lg` typography for the single most important piece of data (e.g., "6 min").
- **Do** use the `20` (7rem) spacing token for major section breathing room.
- **Do** use `tertiary` (#833700) for walking segments to provide a warm, human contrast to the mechanical "Action Blue."

### Don't
- **Don't** use pure black (#000000). Always use `on_surface` (#1a1c1e) for text to maintain a premium, "ink-like" feel.
- **Don't** use 1px dividers. They clutter the interface and feel dated.
- **Don't** use "Standard" 44px tap targets. For this system, the minimum target is **56px** to accommodate the "bouncing" gait of a user walking to a stop.
- **Don't** use harsh shadows. If you can clearly see where the shadow ends, it's too dark.

---

## 7. Spacing Scale Implementation
Precision is key to the editorial look.
- **Layout Margins:** Use `6` (2rem) for left/right screen padding.
- **Component Gaps:** Use `3` (1rem) for internal card padding.
- **Micro-adjustment:** Use `0.5` (0.175rem) for aligning icons with text labels.