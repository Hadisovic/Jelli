# Companion Interaction Window Fix

## Branch: `fix/companion-interaction-window`

## Goal
Fix blob drag, textbox visibility, and compact window sizing so the blob is draggable, textbox is fully visible, and the transparent window doesn't block a large area of the desktop.

## Architecture
Two Tauri windows:
- **main** (120x120): Blob canvas, never moves/resizes. Always visible.
- **chat** (360x56 collapsed / 360x250 expanded): Textbox, shown/hidden on demand. Positioned below blob. Expands when response streams in.

## Changes Made

### tauri.conf.json
- Two windows configured: main (120x120, visible) + chat (360x56, hidden)
- Both transparent, no decorations, alwaysOnTop, skipTaskbar, shadow: false

### src-tauri/src/lib.rs
- Window commands: `get_window_position`, `set_window_position`, `resize_window`, `set_window_geometry`, `get_screen_size`, `get_window_label`, `show_chat_window(x,y)`, `hide_chat_window`, `set_chat_window_position`
- Setup positions main window at bottom-right

### src/lib/api.ts
- Bindings for all Rust commands
- Fixed tuple→object conversion for `getWindowPosition`

### src/components/BlobCanvas.tsx
- Document-level drag using `screenX/screenY` deltas
- Click toggle: opens/closes chat window via `showChatWindow`/`hideChatWindow`
- Chat window positioned BELOW the blob (chatY = blobBottom + 10)
- Chat window repositions during drag (stays below blob)
- Movement threshold 6px distinguishes click from drag
- Constants: `CHAT_H_COLLAPSED = 56`, `CHAT_H_EXPANDED = 250`

### src/components/ChatTextbox.tsx
- Always renders when in chat window (no AnimatePresence conditional)
- Auto-focus on mount
- Escape closes via `hideChatWindow`
- Removed click-outside handler (caused two-click issue)
- Expands window from 56px to 250px when `isProcessing` becomes true

### src/App.tsx
- Routes by window label via Rust command `get_window_label()`
- Main window → BlobCanvas + ChatWidget
- Chat window → ChatTextbox

### src/styles/globals.css
- `.chat-container` fills chat window (left/right/top/bottom: 0, flex column)
- `.chat-panel` reduced padding (8px), no box-shadow, border-radius 12px

## Known Issues / TODO
- Config not synced between windows (need Zustand persist for localStorage sharing)
- Chat window repositioning uses hardcoded 1920x1080 screen bounds (should use getScreenSize)
- Debug console.log / println! statements need removal before final commit
