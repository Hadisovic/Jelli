import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'
import { getWindowPosition, setWindowPosition, showChatWindow, hideChatWindow, getScreenSize, setChatWindowPosition } from '@/lib/api'

const DRAG_THRESHOLD = 6
const CHAT_W = 360
const CHAT_H_COLLAPSED = 56
const CHAT_H_EXPANDED = 250

// ── Ink anatomy ──────────────────────────────────────────────────────────
const BLOB_POINTS = 64
const BASE_RADIUS = 30
const BLEED_LAYERS = 6
const DRIP_COUNT = 5
const BRUSH_COUNT = 4
const BRUSH_SEGS = 10

// ── Ink blob surface ─────────────────────────────────────────────────────
interface SurfacePoint {
  angle: number
  r: number
  vr: number
  targetR: number
}

function makeSurface(): SurfacePoint[] {
  return Array.from({ length: BLOB_POINTS }, (_, i) => {
    const angle = (i / BLOB_POINTS) * Math.PI * 2
    return { angle, r: BASE_RADIUS, vr: 0, targetR: BASE_RADIUS }
  })
}

function updateSurface(pts: SurfacePoint[], t: number, isProcessing: boolean) {
  const chaos = isProcessing ? 1.8 : 1.0
  for (const p of pts) {
    const n1 = Math.sin(p.angle * 2 + t * 0.5) * 2.5
    const n2 = Math.cos(p.angle * 3 - t * 0.4) * 1.8
    const n3 = Math.sin(p.angle * 5 + t * 0.7) * 1.0
    const n4 = Math.cos(p.angle * 7 - t * 0.6) * 0.5
    // Organic bleeding tendrils at the edge
    const bleed = Math.sin(p.angle * 11 + t * 1.2) * 1.5 * chaos
    p.targetR = BASE_RADIUS + (n1 + n2 + n3 + n4 + bleed) * chaos
    p.vr += (p.targetR - p.r) * 0.06
    p.vr *= 0.85
    p.r += p.vr
  }
}

function traceSurface(
  ctx: CanvasRenderingContext2D,
  pts: SurfacePoint[],
  cx: number,
  cy: number,
) {
  ctx.beginPath()
  for (let i = 0; i <= pts.length; i++) {
    const curr = pts[i % pts.length]
    const next = pts[(i + 1) % pts.length]
    const prev = pts[(i - 1 + pts.length) % pts.length]
    const x = cx + Math.cos(curr.angle) * curr.r
    const y = cy + Math.sin(curr.angle) * curr.r
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      const cpx1 = x + (Math.cos(curr.angle) - Math.cos(prev.angle)) * curr.r * 0.2
      const cpy1 = y + (Math.sin(curr.angle) - Math.sin(prev.angle)) * curr.r * 0.2
      const cpx2 = x - (Math.cos(next.angle) - Math.cos(curr.angle)) * curr.r * 0.2
      const cpy2 = y - (Math.sin(next.angle) - Math.sin(curr.angle)) * curr.r * 0.2
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, x, y)
    }
  }
  ctx.closePath()
}

// ── Ink drips ────────────────────────────────────────────────────────────
interface Drip {
  x: number; y: number
  vy: number
  size: number
  life: number; maxLife: number
  opacity: number
}

function makeDrip(cx: number, cy: number, surface: SurfacePoint[]): Drip {
  const angle = Math.random() * Math.PI * 2
  const pt = surface[Math.floor((angle / (Math.PI * 2)) * BLOB_POINTS) % BLOB_POINTS]
  const r = pt ? pt.r : BASE_RADIUS
  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
    vy: 0.3 + Math.random() * 0.6,
    size: 1.0 + Math.random() * 2.0,
    life: 0,
    maxLife: 1.5 + Math.random() * 2.0,
    opacity: 0.5 + Math.random() * 0.3,
  }
}

// ── Brush strokes (calligraphic) ────────────────────────────────────────
interface BrushSeg { x: number; y: number }
interface BrushStroke {
  segs: BrushSeg[]
  life: number; maxLife: number
  width: number
}

function makeBrush(cx: number, cy: number): BrushStroke {
  const startAngle = Math.random() * Math.PI * 2
  const startR = BASE_RADIUS * 0.3 + Math.random() * BASE_RADIUS * 0.3
  const segs: BrushSeg[] = []
  let x = cx + Math.cos(startAngle) * startR
  let y = cy + Math.sin(startAngle) * startR
  let a = startAngle + (Math.random() - 0.5) * 1.5

  for (let i = 0; i < BRUSH_SEGS; i++) {
    segs.push({ x, y })
    a += (Math.random() - 0.5) * 0.8
    const step = 2 + Math.random() * 3
    x += Math.cos(a) * step
    y += Math.sin(a) * step
  }

  return {
    segs,
    life: 0,
    maxLife: 0.6 + Math.random() * 1.2,
    width: 1 + Math.random() * 2.5,
  }
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2

    const surface = makeSurface()
    const drips: Drip[] = []
    const brushes: BrushStroke[] = []
    let dripTimer = 0
    let brushTimer = 0

    // Paper grain texture (pre-rendered)
    const grainCanvas = document.createElement('canvas')
    grainCanvas.width = w
    grainCanvas.height = h
    const gCtx = grainCanvas.getContext('2d')!
    const grainData = gCtx.createImageData(w, h)
    for (let i = 0; i < grainData.data.length; i += 4) {
      const v = Math.random() * 25
      grainData.data[i] = v
      grainData.data[i + 1] = v
      grainData.data[i + 2] = v
      grainData.data[i + 3] = 12
    }
    gCtx.putImageData(grainData, 0, 0)

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h)
      const t = time / 1000

      // ── Pulse ─────────────────────────────────────────────────────
      const pp = t * (Math.PI * 2 / (BLOB.BREATH_PERIOD_MS / 1000))
      const pulse = Math.sin(pp)
      const pI = (pulse + 1) * 0.5

      // ── Surface morphing ──────────────────────────────────────────
      updateSurface(surface, t, isProcessing)

      // ══════════════════════════════════════════════════════════════
      // LAYER 1 — Paper grain texture
      // ══════════════════════════════════════════════════════════════
      ctx.drawImage(grainCanvas, 0, 0)

      // ══════════════════════════════════════════════════════════════
      // LAYER 2 — Bleeding ink (soft diffused edges)
      // ══════════════════════════════════════════════════════════════
      for (let layer = BLEED_LAYERS; layer >= 1; layer--) {
        const f = layer / BLEED_LAYERS
        const expandR = f * 8
        const alpha = 0.04 * (1 - f * 0.6)

        ctx.save()
        ctx.filter = `blur(${f * 3}px)`
        traceSurface(ctx, surface, cx, cy)
        ctx.scale(1 + f * 0.06, 1 + f * 0.06)
        ctx.translate(-cx * f * 0.06, -cy * f * 0.06)
        ctx.fillStyle = `rgba(15, 12, 8, ${alpha})`
        ctx.fill()
        ctx.restore()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 3 — Ink drips (falling droplets)
      // ══════════════════════════════════════════════════════════════
      dripTimer += 1 / 60
      if (dripTimer > 0.4 && drips.length < DRIP_COUNT) {
        drips.push(makeDrip(cx, cy, surface))
        dripTimer = 0
      }

      for (let d = drips.length - 1; d >= 0; d--) {
        const drip = drips[d]
        drip.life += 1 / 60
        drip.y += drip.vy
        drip.vy += 0.02 // gravity
        drip.size *= 0.998 // shrink

        if (drip.life >= drip.maxLife || drip.size < 0.2) {
          drips.splice(d, 1)
          continue
        }

        const lifeFrac = drip.life / drip.maxLife
        const alpha = drip.opacity * (1 - lifeFrac)

        // Drip body
        const dG = ctx.createRadialGradient(drip.x, drip.y, 0, drip.x, drip.y, drip.size)
        dG.addColorStop(0, `rgba(15, 12, 8, ${alpha * 0.9})`)
        dG.addColorStop(0.5, `rgba(20, 16, 10, ${alpha * 0.5})`)
        dG.addColorStop(1, `rgba(25, 20, 12, 0)`)
        ctx.beginPath()
        ctx.arc(drip.x, drip.y, drip.size, 0, Math.PI * 2)
        ctx.fillStyle = dG
        ctx.fill()

        // Drip trail
        ctx.beginPath()
        ctx.moveTo(drip.x, drip.y - drip.size * 2)
        ctx.lineTo(drip.x, drip.y)
        ctx.strokeStyle = `rgba(15, 12, 8, ${alpha * 0.3})`
        ctx.lineWidth = drip.size * 0.4
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 4 — Calligraphic brush strokes (processing)
      // ══════════════════════════════════════════════════════════════
      if (isProcessing) {
        brushTimer += 1 / 60
        if (brushTimer > 0.25 && brushes.length < BRUSH_COUNT) {
          brushes.push(makeBrush(cx, cy))
          brushTimer = 0
        }
      }

      for (let b = brushes.length - 1; b >= 0; b--) {
        const brush = brushes[b]
        brush.life += 1 / 60
        if (brush.life >= brush.maxLife) {
          brushes.splice(b, 1)
          continue
        }

        const lifeFrac = brush.life / brush.maxLife
        const alpha = lifeFrac < 0.15 ? lifeFrac / 0.15 : 1 - (lifeFrac - 0.15) / 0.85

        // Calligraphic stroke — pressure varies along the path
        for (let i = 0; i < brush.segs.length - 1; i++) {
          const f0 = i / (brush.segs.length - 1)
          const f1 = (i + 1) / (brush.segs.length - 1)
          // Pressure: thick in middle, thin at ends (like a brush)
          const pressure0 = Math.sin(f0 * Math.PI) * 0.8 + 0.2
          const pressure1 = Math.sin(f1 * Math.PI) * 0.8 + 0.2
          const w0 = brush.width * pressure0
          const w1 = brush.width * pressure1

          ctx.beginPath()
          ctx.moveTo(brush.segs[i].x, brush.segs[i].y)
          ctx.lineTo(brush.segs[i + 1].x, brush.segs[i + 1].y)
          ctx.strokeStyle = `rgba(15, 12, 8, ${0.7 * alpha})`
          ctx.lineWidth = w0
          ctx.lineCap = 'round'
          ctx.stroke()
        }

        // Glow around stroke
        ctx.beginPath()
        ctx.moveTo(brush.segs[0].x, brush.segs[0].y)
        for (let i = 1; i < brush.segs.length; i++) {
          ctx.lineTo(brush.segs[i].x, brush.segs[i].y)
        }
        ctx.strokeStyle = `rgba(40, 30, 20, ${0.12 * alpha})`
        ctx.lineWidth = brush.width * 4
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 5 — Ink body (main blob)
      // ══════════════════════════════════════════════════════════════
      traceSurface(ctx, surface, cx, cy)
      const bodyG = ctx.createRadialGradient(cx - 4, cy - 4, 0, cx, cy, BASE_RADIUS + 4)
      bodyG.addColorStop(0, `rgba(35, 28, 18, 0.92)`)
      bodyG.addColorStop(0.3, `rgba(22, 18, 10, 0.95)`)
      bodyG.addColorStop(0.7, `rgba(12, 10, 5, 0.97)`)
      bodyG.addColorStop(1, `rgba(8, 6, 3, 0.98)`)
      ctx.fillStyle = bodyG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 6 — Wet ink surface (glossy reflection)
      // ══════════════════════════════════════════════════════════════
      traceSurface(ctx, surface, cx, cy)
      ctx.save()
      ctx.clip()

      // Wet sheen — moves across surface
      const sheenX = cx + Math.sin(t * 0.3) * 8
      const sheenY = cy - BASE_RADIUS * 0.3 + Math.cos(t * 0.4) * 3
      const sheenG = ctx.createRadialGradient(sheenX, sheenY, 0, sheenX, sheenY, BASE_RADIUS * 0.8)
      sheenG.addColorStop(0, `rgba(80, 70, 55, ${0.15 + pI * 0.08})`)
      sheenG.addColorStop(0.3, `rgba(60, 52, 40, ${0.08 + pI * 0.04})`)
      sheenG.addColorStop(0.7, `rgba(40, 35, 25, ${0.02})`)
      sheenG.addColorStop(1, `rgba(20, 18, 12, 0)`)
      ctx.fillStyle = sheenG
      ctx.fillRect(0, 0, w, h)

      // Specular dot
      const specG = ctx.createRadialGradient(sheenX - 5, sheenY - 4, 0, sheenX - 5, sheenY - 4, 4)
      specG.addColorStop(0, `rgba(120, 105, 80, ${0.35 + pI * 0.15})`)
      specG.addColorStop(0.5, `rgba(90, 78, 58, ${0.12})`)
      specG.addColorStop(1, `rgba(60, 52, 38, 0)`)
      ctx.fillStyle = specG
      ctx.beginPath()
      ctx.ellipse(sheenX - 5, sheenY - 4, 4, 2.5, -0.3, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()

      // ══════════════════════════════════════════════════════════════
      // LAYER 7 — Ink edge (organic bleeding boundary)
      // ══════════════════════════════════════════════════════════════
      traceSurface(ctx, surface, cx, cy)
      ctx.strokeStyle = `rgba(25, 20, 12, 0.35)`
      ctx.lineWidth = 1.2
      ctx.stroke()

      // Secondary bleed edge
      ctx.save()
      ctx.filter = 'blur(1.5px)'
      traceSurface(ctx, surface, cx, cy)
      ctx.strokeStyle = `rgba(20, 16, 8, 0.10)`
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.restore()

      // ══════════════════════════════════════════════════════════════
      // LAYER 8 — Processing (ink swirl)
      // ══════════════════════════════════════════════════════════════
      if (isProcessing) {
        const pp2 = Math.sin(t * 3) * 0.3 + 0.7

        // Swirling ink lines inside the blob
        for (let s = 0; s < 3; s++) {
          const sa = t * (1.2 + s * 0.4) + s * 2.1
          const sr = BASE_RADIUS * 0.5 + Math.sin(t * 2 + s) * 4

          ctx.beginPath()
          for (let i = 0; i <= 32; i++) {
            const a = (i / 32) * Math.PI * 2
            const spiralR = sr * (1 - (i / 32) * 0.6)
            const x = cx + Math.cos(a + sa) * spiralR
            const y = cy + Math.sin(a + sa) * spiralR
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.strokeStyle = `rgba(50, 42, 28, ${0.12 * pp2})`
          ctx.lineWidth = 0.8
          ctx.stroke()
        }

        // Ink ripple rings
        for (let r = 0; r < 2; r++) {
          const ringPhase = (t * 2 + r * 1.2) % 3
          const ringAlpha = ringPhase < 1.5 ? ringPhase / 1.5 : (3 - ringPhase) / 1.5
          const ringR = BASE_RADIUS + 3 + ringPhase * 8

          ctx.beginPath()
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(25, 20, 12, ${0.08 * ringAlpha * pp2})`
          ctx.lineWidth = 0.8
          ctx.stroke()
        }
      }

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
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
      setBlobScreenPos({ x: wp.x + 60, y: wp.y + 60 })
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
      setBlobScreenPos({ x: nx + 60, y: ny + 60 })
      if (useConfigStore.getState().textboxOpen) {
        const sc = screenSizeRef.current || { width: 1920, height: 1080 }
        let chatX = Math.max(0, Math.min(nx + 60 - CHAT_W * 0.5, sc.width - CHAT_W))
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
            let chatX = Math.max(0, Math.min(wp.x + 60 - CHAT_W * 0.5, sc.width - CHAT_W))
            let chatY = Math.max(0, Math.min(wp.y + BLOB.SIZE + 10, sc.height - CHAT_H_COLLAPSED))
            setBlobScreenPos({ x: wp.x + 60, y: wp.y + BLOB.SIZE - 60 })
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
      width={BLOB.SIZE}
      height={BLOB.SIZE}
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
