# Blob UI Redesign

## Branch: `redesign/metaball-blob`

## Design Direction

Three distinct blob variants implemented on a shared interaction and chat infrastructure. Each variant is a complete canvas rendering with unique visual identity. Currently set to **Plasma Energy**.

---

## Variant 1: Deep Sea Jellyfish

**"Living Light from the Deep"** — A bioluminescent jellyfish. Translucent bell pulsing rhythmically, trailing physics-simulated tentacles, glowing organs visible inside the body.

### Bell (dome shape)
- 80-segment path tracing a jellyfish dome (semicircle top, flared rim bottom)
- Dome has subtle 3-sine wobble for organic feel
- Rim tucks inward then flares at edges
- Stretches horizontally and contracts vertically during pulse cycle
- Translucent gradient fill (5 stops, 0.18 → 0.48 alpha)
- Inner glow clipped to bell shape (breath-synced)
- 6 radial canals (anatomical detail, slowly rotating)
- Rim light layer (radial glow on top dome surface)

### 5 Physics Tentacles
- Each is a chain of 8 points with spring physics
- Anchor points at bell base, follow with damping (0.88–0.96)
- Tapering width: 2.4px (base) → 0.4px (tip) with per-segment gradient
- Lateral sine wave motion (unique phase/speed/amplitude per tentacle)

### 7 Bioluminescent Organs
- Glowing spots inside the bell (visible through translucent body)
- Each has outer halo ring + core glow
- Drifts gently on individual orbits
- Pulse with individual phase/speed
- Brighter during processing (1.6x)

### Rendering layers (8)
1. Ambient glow (50px radial halo)
2. Tapered tentacles (5 physics chains, gradient strokes)
3. Bell body (5-stop translucent dome gradient)
4. Inner glow + organs (clipped to bell) — 6 radial canals, 7 organs with halos
5. Bell membrane (gradient stroke)
6. Rim light (radial glow on dome surface)
7. Specular highlight (ellipse, top-left)
8. Processing rings (3 concentric)

---

## Variant 2: Liquid Mercury

**"Chrome reflects everything but itself"** — Opaque chrome blob with physics-based morphing, metallic reflections, sharp speculars. No appendages — pure morphing sphere.

### 64-Point Physics Blob
- Spring-dampened radius points with 5 harmonic frequencies for organic morphing
- Catmull-Rom to cubic bezier spline for smooth curves

### Chrome Body (5 layers)
- Nested scaled layers (each 12% smaller, offset) for depth
- Metallic linear gradient: light top-left (82% lit) → dark bottom-right (47% lit)
- Alpha decreases per layer (0.70 → 0.58)

### Reflections
- Horizontal reflection band (oscillates vertically, 0.42 peak alpha)
- Vertical reflection band (subtle, 0.12 alpha)
- Mimics environment mapping on chrome surfaces

### Speculars
- Primary: 12×7px ellipse, top-left, 0.82 peak alpha
- Secondary: 6×3.5px ellipse, offset, 0.60 peak alpha

### Rendering layers (8)
1. Shadow (offset radial gradient)
2. Chrome body (5 nested mesh layers)
3. Horizontal reflection band (clipped to blob)
4. Vertical reflection band (clipped to blob)
5. Primary specular (sharp ellipse)
6. Secondary specular (small offset)
7. Rim light (edge stroke)
8. Processing rings (2 concentric)

---

## Variant 3: Plasma Energy ⬅️ CURRENT

**"Crackling electric core"** — Aggressive plasma blob with lightning arcs, orbiting particle swarm, energy tendrils. Most visually distinct from the other two.

### Plasma Anatomy
- **Core radius**: 18px base, breathes ±2.5px
- **4 energy tendrils**: 10-segment physics chains, tapering strokes, wave motion
- **Lightning arcs**: 6-point random bolt paths, 0.15–0.5s lifecycle, fade in/out
- **24 orbiting particles**: Individual orbit speeds, drift in/out, dual-render (glow + core)
- **5 inner filaments**: Rotating energy lines inside the core

### Rendering layers (9)
1. Corona glow (48px radial halo)
2. Energy tendrils (4 physics chains, tapering strokes)
3. Lightning arcs (6-point bolts, spawn lifecycle)
4. Plasma body (5-stop radial gradient, hot center → cool edge)
5. Hot core (near-white center, soft falloff)
6. Orbiting particles (24, glow + core)
7. Inner filaments (5 rotating lines)
8. Edge glow (thin stroke)
9. Processing: 3 expanding ring ripples + 3× faster arc spawning

### State behavior
- Idle: Tendrils flow, arcs spawn every 0.12s, particles orbit
- Processing: Arcs spawn 3× faster, rings expand, tendrils speed up 1.6x
- Dragging: Hue locks to 200

---

## Shared Infrastructure

### Two-Window Architecture
- **Main window**: 120×120, transparent, alwaysOnTop — holds blob
- **Chat window**: 360×56 (collapsed) / 360×250 (expanded), transparent, hidden initially

### Rust Commands
- `get_window_position`, `set_window_position`, `resize_window`
- `set_window_geometry`, `get_screen_size`, `get_window_label`
- `show_chat_window(x, y)`, `hide_chat_window`, `set_chat_window_position`

### Interaction
- **Click toggle**: Single click opens/closes chat window
- **Drag**: 6px threshold distinguishes click from drag, moves blob + chat window
- **Escape**: Closes chat window
- **Right-click**: Context menu blocked in production, allowed in dev
- **Screen clamping**: Chat window clamped to screen bounds

### Chat Window Positioning
- `chatY = blobBottom + 10`, clamped to screen
- Dynamic resize: 56px collapsed → 250px when `isProcessing`

### Cross-Window Color Sync
- `localStorage.setItem('blob-hue', ...)` in BlobCanvas draw loop
- Polled every 100ms + `storage` events in ChatTextbox
- CSS variable `--blob-hue` synced via localStorage (separate Tauri windows = separate DOMs)

### Chat UI (globals.css + ChatTextbox.tsx)
- Glassy neumorphism: dark glass panels with blob-synced colors
- Breathing border animation
- Inner depth shadows
- Refined input with focus glow
- Gradient send button
- Send flash effect (`.sending` class, 600ms, edge-glow keyframe)
- No persistent shadow (only during send)
- Custom scrollbar
- Outfit font (Google Fonts)

---

## Files Changed
- `src/components/BlobCanvas.tsx` — Blob rendering (currently plasma variant)
- `src/components/ChatTextbox.tsx` — Chat input, resize, hue sync
- `src/styles/globals.css` — Chat panel glassmorphism, animations
- `src/App.tsx` — Routes by window label (main→blob, chat→textbox)
- `src/lib/constants.ts` — BLOB.SIZE=100, HUE_SPEED=15, BREATH_PERIOD_MS=3800
- `src/lib/api.ts` — TypeScript bindings for all Rust commands
- `src/stores/config.ts` — State management (textboxOpen, isDragging, blobScreenPos)
- `src-tauri/tauri.conf.json` — Two windows (main + chat), transparent
- `src-tauri/src/lib.rs` — All window commands
- `index.html` — Outfit font loaded from Google Fonts

## Performance
- All variants use requestAnimationFrame — smooth 60fps
- No pixel loops — pure vector/canvas path rendering
- Physics updates: 64 points (mercury) / 40 points (jellyfish) / 40 points (plasma) — negligible
- Particle count (plasma): 24 — negligible
- Lightning arcs: max 9 simultaneous, short lifecycle — negligible

## Testing
- Canvas `backgroundColor: 'transparent'` preserved
- Body/root `background: transparent !important` preserved
- Tauri windows have `transparent: true`
- No rectangular artifacts
- Event handlers unchanged (click toggle, drag, escape)
- Drag threshold still 6px
- All Rust commands intact
