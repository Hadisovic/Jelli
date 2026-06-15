import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'
import { getWindowPosition, setWindowPosition, showChatWindow, hideChatWindow, getScreenSize, setChatWindowPosition } from '@/lib/api'

const DRAG_THRESHOLD = 6
const CHAT_W = 360
const CHAT_H_COLLAPSED = 56
const CHAT_H_EXPANDED = 250

// ── Plasma anatomy ───────────────────────────────────────────────────────
const ARC_COUNT = 6
const ARC_POINTS = 8
const PARTICLE_COUNT = 24
const TENDRIL_COUNT = 4
const TENDRIL_SEGS = 10
const CORE_RADIUS = 18

interface ArcPoint { x: number; y: number; ox: number; oy: number }
interface Arc { points: ArcPoint[]; life: number; maxLife: number; hue: number }
interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number; maxLife: number
  size: number; hue: number
  orbit: number; angle: number; speed: number
}
interface TendrilPoint { x: number; y: number; vx: number; vy: number }
interface Tendril {
  points: TendrilPoint[]
  phase: number; speed: number; len: number
  amp: number; damp: number
}

function makeArc(cx: number, cy: number, hue: number): Arc {
  const startAngle = Math.random() * Math.PI * 2
  const endAngle = startAngle + (Math.random() - 0.5) * Math.PI * 0.8
  const r = 22 + Math.random() * 14

  const points: ArcPoint[] = []
  for (let i = 0; i < ARC_POINTS; i++) {
    const f = i / (ARC_POINTS - 1)
    const a = startAngle + (endAngle - startAngle) * f
    const jitter = (Math.random() - 0.5) * 8
    const rx = Math.cos(a) * (r + jitter)
    const ry = Math.sin(a) * (r + jitter)
    points.push({ x: cx + rx, y: cy + ry, ox: rx, oy: ry })
  }

  return { points, life: 0, maxLife: 0.15 + Math.random() * 0.35, hue }
}

function makeParticle(cx: number, cy: number): Particle {
  const angle = Math.random() * Math.PI * 2
  const orbit = 10 + Math.random() * 28
  return {
    x: cx + Math.cos(angle) * orbit,
    y: cy + Math.sin(angle) * orbit,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    life: 0,
    maxLife: 0.4 + Math.random() * 1.2,
    size: 0.6 + Math.random() * 1.4,
    hue: 200 + Math.random() * 40,
    orbit,
    angle,
    speed: 0.3 + Math.random() * 0.8,
  }
}

function makeTendrils(cx: number, cy: number): Tendril[] {
  return Array.from({ length: TENDRIL_COUNT }, (_, i) => {
    const baseAngle = (i / TENDRIL_COUNT) * Math.PI * 2
    const baseX = cx + Math.cos(baseAngle) * 20
    const baseY = cy + Math.sin(baseAngle) * 20
    const points: TendrilPoint[] = Array.from({ length: TENDRIL_SEGS }, (_, j) => ({
      x: baseX + Math.cos(baseAngle) * j * 2.5,
      y: baseY + Math.sin(baseAngle) * j * 2.5,
      vx: 0, vy: 0,
    }))
    return {
      points,
      phase: i * 1.8 + Math.random(),
      speed: 0.6 + Math.random() * 0.5,
      len: 22 + Math.random() * 10,
      amp: 3 + Math.random() * 4,
      damp: 0.88 + Math.random() * 0.06,
    }
  })
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

    const arcs: Arc[] = []
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => makeParticle(cx, cy))
    const tendrils = makeTendrils(cx, cy)
    let arcTimer = 0

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h)
      const t = time / 1000
      const hue = isProcessing ? 270 : isDragging ? 200 : (t * BLOB.HUE_SPEED) % 360

      // ── Pulse ─────────────────────────────────────────────────────
      const pp = t * (Math.PI * 2 / (BLOB.BREATH_PERIOD_MS / 1000))
      const pulse = Math.sin(pp)
      const pm = isProcessing ? 1.6 : 1.0
      const coreR = CORE_RADIUS + pulse * 2.5

      // ══════════════════════════════════════════════════════════════
      // LAYER 1 — Corona glow
      // ══════════════════════════════════════════════════════════════
      const coronaR = 48
      const cG = ctx.createRadialGradient(cx, cy, coreR * 0.5, cx, cy, coronaR)
      cG.addColorStop(0, `hsla(${hue}, 70%, 65%, 0.12)`)
      cG.addColorStop(0.3, `hsla(${hue}, 65%, 55%, 0.06)`)
      cG.addColorStop(0.6, `hsla(${hue + 10}, 60%, 45%, 0.02)`)
      cG.addColorStop(1, `hsla(${hue + 20}, 50%, 30%, 0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, coronaR, 0, Math.PI * 2)
      ctx.fillStyle = cG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 2 — Tendrils (energy streams)
      // ══════════════════════════════════════════════════════════════
      const t2t = t
      for (const ten of tendrils) {
        const bx = cx + Math.cos(ten.phase) * 20
        const by = cy + Math.sin(ten.phase) * 20
        ten.points[0].x = bx
        ten.points[0].y = by

        for (let i = 1; i < ten.points.length; i++) {
          const p = ten.points[i]
          const f = i / TENDRIL_SEGS
          const wave = Math.sin(t2t * ten.speed * pm + ten.phase + f * 3) * ten.amp * f
          const tx = bx + Math.cos(ten.phase + f * 0.5) * f * ten.len + wave * Math.cos(ten.phase + Math.PI / 2)
          const ty = by + Math.sin(ten.phase + f * 0.5) * f * ten.len + wave * Math.sin(ten.phase + Math.PI / 2)
          p.vx += (tx - p.x) * 0.06
          p.vy += (ty - p.y) * 0.06
          p.vx *= ten.damp
          p.vy *= ten.damp
          p.x += p.vx
          p.y += p.vy
        }

        // Draw tendril with tapering stroke
        for (let i = 0; i < ten.points.length - 1; i++) {
          const f0 = i / (ten.points.length - 1)
          const f1 = (i + 1) / (ten.points.length - 1)
          const w0 = 2.2 * (1 - f0 * 0.85)
          const w1 = 2.2 * (1 - f1 * 0.85)
          const a0 = 0.35 * (1 - f0 * 0.7)
          const a1 = 0.35 * (1 - f1 * 0.7)

          ctx.beginPath()
          ctx.moveTo(ten.points[i].x, ten.points[i].y)
          ctx.lineTo(ten.points[i + 1].x, ten.points[i + 1].y)

          const segG = ctx.createLinearGradient(
            ten.points[i].x, ten.points[i].y,
            ten.points[i + 1].x, ten.points[i + 1].y,
          )
          segG.addColorStop(0, `hsla(${hue}, 70%, 70%, ${a0})`)
          segG.addColorStop(1, `hsla(${hue + 15}, 65%, 60%, ${a1})`)
          ctx.strokeStyle = segG
          ctx.lineWidth = w0
          ctx.lineCap = 'round'
          ctx.stroke()
        }
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 3 — Arcs (lightning)
      // ══════════════════════════════════════════════════════════════
      arcTimer += 1 / 60
      const arcInterval = isProcessing ? 0.04 : 0.12
      if (arcTimer > arcInterval && arcs.length < ARC_COUNT) {
        arcs.push(makeArc(cx, cy, hue + (Math.random() - 0.5) * 20))
        arcTimer = 0
      }

      for (let a = arcs.length - 1; a >= 0; a--) {
        const arc = arcs[a]
        arc.life += 1 / 60
        if (arc.life >= arc.maxLife) {
          arcs.splice(a, 1)
          continue
        }

        const lifeFrac = arc.life / arc.maxLife
        const alpha = lifeFrac < 0.3
          ? lifeFrac / 0.3
          : 1 - (lifeFrac - 0.3) / 0.7

        // Bright core of arc
        ctx.beginPath()
        ctx.moveTo(arc.points[0].x, arc.points[0].y)
        for (let i = 1; i < arc.points.length; i++) {
          ctx.lineTo(arc.points[i].x, arc.points[i].y)
        }
        ctx.strokeStyle = `hsla(${arc.hue}, 80%, 88%, ${0.7 * alpha})`
        ctx.lineWidth = 1.8
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()

        // Glow around arc
        ctx.beginPath()
        ctx.moveTo(arc.points[0].x, arc.points[0].y)
        for (let i = 1; i < arc.points.length; i++) {
          ctx.lineTo(arc.points[i].x, arc.points[i].y)
        }
        ctx.strokeStyle = `hsla(${arc.hue}, 70%, 70%, ${0.2 * alpha})`
        ctx.lineWidth = 5
        ctx.stroke()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 4 — Plasma body
      // ══════════════════════════════════════════════════════════════
      const bodyG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR + 4)
      bodyG.addColorStop(0, `hsla(${hue + 15}, 55%, 75%, 0.22)`)
      bodyG.addColorStop(0.3, `hsla(${hue + 8}, 60%, 60%, 0.35)`)
      bodyG.addColorStop(0.6, `hsla(${hue}, 65%, 48%, 0.48)`)
      bodyG.addColorStop(0.85, `hsla(${hue - 8}, 70%, 38%, 0.55)`)
      bodyG.addColorStop(1, `hsla(${hue - 15}, 75%, 28%, 0.62)`)
      ctx.beginPath()
      ctx.arc(cx, cy, coreR + 4, 0, Math.PI * 2)
      ctx.fillStyle = bodyG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 5 — Core (hot center)
      // ══════════════════════════════════════════════════════════════
      const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 0.6)
      coreG.addColorStop(0, `hsla(${hue + 30}, 40%, 98%, 0.65)`)
      coreG.addColorStop(0.2, `hsla(${hue + 20}, 50%, 90%, 0.45)`)
      coreG.addColorStop(0.5, `hsla(${hue + 10}, 60%, 75%, 0.2)`)
      coreG.addColorStop(1, `hsla(${hue}, 65%, 60%, 0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 0.6, 0, Math.PI * 2)
      ctx.fillStyle = coreG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 6 — Particles (orbiting energy)
      // ══════════════════════════════════════════════════════════════
      for (const p of particles) {
        p.life += 1 / 60
        if (p.life >= p.maxLife) {
          Object.assign(p, makeParticle(cx, cy))
          p.life = 0
        }

        p.angle += p.speed * pm * 0.02
        const lifeFrac = p.life / p.maxLife
        const fadeIn = Math.min(lifeFrac * 5, 1)
        const fadeOut = lifeFrac > 0.7 ? 1 - (lifeFrac - 0.7) / 0.3 : 1
        const alpha = fadeIn * fadeOut

        // Drift toward/away from center
        const drift = Math.sin(p.life * 2 + p.angle) * 3
        const px = cx + Math.cos(p.angle) * (p.orbit + drift)
        const py = cy + Math.sin(p.angle) * (p.orbit + drift)

        // Particle glow
        const pG = ctx.createRadialGradient(px, py, 0, px, py, p.size * 3)
        pG.addColorStop(0, `hsla(${p.hue}, 75%, 85%, ${0.55 * alpha})`)
        pG.addColorStop(0.4, `hsla(${p.hue}, 65%, 70%, ${0.18 * alpha})`)
        pG.addColorStop(1, `hsla(${p.hue}, 55%, 55%, 0)`)
        ctx.beginPath()
        ctx.arc(px, py, p.size * 3, 0, Math.PI * 2)
        ctx.fillStyle = pG
        ctx.fill()

        // Particle core
        ctx.beginPath()
        ctx.arc(px, py, p.size * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 30%, 98%, ${0.8 * alpha})`
        ctx.fill()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 7 — Inner filaments
      // ══════════════════════════════════════════════════════════════
      for (let i = 0; i < 5; i++) {
        const a1 = (i / 5) * Math.PI * 2 + t * 0.4
        const a2 = a1 + Math.PI * (0.3 + Math.sin(t * 2 + i) * 0.15)
        const r1 = 3 + Math.sin(t * 3 + i * 1.5) * 2
        const r2 = coreR * 0.7 + Math.cos(t * 2.5 + i) * 3

        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1)
        ctx.lineTo(cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2)
        ctx.strokeStyle = `hsla(${hue + 20}, 60%, 80%, 0.15)`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 8 — Edge glow
      // ══════════════════════════════════════════════════════════════
      ctx.beginPath()
      ctx.arc(cx, cy, coreR + 4, 0, Math.PI * 2)
      ctx.strokeStyle = `hsla(${hue}, 55%, 70%, 0.14)`
      ctx.lineWidth = 1.5
      ctx.stroke()

      // ══════════════════════════════════════════════════════════════
      // LAYER 9 — Processing (energy surge)
      // ══════════════════════════════════════════════════════════════
      if (isProcessing) {
        const pp2 = Math.sin(t * 5) * 0.3 + 0.7

        // Expanding rings
        for (let r = 0; r < 3; r++) {
          const ringPhase = (t * 2 + r * 0.7) % 2
          const ringAlpha = ringPhase < 1 ? ringPhase : 2 - ringPhase
          const ringR = coreR + 6 + ringPhase * 14

          ctx.beginPath()
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
          ctx.strokeStyle = `hsla(${hue + 10}, 70%, 72%, ${0.12 * ringAlpha * pp2})`
          ctx.lineWidth = 1.2
          ctx.stroke()
        }

        // Extra arcs during processing
        if (arcTimer > 0.02 && arcs.length < ARC_COUNT + 3) {
          arcs.push(makeArc(cx, cy, hue + (Math.random() - 0.5) * 30))
          arcTimer = 0
        }
      }

      // ── Hue sync ──────────────────────────────────────────────────
      localStorage.setItem('blob-hue', String(Math.round(hue)))

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
