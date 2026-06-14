# Phase 2: Chat UI [DONE]

## Goal
Full iMessage-style chat with message composition, sending animation, message list, and settings panel.

## Tasks
- [x] Input bar with glassmorphism, auto-expand textarea
- [x] Message bubbles (user + assistant) with spring enter/exit animation
- [x] Send → glow thinking indicator (animated dots), auto-reply after 1.5s
- [x] Message list with auto-scroll and AnimatePresence
- [x] Settings panel slide-out with voice picker + provider selector

## Components Created
- `ChatInput.tsx` — Auto-expanding textarea with send button, Enter to send, Shift+Enter for newline
- `MessageBubble.tsx` — iMessage-style bubbles with spring enter, thinking dots, role-dependent styling
- `MessageList.tsx` — Scrollable list with auto-scroll-to-bottom, AnimatePresence for enter/exit
- `SettingsPanel.tsx` — Slide-out panel with voice speaker ID selector (0-9) + LLM provider picker

## Notes
- Simulated AI reply (1.5s timeout) — will be replaced by real LLM in Phase 4.
- Chat is collapsed when not in use; circle blob shows instead.
