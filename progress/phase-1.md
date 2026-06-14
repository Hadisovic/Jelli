# Phase 1: Foundation [DONE]

## Goal
Transparent frameless desktop window with a fixed circle blob (bottom-right) that expands into a chat widget on click.

## Tasks

### Day 1-2: Tauri Project + Window Config
- [x] `npm create tauri-app@latest` → React + TypeScript + Vite
- [x] Install plugins: shell, store, log
- [x] Create progress/ directory
- [x] Configure tauri.conf.json: transparent, frameless, always-on-top, skip-taskbar
- [x] Install frontend deps: motion, zustand, use-flip, tailwind, esbuild
- [x] Set up Tailwind + glassmorphism globals.css
- [x] Create Zustand stores (chat, config)

### Day 3-4: Circle Blob
- [x] Create BlobCanvas.tsx: full-window Canvas 2D radial gradient circle
- [x] Click to expand chat
- [x] Drag fallthrough (window drag via transparent areas)

### Day 5-6: Chat UI Components
- [x] Create ChatWidget.tsx with AnimatePresence spring expand/collapse
- [x] Create ChatInput.tsx — auto-expanding textarea
- [x] Create MessageBubble.tsx — iMessage-style bubbles with spring animation
- [x] Create MessageList.tsx — auto-scroll list
- [x] Create SettingsPanel.tsx — voice picker + provider selector

### Day 7-8: Interaction + Polish
- [x] Click circle → expand chat widget
- [x] Widget collapse restores circle view
- [x] Global shortcut Ctrl+Space toggle, Escape collapse
- [x] Build + tsc --noEmit pass cleanly
- [x] Click-through: Rust cursor polling + CSS transparency fixes
- [x] Window drag: start_dragging command + app-region CSS

## Notes
- Cat concept was scrapped. Circle blob is a placeholder — morphing blob visuals deferred to Phase 6.
- No roaming, no pathfinding, no state machine. Circle is static.
- Tauri window stays fixed at bottom-right of screen.

## Build Results
- `npm run build` (tsc + vite) → clean
- `npm run tauri build` → produces MSI + NSIS installers
