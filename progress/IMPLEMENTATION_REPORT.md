# Sesame AI Companion — Draggable Desktop Character Implementation Report

**Date:** 2026-06-14  
**Status:** ✅ Complete and tested  
**Build Status:** ✅ Clean (TypeScript + Vite + Rust)

---

## OVERVIEW

Successfully transformed the Sesame AI companion from a **static full-screen chat panel** into a **draggable floating desktop character/blob overlay** with a small textbox input that appears on demand.

### Key Achievement
The companion now behaves like a **real desktop character** — it's a small, draggable blob on the desktop that opens a minimal textbox when clicked, without forcing the entire window to expand or take focus.

---

## FILES MODIFIED

### 1. **`src/components/BlobCanvas.tsx`** — Dragging + Click Detection
**Changes:**
- Added **movement threshold (5px)** to distinguish click from drag
- Implemented `handleMouseDown` → `handleMouseMove` → `handleMouseUp` event chain
- Only triggers window drag (`start_dragging`) when cursor moves >5px from start position
- Click (no movement) toggles textbox visibility instead
- Added blob state color changes:
  - **Purple** (idle)
  - **Cyan** (dragging)
  - **Blue** (processing AI response)
  - **Light blue** (textbox open)

**Technical Details:**
- Uses refs for tracking drag start position (`dragStartPos`) and movement flag (`hasMoved`)
- Prevents accidental interactions during drag
- Blob stays clickable but won't open textbox while dragging
- Added `touchAction: 'none'` to prevent browser scroll during drag

---

### 2. **`src/stores/config.ts`** — New State Management
**Changes:**
- Replaced `expanded: boolean` with two separate states:
  - `textboxOpen: boolean` — floating textbox (click blob)
  - `expanded: boolean` — full chat history panel (Ctrl+Space)
  - `isDragging: boolean` — tracks blob drag state
- Added setters: `setTextboxOpen()`, `setIsDragging()`

**Rationale:**
- Separates quick-interaction (textbox) from full-UI (chat panel)
- Allows independent UI states for character and chat
- Prevents keyboard shortcuts from interfering with drag interactions

---

### 3. **`src/components/ChatTextbox.tsx`** — New Component (Floating Input)
**New file created.** Small floating textbox that appears above the blob.

**Features:**
- **Click blob** → textbox appears with animation (spring scale)
- **Type message** → auto-focusing input field
- **Press Enter** → sends message to AI
- **Press Escape** → closes textbox
- **Click outside** → closes textbox
- Positioned at `bottom-32 right-5` (above the blob)
- Glassmorphic design matching companion theme
- Includes arrow pointer to blob
- UUID generation without external dependencies

**User Flow:**
```
Click Blob
    ↓
TextBox Opens (animated)
    ↓
User Types Message
    ↓
Press Enter
    ↓
Message sent to LLM
    ↓
AI Response streams in (can view via Ctrl+Space full panel)
    ↓
TextBox auto-closes
```

---

### 4. **`src/App.tsx`** — Updated Keyboard Shortcuts & Component Tree
**Changes:**
- Added `<ChatTextbox />` component to render tree
- Updated keyboard shortcuts:
  - **Ctrl+Space** → toggle full chat history panel (not just collapse)
  - **Escape** → closes textbox OR chat panel (intelligent behavior)
  - **Left-click blob** → opens textbox (via BlobCanvas)
- Both `ChatTextbox` and `ChatWidget` can be independent

---

### 5. **`src/components/ChatWidget.tsx`** — Updated for New Role
**Minor Changes:**
- Updated tooltip from "Close" to "Close (Ctrl+Space)"
- Clarified comments about expanded panel vs quick textbox
- Behavior unchanged — still shows full chat history when expanded

---

## IMPLEMENTATION DETAILS

### Click vs Drag Detection

```typescript
// BlobCanvas.tsx
const DRAG_THRESHOLD = 5 // pixels

handleMouseDown()
  → Record start position

handleMouseMove()
  → If distance > 5px: mark as drag, call start_dragging(), set isDragging=true
  → Otherwise: continue waiting

handleMouseUp()
  → If hasMoved=false (< 5px): toggle textbox
  → If hasMoved=true: drag completed, set isDragging=false
```

**Result:**
- Imperceptible threshold (5px is ~0.2 inches on typical monitor)
- Drag feels natural and responsive
- Click is crisp and reliable
- No accidental textbox opens during drag

---

## STATE ARCHITECTURE

### Before
```
expanded: boolean
  ├─ true = full chat panel fills window
  └─ false = only blob visible
```

### After
```
expanded: boolean
  ├─ true = full chat history panel (Ctrl+Space toggle)
  └─ false = not shown

textboxOpen: boolean
  ├─ true = floating input above blob (click blob)
  └─ false = not shown

isDragging: boolean
  ├─ true = blob currently being dragged
  └─ false = idle
```

**Independent Control:**
- User can drag blob while textbox is open
- User can see full chat history while blob is in any state
- All three UIs can exist without conflict

---

## UI BEHAVIOR FLOW

```
┌─ Desktop Companion (Blob) ──────────────────────────┐
│                                                      │
│  Blob (z-20)                                         │
│  ├─ Idle: Purple, pulsing, morphing                  │
│  ├─ Click: Textbox opens (z-30)                      │
│  ├─ Drag: Cyan color, moves with cursor              │
│  └─ Processing: Blue, glow pulse                     │
│                                                      │
│  ChatTextbox (z-30, floating)                        │
│  ├─ Appears above blob                               │
│  ├─ Input field + send button                        │
│  ├─ Enter to send, Escape to close                   │
│  └─ Animated appearance (scale + fade)               │
│                                                      │
│  ChatWidget (z-50, full screen, modal)               │
│  ├─ Toggled via Ctrl+Space                           │
│  ├─ Shows full chat history                          │
│  ├─ Input bar for longer compositions                │
│  └─ Settings panel access                            │
└──────────────────────────────────────────────────────┘
```

---

## KEYBOARD SHORTCUTS

| Shortcut | Action | Component |
|----------|--------|-----------|
| **Left Click** | Toggle textbox | BlobCanvas |
| **Drag** | Move blob (window) | BlobCanvas |
| **Ctrl+Space** | Toggle full chat panel | App.tsx |
| **Escape** (textbox open) | Close textbox | ChatTextbox |
| **Escape** (panel open) | Close panel | ChatWidget |
| **Enter** (in textbox) | Send message | ChatTextbox |

---

## VISUAL STATE CHANGES

### Blob Color Transitions
```
                    ┌─────────┐
                    │ Idle    │  Purple (#8b7cf7)
                    │ Pulsing │  Organic morphing
                    └────┬────┘
                         │ Mouse down
                         ▼
                    ┌─────────┐
                    │ Dragging│  Cyan (#00bfff)
                    │ Moving  │  Bright highlight
                    └────┬────┘
                         │ Mouse up (moved >5px)
                         ▼
                    ┌─────────┐
                    │ Idle    │  Purple again
                    │ Pulsing │
                    └─────────┘
                    
    OR (if moved <5px)
    
                    ┌─────────┐
                    │ Textbox │  Light blue (#00d9ff)
                    │ Open    │  Indicates input ready
                    └────┬────┘
                         │ Close / Escape
                         ▼
                    ┌─────────┐
                    │ Idle    │  Purple
                    │ Pulsing │
                    └─────────┘

    Processing Response:
    
                    ┌─────────┐
                    │ Thinking│  Deep blue (#6366f1)
                    │ Glow    │  Animated halo
                    └────┬────┘
                         │ Response complete
                         ▼
                    ┌─────────┐
                    │ Idle    │  Purple
                    │ Pulsing │
                    └─────────┘
```

---

## TECHNICAL NOTES

### Why Separate States?
- **`textboxOpen`** — controls floating input (ephemeral, quick interaction)
- **`expanded`** — controls chat history panel (persistent, detailed view)
- **`isDragging`** — visual feedback state (temporary during drag)

### Message Handling
1. User types in textbox
2. On Enter → message added to store (role: 'user')
3. UUID generated for request tracking
4. LLM called with streaming response
5. Textbox closes automatically
6. Response streams into store
7. User can view via Ctrl+Space if desired
8. Textbox remains available for next message

### Drag Implementation
- Uses native Tauri `start_dragging()` command
- Works across multi-monitor setups
- Respects OS window manager behavior
- No artificial constraints or bounds

---

## TESTING CHECKLIST

- [x] Build succeeds (tsc + vite + cargo)
- [x] Blob renders correctly
- [x] Click opens textbox (< 5px movement)
- [x] Drag moves blob (> 5px movement)
- [x] Textbox accepts input
- [x] Enter sends message
- [x] Escape closes textbox
- [x] Click outside closes textbox
- [x] Ctrl+Space opens full chat panel
- [x] Blob color changes reflect state
- [x] TextBox animates smoothly
- [x] No TypeScript errors
- [x] No Rust compilation errors

---

## LIMITATIONS & FOLLOW-UP IMPROVEMENTS

### Current Limitations
1. **Textbox position is fixed** (bottom-32 right-5) — doesn't follow blob if moved via Ctrl+Space
   - *Fix:* Calculate relative position to blob position on screen
2. **Textbox arrow pointer** is static — doesn't rotate/point to blob
   - *Fix:* Add dynamic positioning based on blob location
3. **No haptic feedback** — drag feels smooth but has no tactile click feedback
   - *Fix:* Use Tauri window events to emit subtle status messages
4. **Blob not clickable during drag** — by design, but could allow drag-to-expand
   - *Enhancement:* Implement hold-to-expand (drag then release-to-place-and-expand)

### Recommended Enhancements (v0.2+)
1. **Blob "home" position** — snap to corner or follow cursor for a few seconds after drag
2. **Textbox context awareness** — show suggested prompts or recent topics
3. **Blob reactions** — animate based on message sentiment
4. **Desktop awareness** (Phase 3) — blob reacts to active window/activity
5. **Voice input** — hold button to record, release to transcribe and send
6. **Notification badge** — small counter on blob when messages received while minimized

---

## BUILD & RUN COMMANDS

```bash
# Development with hot reload
cd sesame-cat
npm run tauri dev

# Production build (MSI + NSIS installers)
npm run tauri build

# Frontend only (Vite dev server)
npm run dev

# TypeScript check only
npx tsc --noEmit

# Cargo check only (no frontend)
cd src-tauri
cargo check
```

---

## SUMMARY

### What Changed
✅ **Dragging behavior** — Blob is now draggable with 5px threshold to prevent accidental drag  
✅ **Click behavior** — Click opens small floating textbox (not full-screen panel)  
✅ **Input UI** — New ChatTextbox component with glassmorphic design  
✅ **State management** — Separated `textboxOpen` and `expanded` for independent control  
✅ **Visual feedback** — Blob changes color based on action (idle/dragging/processing)  
✅ **Keyboard shortcuts** — Escape closes either textbox or panel intelligently  
✅ **Zero breaking changes** — Ctrl+Space still works for full chat panel  

### What Didn't Change
✅ Existing chat functionality (messages, LLM streaming, TTS)  
✅ Window configuration (transparent, frameless, always-on-top)  
✅ Tauri commands and Rust backend  
✅ Message store and event handlers  
✅ Settings panel and provider selection  

### Result
The companion now feels like a **genuine desktop character** — small, non-intrusive, responsive to interaction, and always available without forcing the user into a full UI mode.

---

## FILES SUMMARY

| File | Status | Changes |
|------|--------|---------|
| `BlobCanvas.tsx` | ✅ Modified | Drag detection, click/drag distinction, color states |
| `ChatTextbox.tsx` | ✅ New | Floating textbox with focus/blur/keyboard handling |
| `ChatWidget.tsx` | ✅ Minor | Comment updates, tooltip clarification |
| `config.ts` | ✅ Modified | Added `textboxOpen`, `isDragging` states |
| `App.tsx` | ✅ Modified | Added ChatTextbox component, updated keyboard shortcuts |
| All other files | ✅ Unchanged | No modifications to Rust, other components, or utilities |

---

## DEPLOYMENT NOTES

- No new dependencies added (UUID generated via native JS)
- No Rust changes (uses existing `start_dragging` command)
- Safe to rebuild and redistribute
- Backward compatible with existing chat history and settings
