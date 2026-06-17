# Progress — Jelli Companion

## 2026-06-17: Settings System + V3 LLM Integration

### Settings Persistence System
- **Config store** (`src/stores/config.ts`) — Added new settings: `blobOpacity`, `repeatPenalty`, `frequencyPenalty`, `blobSize`, `alwaysOnTop`, `currentExpression` + `BlobExpression` type + `loadSettings()` bulk loader
- **Rust persistence** (`src-tauri/src/lib.rs`) — Added `save_settings` and `load_settings` commands that read/write `settings.json` in the app data directory
- **Settings UI** (`src/components/SettingsPanel.tsx`) — Full rewrite with organized sections: LLM (provider, model, API key, URL, temperature, max tokens, repeat/frequency penalty, context messages), Blob (opacity slider, always-on-top toggle), Voice (speaker ID). Save/Load buttons for disk persistence
- **API layer** (`src/lib/api.ts`) — Added `saveSettings()`/`loadSettings()` functions + `repeat_penalty`/`frequency_penalty` fields in ProviderConfig
- **App startup** (`src/App.tsx`) — Loads persisted settings on startup, applies blob opacity via CSS
- **Ollama request** (`src-tauri/src/llm.rs`) — Added `repeat_penalty` (default 1.15) and `frequency_penalty` (default 0.1) to ProviderConfig struct and Ollama options. Fixes LLM repetition degeneration
- **Context messages** — Both ChatInput and ChatTextbox now limit message history to `contextMessages * 2` before sending

### V3 Objective 1: Typing/Thinking Expression States (verified complete)
- Already implemented in earlier session. Verified 34 references across state machine, colors, eyes, sparkle, rings, pulse, and tentacles
- Typing: yellow gradient, wider sparkle eyes, third pulsing catchlight
- Thinking: orange gradient, processing rings (3 rings, faster pulse), focused narrowed eyes

### V3 Objective 2: Mood-Matched AI Persona Engine
- **System prompt** (`src/lib/system-prompt.ts`) — Rewritten with `getSystemPrompt(expression)` function. Each expression gets a unique mood suffix:
  - idle: casual adaptive friend
  - happy: HIGH ENERGY, exclamation marks, slang
  - mad: irritated, snappy, passive-aggressive
  - sleepy: low energy, ellipses, lowercase, trailing thoughts
  - dizzy: scattered, chaotic, comical confusion
  - shy: quiet, hesitant, sweet
  - surprised: genuinely shocked
  - annoyed: mildly bothered
  - typing: curious, attentive
  - thinking: thoughtful, processing
- **Expression tracking** — `currentExpression` field added to config store. BlobCanvas updates it on every expression change
- **Message sending** — `sendChatMessage()` now accepts optional `expression` parameter. ChatInput and ChatTextbox pass `config.currentExpression`

### V3 Objective 3: Dynamic Chatbox Auto-Resizing
- **Removed fixed resize** — ChatTextbox no longer resizes to fixed 250px on processing
- **Dynamic measurement** — After each message/state change, measures panel `getBoundingClientRect()` and calls `resizeWindow(360, targetH)` clamped to 56-320px range
- **Removed dead space** — Removed `max-height: 200px` from `.chat-response` CSS so content flows naturally without empty space below short messages
- **Input stays interactive** — Input row remains fully interactive before, during, and after resize

### Files Modified
| File | Changes |
|------|---------|
| `src/stores/config.ts` | New settings fields + BlobExpression type + loadSettings |
| `src-tauri/src/lib.rs` | save_settings/load_settings commands |
| `src-tauri/src/llm.rs` | repeat_penalty/frequency_penalty in ProviderConfig + Ollama options |
| `src/components/SettingsPanel.tsx` | Full rewrite with all settings sections |
| `src/lib/api.ts` | saveSettings/loadSettings + new ProviderConfig fields |
| `src/App.tsx` | Load settings on startup + blob opacity |
| `src/lib/system-prompt.ts` | New getSystemPrompt(expression) with mood suffixes |
| `src/components/BlobCanvas.tsx` | Updates currentExpression in store |
| `src/components/ChatInput.tsx` | Pass expression + context limit |
| `src/components/ChatTextbox.tsx` | Dynamic resize + pass expression + context limit |
| `src/styles/globals.css` | Removed max-height from chat-response |
