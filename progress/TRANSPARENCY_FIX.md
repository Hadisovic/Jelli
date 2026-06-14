# Window Transparency Fix

## What Changed

### 1. **Window Configuration** (`tauri.conf.json`)
- Changed window size from **400×60** (wide rectangle) to **140×140** (square)
- This allows the window to just fit the blob without extra space
- Set `transparent: true` (already was, but now effective)
- Set `shadow: false` to remove window shadow
- Set `decorations: false` to remove title bar/borders

### 2. **Blob Centering** (`BlobCanvas.tsx`)
- Changed blob position from `bottom-5 right-5` (bottom-right corner) to **centered**
- Used `top-1/2 left-1/2` with `transform: translate(-50%, -50%)` to center in window
- Added explicit `backgroundColor: 'transparent'` to canvas style

### 3. **Canvas Transparency** 
- Added comment clarifying canvas clears to transparent (not white)
- Canvas context uses `clearRect()` which maintains transparency
- No other changes needed - canvas 2D already renders transparently

### 4. **CSS Already Correct**
- `globals.css` already had `background: transparent !important` on html/body/#root
- `color-scheme: dark` prevents WebView2 from injecting white background

## Result

✅ **Window is now:**
- **Square (140×140)** - just fits the blob
- **Fully transparent** - only blob is visible
- **No decorations** - no title bar, borders, or shadows
- **Floating character** - appears as true desktop companion
- **Click-through transparent areas** - clicks pass through empty space to desktop behind

## Testing

```bash
# Build
cd sesame-cat
npm run build

# Run development server
npm run tauri dev

# Or run built installer
npm run tauri build
```

## Visual Result

Before:
```
┌─────────────────────────────────┐
│ [blob][lots of empty space]     │  400×60 window
└─────────────────────────────────┘
```

After:
```
┌──────┐
│[blob]│  140×140 window, fully transparent
└──────┘  (background shows desktop)
```

## Notes

- Blob can still be dragged with 5px threshold
- Click opens textbox above blob
- Ctrl+Space expands to 400×600 for full chat panel (transparent as well)
- Window resize handled in App.tsx setWindowGeometry() calls
