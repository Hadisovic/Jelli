# Blob Redesign: Reverted to Simple Noise Approach

## Branch: `redesign/metaball-blob`

## Goal
Redesign the blob with theme-synced glassy neumorphism textbox, smooth dragging, and organic visual language.

## Changes Made

### src/components/BlobCanvas.tsx (reverted to simple noise)
- **Reverted from metaball pixel rendering** to simple noise-distorted circle
- Uses `blobNoise()` with 3 sine harmonics for organic shape
- 64 canvas segments for smooth outline
- Radial gradient fill (0.1 → 0.3 → 0.6 alpha)
- Processing ring (pulsing stroke) when `isProcessing`
- Hue cycling: `(t * BLOB.HUE_SPEED) % 360` — always cycles, synced to chat via localStorage
- **Drag architecture**: screen-based deltas, `setWindowPosition`, `setChatWindowPosition` during drag
- **Click toggle**: Single click opens/closes chat window via Rust commands
- Right-click context menu blocked

### src/styles/globals.css (organic redesign)
- **Chat panel**: Glassy neumorphism with blob-synced colors (`--blob-hue` CSS vars)
- **No persistent shadow** on chat panel — only during send animation
- **Send flash**: `edge-glow` animation (border + box-shadow, 0.6s ease-out)
- **Ink cursor**: Pulsing cursor for streaming text
- **Input wrapper**: Blob-synced background with focus glow

### src/components/ChatTextbox.tsx
- Uses new `.ink-cursor` class for streaming indicator
- All functionality preserved (auto-focus, escape, resize, send)

### index.html
- Added Google Fonts: Outfit (300, 400, 500, 600 weights)

## Visual Language
- **Blob**: Simple noise-distorted circle with radial gradient (fast, no pixel loop)
- **Glass panel**: Dark glass with blob-synced colors, no shadow
- **Ink flow**: Text appears like ink dispersing in water
- **Send flash**: Border glows when message is sent

## Known Issues / TODO
- Debug console.log / println! statements need removal before final commit
- Performance: Metaball approach was too slow for smooth dragging — reverted to simple noise
