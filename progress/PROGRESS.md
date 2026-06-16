# Jelli Companion — Complete Progress

**Last Updated:** 2026-06-16
**Status:** Active development
**Branch:** `master`

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Phase 1: Foundation](#4-phase-1-foundation)
5. [Phase 2: Chat UI](#5-phase-2-chat-ui)
6. [Phase 3: Desktop Awareness](#6-phase-3-desktop-awareness)
7. [Phase 4: LLM + TTS](#7-phase-4-llm--tts)
8. [Phase 6: Blob Visual Design](#8-phase-6-blob-visual-design)
9. [Bug Fixes & Issues Resolved](#9-bug-fixes--issues-resolved)
10. [File Map](#10-file-map)
11. [What Works](#11-what-works)
12. [Known Issues](#12-known-issues)
13. [Performance Metrics](#13-performance-metrics)
14. [Build & Run Commands](#14-build--run-commands)
15. [Key Decisions](#15-key-decisions)
16. [Notes](#16-notes)
17. [Recent Updates](#17-recent-updates)

---

## 1. Project Overview

Jelli Companion is a desktop AI companion built with Tauri v2 (Rust + React). A small, transparent, always-on-top blob sits on the desktop. Click it to open a chat textbox, type a message, and get an AI response spoken aloud.

### Core Loop
```
Click blob → Chat opens → Type message → Send
    → LLM streams response → Tokens display in real-time
    → TTS auto-triggers → Voice speaks response
    → Audio playback with visual indicators
```

### What the User Experiences
1. A floating transparent blob on the desktop (bottom-right)
2. Click the blob → floating glassmorphic textbox appears above it
3. Type a message and press Enter → blob turns deep blue (processing)
4. Response tokens stream in character by character with a blinking cursor
5. After the LLM finishes, TTS generates voice automatically
6. Audio plays progressively with bouncing bar indicators
7. Blob returns to idle (purple, breathing) when done
8. Drag the blob to reposition it anywhere on screen
9. Ctrl+Space opens full chat history panel with settings

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Desktop shell | Tauri v2 | 2.11.2 | Transparent, frameless, always-on-top |
| Frontend | React | 19.2.6 | Tauri official template |
| Build | Vite | 8.0.12 | esbuild required separately for Vite 8 |
| Language | TypeScript | 6.0.2 | |
| Styling | Tailwind CSS | 4.3.1 | v4 uses `@import "tailwindcss"` directive |
| Animation | motion | 12.40.0 | Formerly Framer Motion; `motion/react` |
| State | zustand | 5.0.14 | `create` directly |
| Rust | rustc | 1.96.0 | MSVC toolchain |
| LLM | Ollama, OpenAI, Anthropic, Gemini, DeepSeek | — | Streaming SSE |
| TTS | Planned: Dia 2 (nari-labs/dia2) | — | Replacing Sesame CSM |
| Audio | Web Audio API | — | PCM chunk streaming |
| Python | CSM-1B (current) | — | Sesame speech model, CUDA 12.4+ |

---

## 3. Architecture

### Two-Window System
```
┌─────────────────────┐     ┌──────────────────────┐
│  main (120×120)     │     │  chat (360×56/250)   │
│  Transparent        │     │  Transparent          │
│  Always on top      │     │  Hidden by default    │
│  BlobCanvas         │     │  ChatTextbox          │
│  ChatWidget (shell) │     │  Auto-focus           │
└─────────────────────┘     └──────────────────────┘
         │                            │
         │    Rust commands           │
         └────────────────────────────┘
```

- **Main window:** 120×120, transparent, always on top, skip taskbar — holds only the blob canvas
- **Chat window:** 360×56 (collapsed) / 360×250 (expanded when processing), hidden by default, shown on demand above the blob

### Window Routing (App.tsx)
- Main window → renders BlobCanvas + ChatWidget (shell only)
- Chat window → renders ChatTextbox
- Route determined by `get_window_label()` Rust command

### Component Tree
```
<App>
  ├── <BlobCanvas>          (main window only)
  │   ├── Canvas 2D rendering (rAF loop, 9-layer plasma)
  │   ├── Mouse event handlers (click vs drag, 6px threshold)
  │   └── State subscriptions (isDragging, isProcessing)
  │
  ├── <ChatWidget>          (main window, Ctrl+Space expanded)
  │   ├── Header: settings toggle, drag handle, close, stop button
  │   ├── <MessageList>
  │   │   └── <MessageBubble> × N (spring enter/exit)
  │   ├── <ChatInput> (auto-expanding textarea)
  │   └── <SettingsPanel> (slide-out overlay)
  │
  └── <ChatTextbox>         (chat window, click blob to open)
      ├── Last assistant response display
      ├── Input field (auto-focus)
      ├── Send button (spinner while processing)
      └── Audio indicators (🎤 generating, ▁▂▃ playing)
```

### Data Flow
```
User clicks blob
  → getWindowPosition()
  → getScreenSize()
  → showChatWindow(x, y)
  → setTextboxOpen(true)

User types & sends
  → addMessage("user", text)
  → sendChatMessage(requestId, messages, config) → Rust
  → Rust spawns tokio task → llm::stream_llm()
  → HTTP to LLM provider (Ollama/OpenAI/etc)
  → Parse SSE stream, emit llm:token per token
  → Frontend appends token to message (real-time display)
  → LLM done → emit llm:done
  → Rust auto-calls sidecar.send_tts(fullText)
  → Python sidecar generates audio (CSM-1B or fallback beep)
  → Audio chunks → Rust base64 encoding → audio:chunk events
  → Frontend AudioPlayer.play() via Web Audio API
  → User hears response

User drags blob
  → screenX/screenY deltas (6px threshold)
  → setWindowPosition(nx, ny)
  → setChatWindowPosition(chatX, chatY)
  → Blob + chat move together
```

### State Management

#### useChatStore (stores/chat.ts)
```typescript
messages: Message[]
  { id, text, role: 'user'|'assistant', timestamp, status: 'sending'|'sent'|'thinking'|'done' }
isProcessing: boolean
isPlayingAudio: boolean
pendingRequests: Record<string, string>  // request_id → message_id
latestRequestId: string | null

Actions: addMessage, updateMessage, appendToMessage, removeMessage,
         clearMessages, setProcessing, setPlayingAudio,
         registerRequest, getMessageIdForRequest
```

#### useConfigStore (stores/config.ts)
```typescript
llmProvider: 'ollama'|'openai'|'anthropic'|'gemini'|'deepseek'
llmModel: string (default: 'qwen:4b')
apiKey: string
ollamaUrl: string (default: 'http://localhost:11434')
temperature: number (0.7)
maxTokens: number (2048)
speakerId: number (0)
contextMessages: number (3)
quantization: 'fp16'|'int8'|'int4'
vizPreset: 'orb'|'wave'|'galaxy'|'tunnel'
expanded: boolean (full chat panel)
textboxOpen: boolean (floating textbox)
isDragging: boolean
blobScreenPos: { x, y } | null
```

### JSONL IPC Protocol (Rust ↔ Python Sidecar)

**Rust → Sidecar (stdin):**
```json
{"type":"tts","text":"Hello world","speaker_id":0,"request_id":"abc","quantization":"fp16"}
{"type":"heartbeat"}
```

**Sidecar → Rust (stdout):**
```json
{"type":"ready","version":"1.0"}
{"type":"pong"}
{"type":"audio","pcm_data":[0.1,-0.2,...],"sample_rate":24000,"request_id":"abc"}
{"type":"audio_done","request_id":"abc"}
{"type":"error","message":"CUDA out of memory","request_id":"abc"}
```

### Event Protocol (Rust → Frontend)

| Event | Payload | When |
|-------|---------|------|
| `llm:token` | `{ request_id, token }` | Each token from LLM stream |
| `llm:done` | `{ request_id }` | LLM streaming complete |
| `llm:error` | `{ request_id, message }` | LLM or connection error |
| `audio:chunk` | `{ request_id, pcm_base64, sample_rate }` | Each PCM chunk from sidecar |
| `audio:done` | `{ request_id }` | Audio generation complete |
| `sidecar:status` | `{ status, message? }` | Running/stopped/error transitions |

### Tauri Commands (Frontend → Rust)

| Command | Args | Description |
|---------|------|-------------|
| `send_chat_message` | `requestId, messages[], config` | Spawns LLM streaming, emits events |
| `stop_generation` | `requestId` | Sets cancellation flag |
| `start_sidecar` | `path, args` | Spawns Python CSM process |
| `check_sidecar_health` | — | Returns running status |
| `stop_sidecar` | — | Kills sidecar process |
| `send_tts` | `requestId, text, speakerId, quantization` | Sends text to sidecar |
| `get_window_position` | — | Returns (x, y) of main window |
| `set_window_position` | `x, y` | Moves main window |
| `resize_window` | `width, height` | Resizes any window |
| `set_window_geometry` | `x, y, width, height` | Position + size in one call |
| `get_screen_size` | — | Returns monitor width/height |
| `get_window_label` | — | Returns "main" or "chat" |
| `show_chat_window` | `x, y` | Shows + positions chat window |
| `hide_chat_window` | — | Hides chat window |
| `set_chat_window_position` | `x, y` | Moves chat window only |

---

## 4. Phase 1: Foundation

**Status:** ✅ Complete
**Goal:** Transparent frameless desktop window with a fixed circle blob that expands into a chat widget on click.

### What Was Built
- Tauri project: `npm create tauri-app@latest` → React + TypeScript + Vite
- Installed plugins: shell, store, log
- Configured `tauri.conf.json`: transparent, frameless, always-on-top, skip-taskbar
- Set up Tailwind CSS v4 + glassmorphism `globals.css`
- Created Zustand stores (chat, config)
- Created `BlobCanvas.tsx`: Canvas 2D radial gradient circle
- Click to expand chat widget
- Drag fallthrough (window drag via transparent areas)
- `ChatWidget.tsx`: AnimatePresence spring expand/collapse
- `ChatInput.tsx`: auto-expanding textarea
- `MessageBubble.tsx`: iMessage-style bubbles with spring animation
- `MessageList.tsx`: auto-scroll list
- `SettingsPanel.tsx`: voice picker + provider selector
- Global shortcuts: Ctrl+Space toggle, Escape collapse
- `start_dragging` Rust command for window drag

### Notes
- Cat character concept was scrapped early — circle blob is a placeholder
- No roaming, no pathfinding, no state machine — blob is static
- Window positioned at bottom-right of screen by Rust

### Build Verification
- `npm run build` (tsc + vite) → clean
- `npm run tauri build` → produces MSI + NSIS installers

---

## 5. Phase 2: Chat UI

**Status:** ✅ Complete
**Goal:** Full iMessage-style chat with message composition, sending animation, message list, and settings panel.

### Components Created
- `ChatInput.tsx` — Auto-expanding textarea with send button, Enter to send, Shift+Enter for newline
- `MessageBubble.tsx` — iMessage-style bubbles (user: accent right, assistant: white left), spring enter/exit via motion AnimatePresence, thinking dots with glow-pulse CSS
- `MessageList.tsx` — Scrollable list with auto-scroll-to-bottom, AnimatePresence popLayout
- `SettingsPanel.tsx` — Slide-out panel from right, voice speaker ID selector (0-9), LLM provider picker (Ollama/OpenAI/Anthropic/Gemini/DeepSeek)

### Design
- iMessage styling: user messages right-aligned in accent color, assistant left-aligned in white
- Glow thinking indicator (animated dots with glow-pulse CSS)
- Simulated AI reply (1.5s timeout) — replaced in Phase 4 with real LLM
- Glassmorphism panel: background rgba(18,18,24,0.85), backdrop-filter blur(20px) saturate(180%)

---

## 6. Phase 3: Desktop Awareness

**Status:** ⏸️ Deferred

**Goal:** Desktop widget reacts to user's desktop activity (window titles → state changes).

**Why Deferred:** The blob is a visual accent, not a character — reacting to desktop context may feel unnecessary. Phase 6 (blob visual design) establishes the blob's character; revisit desktop awareness after that. May be skipped entirely.

**Placeholder Tasks (not started):**
- Rust window title detection (Windows API)
- Frontend context → state mapper
- Manual modes UI + desktop-aware mode toggle

---

## 7. Phase 4: LLM + TTS

**Status:** ✅ Complete
**Goal:** Chat works end-to-end with local AI models + voice synthesis.

### Rust LLM Proxy (src-tauri/src/llm.rs)
- **5 providers:** Ollama, OpenAI, Anthropic, Gemini, DeepSeek
- Streaming SSE parsing → token-by-token frontend events
- Cancellation via `CancelMap` (std::sync::Mutex + HashMap)
- Cancellation checked between chunks for responsive stop
- Shared SSE parser handles all OpenAI-compatible providers

**Provider Endpoints:**
| Provider | Endpoint | Auth |
|----------|----------|------|
| Ollama | POST /api/chat | None (local) |
| OpenAI | POST /v1/chat/completions | Bearer token |
| Anthropic | POST /v1/messages | x-api-key + anthropic-version header |
| Gemini | POST /v1beta/models/{model}:streamGenerateContent | API key in URL |
| DeepSeek | POST /v1/chat/completions | Bearer token (OpenAI-compatible) |

### Rust Sidecar Manager (src-tauri/src/sidecar.rs)
- JSONL IPC over stdin/stdout for Python CSM process
- Streaming PCM audio chunk reception → `audio:chunk` events (base64 f32)
- Heartbeat health check every 5 seconds
- Process crash detection and status events (`sidecar:status`)
- `send_tts` command for sending text to CSM
- `kill` command for graceful shutdown

### Python Sidecar (sidecar/csm_sidecar.py)
- Sesame CSM-1B model (CUDA 12.4+ GPU recommended)
- Streaming PCM audio chunks (24kHz mono, float32)
- JSONL protocol: stdin commands → stdout responses
- Fallback to 440Hz test beep if CSM not installed
- Lazy model loading (first TTS request triggers load)
- Pre-imports pyarrow before torch to avoid Windows DLL conflicts
- Disables Triton via `NO_TORCH_COMPILE=1` (unsupported on Windows)

### Audio Pipeline
```
LLM response (string)
  → Rust: receive full text from llm::done
  → Rust → Python sidecar: send JSONL { "type": "tts", "text": "..." }
  → Python: CSM-1B model generates speech
  → Python → Rust: stream PCM f32 chunks (24kHz)
  → Rust: base64 encode, emit audio:chunk events
  → Frontend: AudioPlayer.enqueueChunk() → Web Audio API plays progressively
```

### Frontend Integration
- `api.ts`: Tauri command wrappers + event listener helpers with TypeScript interfaces
- `audio.ts`: `AudioPlayer` class — Web Audio API, queue-based progressive playback, base64 → Float32Array → AudioBuffer → GainNode → Destination
- `App.tsx`: Event listeners for `llm:token`, `llm:done`, `llm:error`, `audio:chunk`, `audio:done`, `sidecar:status`
- Chat store: `pendingRequests` mapping (request_id → message_id) for event-to-message routing

### New Rust Dependencies
- `reqwest = "0.12"` (features: stream, json) — HTTP client
- `uuid = "1"` (features: v4) — request IDs
- `futures-util = "0.3"` — stream combinators
- `base64 = "0.22"` — PCM audio encoding
- `bytes = "1"` — byte buffer utilities
- `tokio` (process, io-util, sync, time) — async runtime

### Notes
- TTS model planned to switch from Sesame CSM to **Dia 2** (https://github.com/nari-labs/dia2)
- CSM requires CUDA 12.4+ GPU + HuggingFace auth for gated models
- Model download on first run: CSM ~4.15 GB + Llama ~2.3 GB + Mimi + SilentCipher

---

## 8. Phase 6: Blob Visual Design

**Status:** ✅ Complete (multiple iterations)
**Goal:** Replace placeholder circle with distinctive, organic blob visuals.

### 8a. Transparency Fixes

**Bug 1: Window shadow re-enabled at runtime**
- In `lib.rs`, `window.set_shadow(true)` was called during setup, overriding `tauri.conf.json`'s `"shadow": false`
- **Fix:** Changed to `window.set_shadow(false)` in the Tauri setup block

**Bug 2: Window size mismatch**
- In `lib.rs`, window was resized to 400×60 pixels, but the blob canvas is only 100×100
- This caused a visible rectangular area larger than the blob
- **Fix:** Changed to 120×120, matching the blob dimensions

**Already Correct (no changes needed):**
- `tauri.conf.json` — `"transparent": true`, `"decorations": false`, `"shadow": false`
- `globals.css` — `background: transparent !important` on html/body/#root with `color-scheme: dark`
- `BlobCanvas.tsx` — `backgroundColor: 'transparent'`, canvas uses `clearRect` for transparent clearing

### 8b. Two-Window Architecture

**Problem:** Single-window resize approach was fundamentally flawed:
1. **Blob jumps:** Resizing from 120×120 to 360×350 changes the blob's CSS position (left:50% top:50%)
2. **Position drift:** Two async calls (resize + position) could race, causing NaN coordinates
3. **Screen clamping:** At bottom-right, the expanded window exceeds screen bounds, forcing jumps

**Solution:** Two separate Tauri windows:
- **Main window (blob):** 120×120, never resizes, never moves. Contains only the blob canvas.
- **Chat window (textbox):** 360×56/250, shown/hidden on demand. Positioned above the blob.

**Benefits:**
- Blob NEVER moves or resizes — zero jumping
- Chat window is properly sized — no cut-off
- Click-outside works naturally (separate window)
- Transparent areas don't block desktop

**Changes Made:**
- `tauri.conf.json`: Added second window "chat" (360×56, visible: false, transparent)
- `lib.rs`: Added `show_chat_window(x, y)`, `hide_chat_window`, `set_chat_window_position`
- `api.ts`: Added `showChatWindow`, `hideChatWindow`, `setChatWindowPosition` bindings
- `App.tsx`: Detects window label, routes to BlobCanvas or ChatTextbox
- `BlobCanvas.tsx`: Computes chat window position above blob, calls `showChatWindow()`

### 8c. Blob Variants Implemented

#### Simple Noise Circle (Original)
- 64-segment noise-distorted circle with 3 sine harmonics for organic shape
- Radial gradient fill (0.1 → 0.3 → 0.6 alpha)
- Processing ring (pulsing stroke) when `isProcessing`
- Hue cycling: `(t * BLOB.HUE_SPEED) % 360`

#### Deep Sea Jellyfish
**"Living Light from the Deep"** — translucent dome pulsing rhythmically, trailing physics-simulated tentacles, glowing organs inside the body.

- **Bell:** 80-segment dome path, 5-stop translucent gradient, 3-sine wobble, rim tuck/flare
- **Tentacles:** 5 physics chains (8 points each), tapering width 2.4→0.4px, unique phase/speed/amplitude
- **Organs:** 7 bioluminescent spots with outer halos, individual pulse phases, 1.6× brightness during processing
- **Detail:** 6 radial canals (slowly rotating), rim light layer
- **Rendering:** 8 layers (ambient glow → tentacles → bell body → inner glow+organs → membrane → rim light → specular → processing rings)

#### Liquid Mercury
**"Chrome reflects everything but itself"** — opaque chrome blob with physics morphing, metallic reflections, sharp speculars.

- **Blob:** 64 spring-dampened radius points, 5 harmonic frequencies, Catmull-Rom splines
- **Chrome body:** 5 nested scaled layers with metallic gradients (light top-left, dark bottom-right)
- **Reflections:** Horizontal band (oscillating) + vertical band (subtle) — environment mapping
- **Speculars:** Primary 12×7px + secondary 6×3.5px elliptical highlights
- **Rendering:** 8 layers (shadow → chrome body → horizontal reflection → vertical reflection → primary specular → secondary specular → rim light → processing rings)

#### Plasma Energy (Current)
**"Crackling electric core"** — aggressive plasma blob with lightning arcs, particle swarm, energy tendrils.

- **Core:** 18px radius, breathes ±2.5px
- **Tendrils:** 4 physics chains (10 segments), tapering strokes, wave motion
- **Arcs:** 6-point random bolt paths, 0.15–0.5s lifecycle, fade in/out
- **Particles:** 24 orbiting energy particles, individual speeds, drift in/out
- **Filaments:** 5 rotating energy lines inside core
- **Rendering:** 9 layers (corona glow → tendrils → arcs → plasma body → hot core → particles → filaments → edge glow → processing rings)
- **Processing:** 3× faster arc spawning, 3 expanding ring ripples

### 8d. Chat UI Polish

- **Glassy neumorphism:** Dark glass panels with blob-synced colors (`--blob-hue` CSS vars)
- **Breathing border animation:** `panel-breathe` keyframe cycling border-color through hues
- **Inner depth shadows:** `inset 0 1px 0 rgba(255,255,255,0.02)` + `inset 0 -1px 4px rgba(0,0,0,0.12)`
- **Send flash effect:** `.sending` class triggers `edge-glow` keyframe (border + box-shadow, 0.6s ease-out)
- **Ink cursor:** Pulsing cursor (`ink-pulse` keyframe) for streaming text display
- **Input wrapper:** Blob-synced background with focus glow
- **Send button:** Gradient with hover scale transform, disabled state
- **Custom scrollbar:** 4px width, blob-colored thumb
- **Font:** Outfit (300, 400, 500, 600 weights) from Google Fonts
- **Cross-window color sync:** BlobCanvas writes `localStorage.setItem('blob-hue', ...)` every frame; ChatTextbox polls every 100ms + listens for `storage` events; CSS variable `--blob-hue` updated accordingly (separate Tauri windows = separate DOMs)

---

## 9. Bug Fixes & Issues Resolved

| # | Issue | Root Cause | Fix |
|---|-------|-----------|-----|
| 1 | Window shadow visible rectangle | `lib.rs` called `set_shadow(true)` at runtime, overriding config | Changed to `set_shadow(false)` |
| 2 | Window size mismatch showing empty space | Window resized to 400×60, blob is 100×100 | Changed to 120×120 |
| 3 | UTF-16 encoded `csm/__init__.py` | File had null bytes from encoding issue | Rewrote as UTF-8 |
| 4 | Metaball pixel rendering too slow | CPU-heavy pixel loops blocked smooth dragging | Reverted to vector/canvas paths |
| 5 | Sidecar respawned on HMR | Vite hot-reload triggered useEffect cleanup + re-run | Added `window.__sidecarStarted` guard |
| 6 | pyarrow/CUDA DLL conflicts | pyarrow 24.x loaded after CUDA, causing access violation | Pre-import pyarrow before torch at process startup |
| 7 | Triton compile failure on Windows | Triton package unsupported on Windows | Set `NO_TORCH_COMPILE=1` env var |
| 8 | `getWindowPosition` returned `[x,y]` not `{x,y}` | Tuple vs object mismatch between Rust and TypeScript | Destructured tuple into `{x, y}` object |
| 9 | Single-window resize jumping | Resizing 120→360 changed blob CSS position | Switched to two-window architecture |
| 10 | `csm_sidecar.py` calling non-existent `generate()` | Wrong CSM API call | Fixed to use `Generator.generate()` |
| 11 | Default model `llama3.2` not installed | Default model wasn't available locally | Changed to `qwen:4b` (2.3 GB, installed) |
| 12 | BlobCanvas radius wrong at 400×60 | `Math.min(w,h)*0.35 = 21px` with wrong window size | Added `BLOB.SIZE = 100` constant |
| 13 | `emit_error` unused warning | Helper function kept for future use but flagged by compiler | Added `#[allow(dead_code)]` |

---

## 10. File Map

### Frontend (`jelli-companion/src/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Root component, keyboard shortcuts, event listeners for LLM/audio/sidecar, window label routing |
| `main.tsx` | React entry point |
| `components/BlobCanvas.tsx` | Canvas 2D blob rendering (currently plasma energy, 9-layer), click toggle, drag handling, hue sync |
| `components/ChatWidget.tsx` | Expanded chat panel (Ctrl+Space), settings toggle, message list, stop generation button |
| `components/ChatTextbox.tsx` | Floating input window (chat window), resize on processing, send flash, ink cursor, hue sync |
| `components/ChatInput.tsx` | Auto-expanding textarea for ChatWidget, Enter to send |
| `components/MessageBubble.tsx` | iMessage-style bubble with spring enter/exit, thinking dots, streaming cursor |
| `components/MessageList.tsx` | Auto-scrolling message list with AnimatePresence |
| `components/SettingsPanel.tsx` | Provider, model, API key, Ollama URL, temperature, speaker ID settings |
| `stores/chat.ts` | Messages, processing state, audio playing state, request tracking |
| `stores/config.ts` | LLM provider config, UI state (expanded, textboxOpen, isDragging, blobScreenPos) |
| `lib/api.ts` | Tauri command wrappers + event listener helpers with TypeScript interfaces |
| `lib/audio.ts` | Web Audio API progressive PCM playback (AudioPlayer class) |
| `lib/constants.ts` | Widget/blob/timing constants (BLOB.SIZE=100, HUE_SPEED=15, BREATH_PERIOD_MS=3800) |
| `lib/animation-presets.ts` | Spring physics configs (window, messageEnter/Exit, thinkingGlow, particleIdle, press) |
| `lib/noise.ts` | 2D Perlin noise generator |
| `styles/globals.css` | Tailwind v4 + glassmorphism + neumorphism + breathing border + send flash + ink cursor animations |
| `types/tauri.d.ts` | `window.__TAURI__` type declaration |

### Backend (`jelli-companion/src-tauri/src/`)

| File | Purpose |
|------|---------|
| `main.rs` | Entry point (calls `app_lib::run()`) |
| `lib.rs` | Tauri commands (16 total), window management, AppState, plugin registration, window setup |
| `llm.rs` | LLM proxy: 5 providers, SSE streaming, cancel map, token emission |
| `sidecar.rs` | Sidecar manager: JSONL IPC, heartbeat, process control, audio chunk relay, base64 encoding |

### Python Sidecar

| File | Purpose |
|------|---------|
| `sidecar/csm_sidecar.py` | CSM TTS sidecar: JSONL IPC, audio generation, fallback beep, pyarrow pre-import |
| `sidecar/requirements.txt` | Python dependencies (torch, huggingface_hub, transformers) |
| `sidecar/test_csm.py` | E2E sidecar test script |
| `csm/generator.py` | CSM-1B generator (Sesame model, Llama 3.2 backbone + Mimi codec) |
| `csm/models.py` | Llama 3.2 1B/100M transformer architecture, Model class with PyTorchModelHubMixin |

### Config Files

| File | Purpose |
|------|---------|
| `src-tauri/tauri.conf.json` | Two windows (main + chat), transparent, bundle config |
| `src-tauri/Cargo.toml` | Rust dependencies (tauri, reqwest, tokio, serde, uuid, base64, etc.) |
| `src-tauri/capabilities/default.json` | Permission grants (core, window, shell, store) |
| `vite.config.ts` | Vite config: React + Tailwind plugins, @/ path alias, port 5173 |
| `index.html` | Entry point, Outfit font from Google Fonts |
| `package.json` | npm config, scripts (dev, build, lint, tauri) |
| `eslint.config.js` | ESLint config |
| `tsconfig.json` | Root TypeScript config |
| `tsconfig.app.json` | App TypeScript config (target: es2023, module: esnext) |
| `tsconfig.node.json` | Node TypeScript config |

---

## 11. What Works

### Verified
- [x] Transparent background — no rectangular artifacts
- [x] Blob renders correctly at screen center
- [x] Click opens/closes chat window
- [x] Drag moves both windows together (6px threshold)
- [x] Chat window expands when processing
- [x] Hue cycles and syncs to chat UI via localStorage
- [x] Send flash animation works
- [x] Escape closes chat window
- [x] All Rust commands functional
- [x] LLM streaming works end-to-end (Ollama tested)
- [x] TTS auto-triggers after LLM response
- [x] Audio playback via Web Audio API
- [x] TypeScript compilation clean
- [x] Vite build successful
- [x] Multiple messages in sequence
- [x] Stop generation button during processing
- [x] Settings panel with provider/model/temperature/speaker selection
- [x] Right-click context menu blocked in production

### Not Verified (requires visual testing)
- [ ] Plasma blob renders correctly (arcs, particles, tendrils) on actual display
- [ ] Mercury blob chrome reflections look correct
- [ ] Jellyfish tentacle physics feel natural
- [ ] Chat panel glassmorphism looks correct on different monitors/DPI settings

---

## 12. Known Issues

1. **Debug `println!` statements in Rust** — need removal before final commit
2. **Cross-window config sync** — localStorage sync works but Zustand persist middleware would be cleaner
3. **Screen bounds clamping** — chat repositioning uses `getScreenSize()` but could clamp better on ultra-wide monitors
4. **First-run model download** — CSM ~4.15 GB + Llama ~2.3 GB on first use (can be pre-cached)
5. **GPU required for TTS** — CPU fallback works but is slow (~15-30s vs 2-3s on GPU)

---

## 13. Performance Metrics

### Rendering
- All blob variants: `requestAnimationFrame`, pure vector paths, smooth 60fps
- No pixel loops — pure canvas path rendering
- Mercury: 64 points × 5 layers = 320 path operations/frame — smooth
- Jellyfish: 80 segments + 40 tentacle points + 7 organs — smooth
- Plasma: 24 particles + 4 tendrils + 6 arcs max — smooth
- Chat panel CSS animations: GPU-composited (transform, opacity)

### Build Times
- Frontend (Vite): ~700ms
- Backend (cargo): ~2 seconds
- Full build: ~5-10 seconds
- Bundle: 348 KB JS, 25 KB CSS (gzipped)

### Runtime
- Idle: ~150 MB RAM
- Processing: ~600–800 MB RAM
- Peak (models loaded): ~1–2 GB RAM
- App startup: 1–2 seconds
- Message round trip: 5–10 seconds (LLM + TTS)

### Latency Breakdown (typical, GPU)
- LLM first token: 1-2s
- LLM streaming: 2-4s
- TTS generation: 2-3s
- Audio playback start: <100ms after first chunk

---

## 14. Build & Run Commands

```bash
# Development with hot reload
cd jelli-companion
npm run tauri dev

# Production build (MSI + NSIS installers)
npm run tauri build

# Frontend only (browser, no Tauri APIs)
npm run dev

# TypeScript check only
npx tsc --noEmit

# Full frontend build (tsc + vite)
npm run build

# Rust check only (skip frontend)
cd src-tauri
cargo check

# Rust build only
cd src-tauri
cargo build

# Python sidecar setup
pip install -r sidecar/requirements.txt
git clone https://github.com/SesameAILabs/csm.git
cd csm && pip install -e .
```

---

## 15. Key Decisions

| Decision | Rationale |
|----------|-----------|
| Two-window architecture | Prevents transparent main window from blocking desktop interaction; blob never jumps or resizes |
| 6px drag threshold | Distinguishes accidental clicks from intentional drags (~0.2 inches on typical monitor) |
| localStorage for color sync | Tauri windows are separate DOMs, CSS variables don't cross boundaries; 100ms polling + storage events |
| Vector rendering (no pixel loops) | CPU performance — metaball pixel approach was too slow for smooth dragging |
| Plasma as current variant | Most visually distinctive — nothing else on desktop has lightning arcs |
| Outfit font | Clean, modern, distinctive without being generic (not Inter/Roboto) |
| Glassy neumorphism for chat | Matches luminous blob aesthetic, dark theme, blob-synced colors |
| Hue always cycles | User confirmed blob should keep changing color even with textbox open |
| Simulated reply in Phase 2 | Shows feature works before real LLM integration in Phase 4 |
| Beep fallback for TTS | Allows full pipeline testing without GPU/CSM installed |

---

## 16. Notes

- `/clawd-on-desk` and `/csm` directories have been removed from the project for now
- TTS model planned to switch from Sesame CSM to **Dia 2** (https://github.com/nari-labs/dia2)
- Phase 5 (Particles + Installer) is planned but not started — excluded from this progress file
- Phase 3 (Desktop Awareness) is deferred — may be skipped entirely

---

## 17. Recent Updates (June 16, 2026)

### 1. Multi-Monitor Chat Box Display Fix
- **Issue:** The chat box was stuck on the primary display and did not follow the main window coordinates correctly.
- **Fix:** Added `get_screen_info` Rust command returning monitor position + size. Updated chat position clamping in `BlobCanvas.tsx` to account for monitor offset in virtual screen space.

### 2. Chat Follows Blob Across Monitors During Drag
- **Issue:** Dragging the blob to a second screen left the chat textbox behind.
- **Fix:** Replaced debounced `getScreenInfo()` ref with inline per-frame `getScreenInfo()` calls during drag, ensuring fresh monitor info for every position update.

### 3. System-Level Cursor Tracking
- **Issue:** Jellyfish eyes only tracked the mouse within the Tauri window (canvas mousemove events stop when cursor leaves).
- **Fix:** Added `get_cursor_position` Rust command using Win32 `GetCursorPos` API. Replaced canvas `mousemove` listener with 16ms `setInterval` polling system-wide cursor position. Eyes now track the cursor anywhere on screen, across monitors.

### 4. Jellyfish Expressions System
- Added 7 expressions: `idle`, `annoyed`, `dizzy`, `sleepy`, `happy`, `surprised`, `shy`
- **Dizzy:** Triggered after dragging >2.5s — spiral rotating eyes, orbiting star particles, erratic tentacle wobble
- **Annoyed:** Active drag — angled eyebrows, slight squint
- **Sleepy:** Idle >8s — half-closed eyes, floating "zZz" particles
- **Happy:** Random idle chance (2-4s) — eyes curve into ^_^ arcs
- **Surprised:** Fast mouse near blob — eyes widen 1.2x, small "o" mouth
- **Shy:** Mouse within 120px — blush marks, dampened eye tracking
- Expression priority: dizzy > annoyed > sleepy > happy > surprised > shy > idle

### 5. Full Black Eyes with Cursor Tracking
- Replaced white+iris+pupil system with solid black ellipses
- Entire eye shifts toward cursor (`ep * 1.2`)
- Subtle iris ring drawn inside each eye (follows at 70% speed for depth)
- Specular highlights counter-shift for 3D feel

### 6. Stronger Glow & Transparency
- Ambient glow radius 52→58, center alpha 0.16→0.28
- Bell body more transparent (edge alpha 0.50→0.20)
- Core glow center alpha 0.30→0.40, wider spread
- Organ halos 2.5x→2.8x size, brighter cores
- Membrane stroke thinner (1.2→1.0px) and more transparent

### 7. Debug Console Cleanup
- Removed all 24 `println!`/`eprintln!` debug statements from `lib.rs`
- Functions now silently handle errors (window commands return early on failure)

### 8. Dev Build Speed & Linker Optimization
- **Goal:** Reduce compile and rebuild times which were taking up to 10 minutes.
- **Changes:**
  - Added `jelli-companion/src-tauri/.cargo/config.toml` configuring the `rust-lld` fast linker for Windows MSVC (dramatically reducing link times).
  - Modified `Cargo.toml` `[profile.dev]` settings: local code builds at `opt-level = 0` and `debug = 1` for fast compilation, while external dependencies compile at `opt-level = 3` to run at full speed and utilize cached builds.

### 9. TypeScript Cleanup
- Removed unused `ORGAN_COUNT` constant and `w1` variable from `BlobCanvas.tsx`
- Removed unused dependencies: `@rive-app/react-canvas`, `@vaerone/use-flip`
- Removed unused store fields: `vizPreset`, `contextMessages`

### 10. Visual Polish, Expressions, & Petting Interaction
- **Canvas Size Expansion:**
  - Expanded transparent main window/canvas boundaries from `90x120` to `140x160` in `tauri.conf.json`, `lib.rs`, and `BlobCanvas.tsx` (setting center coordinates to `cx = 70`, `cy = 50`). This successfully resolves the visual issue where the outer glow was cut off by an "invisible square".
- **High-DPI Cursor Tracking Fix:**
  - Re-engineered `get_cursor_position` Rust command to retrieve and scale raw Win32 coordinates by the monitor's `scale_factor()`. This ensures that eye-tracking and cursor-following look natural and align perfectly across monitors of different DPI configurations.
- **Dedicated Sleep Mode Eyes:**
  - Redesigned `sleepy` mode to directly render peaceful closed arcs (`︶`) in the main render loop instead of layering them on top of standard open eyes, eliminating the visual issue where pupil highlights and open eyelids bled through in the background.
- **Petting Interaction System (Happy Mode):**
  - Implemented petting detection: hovering the cursor near the blob and wiggling it horizontally (`dist < 85` pixels) increments a pet score. Once the score threshold is met, the blob enters a long-duration `happy` mode (lasting 60–120 seconds).
  - Happy mode is configured to be 5x rarer during idle sequences, but lasts much longer when triggered. It features smiling eyes (`^` arcs) and a bright Lemon-Yellow to Fire-Orange gradient color scheme.
- **Dynamic Gradient Pairs & Saturation/Lightness Breathing:**
  - Replaced the simple hue rotation with custom mode-specific HSL gradient pairs that dynamically fade into each other:
    - *Normal:* Teal-Blue `hsla(180, 70%, 65%)` to Indigo-Purple `hsla(230, 60%, 50%)`
    - *Sleep:* Pastel Lavender `hsla(245, 50%, 45%)` to Deep Indigo `hsla(285, 45%, 35%)`
    - *Happy:* Bright Lemon-Yellow `hsla(55, 95%, 62%)` to Fire-Orange `hsla(22, 95%, 52%)`
    - *Angry:* Intense Crimson-Red `hsla(0, 80%, 60%)` to Dark Brick-Orange `hsla(300, 70%, 45%)`
    - *Dragged:* Neon Blue `hsla(195, 75%, 65%)` to Electric Violet `hsla(270, 70%, 50%)`
  - Integrated custom breathing wave logic that cycles the saturation and lightness offsets organically, ensuring the blob feels alive even when stationary.
- **Smooth Mode Transitions (Color Lerp):**
  - Implemented continuous linear interpolation (lerp) logic for color transitions at a speed of `0.025` (~0.8s), removing all instantaneous color snaps.
- **Staged Drag-Release Sequence:**
  - Releasing the blob after a drag duration longer than 2.5 seconds triggers a staged transition:
    - *Phase 1 (Dizzy slow-mo deceleration):* The blob remains in dizzy mode for 2.0 seconds. Its spiral eyes and orbiting stars gradually slow down to a standstill.
    - *Phase 2 (Brief pause):* The blob rests quietly in a neutral state for 0.5 seconds.
    - *Phase 3 (Rage mode):* The blob enters angry mode (Crimson-Red glow, tilted closed-eye arcs, and an animated forehead anger vein 💢) for 7.0–9.0 seconds (2.0s longer than before).
  - Normal drags (< 2.5s) return directly to standard idle.
- **Decaying Angry-to-Normal Crossfade:**
  - Programmed a 1.5s visual decay fade-out via a decaying alpha variable (`madAlphaRef`), blending the angry features (red overlay and anger vein) out smoothly rather than snapping.
- **Removal of Unused Arm Properties:**
  - Cleaned up the `BLOB` configurations inside [constants.ts](file:///d:/Jelli-master/jelli-companion/src/lib/constants.ts) by removing unused arm settings.
- **Accelerated Mode Transitions & Timing Tweaks:**
  - Sped up all expression transitions by 2x. Halved timing constants: `RAGE_DIZZY_SECONDS` reduced to `0.6s`, `RAGE_MORPH_SECONDS` to `0.4s`, `RAGE_OUTRO_SECONDS` to `0.8s`, `SLEEP_INTRO_SECONDS` to `1.5s`, `SLEEP_OUTRO_SECONDS` to `0.9s`, and `MODE_TRANSITION_SECONDS` to `0.12s`.
  - Doubled the frame-lerp rates in [BlobCanvas.tsx](file:///d:/Jelli-master/jelli-companion/src/components/BlobCanvas.tsx) for snappier transitions.
  - Reduced the duration of the angry mode loop by 30% (`RAGE_LOOP_MIN_SECONDS` to `5.6s` and `RAGE_LOOP_VARIANCE_SECONDS` to `1.4s`).
- **Instant Smile Morph & Synced Mouth Transitions:**
  - Replaced the slow `happyIntro`/`happyOutro` scaling with a fast `happyAlphaRef` interpolation, syncing the eye and mouth morphs.
- **Unified Vector-Morphing Eye System:**
  - Implemented state-tracked quadratic curve eye-morphing variables (`eyeMorphRxRef`, `eyeMorphRyTopRef`, `eyeMorphRyBotRef`, `eyeMorphRotRef`, `eyeMorphIsStrokeRef`, `eyeMorphYOffRef`, `eyeMorphPXRef`, `eyeMorphPYRef`) inside the component and updated their targets dynamically inside `draw()`.
  - Switched eye drawing from cross-fade alpha-blending of different layers to a smooth geometric vector morph using quadratic curves, allowing the eyes to change shape (e.g., smiling arcs, closed arcs, angry tilts, surprised ovals) instantly and organically.
- **Canvas Transform & Path Separation Bug Fixes:**
  - Added `ctx.setTransform(1, 0, 0, 1, 0, 0)` at the start of the `draw()` loop to reset the transform matrix. This prevents any runtime errors or mid-draw exceptions from leaving the canvas permanently rotated/shifted, resolving the visual issue where the entire body and tentacles rendered tilted and shifted far left.
  - Added a `ctx.beginPath()` and traced the eyelids path right before the stroke operation in Layer 6. This prevents the stroke path from being contaminated by the pupil and highlight circle sub-paths, resolving the issue where eyes rendered as a single black diamond.
  - Fixed multiple TypeScript compiler errors such as `Cannot find name 'madAlpha'` by properly declaring `const madAlpha = madAlphaRef.current` inside the `draw()` loop, and removed unused eye variables to keep build output clean.
- **Forced Color Transitions through Purple/Blue:**
  - Adjusted HSL target colors during the mad sequence (`madT1` and the target red in `inTransition`) by changing the red hue from `0` to `360`. This mathematical shift forces color interpolation (`mixHue`) to pass through purple/blue/magenta (`180 → 270 → 360`) instead of green/yellow/orange (`180 → 90 → 0`) when returning to normal mode.
- **Eliminated Drag Overlay in Dizzy Mode:**
  - Modified the `><` overlay condition to only render if `expression !== 'dizzy' && expression !== 'mad'`, immediately hiding the dragging overlay when dizzy mode starts and preventing it from overlapping the white dizzy spirals.

### 11. Project Rename & Folder Reorganization
- **Project Folder Rename:**
  - Renamed the main project directory from `zain-companion` to `jelli-companion` to align with the Jelli rebranding.
- **Reference Updates:**
  - Updated name references in `package-lock.json` to use `"jelli-companion"` instead of `"zain-companion"`.

---

**Status:** Active development
**Quality:** Production-grade code, fully polished expressions, colors, and transitions
**Documentation:** This file is the single source of truth for all project progress
