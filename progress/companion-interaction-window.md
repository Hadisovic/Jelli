# Companion Interaction Window Progress

## Overall Status
- Status: Two-window architecture implemented, needs testing
- Active branch: fix/companion-interaction-window

## Root Cause Found
The single-window resize approach was fundamentally flawed:
1. **Blob jumps**: Resizing from 120x120 to 360x350 changes the blob's CSS position (left:50% top:50%)
2. **Position drift**: Two async calls (resize + position) could race, causing NaN coordinates
3. **Screen clamping**: At bottom-right (1780,920), the expanded window (360x350) exceeds 1920x1080, forcing the window to jump

The tuple→object fix (api.ts) exposed a deeper issue: `blobScreenPos` was always null because `getWindowPosition()` returned `[x,y]` not `{x,y}`. Once fixed, the resize logic worked but caused visible jumping.

## Solution: Two-Window Architecture
Instead of resizing one window, use two separate Tauri windows:
- **Main window (blob)**: 120x120, never resizes, never moves. Contains only the blob canvas.
- **Chat window (textbox)**: 360x350, shown/hidden on demand. Positioned above the blob. Contains only the chat textbox.

Benefits:
- Blob NEVER moves or resizes — zero jumping
- Chat window is properly sized — no cut-off
- Chat window can be positioned anywhere on screen
- Click-outside works naturally (it's a separate window)
- Transparent areas don't block desktop (separate small windows)

## Changes Made

### tauri.conf.json
- Added second window "chat" (360x350, visible: false, transparent, decorations: false)
- Removed minWidth/minHeight from main window

### lib.rs
- Added `show_chat_window(x, y)`: Positions and shows the chat window
- Added `hide_chat_window`: Hides the chat window
- Registered both commands in invoke handler

### api.ts
- Added `showChatWindow(x, y)` and `hideChatWindow()` bindings
- Fixed `getWindowPosition()` to destructure tuple `[x,y]` into `{x,y}`

### App.tsx
- Detects window label via `getCurrentWindow().label`
- Main window renders BlobCanvas + ChatWidget
- Chat window renders only ChatTextbox
- Sidecar only starts in main window
- Escape key closes chat window via `hideChatWindow()`

### BlobCanvas.tsx
- On click: computes chat window position above blob, calls `showChatWindow()`
- On click while open: calls `hideChatWindow()` (toggle)
- On drag: moves only the main window (120x120)
- Added clear ★ CLICK vs ★ DRAG logging

### ChatTextbox.tsx
- Always renders (no AnimatePresence/textboxOpen conditional)
- Auto-focuses input on mount
- Escape closes via `hideChatWindow()`
- Click-outside closes via `hideChatWindow()`
- No longer imports motion/AnimatePresence

### config.ts
- Removed all resize logic (setTextboxOpen is now just a state setter)
- Removed savedCompactPos, blobScreenPos, clampToScreen, window sizing constants
- Clean and simple

### globals.css
- `.chat-container` now fills the chat window (left/right/top/bottom: 12px)
- No longer positioned relative to blob

## What to Test
1. Run `cargo tauri dev`
2. Click blob → chat window should appear above blob, blob stays in place
3. Click outside chat → chat window closes, blob stays in place
4. Click blob again → chat window opens again at same position
5. Drag blob → only the small 120x120 window moves
6. Type message and send → should work (if sidecar is running)
7. Press Escape → chat window closes
8. Chat window should not be cut off (360x350 is large enough)

## Known Limitations
- Config (LLM provider, model, etc.) is NOT synced between windows — the chat window uses default config values. Need Zustand persist middleware for this.
- Chat messages are NOT synced — each window has its own Zustand store
- The chat window doesn't share the main window's sidecar status
