# 🌌 zAIn

<div align="center">
  <img src="zain-companion/src/assets/hero.png" alt="zAIn Logo" width="180" style="border-radius: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.2);" />
  
  <h3>zAIn</h3>
  <p><strong>The Next-Generation Agentic Desktop Experience</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Status-In_Development-blueviolet?style=for-the-badge&logo=github" alt="Status" />
    <img src="https://img.shields.io/badge/Powered_by-Dia_2_%26_Claude-orange?style=for-the-badge" alt="Powered By" />
    <img src="https://img.shields.io/badge/Platform-Tauri_v2-lightgrey?style=for-the-badge&logo=rust" alt="Platform" />
  </p>
</div>

---

## 🚀 Overview

**zAIn** merges advanced agentic AI capabilities with a desktop companion interface powered by Tauri v2, React 19, and local/remote LLM orchestration. 

Built for speed and responsiveness, zAIn utilizes the [Dia 2](https://github.com/nari-labs/dia2) speech generation engine for near-instant speech responses. Clicking the floating desktop widget opens a glassmorphic chat interface, streams the LLM response character-by-character, and progressively synthesizes voice output.

---

## ✨ Key Features

- 🔮 **Luminous Vector Blob**: Dynamic, 60fps plasma energy blob with lightning arcs, orbiting particles, and rotating filaments.
- 🪟 **Two-Window Architecture**: Frameless, transparent windows that move in lockstep without blocking click-through areas of the screen.
- 💬 **iMessage-Style UI**: Sleek, glassmorphic floating chat bubble with smooth spring animations and responsive text expansion.
- 🎙️ **Low-Latency Voice**: Real-time voice generation using **Dia 2** with streaming PCM chunk audio over Tauri IPC.
- 🧠 **Multi-Provider LLM Proxy**: Deep integration with Ollama, OpenAI, Anthropic, Gemini, and DeepSeek, including instant cancellation.

---

## 🏗️ Architecture

```mermaid
graph TD
    User([User Click]) -->|Triggers| MainWin[Main Blob Window 120x120]
    MainWin -->|Position Sync| ChatWin[Chat Textbox Window]
    ChatWin -->|Input Sent| Rust[Rust Tauri Core]
    Rust -->|SSE Stream| LLM[LLM Provider - Ollama/OpenAI/etc]
    LLM -->|Token Events| ChatWin
    Rust -->|Generate Speech| Dia2[Dia 2 TTS Engine]
    Dia2 -->|PCM Audio Chunks| Rust
    Rust -->|IPC Base64 Audio| ChatWin
    ChatWin -->|Web Audio Playback| Speaker([Audio Output])
```

---

## 🛠️ Repository Structure

Here is a quick look at the main modules of the **zAIn** ecosystem:

| Module | Purpose | Tech Stack |
| :--- | :--- | :--- |
| [`/zain-companion`](./zain-companion) | Main Desktop App Shell | React 19, TypeScript, Vite, Tauri v2, Dia 2 Sidecar |
| [`/progress`](./progress) | Development Roadmaps & Phases | Consolidated Markdown logs |
| [`.claude`](./.claude) | Workspace and Agent Settings | Local permissions & JSON Config |

---

## 📅 Roadmap & Progress

Check out the [`progress/`](./progress) folder for details on our active milestones.

* [x] **Phase 1**: Foundation & Window Setup
* [x] **Phase 2**: iMessage-Style Chat UI & Settings
* [ ] **Phase 3**: Desktop Awareness (Deferred)
* [x] **Phase 4**: LLM Proxy & TTS Pipeline (Transitioned to Dia 2)
* [ ] **Phase 5**: Particles Swarm & Installer Compilation
* [x] **Phase 6**: Luminous Blob Visual Design & Two-Window Sync

---

<div align="center">
  <sub>Built with ❤️ by the zAIn Development Team</sub>
</div>
