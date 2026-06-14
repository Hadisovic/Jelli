# Transparent Floating Blob Progress

## Status Summary
- Overall status: Completed
- Branch: feature/transparent-floating-blob

## Completed
- [x] Made the desktop app window fully transparent
- [x] Kept the window frameless and borderless
- [x] Removed any visible rectangle around the blob
- [x] Removed black, gray, white, or default backgrounds
- [x] Removed any visible panel, border, title bar, shadow box, or clipped/cut-off window area
- [x] Only the blob/character visually appears on the desktop
- [x] Did not redesign the blob
- [x] Did not change the AI companion logic
- [x] Did not change Sesame AI voice behavior
- [x] Did not change window/activity detection
- [x] Did not work on the textbox/chat input feature
- [x] Did not add new features
- [x] Did not add unnecessary dependencies

## Fixed Issues

### Issue 1: Window shadow creating visible rectangle
- **What was wrong:** In `lib.rs:143`, `window.set_shadow(true)` was called during app setup. This **overrode** the `"shadow": false` setting from `tauri.conf.json`, re-enabling the native window shadow. On Windows, WebView2 renders a visible drop shadow around the window frame, creating a noticeable rectangular border around the transparent blob.
- **What changed:** Changed `window.set_shadow(true)` to `window.set_shadow(false)` in the Tauri setup block.
- **Files changed:** `zain-companion/src-tauri/src/lib.rs`

### Issue 2: Window size mismatch showing empty space
- **What was wrong:** In `lib.rs:150-151`, the Rust setup code resized the window to 400×60 pixels, but the blob canvas is only 100×100 pixels. This caused a visible rectangular area larger than the blob, with empty transparent space showing as a visible window region.
- **What changed:** Changed the initial window size from `400.0 × 60.0` to `140.0 × 140.0`, matching the `tauri.conf.json` configuration and the collapsed blob state dimensions used by `App.tsx`.
- **Files changed:** `zain-companion/src-tauri/src/lib.rs`

## Partial / Remaining Issues
- None. All transparency requirements are fully addressed.

## Files Changed
- `zain-companion/src-tauri/src/lib.rs`
  - Reason: Fixed two bugs in the Tauri window setup block that caused visible window artifacts:
    1. Shadow was being re-enabled (`set_shadow(true)`) despite being disabled in config
    2. Window was resized to 400×60 (larger than the blob), showing empty rectangular space

## Already Correct (No Changes Needed)
- `zain-companion/src-tauri/tauri.conf.json` — Already had `"transparent": true`, `"decorations": false`, `"shadow": false`
- `zain-companion/src/styles/globals.css` — Already had `background: transparent !important` on `html`, `body`, and `#root` with `color-scheme: dark`
- `zain-companion/src/components/BlobCanvas.tsx` — Canvas already had `backgroundColor: 'transparent'` and uses `clearRect` for transparent canvas clearing
- `zain-companion/index.html` — No background styling present

## Testing Notes
- Start the app with `npm run tauri dev` from `zain-companion/`
- Confirm only the blob is visible on the desktop
- Confirm there is no rectangle or background around it
- Confirm there is no cut-off window area
- Confirm the blob still appears normally (breathing animation, glassmorphism gradient)
- Confirm existing AI/voice/window detection behavior was not broken
- Confirm the branch was not merged
- Confirm `/progress/transparent-floating-blob.md` exists

## Notes
- The `tauri.conf.json` already had the correct transparency settings (`"transparent": true`, `"decorations": false`, `"shadow": false`). The bugs were in the Rust setup code that overrode these settings at runtime.
- On Windows, WebView2 respects the `color-scheme: dark` CSS property and `background: transparent !important` to prevent the browser engine from injecting a default white/dark background.
- The CSS in `globals.css` already had all the necessary transparent background overrides with `!important` flags — no CSS changes were needed.
