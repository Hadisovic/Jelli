import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'
import { getWindowPosition, setWindowPosition, showChatWindow, hideChatWindow, getScreenSize, setChatWindowPosition } from '@/lib/api'

const DRAG_THRESHOLD = 6
const CHAT_W = 360
const CHAT_H_COLLAPSED = 56
const CHAT_H_EXPANDED = 250

// ── Jellyfish anatomy ────────────────────────────────────────────────────
const BELL_SEGS = 80
const BELL_W = 32
const BELL_H = 24
const BELL_BASE_Y = 38
const TENT_COUNT = 4
const TENT_SEGS = 12
const TENT_LEN = 32
const ORGAN_COUNT = 5

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
    const spread = 14
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
      width: 2.8 + Math.random() * 1.5,
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
  const screenSizeRef = useRef<{ width: number; height: number } | null>(null)

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

    // Track mouse for eye direction
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left - cx
      const my = e.clientY - rect.top - cy
      const dist = Math.sqrt(mx * mx + my * my)
      const maxShift = 3.5
      if (dist > 0) {
        eyeTargetRef.current = {
          x: (mx / dist) * Math.min(maxShift, dist * 0.05),
          y: (my / dist) * Math.min(maxShift, dist * 0.05),
        }
      }
    }
    window.addEventListener('mousemove', onMouseMove)

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h)
      const t = time / 1000
      const hue = isProcessing ? 270 : isDragging ? 200 : (t * BLOB.HUE_SPEED) % 360

      // ── Pulse ─────────────────────────────────────────────────────
      const pp = t * (Math.PI * 2 / (BLOB.BREATH_PERIOD_MS / 1000))
      const pulse = Math.sin(pp)
      const sx = 1 + pulse * 0.06
      const sy = 1 - pulse * 0.08
      const pm = isProcessing ? 2.0 : 1.0

      // ── Eye tracking ──────────────────────────────────────────────
      const ep = eyePosRef.current
      const et = eyeTargetRef.current
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

      // Eye squint (processing = focused, idle = relaxed)
      const squint = isProcessing ? 0.15 : 0

      // ── Tentacle physics ──────────────────────────────────────────
      for (const ten of tents) {
        const ax = cx + ten.sx * sx
        const ay = cy + BELL_BASE_Y * sy
        ten.pts[0].x = ax
        ten.pts[0].y = ay

        for (let i = 1; i < ten.pts.length; i++) {
          const p = ten.pts[i]
          const f = i / TENT_SEGS
          const wave = Math.sin(t * ten.speed * pm + ten.phase + f * 2.8) * ten.amp * f
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
      // LAYER 1 — Ambient glow
      // ══════════════════════════════════════════════════════════════
      const glowR = 52
      const gG = ctx.createRadialGradient(cx, cy, 8, cx, cy, glowR)
      gG.addColorStop(0, `hsla(${hue}, 68%, 60%, 0.16)`)
      gG.addColorStop(0.35, `hsla(${hue}, 62%, 52%, 0.07)`)
      gG.addColorStop(0.65, `hsla(${hue}, 55%, 44%, 0.02)`)
      gG.addColorStop(1, `hsla(${hue}, 48%, 35%, 0)`)
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
          const w1 = ten.width * (1 - f1 * 0.8)
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
      // LAYER 3 — Bell body (translucent dome)
      // ══════════════════════════════════════════════════════════════
      traceBell(ctx, cx, cy, sx, sy, t)
      const bG = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy + 2, BELL_H + 6)
      bG.addColorStop(0, `hsla(${hue}, 58%, 66%, 0.16)`)
      bG.addColorStop(0.25, `hsla(${hue}, 62%, 56%, 0.26)`)
      bG.addColorStop(0.55, `hsla(${hue}, 56%, 46%, 0.34)`)
      bG.addColorStop(0.8, `hsla(${hue}, 50%, 38%, 0.40)`)
      bG.addColorStop(1, `hsla(${hue}, 44%, 28%, 0.46)`)
      ctx.fillStyle = bG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 4 — Inner glow + organs (clipped to bell)
      // ══════════════════════════════════════════════════════════════
      ctx.save()
      traceBell(ctx, cx, cy, sx, sy, t)
      ctx.clip()

      // Inner radial glow
      const iG = ctx.createRadialGradient(cx, cy - 2, 0, cx, cy, BELL_H * 0.8)
      iG.addColorStop(0, `hsla(${hue}, 68%, 75%, ${0.12 + (pulse + 1) * 0.04})`)
      iG.addColorStop(0.5, `hsla(${hue}, 58%, 60%, ${0.05})`)
      iG.addColorStop(1, `hsla(${hue}, 48%, 45%, 0)`)
      ctx.fillStyle = iG
      ctx.fillRect(0, 0, w, h)

      // Organs with halos
      for (let i = 0; i < organs.length; i++) {
        const o = organs[i]
        const pos = organPos[i]
        const op = Math.sin(t * o.speed + o.phase) * 0.3 + 0.7
        const ob = o.bright * op * (isProcessing ? 1.5 : 1.0)

        // Halo
        const ohG = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, o.size * 2.5)
        ohG.addColorStop(0, `hsla(${hue + 30}, 68%, 72%, ${0.10 * ob})`)
        ohG.addColorStop(0.5, `hsla(${hue + 20}, 58%, 58%, ${0.03 * ob})`)
        ohG.addColorStop(1, `hsla(${hue + 10}, 48%, 45%, 0)`)
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, o.size * 2.5, 0, Math.PI * 2)
        ctx.fillStyle = ohG
        ctx.fill()

        // Core
        const oG = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, o.size)
        oG.addColorStop(0, `hsla(${hue + 25}, 75%, 80%, ${0.35 * ob})`)
        oG.addColorStop(0.5, `hsla(${hue + 15}, 65%, 65%, ${0.15 * ob})`)
        oG.addColorStop(1, `hsla(${hue + 5}, 55%, 50%, 0)`)
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, o.size, 0, Math.PI * 2)
        ctx.fillStyle = oG
        ctx.fill()
      }

      ctx.restore()

      // ══════════════════════════════════════════════════════════════
      // LAYER 5 — Bell membrane (edge stroke)
      // ══════════════════════════════════════════════════════════════
      traceBell(ctx, cx, cy, sx, sy, t)
      const mG = ctx.createLinearGradient(cx - BELL_W, cy - BELL_H, cx + BELL_W, cy + BELL_H * 0.5)
      mG.addColorStop(0, `hsla(${hue}, 60%, 62%, 0.18)`)
      mG.addColorStop(0.5, `hsla(${hue}, 55%, 52%, 0.12)`)
      mG.addColorStop(1, `hsla(${hue}, 50%, 48%, 0.06)`)
      ctx.strokeStyle = mG
      ctx.lineWidth = 1.2
      ctx.stroke()

      // ══════════════════════════════════════════════════════════════
      // LAYER 6 — EYES (the character)
      // ══════════════════════════════════════════════════════════════
      const eyeSpacing = 9
      const eyeY = cy - 2
      const eyeRadius = 5.5
      const pupilRadius = 2.8
      const irisRadius = 3.8

      for (let side = -1; side <= 1; side += 2) {
        const ex = cx + side * eyeSpacing * sx
        const ey = eyeY

        // Eye white (slightly translucent)
        const eyeG = ctx.createRadialGradient(ex, ey, 0, ex, ey, eyeRadius)
        eyeG.addColorStop(0, `hsla(${hue + 20}, 15%, 95%, 0.85)`)
        eyeG.addColorStop(0.7, `hsla(${hue + 10}, 20%, 90%, 0.80)`)
        eyeG.addColorStop(1, `hsla(${hue}, 25%, 82%, 0.70)`)
        ctx.beginPath()
        ctx.ellipse(ex, ey, eyeRadius, eyeRadius * (1 - squint) * (1 - blinkAmount), 0, 0, Math.PI * 2)
        ctx.fillStyle = eyeG
        ctx.fill()

        // Eye rim
        ctx.beginPath()
        ctx.ellipse(ex, ey, eyeRadius, eyeRadius * (1 - squint) * (1 - blinkAmount), 0, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hue}, 40%, 40%, 0.25)`
        ctx.lineWidth = 0.6
        ctx.stroke()

        // Iris (colored, tracks movement)
        const irisX = ex + ep.x
        const irisY = ey + ep.y
        const iG = ctx.createRadialGradient(irisX, irisY, 0, irisX, irisY, irisRadius)
        iG.addColorStop(0, `hsla(${hue + 40}, 50%, 40%, 0.9)`)
        iG.addColorStop(0.5, `hsla(${hue + 20}, 55%, 32%, 0.92)`)
        iG.addColorStop(1, `hsla(${hue}, 60%, 22%, 0.95)`)
        ctx.beginPath()
        ctx.arc(irisX, irisY, irisRadius * (1 - blinkAmount * 0.8), 0, Math.PI * 2)
        ctx.fillStyle = iG
        ctx.fill()

        // Pupil (dark center)
        ctx.beginPath()
        ctx.arc(irisX, irisY, pupilRadius * (1 - blinkAmount * 0.7), 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${hue}, 30%, 8%, 0.95)`
        ctx.fill()

        // Pupil dilation (processing = smaller, idle = larger)
        const pupilDilated = isProcessing ? 0.7 : 1.0
        ctx.beginPath()
        ctx.arc(irisX, irisY, pupilRadius * pupilDilated * (1 - blinkAmount * 0.7), 0, Math.PI * 2)
        ctx.fillStyle = `hsla(0, 0%, 5%, 0.98)`
        ctx.fill()

        // Specular highlight (top-right of eye)
        const shX = ex + 2 + ep.x * 0.3
        const shY = ey - 2 + ep.y * 0.3
        const shG = ctx.createRadialGradient(shX, shY, 0, shX, shY, 2.2)
        shG.addColorStop(0, `hsla(0, 0%, 100%, ${0.75 * (1 - blinkAmount)})`)
        shG.addColorStop(0.5, `hsla(0, 0%, 100%, ${0.30 * (1 - blinkAmount)})`)
        shG.addColorStop(1, `hsla(0, 0%, 100%, 0)`)
        ctx.beginPath()
        ctx.arc(shX, shY, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = shG
        ctx.fill()

        // Secondary specular (smaller, bottom-left)
        const sh2X = ex - 1.5 + ep.x * 0.2
        const sh2Y = ey + 1.5 + ep.y * 0.2
        ctx.beginPath()
        ctx.arc(sh2X, sh2Y, 1.0, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(0, 0%, 100%, ${0.30 * (1 - blinkAmount)})`
        ctx.fill()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 7 — Specular highlight on bell
      // ══════════════════════════════════════════════════════════════
      const spX = cx - 8
      const spY = cy - BELL_H * 0.55
      const spG = ctx.createRadialGradient(spX, spY, 0, spX, spY, 8)
      spG.addColorStop(0, `hsla(${hue}, 30%, 95%, 0.40)`)
      spG.addColorStop(0.4, `hsla(${hue}, 40%, 88%, 0.15)`)
      spG.addColorStop(1, `hsla(${hue}, 50%, 80%, 0)`)
      ctx.beginPath()
      ctx.ellipse(spX, spY, 8, 4, -0.2, 0, Math.PI * 2)
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
      window.removeEventListener('mousemove', onMouseMove)
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

    getScreenSize().then((s) => { screenSizeRef.current = s }).catch(() => {})
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
        const sc = screenSizeRef.current || { width: 1920, height: 1080 }
        let chatX = Math.max(0, Math.min(nx + 45 - CHAT_W * 0.5, sc.width - CHAT_W))
        let chatY = Math.max(0, Math.min(ny + BLOB.SIZE + 10, sc.height - CHAT_H_EXPANDED))
        setChatWindowPosition(chatX, chatY).catch(() => {})
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
          Promise.all([getWindowPosition(), getScreenSize()]).then(([wp, sc]) => {
            let chatX = Math.max(0, Math.min(wp.x + 45 - CHAT_W * 0.5, sc.width - CHAT_W))
            let chatY = Math.max(0, Math.min(wp.y + BLOB.SIZE + 10, sc.height - CHAT_H_COLLAPSED))
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
      screenSizeRef.current = null
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
