import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'
import { getWindowPosition, setWindowPosition, showChatWindow, hideChatWindow, getScreenInfo, setChatWindowPosition, getCursorPosition } from '@/lib/api'

const DRAG_THRESHOLD = 6
const CHAT_W = 360
const CHAT_H_COLLAPSED = 56
const CHAT_H_EXPANDED = 250

// ── Expressions ──────────────────────────────────────────────────────────
type Expression = 'idle' | 'annoyed' | 'dizzy' | 'sleepy' | 'happy' | 'surprised' | 'shy'

// ── Jellyfish anatomy ────────────────────────────────────────────────────
const BELL_SEGS = 80
const BELL_W = 32
const BELL_H = 24
const BELL_BASE_Y = 38
const TENT_COUNT = 4
const TENT_SEGS = 12
const TENT_LEN = 32

// ── Tentacle ─────────────────────────────────────────────────────────────
interface TPoint { x: number; y: number; vx: number; vy: number }
interface Tentacle {
  pts: TPoint[]
  sx: number
  phase: number
  speed: number
  amp: number
  damp: number
  width: number
}

function makeTentacles(): Tentacle[] {
  return Array.from({ length: TENT_COUNT }, (_, i) => {
    const spread = 22
    const sx = -spread / 2 + (i / (TENT_COUNT - 1)) * spread
    const pts: TPoint[] = Array.from({ length: TENT_SEGS }, (_, j) => ({
      x: sx,
      y: BELL_BASE_Y + (j / TENT_SEGS) * TENT_LEN,
      vx: 0,
      vy: 0,
    }))
    return {
      pts, sx,
      phase: i * 1.3 + Math.random() * 0.5,
      speed: 0.5 + Math.random() * 0.4,
      amp: 1.5 + Math.random() * 1.2,
      damp: 0.90 + Math.random() * 0.05,
      width: 3.5 + Math.random() * 2.0,
    }
  })
}

// ── Bioluminescent organs ────────────────────────────────────────────────
interface Organ {
  bx: number; by: number
  size: number; bright: number
  phase: number; speed: number
}

function makeOrgans(): Organ[] {
  return [
    { bx: -8, by: -5, size: 4.5, bright: 1, phase: 0, speed: 1.1 },
    { bx: 6, by: -3, size: 3.5, bright: 0.8, phase: 1.8, speed: 0.9 },
    { bx: -2, by: 2, size: 3.0, bright: 0.7, phase: 3.2, speed: 1.0 },
    { bx: 10, by: -1, size: 2.2, bright: 0.55, phase: 4.5, speed: 0.8 },
    { bx: -11, by: 0, size: 2.0, bright: 0.45, phase: 2.5, speed: 1.2 },
  ]
}

// ── Bell path ────────────────────────────────────────────────────────────
function traceBell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sx: number,
  sy: number,
  time: number,
) {
  ctx.beginPath()
  for (let i = 0; i <= BELL_SEGS; i++) {
    const a = (i / BELL_SEGS) * Math.PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    let bx: number, by: number

    if (sa <= 0) {
      const wobble = Math.sin(a * 3 + time * 0.5) * 0.6
      bx = cx + ca * (BELL_W + wobble) * sx
      by = cy + sa * BELL_H * sy
    } else {
      const rimTuck = 1 - Math.pow(ca, 2) * 0.1
      const rimFlare = Math.pow(Math.abs(ca), 0.5) * 3
      bx = cx + ca * BELL_W * rimTuck * sx
      by = cy + sa * BELL_H * sy + rimFlare
    }

    if (i === 0) ctx.moveTo(bx, by)
    else ctx.lineTo(bx, by)
  }
  ctx.closePath()
}

// ── Component ───────────────────────────────────────────────────────────
export function BlobCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const setTextboxOpen = useConfigStore((s) => s.setTextboxOpen)
  const isDragging = useConfigStore((s) => s.isDragging)
  const setIsDragging = useConfigStore((s) => s.setIsDragging)
  const setBlobScreenPos = useConfigStore((s) => s.setBlobScreenPos)
  const isProcessing = useChatStore((s) => s.isProcessing)

  const isPointerDownRef = useRef(false)
  const isDraggingRef = useRef(false)
  const didDragRef = useRef(false)
  const startScreenRef = useRef<{ x: number; y: number } | null>(null)
  const startWindowRef = useRef<{ x: number; y: number } | null>(null)

  // Eye state
  const eyeTargetRef = useRef({ x: 0, y: 0 })
  const eyePosRef = useRef({ x: 0, y: 0 })
  const blinkTimerRef = useRef(0)
  const isBlinkingRef = useRef(false)
  const blinkPhaseRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const w = 90
    const h = 120
    const cx = w / 2
    const cy = 40

    const tents = makeTentacles()
    const organs = makeOrgans()

    // ── Expression tracking ────────────────────────────────────────
    let dragStartTime = 0
    let lastInteractionTime = Date.now()
    let lastMouseTime = Date.now()
    let mouseSpeed = 0
    let mouseNearBlob = false
    let happyCooldown = 0
    let dizzyStars: { angle: number; dist: number; speed: number }[] = []
    let dizzyWobble = 0

    // Track system cursor for eye direction (works even outside window)
    let blobScreenX = 0
    let blobScreenY = 0
    let lastCursorX = 0
    let lastCursorY = 0

    // Get initial blob position
    getWindowPosition().then((wp) => {
      blobScreenX = wp.x + cx
      blobScreenY = wp.y + cy
    }).catch(() => {})

    // Poll system cursor at ~60fps
    const cursorInterval = setInterval(() => {
      Promise.all([getCursorPosition(), getWindowPosition()]).then(([cursor, wp]) => {
        blobScreenX = wp.x + cx
        blobScreenY = wp.y + cy

        const dx = cursor.x - blobScreenX
        const dy = cursor.y - blobScreenY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const maxShift = 3.5
        if (dist > 0) {
          eyeTargetRef.current = {
            x: (dx / dist) * Math.min(maxShift, dist * 0.05),
            y: (dy / dist) * Math.min(maxShift, dist * 0.05),
          }
        }

        // Mouse speed tracking
        const now = Date.now()
        const dt = (now - lastMouseTime) / 1000
        if (dt > 0) {
          const dmx = cursor.x - lastCursorX
          const dmy = cursor.y - lastCursorY
          mouseSpeed = Math.sqrt(dmx * dmx + dmy * dmy) / dt
        }
        lastCursorX = cursor.x
        lastCursorY = cursor.y
        lastMouseTime = now
        lastInteractionTime = now

        // Is mouse near blob?
        mouseNearBlob = dist < 120
      }).catch(() => {})
    }, 16)

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h)
      const t = time / 1000
      const hue = isProcessing ? 270 : isDragging ? 200 : (t * BLOB.HUE_SPEED) % 360

      // ── Expression determination ─────────────────────────────────
      const now = Date.now()
      const idleMs = now - lastInteractionTime
      const dragMs = isDragging ? (dragStartTime === 0 ? 0 : now - dragStartTime) : 0

      // Start drag timer
      if (isDragging && dragStartTime === 0) {
        dragStartTime = now
      }
      if (!isDragging) {
        dragStartTime = 0
      }

      let expression: Expression = 'idle'

      if (isProcessing) {
        expression = 'idle' // processing has its own visual (rings)
      } else if (isDragging) {
        if (dragMs > 2500) {
          expression = 'dizzy'
        } else {
          expression = 'annoyed'
        }
      } else if (idleMs > 8000) {
        expression = 'sleepy'
      } else if (happyCooldown > 0) {
        happyCooldown -= 1 / 60
        expression = 'happy'
      } else if (mouseSpeed > 800 && mouseNearBlob) {
        expression = 'surprised'
      } else if (mouseNearBlob) {
        expression = 'shy'
      }

      // Random happy expression when idle
      if (expression === 'idle' && !isDragging && !isProcessing) {
        if (Math.random() < 0.0008 && happyCooldown <= 0) {
          happyCooldown = 2 + Math.random() * 2
          expression = 'happy'
        }
      }

      // Dizzy stars management
      if (expression === 'dizzy') {
        dizzyWobble = Math.sin(t * 6) * 3
        // Add stars gradually
        if (dizzyStars.length < 5 && Math.random() < 0.05) {
          dizzyStars.push({
            angle: Math.random() * Math.PI * 2,
            dist: 14 + Math.random() * 6,
            speed: 1.5 + Math.random() * 1,
          })
        }
        // Update star angles
        for (const star of dizzyStars) {
          star.angle += star.speed * (1 / 60)
        }
      } else {
        dizzyStars = []
        dizzyWobble *= 0.9
      }

      // ── Pulse ─────────────────────────────────────────────────────
      const pp = t * (Math.PI * 2 / (BLOB.BREATH_PERIOD_MS / 1000))
      const pulse = Math.sin(pp)
      const sx = 1 + pulse * 0.06 + dizzyWobble * 0.01
      const sy = 1 - pulse * 0.08
      const pm = isProcessing ? 2.0 : 1.0

      // ── Eye tracking ──────────────────────────────────────────────
      const ep = eyePosRef.current
      const et = eyeTargetRef.current

      // Dizzy eyes spin instead of tracking
      if (expression === 'dizzy') {
        const spinAngle = t * 3
        eyeTargetRef.current = {
          x: Math.cos(spinAngle) * 2.5,
          y: Math.sin(spinAngle) * 2.5,
        }
      }

      // Shy eyes look toward mouse (but offset slightly)
      if (expression === 'shy') {
        // Keep normal tracking but减弱
        et.x *= 0.6
        et.y *= 0.6
      }

      ep.x += (et.x - ep.x) * 0.08
      ep.y += (et.y - ep.y) * 0.08

      // Blink timer
      blinkTimerRef.current += 1 / 60
      if (!isBlinkingRef.current && blinkTimerRef.current > 2.5 + Math.random() * 3) {
        isBlinkingRef.current = true
        blinkPhaseRef.current = 0
        blinkTimerRef.current = 0
      }
      if (isBlinkingRef.current) {
        blinkPhaseRef.current += 1 / 60
        if (blinkPhaseRef.current > 0.2) {
          isBlinkingRef.current = false
          blinkPhaseRef.current = 0
        }
      }
      const blinkAmount = isBlinkingRef.current
        ? Math.sin((blinkPhaseRef.current / 0.2) * Math.PI)
        : 0

      // Eye squint per expression
      let squint = 0
      if (isProcessing) squint = 0.15
      else if (expression === 'annoyed') squint = 0.12
      else if (expression === 'sleepy') squint = 0.35
      else if (expression === 'shy') squint = 0.05

      // Happy eyes = ^_^ (no blink, just curved)
      const isHappyEyes = expression === 'happy'
      // Surprised = extra wide
      const isSurprised = expression === 'surprised'

      // ── Tentacle physics ──────────────────────────────────────────
      for (const ten of tents) {
        const ax = cx + ten.sx * sx
        const ay = cy + BELL_BASE_Y * sy
        ten.pts[0].x = ax
        ten.pts[0].y = ay

        // Dizzy tentacles go erratic
        const tentAmp = expression === 'dizzy' ? ten.amp * 2.0 : ten.amp
        const tentSpeed = expression === 'dizzy' ? ten.speed * 1.8 : ten.speed

        for (let i = 1; i < ten.pts.length; i++) {
          const p = ten.pts[i]
          const f = i / TENT_SEGS
          const wave = Math.sin(t * tentSpeed * pm + ten.phase + f * 2.8) * tentAmp * f
          const tx = ax + wave
          const ty = ay + f * TENT_LEN
          p.vx += (tx - p.x) * 0.04
          p.vy += (ty - p.y) * 0.04
          p.vx *= ten.damp
          p.vy *= ten.damp
          p.x += p.vx
          p.y += p.vy
        }
      }

      // ── Organ positions ───────────────────────────────────────────
      const organPos = organs.map((o) => ({
        x: cx + o.bx * sx + Math.sin(t * o.speed * 0.4 + o.phase) * 1.2,
        y: cy + o.by * sy + Math.cos(t * o.speed * 0.3 + o.phase) * 0.8,
      }))

      // ══════════════════════════════════════════════════════════════
      // LAYER 1 — Ambient glow (strong, wide)
      // ══════════════════════════════════════════════════════════════
      const glowR = 58
      const gG = ctx.createRadialGradient(cx, cy, 6, cx, cy, glowR)
      gG.addColorStop(0, `hsla(${hue}, 72%, 65%, 0.28)`)
      gG.addColorStop(0.25, `hsla(${hue}, 68%, 58%, 0.14)`)
      gG.addColorStop(0.5, `hsla(${hue}, 60%, 48%, 0.06)`)
      gG.addColorStop(0.75, `hsla(${hue}, 52%, 40%, 0.02)`)
      gG.addColorStop(1, `hsla(${hue}, 45%, 32%, 0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fillStyle = gG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 2 — Tentacles (tapering, flowing)
      // ══════════════════════════════════════════════════════════════
      for (const ten of tents) {
        for (let i = 0; i < ten.pts.length - 1; i++) {
          const f0 = i / (ten.pts.length - 1)
          const f1 = (i + 1) / (ten.pts.length - 1)
          const w0 = ten.width * (1 - f0 * 0.8)
          const a0 = 0.35 * (1 - f0 * 0.75)
          const a1 = 0.35 * (1 - f1 * 0.75)

          ctx.beginPath()
          ctx.moveTo(ten.pts[i].x, ten.pts[i].y)
          ctx.lineTo(ten.pts[i + 1].x, ten.pts[i + 1].y)

          const segG = ctx.createLinearGradient(
            ten.pts[i].x, ten.pts[i].y,
            ten.pts[i + 1].x, ten.pts[i + 1].y,
          )
          segG.addColorStop(0, `hsla(${hue}, 58%, 58%, ${a0})`)
          segG.addColorStop(1, `hsla(${hue + 10}, 52%, 48%, ${a1})`)
          ctx.strokeStyle = segG
          ctx.lineWidth = w0
          ctx.lineCap = 'round'
          ctx.stroke()
        }
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 3 — Bell body (transparent with strong glow center)
      // ══════════════════════════════════════════════════════════════
      traceBell(ctx, cx, cy, sx, sy, t)
      const bG = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy + 2, BELL_H + 6)
      bG.addColorStop(0, `hsla(${hue}, 72%, 88%, ${0.22 + pulse * 0.06})`)
      bG.addColorStop(0.15, `hsla(${hue}, 68%, 75%, 0.28)`)
      bG.addColorStop(0.35, `hsla(${hue}, 62%, 62%, 0.30)`)
      bG.addColorStop(0.55, `hsla(${hue}, 56%, 50%, 0.28)`)
      bG.addColorStop(0.8, `hsla(${hue}, 50%, 40%, 0.24)`)
      bG.addColorStop(1, `hsla(${hue}, 44%, 30%, 0.20)`)
      ctx.fillStyle = bG
      ctx.fill()

      // Bright center glow (drawn inside clipped bell)
      ctx.save()
      traceBell(ctx, cx, cy, sx, sy, t)
      ctx.clip()
      const coreG = ctx.createRadialGradient(cx, cy - 3, 0, cx, cy - 3, BELL_H * 0.65)
      coreG.addColorStop(0, `hsla(${hue + 10}, 78%, 95%, ${0.40 + pulse * 0.12})`)
      coreG.addColorStop(0.3, `hsla(${hue + 5}, 70%, 82%, 0.22)`)
      coreG.addColorStop(0.6, `hsla(${hue}, 60%, 65%, 0.08)`)
      coreG.addColorStop(1, `hsla(${hue}, 50%, 50%, 0)`)
      ctx.fillStyle = coreG
      ctx.fillRect(cx - BELL_W - 5, cy - BELL_H - 5, (BELL_W + 5) * 2, (BELL_H + 5) * 2)
      ctx.restore()

      // ══════════════════════════════════════════════════════════════
      // LAYER 4 — Inner glow + organs (clipped to bell)
      // ══════════════════════════════════════════════════════════════
      ctx.save()
      traceBell(ctx, cx, cy, sx, sy, t)
      ctx.clip()

      // Inner radial glow
      const iG = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy, BELL_H * 0.8)
      iG.addColorStop(0, `hsla(${hue}, 72%, 80%, ${0.18 + (pulse + 1) * 0.06})`)
      iG.addColorStop(0.4, `hsla(${hue}, 62%, 65%, ${0.08})`)
      iG.addColorStop(1, `hsla(${hue}, 50%, 50%, 0)`)
      ctx.fillStyle = iG
      ctx.fillRect(0, 0, w, h)

      // Organs with halos
      for (let i = 0; i < organs.length; i++) {
        const o = organs[i]
        const pos = organPos[i]
        const op = Math.sin(t * o.speed + o.phase) * 0.3 + 0.7
        const ob = o.bright * op * (isProcessing ? 1.5 : 1.0)

        // Halo (stronger)
        const ohG = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, o.size * 2.8)
        ohG.addColorStop(0, `hsla(${hue + 30}, 72%, 78%, ${0.16 * ob})`)
        ohG.addColorStop(0.4, `hsla(${hue + 20}, 62%, 62%, ${0.06 * ob})`)
        ohG.addColorStop(1, `hsla(${hue + 10}, 50%, 48%, 0)`)
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, o.size * 2.8, 0, Math.PI * 2)
        ctx.fillStyle = ohG
        ctx.fill()

        // Core (brighter)
        const oG = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, o.size)
        oG.addColorStop(0, `hsla(${hue + 25}, 78%, 85%, ${0.45 * ob})`)
        oG.addColorStop(0.4, `hsla(${hue + 15}, 68%, 70%, ${0.20 * ob})`)
        oG.addColorStop(1, `hsla(${hue + 5}, 55%, 50%, 0)`)
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, o.size, 0, Math.PI * 2)
        ctx.fillStyle = oG
        ctx.fill()
      }

      ctx.restore()

      // ══════════════════════════════════════════════════════════════
      // LAYER 5 — Bell membrane (subtle edge stroke)
      // ══════════════════════════════════════════════════════════════
      traceBell(ctx, cx, cy, sx, sy, t)
      const mG = ctx.createLinearGradient(cx - BELL_W, cy - BELL_H, cx + BELL_W, cy + BELL_H * 0.5)
      mG.addColorStop(0, `hsla(${hue}, 62%, 68%, 0.12)`)
      mG.addColorStop(0.5, `hsla(${hue}, 55%, 55%, 0.08)`)
      mG.addColorStop(1, `hsla(${hue}, 50%, 50%, 0.04)`)
      ctx.strokeStyle = mG
      ctx.lineWidth = 1.0
      ctx.stroke()

      // ══════════════════════════════════════════════════════════════
      // LAYER 6 — EYES (full black, expressive)
      // ══════════════════════════════════════════════════════════════
      const eyeSpacing = 9
      const eyeY = cy - 2
      const eyeRadius = 5.5
      const eyeH = eyeRadius * (1 - squint) * (1 - blinkAmount)
      const eyeW = eyeRadius * (isSurprised ? 1.2 : 1)

      for (let side = -1; side <= 1; side += 2) {
        const ex = cx + side * eyeSpacing * sx
        const ey = eyeY

        if (isHappyEyes) {
          // Happy eyes: draw upward arc (^_^ style)
          ctx.beginPath()
          ctx.arc(ex, ey + 1, eyeRadius * 0.7, Math.PI + 0.4, -0.4)
          ctx.strokeStyle = `hsla(0, 0%, 5%, 0.90)`
          ctx.lineWidth = 2.2
          ctx.lineCap = 'round'
          ctx.stroke()
        } else {
          // Shift entire eye toward cursor
          const trackX = ep.x * 1.2
          const trackY = ep.y * 1.2
          const pupilX = ex + trackX
          const pupilY = ey + trackY

          // Full black eye (shifted toward cursor)
          ctx.beginPath()
          ctx.ellipse(pupilX, pupilY, eyeW, eyeH, 0, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(0, 0%, 3%, 0.95)`
          ctx.fill()

          // Subtle iris ring (shifted with tracking, slightly less)
          const irisX = ex + trackX * 0.7
          const irisY = ey + trackY * 0.7
          const irisR = eyeW * 0.65
          ctx.beginPath()
          ctx.arc(irisX, irisY, irisR, 0, Math.PI * 2)
          ctx.strokeStyle = `hsla(${hue + 20}, 30%, 18%, 0.35)`
          ctx.lineWidth = 1.0
          ctx.stroke()

          // Specular highlight (top-right, follows eye slightly less)
          const shX = pupilX + 2 - trackX * 0.2
          const shY = pupilY - 2 - trackY * 0.2
          const shG = ctx.createRadialGradient(shX, shY, 0, shX, shY, 2.2)
          shG.addColorStop(0, `hsla(0, 0%, 100%, ${0.70 * (1 - blinkAmount)})`)
          shG.addColorStop(0.5, `hsla(0, 0%, 100%, ${0.25 * (1 - blinkAmount)})`)
          shG.addColorStop(1, `hsla(0, 0%, 100%, 0)`)
          ctx.beginPath()
          ctx.arc(shX, shY, 2.2, 0, Math.PI * 2)
          ctx.fillStyle = shG
          ctx.fill()

          // Secondary specular (smaller, bottom-left)
          const sh2X = pupilX - 1.5 - trackX * 0.15
          const sh2Y = pupilY + 1.5 - trackY * 0.15
          ctx.beginPath()
          ctx.arc(sh2X, sh2Y, 1.0, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(0, 0%, 100%, ${0.25 * (1 - blinkAmount)})`
          ctx.fill()
        }
      }

      // ── Expression overlays ─────────────────────────────────────

      // Annoyed eyebrows (when dragging, before dizzy)
      if (expression === 'annoyed') {
        const browY = eyeY - eyeH - 3.5
        const browLen = 5
        const browAngle = 0.35
        ctx.lineWidth = 1.6
        ctx.lineCap = 'round'
        ctx.strokeStyle = `hsla(0, 0%, 10%, 0.7)`

        const lbx = cx - eyeSpacing * sx
        ctx.beginPath()
        ctx.moveTo(lbx - browLen * Math.cos(browAngle), browY - browLen * Math.sin(browAngle))
        ctx.lineTo(lbx + browLen * Math.cos(browAngle), browY + browLen * Math.sin(browAngle))
        ctx.stroke()

        const rbx = cx + eyeSpacing * sx
        ctx.beginPath()
        ctx.moveTo(rbx + browLen * Math.cos(browAngle), browY - browLen * Math.sin(browAngle))
        ctx.lineTo(rbx - browLen * Math.cos(browAngle), browY + browLen * Math.sin(browAngle))
        ctx.stroke()
      }

      // Dizzy: spiral eyes + orbiting stars
      if (expression === 'dizzy') {
        // Draw spirals over the eyes
        for (let side = -1; side <= 1; side += 2) {
          const ex = cx + side * eyeSpacing * sx
          const ey = eyeY
          ctx.save()
          ctx.translate(ex, ey)
          ctx.rotate(t * 4)
          ctx.beginPath()
          for (let s = 0; s < 20; s++) {
            const sa = (s / 20) * Math.PI * 4
            const sr = (s / 20) * 3.5
            const sx2 = Math.cos(sa) * sr
            const sy2 = Math.sin(sa) * sr
            if (s === 0) ctx.moveTo(sx2, sy2)
            else ctx.lineTo(sx2, sy2)
          }
          ctx.strokeStyle = `hsla(0, 0%, 95%, 0.7)`
          ctx.lineWidth = 1.2
          ctx.stroke()
          ctx.restore()
        }

        // Orbiting stars
        for (const star of dizzyStars) {
          const starX = cx + Math.cos(star.angle) * star.dist * sx
          const starY = cy - 6 + Math.sin(star.angle) * star.dist * 0.4
          const starSize = 1.5 + Math.sin(t * 8 + star.angle) * 0.5
          ctx.fillStyle = `hsla(50, 90%, 75%, 0.8)`
          // Draw 4-point star
          ctx.beginPath()
          for (let p = 0; p < 4; p++) {
            const pa = (p / 4) * Math.PI * 2 - Math.PI / 2
            const outerX = starX + Math.cos(pa) * starSize
            const outerY = starY + Math.sin(pa) * starSize
            const innerPa = pa + Math.PI / 4
            const innerX = starX + Math.cos(innerPa) * starSize * 0.3
            const innerY = starY + Math.sin(innerPa) * starSize * 0.3
            if (p === 0) ctx.moveTo(outerX, outerY)
            else ctx.lineTo(outerX, outerY)
            ctx.lineTo(innerX, innerY)
          }
          ctx.closePath()
          ctx.fill()
        }
      }

      // Sleepy: droopy eyes + floating zzz
      if (expression === 'sleepy') {
        // Draw half-lidded overlay (droopy top eyelid)
        for (let side = -1; side <= 1; side += 2) {
          const ex = cx + side * eyeSpacing * sx
          const ey = eyeY
          ctx.save()
          ctx.beginPath()
          ctx.ellipse(ex, ey - eyeH * 0.3, eyeRadius + 1, eyeH * 0.6, 0, 0, Math.PI)
          ctx.fillStyle = `hsla(0, 0%, 3%, 0.5)`
          ctx.fill()
          ctx.restore()
        }

        // Floating zzz
        const zzz = ['z', 'Z', 'z']
        for (let i = 0; i < 3; i++) {
          const zt = (t * 0.8 + i * 0.7) % 3
          const zx = cx + 16 + i * 4 + Math.sin(zt * 2) * 2
          const zy = cy - 10 - zt * 8
          const za = Math.max(0, 1 - zt / 3)
          const zSize = 5 + i * 1.5
          ctx.font = `bold ${zSize}px sans-serif`
          ctx.fillStyle = `hsla(${hue}, 40%, 80%, ${za * 0.6})`
          ctx.fillText(zzz[i], zx, zy)
        }
      }

      // Surprised: small "o" mouth
      if (expression === 'surprised') {
        ctx.beginPath()
        ctx.arc(cx, cy + 8, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(0, 0%, 5%, 0.6)`
        ctx.fill()
      }

      // Shy: slight blush marks
      if (expression === 'shy') {
        for (let side = -1; side <= 1; side += 2) {
          const bx = cx + side * (eyeSpacing + 5) * sx
          const by = eyeY + 4
          const blushG = ctx.createRadialGradient(bx, by, 0, bx, by, 4)
          blushG.addColorStop(0, `hsla(${hue + 340}, 60%, 60%, 0.25)`)
          blushG.addColorStop(1, `hsla(${hue + 340}, 50%, 55%, 0)`)
          ctx.beginPath()
          ctx.arc(bx, by, 4, 0, Math.PI * 2)
          ctx.fillStyle = blushG
          ctx.fill()
        }
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 7 — Specular highlight on bell
      // ══════════════════════════════════════════════════════════════
      const spX = cx - 8
      const spY = cy - BELL_H * 0.55
      const spG = ctx.createRadialGradient(spX, spY, 0, spX, spY, 9)
      spG.addColorStop(0, `hsla(${hue}, 30%, 98%, 0.50)`)
      spG.addColorStop(0.3, `hsla(${hue}, 40%, 92%, 0.22)`)
      spG.addColorStop(0.6, `hsla(${hue}, 45%, 85%, 0.08)`)
      spG.addColorStop(1, `hsla(${hue}, 50%, 80%, 0)`)
      ctx.beginPath()
      ctx.ellipse(spX, spY, 9, 4.5, -0.2, 0, Math.PI * 2)
      ctx.fillStyle = spG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 8 — Processing rings
      // ══════════════════════════════════════════════════════════════
      if (isProcessing) {
        const pp2 = Math.sin(t * 4) * 0.3 + 0.7

        ctx.beginPath()
        ctx.arc(cx, cy - 2, BELL_W + 4, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hue}, 72%, 65%, ${0.12 * pp2})`
        ctx.lineWidth = 1.5
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(cx, cy - 2, BELL_W + 8, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hue}, 62%, 55%, ${0.05 * pp2})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // ── Hue sync ──────────────────────────────────────────────────
      localStorage.setItem('blob-hue', String(Math.round(hue)))

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(cursorInterval)
    }
  }, [isProcessing, isDragging])

  // ── Interaction ──────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    isPointerDownRef.current = true
    isDraggingRef.current = false
    didDragRef.current = false
    startScreenRef.current = { x: e.screenX, y: e.screenY }

    getWindowPosition().then((wp) => {
      startWindowRef.current = wp
      setBlobScreenPos({ x: wp.x + 45, y: wp.y + 60 })
    }).catch(() => {})

    const onMove = (me: MouseEvent) => {
      if (!isPointerDownRef.current || !startScreenRef.current || !startWindowRef.current) return
      const dx = me.screenX - startScreenRef.current.x
      const dy = me.screenY - startScreenRef.current.y
      if (!isDraggingRef.current) {
        if (Math.sqrt(dx * dx + dy * dy) <= DRAG_THRESHOLD) return
        isDraggingRef.current = true
        didDragRef.current = true
        setIsDragging(true)
      }
      const nx = startWindowRef.current.x + dx
      const ny = startWindowRef.current.y + dy
      setWindowPosition(nx, ny).catch(() => {})
      setBlobScreenPos({ x: nx + 45, y: ny + 60 })

      if (useConfigStore.getState().textboxOpen) {
        getScreenInfo().then((sc) => {
          let chatX = Math.max(sc.x, Math.min(nx + 45 - CHAT_W * 0.5, sc.x + sc.width - CHAT_W))
          let chatY = Math.max(sc.y, Math.min(ny + BLOB.SIZE + 10, sc.y + sc.height - CHAT_H_EXPANDED))
          setChatWindowPosition(chatX, chatY).catch(() => {})
        }).catch(() => {})
      }
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      if (!isPointerDownRef.current) return
      isPointerDownRef.current = false

      if (!didDragRef.current) {
        const open = useConfigStore.getState().textboxOpen
        if (open) {
          setTextboxOpen(false)
          hideChatWindow().catch(() => {})
        } else {
          Promise.all([getWindowPosition(), getScreenInfo()]).then(([wp, sc]) => {
            let chatX = Math.max(sc.x, Math.min(wp.x + 45 - CHAT_W * 0.5, sc.x + sc.width - CHAT_W))
            let chatY = Math.max(sc.y, Math.min(wp.y + BLOB.SIZE + 10, sc.y + sc.height - CHAT_H_COLLAPSED))
            setBlobScreenPos({ x: wp.x + 45, y: wp.y + BLOB.SIZE - 60 })
            setTextboxOpen(true)
            showChatWindow(chatX, chatY).catch(() => {})
          }).catch(() => {})
        }
      }

      isDraggingRef.current = false
      didDragRef.current = false
      startScreenRef.current = null
      startWindowRef.current = null
      setIsDragging(false)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [setIsDragging, setTextboxOpen, setBlobScreenPos])

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={90}
      height={120}
      className="fixed z-20 cursor-grab active:cursor-grabbing"
      style={{
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        touchAction: 'none',
        backgroundColor: 'transparent',
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    />
  )
}
