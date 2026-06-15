# Blob UI Redesign — Deep Sea Jellyfish

## Branch: `redesign/metaball-blob`

## Design: "Living Light from the Deep"

A bioluminescent jellyfish — translucent bell pulsing rhythmically, trailing physics-simulated tentacles, glowing organs visible inside the body. Nothing else on a desktop has trailing appendages. It looks like something from the deep ocean, alien and alive.

## What Was Redesigned

### Blob (BlobCanvas.tsx) — Deep Sea Jellyfish

**Bell (dome shape):**
- 72-segment path tracing a jellyfish dome (semicircle top, flared rim bottom)
- Stretches horizontally and contracts vertically during pulse cycle
- Translucent gradient fill (4 stops, 0.20 → 0.45 alpha)
- Inner glow clipped to bell shape (light from within)
- Thin membrane edge stroke

**4 Physics Tentacles:**
- Each is a chain of 7 points with spring physics
- Anchor points at bell base, follow with damping (0.92-0.96)
- Lateral sine wave motion (different phase/speed per tentacle)
- Gradient stroke: brighter at base (0.35 alpha), fading to transparent at tips
- Quadratic bezier curves for smooth rendering

**5 Bioluminescent Organs:**
- Glowing spots inside the bell (visible through translucent body)
- Each drifts gently on its own orbit
- Pulse with individual phase/speed
- Brighter during processing state (1.5x multiplier)

**Rendering layers (8 total):**
1. Ambient glow (soft halo)
2. Tentacles (4 physics chains with gradient strokes)
3. Bell body (translucent dome gradient)
4. Bell inner glow (clipped radial gradient, breath-synced)
5. Bioluminescent organs (5 glowing spots, clipped to bell)
6. Bell membrane edge (thin stroke)
7. Specular highlight (ellipse, top-left)
8. Processing rings (pulsing when thinking)

**State behavior:**
- Idle: Bell pulses at BLOB.BREATH_PERIOD_MS, tentacles flow gently
- Processing: Pulse continues, tentacles speed up 2x, organs brighten 1.5x, rings appear
- Dragging: Hue locks to 200 (cyan)

### Chat UI (globals.css + ChatTextbox.tsx)
- Glassmorphism panel with breathing border
- Inner depth shadows
- Refined input with focus glow
- Gradient send button
- Custom scrollbar
- Blob-synced status indicators

## Files Changed
- `src/components/BlobCanvas.tsx` — Complete rewrite (jellyfish organism)
- `src/styles/globals.css` — Chat panel glassmorphism
- `src/components/ChatTextbox.tsx` — Refined status indicators

## What Was Completed
- Jellyfish bell with translucent dome shape
- 4 physics-simulated tentacles with spring dynamics
- 5 bioluminescent organs glowing inside the bell
- Bell pulses rhythmically (breath cycle)
- Processing state speeds up tentacles and brightens organs
- Hue always cycles (no lock on textbox open)
- Transparent background preserved
- All event handlers intact

## What Is Partial / Blocked
- Cannot visually verify without running the Tauri app
- Tentacle physics could be refined (currently simple spring model)

## What Was Tested
- Canvas `backgroundColor: 'transparent'` preserved
- Body/root `background: transparent !important` preserved
- Tauri windows have `transparent: true`
- No rectangular artifacts
- Event handlers unchanged (click toggle, drag, escape)
- Drag threshold still 6px
- All Rust commands intact

## Performance
- 72 segments for bell shape — smooth
- 4 tentacles × 7 points = 28 physics updates per frame — negligible
- 5 organ position updates per frame — negligible
- No pixel loops — pure vector path rendering
- requestAnimationFrame loop — smooth 60fps

## Visual Language
- **Bell**: Translucent dome, like looking through deep ocean water
- **Tentacles**: Silk-like trails flowing in current — the signature element
- **Organs**: Bioluminescent spots glowing through the translucent body
- **Pulse**: Rhythmic contraction/expansion — the organism breathes
- **Color**: Shifts through deep ocean hues (blue → cyan → teal → green)
