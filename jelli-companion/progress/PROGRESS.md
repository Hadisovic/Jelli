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

---

## 2026-06-18: Personality Delivery Fix

### Problem
Jelli was responding formally ("I am doing well, thank you for asking.") instead of in character. Root causes:
1. **Cross-window expression sync missing** — Blob expressions didn't reach chat windows, so mood suffixes never applied when chatting via floating window
2. **Ollama persona injection targeted first user message** — By turn 2+, the system prompt was buried and ignored
3. **Few-shot examples buried in system prompt** — Small Ollama models underweight system blocks vs. actual conversation history
4. **Thinking messages sent to LLM** — ChatTextbox included internal thinking messages in context, confusing the model
5. **Mood suffixes contradicted base rules** — e.g., happy mood said "use exclamation marks, caps" conflicting with "lowercase only"

### Fixes Implemented

#### 1. Cross-Window Expression Sync
- **`src/lib/api.ts`** — Added `emitExpressionChanged(expression)` / `onExpressionChanged(handler)` Tauri IPC events (same pattern as existing `user:typing`/`user:idle`)
- **`src/components/BlobCanvas.tsx`** — Calls `emitExpressionChanged(expression)` on every expression change
- **`src/components/ChatTextbox.tsx`** — Listens for expression changes, updates local store
- **`src/components/ChatInput.tsx`** — Listens for expression changes, updates local store

#### 2. Ollama Persona Injection Fix
- **`src-tauri/src/llm.rs`** — Changed `.find()` to `.rev().find()` targeting the LAST user message instead of first
- **Turn 1**: Full system prompt injected (same as before)
- **Turn 2+**: Short 1-line reminder: "stay in character as jelli — lowercase, 1 sentence, emojis, gen z texting, no periods, be casual and brief"
- Keeps context clean while reinforcing character continuity

#### 3. Few-Shot Extraction
- **`src/lib/system-prompt.ts`** — Extracted 6 example pairs into `FEW_SHOT_MESSAGES` array (exported)
- **`src/lib/api.ts`** — `sendChatMessage()` prepends `FEW_SHOT_MESSAGES` as `[systemMsg, ...FEW_SHOT_MESSAGES, ...messages]`, OUTSIDE context trim
- Small models weight actual conversation history (role: user/assistant turns) far more than system blocks

#### 4. Thinking Message Filter
- **`src/components/ChatTextbox.tsx`** — Added `.filter((m) => m.status !== 'thinking')` before mapping messages to LLM format, matching existing ChatInput behavior

#### 5. Mood Suffix Rewrite
- **`src/lib/system-prompt.ts`** — All `MOOD_SUFFIXES` rewritten as tone modifiers only:
  - Removed contradictory rules (happy no longer says "caps for EXCITEMENT")
  - Respects base rules: lowercase, brief, no periods
  - Each suffix shifts tone without overriding core persona

#### 6. BASE_PROMPT Tightened
- **`src/lib/system-prompt.ts`** — Reduced from 35+ lines to 6 lines
- Front-loaded 5 critical rules (lowercase, 1 sentence, emojis, slang, jellyfish identity)
- Removed redundant numbered rules that dilute attention

#### 7. Parse Error Fix
- **`src/lib/system-prompt.ts`** — Replaced smart/curly quotes (`'` U+2019) with straight ASCII apostrophes in string literals
- TypeScript `tsc --noEmit` passes fine (handles smart quotes), but Vite's esbuild parser rejects them

### Commit
- `5ea4643` — "Fix Jelli personality delivery: cross-window expression sync, Ollama persona injection, few-shot extraction, and mood suffixes"
- Pushed to `https://github.com/Hadisovic/Jelli.git`

### Files Modified
| File | Changes |
|------|---------|
| `src/lib/system-prompt.ts` | Extracted FEW_SHOT_MESSAGES, tightened BASE_PROMPT, rewrote MOOD_SUFFIXES, fixed smart quotes |
| `src/lib/api.ts` | Added expression sync events, FEW_SHOT_MESSAGES prepend in sendChatMessage |
| `src-tauri/src/llm.rs` | Ollama injection targets last user message, short reminder on turn 2+ |
| `src/components/BlobCanvas.tsx` | Emits expression:changed events |
| `src/components/ChatTextbox.tsx` | Expression listener, thinking message filter |
| `src/components/ChatInput.tsx` | Expression listener |

### Next Steps
1. **Manual test** — Chat with Jelli: turn 1 casual, turn 2 casual, "who are you?", different expressions via floating chat
2. **If still formal** — Consider adding more few-shot pairs or increasing Ollama `num_predict` / `temperature`
3. **Dia 2 TTS** — Replace Sesame CSM (separate task)
