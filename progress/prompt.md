# Blob Widget Implementation Prompt

## Overview

Replace a free-roaming procedural cat character with a **fixed bottom-right transparent morphing blob** in a Tauri v2 + React 19 desktop app. The blob expands into a chat widget on click.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19.2.6 |
| Build | Vite | 8.0.16 |
| Language | TypeScript | 6.0.2 |
| Styling | Tailwind CSS | 4.3.1 (via `@import "tailwindcss"` in CSS) |
| Animation | motion (framer) | 12.40.0 (import from `motion/react`) |
| State | Zustand | 5.0.14 (import `create` from `zustand`) |
| Desktop | Tauri | 2.11.2 |
| JS runtime | esbuild | 0.28.1 (separate dep required by Vite 8) |

**IMPORTANT TypeScript 6.0 quirks:**
- NO `baseUrl` in tsconfig (deprecated, causes error)
- `paths` still works: `"@/*": ["./src/*"]`
- `onInput` handler uses `React.FormEvent<HTMLTextAreaElement>`, NOT `ChangeEvent`
- `verbatimModuleSyntax` requires `import type` for type-only imports
- `erasableSyntaxOnly` — no `enum`, no `namespace`, no parameter properties

**IMPORTANT Zustand pattern:**
- Use `useXxxStore.getState()` inside rAF loops / event handlers (not closures)
- Subscribe with selectors: `useStore((s) => s.field)`

**IMPORTANT motion v12:**
- Import from `motion/react`, NOT `framer-motion`

---

## Blob Design Spec

### Position & Layout
- **Fixed at bottom-right** of screen: `right: 20px, bottom: 20px`
- **Canvas area**: 100×100px
- **Base radius**: 35px
- **Z-index**: 10 (above background, below widget)
- **Pointer events**: auto (clickable)

### Appearance
- **Shape**: Soft sphere with subtle organic morphing (not perfect circle)
- **Style**: Glassmorphism — transparent center → tinted/colored edges
- **Drawing**: Canvas 2D radial gradient + noise displacement on radius

### Color Palette (curated professional hues)
| State | Hue Range | Saturation | Lightness | Description |
|-------|-----------|------------|-----------|-------------|
| **Idle** | 220° → 290° → 320° | 50-65% | 45-60% | Deep blue → purple → warm pink |
| **Expanded** | 190° → 210° → 240° | 60-70% | 50-55% | Cyan → sky blue → indigo (cooler) |
| **Thinking** | 270° | 80% | 65% | Bright accent purple |

### Core Animations (continuous rAF loop)
1. **Breathing**: Radius pulse ±3.5px, period 3.8s (sinusoidal)
2. **Color phase**: Slow hue rotation through palette, 75s full cycle
3. **Organic morph**: Value noise (3 octaves) on radius displacement, ±2.5px amplitude

### Interaction States
| State | Visual Change | Trigger |
|-------|---------------|---------|
| **Idle** | Base animations (breathing + color + morph) | Default |
| **Hover** | Scale 1.05x, brighter saturation, breath speeds up | Mouse enter |
| **Click** | Squish: 0.9x → 1.1x spring back | Mouse down |
| **Expanded** | Palette → cooler tones ("listening"), pulse faster (2s period), subtle glow ring | `expanded=true` |
| **Thinking** | Rapid pulse (1s), brighter accent hue, slight glow | `isProcessing=true` |

### Click Behavior
- Single click anywhere on blob → toggles chat widget `expanded` in config store
- Hit area: circle radius = BLOB.RADIUS × 1.2 (slightly larger than visual)
- No drag — blob stays fixed at bottom-right always

---

## Files to CREATE

### 1. `src/stores/blob.ts`

A minimal Zustand store for animation state. The animation loop writes to it, and the canvas reads from it. Also syncs with existing chat/config stores.

```typescript
import { create } from 'zustand'
import { useConfigStore } from './config'
import { useChatStore } from './chat'

interface BlobStore {
  hue: number              // 0-360, animated by rAF loop
  breathPhase: number      // 0-2π, animated by rAF loop
  hovered: boolean         // set by BlobCanvas mouse enter/leave
  setHue: (h: number) => void
  setBreathPhase: (p: number) => void
  setHovered: (v: boolean) => void
}

export const useBlobStore = create<BlobStore>((set) => ({
  hue: 220,
  breathPhase: 0,
  hovered: false,
  setHue: (hue) => set({ hue }),
  setBreathPhase: (breathPhase) => set({ breathPhase }),
  setHovered: (hovered) => set({ hovered }),
}))

// Derived state helpers (not in store — computed from other stores)
export function useBlobExpanded() {
  return useConfigStore((s) => s.expanded)
}

export function useBlobThinking() {
  return useChatStore((s) => s.isProcessing)
}
```

### 2. `src/hooks/useBlobAnimation.ts`

A single rAF animation loop that drives hue and breathPhase.

```typescript
import { useEffect, useRef } from 'react'
import { useBlobStore } from '@/stores/blob'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'

export function useBlobAnimation() {
  const rafRef = useRef<number>(0)
  const lastRef = useRef<number>(0)

  useEffect(() => {
    const animate = (time: number) => {
      const dt = lastRef.current ? (time - lastRef.current) : 16
      lastRef.current = time

      const store = useBlobStore.getState()
      const expanded = useConfigStore.getState().expanded
      const thinking = useChatStore.getState().isProcessing

      // Speed modifiers based on state
      const breathSpeed = thinking ? 3.8 : expanded ? 1.9 : 1.0
      const hueSpeed = thinking ? 3.0 : expanded ? 1.5 : 1.0

      store.setBreathPhase(store.breathPhase + (dt / 1000) * breathSpeed * (Math.PI * 2 / (BLOB.BREATH_PERIOD_MS / 1000)))
      store.setHue((store.hue + hueSpeed * BLOB.HUE_SPEED * (dt / 1000)) % 360)

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])
}
```

### 3. `src/components/BlobCanvas.tsx`

The main component. Canvas 2D with radial gradient and noise-displaced circle.

```typescript
import { useEffect, useRef, useCallback } from 'react'
import { useBlobStore, useBlobExpanded, useBlobThinking } from '@/stores/blob'
import { useConfigStore } from '@/stores/config'
import { BLOB } from '@/lib/constants'
// If using noise library:
// import simplexNoise from 'simplex-noise'

export function BlobCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const store = useBlobStore()
  const expanded = useBlobExpanded()
  const thinking = useBlobThinking()
  const hoveredRef = useRef(false)

  // Handle click → toggle widget expand
  const handleClick = useCallback(() => {
    const expanded = useConfigStore.getState().expanded
    useConfigStore.getState().setExpanded(!expanded)
  }, [])

  // Canvas rAF draw loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number

    const draw = (time: number) => {
      const blob = useBlobStore.getState()
      const exp = useConfigStore.getState().expanded
      const think = useChatStore.getState().isProcessing

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Select palette based on state
      const palette = think ? BLOB.THINKING_PALETTE
        : exp ? BLOB.EXPANDED_PALETTE
        : BLOB.PALETTE

      // Compute current hue from palette rotation
      const hue = blob.hue

      // Compute breath
      const breath = Math.sin(blob.breathPhase) * BLOB.BREATH_AMPLITUDE

      // Base radius + breath
      const radius = BLOB.RADIUS + breath

      // TODO: apply noise displacement for organic edges
      // For MVP: draw smooth circle with radial gradient

      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius + breath)
      
      // Apply palette as gradient stops
      grad.addColorStop(0, `hsla(${(hue + 0) % 360}, 50%, 60%, 0.05)`)    // center (transparent)
      grad.addColorStop(0.3, `hsla(${(hue + 30) % 360}, 55%, 55%, 0.15)`)
      grad.addColorStop(0.6, `hsla(${(hue + 60) % 360}, 60%, 50%, 0.30)`)
      grad.addColorStop(1, `hsla(${(hue + 90) % 360}, 65%, 45%, 0.50)`)     // edge (most opaque)

      ctx.beginPath()
      ctx.arc(cx, cy, radius + breath, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()

      // Glow effect when thinking
      if (think) {
        ctx.beginPath()
        ctx.arc(cx, cy, radius + breath + 4, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${(hue + 90) % 360}, 80%, 65%, 0.3)`
        ctx.lineWidth = 2
        ctx.stroke()
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={BLOB.SIZE}
      height={BLOB.SIZE}
      className="fixed bottom-5 right-5 z-10 cursor-pointer"
      style={{
        filter: useBlobStore((s) => s.hovered) ? 'brightness(1.15)' : undefined,
        transition: 'filter 0.3s ease',
      }}
      onClick={handleClick}
      onMouseEnter={() => store.setHovered(true)}
      onMouseLeave={() => store.setHovered(false)}
    />
  )
}
```

### 4. Update `src/lib/constants.ts`

Replace CAT constants with BLOB constants:

```typescript
export const BLOB = {
  SIZE: 100,
  RADIUS: 35,
  BREATH_AMPLITUDE: 3.5,
  BREATH_PERIOD_MS: 3800,
  HUE_SPEED: 15,             // deg/s in idle
  NOISE_AMPLITUDE: 2.5,
  NOISE_SPEED: 0.7,
  POSITION: { right: 20, bottom: 20 },
  PALETTE: [
    { h: 220, s: 0.65, l: 0.45 },
    { h: 260, s: 0.60, l: 0.50 },
    { h: 290, s: 0.55, l: 0.55 },
    { h: 320, s: 0.50, l: 0.60 },
  ],
  EXPANDED_PALETTE: [
    { h: 190, s: 0.70, l: 0.50 },
    { h: 210, s: 0.65, l: 0.55 },
    { h: 240, s: 0.60, l: 0.50 },
  ],
  THINKING_PALETTE: [
    { h: 270, s: 0.80, l: 0.65 },
  ],
} as const
```

---

## Files to MODIFY

### 1. `src/App.tsx`

```diff
- import { CatCanvas } from '@/components/CatCanvas'
- import { useCatState } from '@/hooks/useCatState'
+ import { BlobCanvas } from '@/components/BlobCanvas'
+ import { useBlobAnimation } from '@/hooks/useBlobAnimation'

function App() {
-   const winW = window.innerWidth
-   const winH = window.innerHeight
-   const { handleCatClick } = useCatState(winW, winH)
+   useBlobAnimation()

  useEffect(() => {
    // keyboard shortcuts (KEEP AS-IS)
    ...
  }, [])

  return (
    <>
-     <CatCanvas onClick={handleCatClick} />
+     <BlobCanvas />
      <ChatWidget />
    </>
  )
}
```

### 2. `src/components/ChatWidget.tsx`

No structural changes needed — the blob reads `expanded` and `isProcessing` from existing stores directly. The chat widget already works correctly. Keep the collapse button, gear settings, etc.

---

## Files to DELETE

- `src/components/CatCanvas.tsx` (267 lines of cat drawing code)
- `src/hooks/useCatState.ts` (108 lines of cat state machine)
- `src/stores/cat.ts` (47 lines of cat store)

---

## Noise Implementation

For the organic morph effect, use a simple inline value noise function (no npm dep needed):

```typescript
// Simple 2D noise with 3 octaves for organic blob edges
// Input: angle (0-2π), time, amplitude
// Output: radius displacement in pixels
function blobNoise(angle: number, time: number, amplitude: number): number {
  // Implement 3-octave value noise:
  // octave 1: sin(angle * 2 + time * 0.8) * amplitude
  // octave 2: sin(angle * 4 + time * 1.3) * amplitude * 0.5
  // octave 3: sin(angle * 7 + time * 2.1) * amplitude * 0.25
  // Sum all octaves for organic displacement
  const n1 = Math.sin(angle * 2 + time * 0.8) * amplitude
  const n2 = Math.sin(angle * 4 + time * 1.3) * amplitude * 0.5
  const n3 = Math.sin(angle * 7 + time * 2.1) * amplitude * 0.25
  return n1 + n2 + n3
}
```

Then in the canvas draw loop, instead of a single `arc()` call, draw a path with many points:

```typescript
const segments = 64
ctx.beginPath()
for (let i = 0; i <= segments; i++) {
  const angle = (i / segments) * Math.PI * 2
  const noise = blobNoise(angle, time / 1000, BLOB.NOISE_AMPLITUDE)
  const r = radius + breath + noise
  const x = cx + Math.cos(angle) * r
  const y = cy + Math.sin(angle) * r
  if (i === 0) ctx.moveTo(x, y)
  else ctx.lineTo(x, y)
}
ctx.closePath()
ctx.fill()
```

---

## Integration Points

The blob interacts with existing Zustand stores:

| Blob reads from | Store | Field |
|----------------|-------|-------|
| `useConfigStore` | config | `expanded` (to select palette) |
| `useChatStore` | chat | `isProcessing` (for thinking state) |

| Blob writes to | Store | Field |
|----------------|-------|-------|
| `useConfigStore` | config | `setExpanded(!expanded)` on click |

No other integration needed — ChatWidget already manages its own expanded state.

---

## Expected Outcome

- 100×100px canvas fixed at bottom-right of screen
- Transparent-centered sphere with colored edges that organically morphs
- Slow color cycle through curated professional palette
- Click toggles chat widget expand/collapse
- Palette shifts to cooler blues when chat is open
- Faster pulse + glow when AI is processing
- Hover brightness boost
- ~120 lines of BlobCanvas.tsx, ~30 lines of blob store, ~50 lines of animation hook
- Build passes with `tsc -b && vite build` (zero errors)
- All cat files deleted
