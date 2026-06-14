# Phase 4: LLM + TTS [IN PROGRESS]

## Goal
Chat works end-to-end with local AI model + Sesame CSM voice.

## Prerequisites
- CUDA 12.4+ GPU recommended (CPU fallback works but is slow)
- HuggingFace auth for gated models (sesame/csm-1b, meta-llama/Llama-3.2-1B)
- CSM dependencies: `pip install -r sidecar/requirements.txt`
- CSM source: `git clone https://github.com/SesameAILabs/csm && cd csm && pip install -e .`
- Model download on first run (CSM ~4.15 GB, Llama ~2.3 GB)

## Tasks
- [x] Rust LLM proxy: Ollama, OpenAI, Anthropic, Gemini, DeepSeek streaming
- [x] Rust sidecar manager: spawn, monitor, restart, heartbeat
- [x] Audio playback pipeline: sidecar PCM → Rust base64 → Web Audio API
- [x] Token streaming animation + TTS sync (event listeners in App.tsx)
- [x] Frontend API layer: Tauri command wrappers + event listeners
- [x] Stop generation button (ChatWidget header when processing)
- [x] Sidecar autostart on app mount (App.tsx)
- [x] Quantization options wired through (FP16/INT8/INT4 in config → TTS)
- [x] Python sidecar: CSM streaming + JSONL IPC (tested and fully functional)

## Sidecar Architecture
```
┌──────────────┐    JSONL stdin     ┌──────────────────┐
│  Rust (Tauri) │ ──────────────────▶│  Python Sidecar  │
│  sidecar.rs   │                    │  csm_sidecar.py  │
│               │◀──────────────────│                  │
│  send_tts()   │    JSONL stdout   │  CSM-1B model    │
│  spawn/kill   │   audio chunks    │  PCM f32 output  │
└──────┬───────┘                    └──────────────────┘
       │ Tauri events (llm:token, audio:chunk, ...)
       ▼
┌──────────────┐
│  WebView2    │
│  api.ts      │
│  audio.ts    │
│  App.tsx     │
└──────────────┘
```

## Order
Runs after Phase 2 (Chat UI), before Phase 5 (Particles + Installer).

## Notes
- The Python sidecar falls back to a test beep tone if CSM is not installed
- Sidecar script: `sidecar/csm_sidecar.py`
- Dependencies: `sidecar/requirements.txt`
