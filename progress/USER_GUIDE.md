# Quick Start Guide — Draggable Blob Companion

## What's New

Your Sesame AI companion is now a **draggable floating blob** on your desktop!

### User Experience

**Before:**
- Click blob → entire window expands to show chat
- No dragging

**After:**
- Click blob → small textbox appears above it
- Drag blob → move it around your desktop
- Ctrl+Space → see full chat history (optional)
- Escape → close textbox or chat panel

---

## How to Use

### 1. Interact with the Blob

```
┌────────────────────────────────────┐
│                                    │
│    [Settings] [─] [X]  ← Full Chat │  Ctrl+Space
│                                    │  to open
│    Chat History                    │
│    Messages...                     │
│                                    │
│                                    │
│              ┌──────────┐          │
│              │ Say sth..│ ← TextBox│  Click blob
│              │ [Send]   │          │  to open
│              └─────┬────┘          │
│                    ↓ arrow         │
│               [Blob]   ← Drag me!  │
│                                    │
└────────────────────────────────────┘
```

### 2. Basic Actions

| Action | Result |
|--------|--------|
| **Click** the blob | Opens floating textbox ↑ |
| **Type a message** | Message appears in textbox |
| **Press Enter** | Sends to AI, textbox closes |
| **Press Escape** | Closes textbox (or chat panel) |
| **Click outside textbox** | Closes textbox |
| **Drag the blob** | Moves it around desktop |
| **Press Ctrl+Space** | Shows/hides full chat history |

### 3. What Happens Next

1. You click the blob
2. Textbox appears with animation
3. You type: "What's the weather?"
4. You press Enter
5. Textbox closes
6. AI starts responding (you'll hear voice)
7. Chat history updates (view with Ctrl+Space if you want)
8. Blob returns to idle state
9. Ready for next message

---

## Keyboard Shortcuts

- **Left Click** = Open textbox
- **Drag** = Move blob around  
- **Ctrl+Space** = Show/hide full chat panel
- **Escape** = Close textbox or panel
- **Enter** (in textbox) = Send message

---

## Visual Feedback

The blob changes color to show what's happening:

- **Purple** = Idle, ready to chat
- **Cyan** = Being dragged around
- **Blue with glow** = AI is thinking/responding
- **Light blue** = Textbox is open

---

## Troubleshooting

### Textbox doesn't appear when I click
- **Check:** Is the blob visible? (should be bottom-right corner)
- **Fix:** Make sure you clicked directly on the blob, not nearby

### Textbox closes immediately
- **Check:** Did you click outside of it?
- **Fix:** Click only on the input field and send button

### Blob moves when I tried to click
- **Check:** Did your mouse move >5px during click?
- **Why:** The app distinguishes between click (no movement) and drag (movement)
- **Fix:** Click smoothly without moving the cursor

### I can't find the chat history
- **Fix:** Press Ctrl+Space to open full chat panel
- **Note:** Chat history persists between sessions

### Voice not working
- **Check:** Is your audio device connected?
- **Fix:** Check settings (gear icon in chat panel)

---

## Tips

✨ **Drag the blob to a convenient spot** — it stays where you leave it  
✨ **Quick messages** — just click and type, no need to open full chat  
✨ **Persistent chat** — click Ctrl+Space anytime to see full history  
✨ **Always accessible** — blob stays on top of other windows  
✨ **Non-intrusive** — blob is small and doesn't steal focus  

---

## Settings

Open full chat panel (Ctrl+Space) then click ⚙️ to access:
- LLM provider (Ollama, OpenAI, etc.)
- Model selection
- API keys (for cloud providers)
- Ollama URL
- Temperature setting
- Voice speaker ID
- Quantization options

---

## Feedback

This is a beta feature! If you find any issues:
1. Note what you were doing
2. Check the progress/IMPLEMENTATION_REPORT.md for technical details
3. Report to the team

Enjoy your new AI companion! 🎉
