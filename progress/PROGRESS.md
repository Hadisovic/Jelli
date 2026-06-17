# 🌟 Jelli Companion — Complete Progress & Architecture

<p align="center">
  <img src="https://img.shields.io/badge/Status-Active%20Development-brightgreen?style=for-the-badge&logo=git" alt="Status" />
  <img src="https://img.shields.io/badge/Platform-Tauri%20v2-blue?style=for-the-badge&logo=tauri" alt="Platform" />
  <img src="https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61dafb?style=for-the-badge&logo=react" alt="Frontend" />
  <img src="https://img.shields.io/badge/Language-TypeScript%20%2B%20Rust-orange?style=for-the-badge&logo=rust" alt="Language" />
</p>

**Last Updated:** 2026-06-18  
**Current Active Branch:** `master`

---

> [!NOTE]
> **Jelli Companion** is a desktop AI companion built with Tauri v2 (Rust + React). A small, transparent, always-on-top jellyfish blob sits on the desktop. Clicking the blob opens a floating, glassmorphic chat textbox. Responses stream in real-time and are spoken aloud using high-performance speech synthesis (TTS) accompanied by fluid-simulated visual animations.

---

## 📌 Table of Contents

1. [Project Overview & Core Loop](#1-project-overview--core-loop)
2. [Tech Stack](#2-tech-stack)
3. [Architecture & Data Flow](#3-architecture--data-flow)
4. [Development Phases (Archive)](#4-development-phases-archive)
5. [Resolved Bugs & Issues](#5-resolved-bugs--issues)
6. [Workspace File Map](#6-workspace-file-map)
7. [Verification & Status Checklist](#7-verification--status-checklist)
8. [Performance & Latency Metrics](#8-performance--latency-metrics)
9. [Build & Run Recipes](#9-build--run-recipes)
10. [Key Design Decisions](#10-key-design-decisions)
11. [Recent Updates](#11-recent-updates)

---

## 1. Project Overview & Core Loop

### User Core Loop
```
Click blob → Chat opens → Type message → Send
    → LLM streams response → Tokens display in real-time
    → TTS auto-triggers → Voice speaks response
    → Audio playback with visual indicators
```

### Key Interactive Features
* **Floating Widget:** A transparent blob situated at the bottom-right of the desktop. Can be dragged to reposition anywhere on screen.
* **Glassmorphic Chat:** Click the blob to toggle a floating chat textbox.
* **Responsive Visuals:** The blob changes color and morphs structurally based on status (e.g. deep blue when processing).
* **Voice Synthesis:** Synthesizes LLM responses automatically with progressive audio playback and bouncing-bar audio indicators.
* **Settings Overlay:** Press `Ctrl+Space` to expand the full chat history panel with advanced settings (LLM provider, API key, model selection, voice configs, and window configurations).

---

## 2. Tech Stack

| Layer | Technology | Version | Description / Role |
| :--- | :--- | :--- | :--- |
| **Desktop Shell** | [Tauri v2](https://tauri.app/) | 2.11.2 | Transparent, frameless, always-on-top desktop app wrapper |
| **Frontend** | [React](https://react.dev/) | 19.2.6 | Interactive user interface |
| **Build Tool** | [Vite](https://vite.dev/) | 8.0.12 | High-speed bundler (requires external esbuild configs) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | 6.0.2 | Typed frontend logic |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | 4.3.1 | Core layout with custom utility classes & glassmorphism |
| **Animation** | [Motion](https://motion.dev/) | 12.40.0 | Fluid spring animations (imported as `motion/react`) |
| **State Manager** | [Zustand](https://zustand-demo.pmnd.rs/) | 5.0.14 | Store management with direct creation |
| **Backend** | [Rust](https://www.rust-lang.org/) | 1.96.0 | System-level Tauri bindings and window controls (MSVC toolchain) |
| **LLM Interface** | SSE / HTTP | — | Direct streaming support for Ollama, OpenAI, Anthropic, Gemini, DeepSeek |
| **TTS System** | CSM-1B / Dia 2 | — | Python-based speech generation sidecar; PCM stream reader |
| **Audio Playback** | Web Audio API | — | Real-time browser PCM streaming player |

---

## 3. Architecture & Data Flow

### Two-Window System Layout
```
┌─────────────────────────┐         ┌─────────────────────────┐
│     main (140×160)      │         │   chat (360×56/320)     │
│  - Transparent & Frameless│         │  - Transparent & Glassy  │
│  - Always on top        │         │  - Hidden by default     │
│  - BlobCanvas           │         │  - ChatTextbox & Input   │
└─────────────────────────┘         └─────────────────────────┘
             │                                   │
             │           Tauri IPC Routing       │
             └───────────────────────────────────┘
```
* **`main` Window:** Renders only the dynamic canvas ([BlobCanvas.tsx](file:///d:/Jelli/jelli-companion/src/components/BlobCanvas.tsx)) and the settings/history panel overlay ([ChatWidget.tsx](file:///d:/Jelli/jelli-companion/src/components/ChatWidget.tsx)).
* **`chat` Window:** Renders the floating keyboard input bar ([ChatTextbox.tsx](file:///d:/Jelli/jelli-companion/src/components/ChatTextbox.tsx)). Positioned above the blob on demand.

### E2E Chat & Voice Flow
```
User sends message 
  → frontend.addMessage()
  → Tauri IPC invoke("send_chat_message") 
  → Rust llm::stream_llm() 
  → SSE Stream parsed (emits "llm:token" events) 
  → Frontend appends tokens in real-time
  → Stream complete (emits "llm:done") 
  → Rust sidecar::send_tts(text) 
  → Python sidecar generates speech via CSM-1B/Dia 2 
  → Raw float32 PCM chunks (24kHz) piped to stdout 
  → Rust encodes base64 (emits "audio:chunk" events) 
  → Frontend AudioPlayer.play() streams audio progressively
```

### State Store Structure
* **`useChatStore`** ([chat.ts](file:///d:/Jelli/jelli-companion/src/stores/chat.ts)): Manages conversational messages list, processing spinners, audio playback statuses, and active request mappings.
* **`useConfigStore`** ([config.ts](file:///d:/Jelli/jelli-companion/src/stores/config.ts)): Configures target LLM providers, API keys, host endpoints, model specifications, temp/tokens, blob styling configurations (opacity, size, always-on-top), and UI visibility triggers.

---

## 4. Development Phases (Archive)

<details>
<summary>📦 Phase 1: Foundation (Completed)</summary>

### Goal
Establish transparent frameless desktop window with a vector circle blob that expands into a chat panel on shortcut/click.

### Deliverables
* Configured transparent body background and window shadow rules in [tauri.conf.json](file:///d:/Jelli/jelli-companion/src-tauri/tauri.conf.json) and [lib.rs](file:///d:/Jelli/jelli-companion/src-tauri/src/lib.rs).
* Setup custom Tailwind CSS v4 styling in [globals.css](file:///d:/Jelli/jelli-companion/src/styles/globals.css).
* Built custom spring transitions in [ChatWidget.tsx](file:///d:/Jelli/jelli-companion/src/components/ChatWidget.tsx).
* Added global key shortcuts (e.g. `Ctrl+Space` to expand chat).
</details>

<details>
<summary>💬 Phase 2: Chat UI (Completed)</summary>

### Goal
Construct full iMessage-style chat with message lists, typing indicator, and settings panels.

### Deliverables
* Built [MessageBubble.tsx](file:///d:/Jelli/jelli-companion/src/components/MessageBubble.tsx) using spring enter/exit motions.
* Coded [SettingsPanel.tsx](file:///d:/Jelli/jelli-companion/src/components/SettingsPanel.tsx) to handle manual parameters config.
* Added glow thinking states and local mock response loops before E2E backend integration.
</details>

<details>
<summary>🖥️ Phase 3: Desktop Awareness (Deferred)</summary>

### Goal
Expose user's background desktop activities (active window title checking) to contextually prompt Jelli.

### Status
* **⏸️ Deferred.** Focus is shifted toward perfecting blob character designs (Phase 6) and core interaction modes.
</details>

<details>
<summary>🗣️ Phase 4: LLM + TTS Integration (Completed)</summary>

### Goal
Wire streaming LLM APIs (Ollama/OpenAI/Gemini/Anthropic/DeepSeek) and Python-based TTS audio synthesis pipelines.

### Deliverables
* **Rust LLM Proxy** ([llm.rs](file:///d:/Jelli/jelli-companion/src-tauri/src/llm.rs)): Direct SSE streaming pipeline supporting multiple cloud APIs and local Ollama servers.
* **Rust Sidecar Manager** ([sidecar.rs](file:///d:/Jelli/jelli-companion/src-tauri/src/sidecar.rs)): Controls background execution and JSONL standard streams of python processes.
* **Python TTS Sidecar** ([csm_sidecar.py](file:///d:/Jelli/jelli-companion/sidecar/csm_sidecar.py)): Integrates CUDA-accelerated Sesame CSM-1B model (with a beep fallback when GPU dependencies are missing).
* **Audio Queue Player** ([audio.ts](file:///d:/Jelli/jelli-companion/src/lib/audio.ts)): Decodes and schedules incoming raw base64 float32 PCM chunks via the Web Audio API without latency gaps.
</details>

<details>
<summary>🎨 Phase 6: Blob Visual Design (Completed)</summary>

### Goal
Replace original basic circles with dynamic vector-morphing character blobs.

### Deliverables
* **Two-Window Architecture:** Resolved visual glitching and resizing bounds checking by splitting the layout into discrete static `main` and reactive `chat` windows.
* **Deep Sea Jellyfish Mode:** Transparent dome morphing with 3-sine waves, bioluminescent organs, and physics-simulated swimming tentacles.
* **Liquid Mercury Mode:** Opaque metallic chrome layout utilizing spring-damped vertices, reflective environment bands, and double specular glares.
* **Plasma Energy Mode (Current default):** Electric core outline generating rotating inner filaments, particle orbits, and branching lightning strikes.
* **Interaction Polish:** Integrated local-storage polling color controllers to synchronize gradients and glassy shadows between separate window DOM contexts.
</details>

---

## 5. Resolved Bugs & Issues

| ID | Issue Description | Root Cause | Fix Implementation |
| :--- | :--- | :--- | :--- |
| **1** | Window shadow bounding box visible | `lib.rs` called `set_shadow(true)` during initialization, overriding configuration | Changed to `set_shadow(false)` |
| **2** | Blank rectangular regions appearing around blob | App window dimensions mismatched canvas sizes (400×60 vs 120×120) | Reconfigured boundaries to 120×120, later extended to 140×160 |
| **3** | Null-byte crash in Python scripts | UTF-16 byte-order-mark encoding in script generation | Explicitly output all files as UTF-8 |
| **4** | App lagging when dragging window | CPU-bound pixel-loop operations for canvas rendering | Switched to vector canvas path instructions |
| **5** | Sidecar processes duplicating during dev | Vite HMR trigger causing setup callbacks to rerun | Protected setup with a global state guard |
| **6** | Python DLL Access Violation crash | CUDA libraries loading in conflicting order with `pyarrow` | Imported `pyarrow` explicitly before launching `torch` |
| **7** | Windows compiler fails on `triton` compilation | `triton` compiler module doesn't natively support Windows targets | Set environment variable `NO_TORCH_COMPILE=1` |
| **8** | Position return value mismatched between TS and Rust | Rust command returned array structure `[x, y]` while TS expected `{x, y}` object | Destructured output values directly in JS wrapper |
| **9** | Chat box jumps during transition expansion | Single window resize logic altering coordinates centering | Migrated layout to Two-Window system |
| **10** | Missing method runtime crash in TTS sidecar | Script referenced deprecated `generate()` method | Updated sidecar backend to execute `Generator.generate()` |
| **11** | Smart quote parse error during bundler stage | System prompt file utilized curly smart quotes `’` (U+2019) | Replaced smart quotes with straight ASCII apostrophes in string literals |

---

## 6. Workspace File Map

### Frontend Modules (`jelli-companion/src/`)
* **[App.tsx](file:///d:/Jelli/jelli-companion/src/App.tsx):** App router, global hotkeys, IPC event subscriptions for LLMs, TTS, and sidecar states.
* **[BlobCanvas.tsx](file:///d:/Jelli/jelli-companion/src/components/BlobCanvas.tsx):** Animation loop, eye-tracking math, dragging gesture metrics, and styling updates.
* **[ChatTextbox.tsx](file:///d:/Jelli/jelli-companion/src/components/ChatTextbox.tsx):** Floating input overlay (auto-scales height dynamically to match text layout).
* **[ChatInput.tsx](file:///d:/Jelli/jelli-companion/src/components/ChatInput.tsx):** Context-limit input form inside full history panel.
* **[SettingsPanel.tsx](file:///d:/Jelli/jelli-companion/src/components/SettingsPanel.tsx):** UI forms for managing API endpoints, styles, and prompt rules.
* **[system-prompt.ts](file:///d:/Jelli/jelli-companion/src/lib/system-prompt.ts):** System prompt directives and emotional tone modifiers based on blob expressions.
* **[api.ts](file:///d:/Jelli/jelli-companion/src/lib/api.ts):** Typing-level declarations for Tauri IPC channels.
* **[audio.ts](file:///d:/Jelli/jelli-companion/src/lib/audio.ts):** Progressive audio player using Web Audio API buffer scheduling.
* **[globals.css](file:///d:/Jelli/jelli-companion/src/styles/globals.css):** Custom CSS animations (send flash, ink cursor, neon gradient breathers).

### Backend Modules (`jelli-companion/src-tauri/src/`)
* **[lib.rs](file:///d:/Jelli/jelli-companion/src-tauri/src/lib.rs):** Window coordinate managers, setup lifecycle, settings load/save commands, cursor location Win32 bindings.
* **[llm.rs](file:///d:/Jelli/jelli-companion/src-tauri/src/llm.rs):** Provider endpoints (Ollama, OpenAI, Anthropic, Gemini, DeepSeek), cancel mapping, Gemini system instructions, and Ollama system fallback injection.
* **[sidecar.rs](file:///d:/Jelli/jelli-companion/src-tauri/src/sidecar.rs):** IPC process spawning, stdin writer, stdout reader, base64 PCM data relay, and heatbeats.

### Python Sidecar Modules
* **[csm_sidecar.py](file:///d:/Jelli/jelli-companion/sidecar/csm_sidecar.py):** Audio generation service.
* **[generator.py](file:///d:/Jelli/jelli-companion/csm/generator.py):** Sesame CSM-1B core generation pipelines (Llama 3.2 + Mimi codec).

---

## 7. Verification & Status Checklist

### Verified Functionality
- [x] Transparent app layers (no border artifacts)
- [x] Correct screen center coordinate calculations
- [x] Dual window repositioning and tracking synchronization (6px threshold)
- [x] Adaptive chat window heights (no text cutoffs)
- [x] Cross-window color hue synchronization (localStorage + IPC)
- [x] In-app settings persistence (`settings.json` disk loading/saving)
- [x] Streamed token output (Ollama, Gemini, OpenAI, etc.)
- [x] Audio chunk delivery and gapless Web Audio synthesis
- [x] Win32-based mouse tracking across monitors (eye-movement follow)
- [x] Petting detection wiggles (hover cursor triggers happy state)
- [x] Transition animations (dizzy drag-deceleration into rage mode)
- [x] Trailing hash symbols cleanup from token streams
- [x] Smart quote TypeScript transpilation fixes

### Pending Visual Validations
- [ ] Render parameters optimization for plasma particles on HDR displays
- [ ] Tentacle physics behavior during low frame rate spikes
- [ ] Custom backdrop sat/contrast values under varying OS scaling settings

---

## 8. Performance & Latency Metrics

### CPU / GPU Resource Footprint
* **Idle State:** ~150 MB RAM, <2% CPU usage.
* **Active Generating State:** ~600–800 MB RAM (excluding local model execution).
* **Peak State (TTS loaded in GPU memory):** ~1.5–2.0 GB VRAM.
* **Blob Rendering Loop:** Solid 60fps via vector path scheduling.

### Typical Latency (GPU-Accelerated)
```
[User Send] ──(1.5s)──> [LLM First Token] ──(3.0s)──> [LLM Stream Done]
  └─(2.5s Audio Synthesis)─> [Audio Playback Begins] (<100ms response start)
```

---

## 9. Build & Run Recipes

### Development Environment
```bash
# Start dev loop with Vite HMR + Tauri backend
cd jelli-companion
npm run tauri dev
```

### Production Build Compilation
```bash
# Build installers (produces .msi + setup packages)
npm run tauri build
```

### Dependency Installation
```bash
# Python dependencies setup
pip install -r sidecar/requirements.txt
cd csm && pip install -e .
```

---

## 10. Key Design Decisions

* **Two-Window Architecture:** Separating the blob graphics viewport from the keyboard textbox solves monitor bounds clamping issues and prevents transparent layers from capturing mouse clicks over normal Windows desktop items.
* **Win32 Cursor Polling:** Polling cursor positions via system API instead of standard JS events ensures the jellyfish eyes follow the user's focus even when dragging outside the boundaries of the browser canvas.
* **Tone Modifier Suffixes:** Suffix rules (happy, mad, shy, etc.) are injected directly into the LLM system prompts based on the current expression state to enforce personality delivery.
* **Compact Settings Persistence:** Writing custom `save_settings` API wrappers avoids bulk Zustand-sync setups, saving configurations immediately in the user's OS application directory.

---

## 11. Recent Updates

### 📅 June 18, 2026: Personality Delivery & Persona Sync
> [!IMPORTANT]
> Fixed a critical issue where Jelli was responding formally ("I am doing well, thank you for asking.") instead of using its casual character rules.

* **Cross-Window Expression Sync:** Added Tauri IPC events in [api.ts](file:///d:/Jelli/jelli-companion/src/lib/api.ts) (`emitExpressionChanged`/`onExpressionChanged`). The canvas emits expression changes to notify ChatTextbox and ChatInput immediately, applying appropriate mood suffixes during floating chat sessions.
* **Ollama Target Injection Fix:** Patched [llm.rs](file:///d:/Jelli/jelli-companion/src-tauri/src/llm.rs) to target the *last* user message in the thread. Prepend system persona reminder on turn 2+ ("stay in character as jelli — lowercase, 1 sentence, emojis, gen z texting, no periods") to maintain consistency without inflating context size.
* **Few-Shot Prompt Extraction:** Extracted training prompt examples into `FEW_SHOT_MESSAGES` in [system-prompt.ts](file:///d:/Jelli/jelli-companion/src/lib/system-prompt.ts) and prepended them directly as conversation history. This forces smaller LLMs (e.g. Qwen:4b) to weigh character constraints more heavily.
* **Base Prompt Tightening:** Tightened `BASE_PROMPT` down to 6 core lines to maximize attention weights. Rewrote all `MOOD_SUFFIXES` as tone modifiers to prevent contradiction rules (e.g. happy mode no longer conflicts with lowercase directives).
* **Code Cleanups:** Replaced curly quotes with ASCII apostrophes in system prompt blocks to avoid esbuild parsing issues, and filtered out thinking state messages in [ChatTextbox.tsx](file:///d:/Jelli/jelli-companion/src/components/ChatTextbox.tsx) before compiling context vectors.

### 📅 June 17, 2026: Persistence & Dynamic UI Controls
* **Settings System:** Added `save_settings` and `load_settings` commands to [lib.rs](file:///d:/Jelli/jelli-companion/src-tauri/src/lib.rs) utilizing OS AppData directories. Built robust UI inputs in [SettingsPanel.tsx](file:///d:/Jelli/jelli-companion/src/components/SettingsPanel.tsx) to manipulate LLM settings, API keys, opacity levels, and always-on-top attributes.
* **Typing & Thinking Expressions:** Added visual feedback for typing (yellow color scheme, sparkle eyes) and thinking (orange color scheme, core rings and filaments, focused eyelids).
* **Dynamic Chatbox Scaling:** Removed fixed 250px sizing heights. The chat viewport measures its child elements and triggers OS window resizing dynamically between `56px` and `320px`.
* **Command Dropdown Overlay:** Built a slash-command autocomplete list overlay in [ChatTextbox.tsx](file:///d:/Jelli/jelli-companion/src/components/ChatTextbox.tsx) and [ChatInput.tsx](file:///d:/Jelli/jelli-companion/src/components/ChatInput.tsx) featuring full keyboard navigability.
* **Gemini System Instruction Mapping:** Patched `stream_gemini` in [llm.rs](file:///d:/Jelli/jelli-companion/src-tauri/src/llm.rs) to properly assign the system prompt parameter, preventing role-alternation bugs.

---

**Status:** Active development  
**Quality:** Production-grade code, fully polished expressions, colors, and transitions  
**Documentation:** This file is the single source of truth for all project progress
