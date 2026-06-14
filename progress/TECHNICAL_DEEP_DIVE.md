# Technical Deep Dive — Draggable Blob Implementation

## Architecture

### Component Hierarchy
```
App
├── BlobCanvas
│   ├── Canvas 2D rendering (animation loop)
│   ├── Mouse event handlers (click vs drag)
│   └── State subscriptions (isDragging, textboxOpen, isProcessing)
├── ChatTextbox
│   ├── AnimatePresence (conditional rendering)
│   ├── Input field (auto-focus)
│   ├── Send button
│   └── Event listeners (Escape, click-outside)
└── ChatWidget
    ├── Full chat history panel
    ├── Message list
    ├── Input bar
    └── Settings panel
```

### State Dependencies

```
useConfigStore
├── textboxOpen (boolean)
│   ├─ Read by: BlobCanvas (for color), ChatTextbox (visibility)
│   └─ Modified by: BlobCanvas (click), ChatTextbox (escape/blur)
├── isDragging (boolean)
│   ├─ Read by: BlobCanvas (for color)
│   └─ Modified by: BlobCanvas (drag detection)
├── expanded (boolean)
│   ├─ Read by: ChatWidget (visibility)
│   └─ Modified by: App (Ctrl+Space), ChatWidget (close button)
└── [LLM config...]

useChatStore
├── messages
├── isProcessing
└── latestRequestId
```

---

## Click vs Drag Detection

### Algorithm

```typescript
// BlobCanvas.tsx
const DRAG_THRESHOLD = 5 // pixels

// Step 1: Mouse down
handleMouseDown(e) {
  dragStartPos = { x: e.clientX, y: e.clientY }
  hasMoved = false
}

// Step 2: Mouse move
handleMouseMove(e) {
  if (hasMoved) return // Already classified as drag
  
  dx = |e.clientX - dragStartPos.x|
  dy = |e.clientY - dragStartPos.y|
  
  if (dx > 5 || dy > 5) {
    hasMoved = true
    setIsDragging(true)
    invoke('start_dragging') // Tauri native drag
  }
}

// Step 3: Mouse up
handleMouseUp(e) {
  if (!hasMoved) {
    // Click: toggle textbox
    setTextboxOpen(!textboxOpen)
  }
  
  setIsDragging(false)
  hasMoved = false
}
```

### Why 5px?
- 5 pixels ≈ 0.15-0.2 inches on typical monitor (96-100 DPI)
- Threshold between finger tremor and intentional movement
- Fast enough for drag detection (no noticeable delay)
- Small enough that users don't accidentally open textbox

### Canvas Events
```
canvas
  onMouseDown  → Record start position
  onMouseMove  → Check if threshold exceeded
  onMouseUp    → Classify as click or drag
  onMouseLeave → End drag (user moved cursor away)
```

The `onMouseLeave` handler calls `handleMouseUp()` to clean up if the cursor leaves the window during drag.

---

## Textbox Lifecycle

### Open Sequence
```typescript
// User clicks blob
BlobCanvas.handleMouseUp() → setTextboxOpen(true)

// ChatTextbox receives new state
useEffect([textboxOpen]) {
  if (textboxOpen) {
    // Animate in (via motion.div initial/animate)
    // Set focus to input after animation
    setTimeout(() => inputRef.current?.focus(), 50)
  }
}

// Event listeners attached
useEffect([textboxOpen]) {
  if (textboxOpen) {
    addEventListener('keydown', handleKeyDown)     // Escape key
    addEventListener('click', handleClickOutside)  // Blur
  }
}
```

### Close Sequence
```typescript
// User presses Escape
handleKeyDown(e) {
  if (e.key === 'Escape' && textboxOpen) {
    setTextboxOpen(false)  // Trigger exit animation
  }
}

// Or user clicks outside
handleClickOutside(e) {
  if (!containerRef.current?.contains(e.target)) {
    setTextboxOpen(false)
  }
}

// AnimatePresence removes component from DOM after animation
<AnimatePresence>
  {textboxOpen && <motion.div ...>...</motion.div>}
</AnimatePresence>
```

### Send Sequence
```typescript
handleSend() {
  // 1. Extract and validate input
  text = inputRef.current.value.trim()
  
  // 2. Add user message to store
  addMessage({ text, role: 'user', status: 'sent' })
  
  // 3. Add assistant placeholder
  assistantMsgId = addMessage({
    text: '',
    role: 'assistant',
    status: 'thinking'
  })
  
  // 4. Clear and close
  inputRef.current.value = ''
  setTextboxOpen(false)
  setProcessing(true)
  
  // 5. Generate request ID and send
  requestId = generateUUID()
  registerRequest(requestId, assistantMsgId)
  
  // 6. Call Tauri command (async)
  sendChatMessage(requestId, messages, config)
    // Event listeners in App.tsx will handle:
    // onLlmToken → appendToMessage(assistantMsgId, token)
    // onLlmDone → updateMessage(assistantMsgId, { status: 'done' })
    // onLlmError → updateMessage(assistantMsgId, { text: error })
}
```

---

## Blob Animation

### Canvas Rendering Loop
```typescript
useEffect([textboxOpen, isProcessing, isDragging]) {
  const draw = (time: number) => {
    // 1. Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // 2. Determine color based on state
    if (isProcessing) hue = 270   // Deep blue
    else if (isDragging) hue = 200 // Cyan
    else if (textboxOpen) hue = 210 // Light blue
    else hue = (time * HUE_SPEED) % 360 // Purple idle
    
    // 3. Calculate breathing amplitude
    breath = sin(time * BREATH_SPEED) * BREATH_AMPLITUDE
    radius = BASE_RADIUS + breath
    
    // 4. Draw organic blob shape (noise-based)
    ctx.beginPath()
    for (i = 0 to 64 segments) {
      angle = (i / 64) * TAU
      noise = blobNoise(angle, time, NOISE_AMPLITUDE)
      r = radius + noise
      x = cx + cos(angle) * r
      y = cy + sin(angle) * r
      ctx.lineTo(x, y)
    }
    ctx.closePath()
    
    // 5. Fill with glassmorphic gradient
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    grad.addColorStop(0, hsla(hue, 50%, 60%, 0.1))    // Transparent center
    grad.addColorStop(0.4, hsla(hue, 55%, 55%, 0.3))  // Mid opacity
    grad.addColorStop(1, hsla(hue, 65%, 45%, 0.6))    // Opaque edge
    ctx.fillStyle = grad
    ctx.fill()
    
    // 6. Add thinking glow when processing
    if (isProcessing) {
      ctx.arc(cx, cy, radius + 5, 0, TAU)
      ctx.strokeStyle = hsla(hue, 80%, 65%, 0.4)
      ctx.lineWidth = 3
      ctx.stroke()
    }
    
    // 7. Request next frame
    raf = requestAnimationFrame(draw)
  }
  
  raf = requestAnimationFrame(draw)
  return () => cancelAnimationFrame(raf)
}, [textboxOpen, isProcessing, isDragging])
```

### Performance
- **Frame rate:** 60 FPS (requestAnimationFrame)
- **CPU usage:** Minimal (single circle, no DOM mutations)
- **GPU usage:** Canvas 2D accelerated (hardware rendering)
- **Memory:** Constant (no allocation during animation)

---

## State Transitions

### State Machine
```
[IDLE]
  ↓ click (no drag)
[TEXTBOX_OPEN]
  ├─ Type message
  ├─ Enter → SENDING
  └─ Escape → IDLE
  
[IDLE]
  ↓ drag start
[DRAGGING]
  ├─ Move cursor
  ├─ Keep dragging
  └─ Release → IDLE
  
[*]
  ↓ async LLM response
[PROCESSING]
  ├─ Stream tokens
  ├─ Update message
  └─ Complete → IDLE
  
[*]
  ↓ Ctrl+Space
[CHAT_PANEL_OPEN]
  ├─ View history
  ├─ Edit settings
  └─ Close → IDLE
```

### State Guard Rules
1. Only one textbox OR one chat panel can be open (AnimatePresence)
2. Dragging doesn't prevent clicking (click has priority if <5px)
3. Processing doesn't prevent interaction (user can still open/close)
4. Each component subscribes only to states it uses (Zustand selectors)

---

## Message Flow

### User → AI → User

```
┌─ USER ──────────────────────────────────────────┐
│ 1. Click blob                                    │
│ 2. Type: "What's 2+2?"                          │
│ 3. Press Enter                                   │
└─ ↓ ────────────────────────────────────────────┘

┌─ FRONTEND (React) ───────────────────────────────┐
│ 1. ChatTextbox.handleSend()                      │
│ 2. addMessage({ role: 'user', text: "..." })    │
│ 3. registerRequest(id, msgId)                    │
│ 4. sendChatMessage(id, messages, config)        │
│ 5. Close textbox                                │
│ 6. Set processing=true                          │
└─ ↓ ────────────────────────────────────────────┘

┌─ TAURI COMMAND (Rust) ───────────────────────────┐
│ 1. async send_chat_message(...)                  │
│ 2. Spawn tokio::spawn for streaming              │
│ 3. Call llm::stream_llm(...)                     │
│ 4. Parse SSE stream from LLM provider            │
│ 5. For each token: emit llm:token event          │
│ 6. On complete: call sidecar.send_tts(...)      │
│ 7. On error: emit llm:error event                │
└─ ↓ ────────────────────────────────────────────┘

┌─ FRONTEND EVENT HANDLERS (App.tsx) ──────────────┐
│ 1. onLlmToken({ request_id, token })            │
│    → appendToMessage(msgId, token)               │
│ 2. onLlmDone({ request_id })                     │
│    → updateMessage(msgId, { status: 'done' })    │
│    → setProcessing(false)                        │
│ 3. onAudioChunk({ pcm_base64 })                  │
│    → audioPlayer.enqueueChunk(pcm_base64)        │
└─ ↓ ────────────────────────────────────────────┘

┌─ USER (hearing response) ───────────────────────┐
│ "The answer is 4"                              │
└──────────────────────────────────────────────────┘
```

---

## UUID Generation (No External Dependency)

```typescript
// src/components/ChatTextbox.tsx
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    .replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
}

// Why this pattern?
// - 'x' → random digit (0-f)
// - 'y' → random with version/variant bits (8-b range)
// - No external npm package needed
// - Cryptographically weak but sufficient for request tracking
// - Standard UUID v4 format
```

---

## Styling

### Glassmorphism Effect
```css
/* globals.css */
.glass-panel {
  background: rgba(18, 18, 24, 0.85);           /* Dark with transparency */
  backdrop-filter: blur(20px) saturate(180%);   /* Blur background */
  border-color: rgba(255, 255, 255, 0.2);      /* Subtle white border */
}
```

### TextBox CSS
```css
input {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  rounded: lg
  
  &:focus {
    border-color: rgba(255, 255, 255, 0.4);    /* Brighter on focus */
    ring: 1px rgba(255, 255, 255, 0.3);        /* Subtle glow */
  }
}

button {
  gradient: from-purple-500 to-blue-600
  
  &:hover {
    gradient: from-purple-600 to-blue-700       /* Darker on hover */
  }
}
```

---

## Performance Considerations

### What's Optimized
- ✅ Canvas draws once per frame (rAF)
- ✅ No DOM mutations during draw (canvas only)
- ✅ Zustand selectors prevent unnecessary re-renders
- ✅ useCallback memoizes event handlers
- ✅ useRef for drag tracking (no state updates)
- ✅ AnimatePresence only animates when needed

### Potential Improvements
- Consider: Web Worker for canvas animation (if CPU-heavy in future)
- Consider: requestIdleCallback for textbox open/close animations
- Consider: Intersection Observer for visibility detection
- Consider: Virtual scrolling for message list (already good, but room for improvement)

---

## Testing Scenarios

### Scenario 1: Quick Message
```
1. Blob visible, idle (purple)
2. Click blob
3. Textbox appears (fade-in animation)
4. Type: "Hello"
5. Press Enter
6. Textbox disappears
7. Blob turns blue (processing)
8. Response streams in
9. AI speaks
10. Blob returns to purple
```

### Scenario 2: Dragging
```
1. Blob visible, idle
2. Click and hold on blob
3. Move cursor 10px to the right
4. Blob turns cyan
5. Window moves with cursor
6. Release mouse
7. Blob returns to purple
```

### Scenario 3: Escape Key
```
1. Textbox is open
2. Press Escape
3. Textbox closes (fade-out animation)
4. Blob returns to view
```

### Scenario 4: Full Chat Panel
```
1. Blob visible
2. Press Ctrl+Space
3. Full chat panel opens (modal)
4. User can see history, change settings
5. Press Ctrl+Space or click X
6. Panel closes
7. Blob still visible
```

---

## Future Enhancement Hooks

### Hook 1: Dynamic Textbox Position
```typescript
// Calculate textbox position relative to blob
const getBlobScreenPosition = () => {
  // Query Tauri for window position
  // Calculate blob pixel position in canvas
  // Offset textbox accordingly
}
```

### Hook 2: Blob Personality
```typescript
// Different animations for different states
const getBlobAnimationByMood = (mood: 'happy' | 'thinking' | 'tired') => {
  if (mood === 'happy') return { speed: 1.2, amplitude: 1.5 }
  if (mood === 'thinking') return { speed: 0.8, amplitude: 0.8 }
  return { speed: 0.5, amplitude: 0.3 }
}
```

### Hook 3: Voice-Controlled Drag
```typescript
// Use browser Web Speech API
const useDragByVoice = () => {
  // "Move down 200 pixels"
  // "Snap to top right"
}
```

---

## Debugging

### Console Logs to Add
```typescript
// In BlobCanvas.tsx
console.log('[blob:drag]', { hasMoved, dx, dy, THRESHOLD })
console.log('[blob:state]', { textboxOpen, isDragging, isProcessing })

// In ChatTextbox.tsx
console.log('[textbox:send]', { text, requestId, assistantMsgId })
console.log('[textbox:close]', { reason: 'escape' | 'blur' })

// In App.tsx
console.log('[llm:token]', { request_id, token_count })
console.log('[llm:done]', { request_id, total_tokens })
```

### React DevTools
- Inspect state changes in Zustand store
- Check component re-renders (Profiler)
- Debug event listeners and cleanup

### Performance Profiling
```javascript
// In browser DevTools Performance tab
performance.mark('blob-drag-start')
// ... perform drag ...
performance.mark('blob-drag-end')
performance.measure('drag', 'blob-drag-start', 'blob-drag-end')
```

---

## Summary

The draggable blob implementation is:
- **Simple:** ~300 lines of new code across 3 components
- **Non-intrusive:** Doesn't modify core Rust backend
- **Performant:** Canvas rendering is efficient
- **Intuitive:** Click/drag distinction is natural
- **Extensible:** Hooks for future enhancements clearly marked

All systems are go! 🚀
