import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'
import { getWindowPosition, setWindowPosition, showChatWindow, hideChatWindow, getScreenSize, setChatWindowPosition } from '@/lib/api'

const DRAG_THRESHOLD = 6
const CHAT_W = 360
const CHAT_H_COLLAPSED = 56
const CHAT_H_EXPANDED = 250

// ── Celestial anatomy ────────────────────────────────────────────────────
const RAY_COUNT = 12
const FILAMENT_MAX = 8
const FILAMENT_SEGMENTS = 12
const PARTICLE_COUNT = 36
const TRAIL_LENGTH = 6
const WAVE_COUNT = 3
const BLOB_POINTS = 48
const BASE_RADIUS = 22

// ── Blob surface (morphing sphere) ──────────────────────────────────────
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

function updateSurface(pts: SurfacePoint[], t: number) {
  for (const p of pts) {
    const n1 = Math.sin(p.angle * 2 + t * 0.8) * 3.0
    const n2 = Math.cos(p.angle * 3 - t * 0.6) * 2.0
    const n3 = Math.sin(p.angle * 5 + t * 1.2) * 1.2
    const n4 = Math.cos(p.angle * 7 - t * 0.9) * 0.7
    p.targetR = BASE_RADIUS + n1 + n2 + n3 + n4
    p.vr += (p.targetR - p.r) * 0.07
    p.vr *= 0.83
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
      const cpx1 = x + (Math.cos(curr.angle) - Math.cos(prev.angle)) * curr.r * 0.22
      const cpy1 = y + (Math.sin(curr.angle) - Math.sin(prev.angle)) * curr.r * 0.22
      const cpx2 = x - (Math.cos(next.angle) - Math.cos(curr.angle)) * curr.r * 0.22
      const cpy2 = y - (Math.sin(next.angle) - Math.sin(curr.angle)) * curr.r * 0.22
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, x, y)
    }
  }
  ctx.closePath()
}

// ── God rays ─────────────────────────────────────────────────────────────
interface Ray {
  angle: number
  width: number
  len: number
  speed: number
  phase: number
  bright: number
}

function makeRays(): Ray[] {
  return Array.from({ length: RAY_COUNT }, (_, i) => ({
    angle: (i / RAY_COUNT) * Math.PI * 2,
    width: 0.04 + Math.random() * 0.06,
    len: 28 + Math.random() * 18,
    speed: 0.08 + Math.random() * 0.12,
    phase: Math.random() * Math.PI * 2,
    bright: 0.3 + Math.random() * 0.4,
  }))
}

// ── Plasma filaments ─────────────────────────────────────────────────────
interface FilSeg { x: number; y: number }
interface Filament {
  segs: FilSeg[]
  life: number
  maxLife: number
  hue: number
  thickness: number
  branches: number
}

function makeFilament(cx: number, cy: number, hue: number): Filament {
  const startAngle = Math.random() * Math.PI * 2
  const segs: FilSeg[] = []
  let x = cx + Math.cos(startAngle) * BASE_RADIUS * 0.8
  let y = cy + Math.sin(startAngle) * BASE_RADIUS * 0.8
  let a = startAngle

  for (let i = 0; i < FILAMENT_SEGMENTS; i++) {
    segs.push({ x, y })
    const f = i / FILAMENT_SEGMENTS
    a += (Math.random() - 0.5) * 1.2
    const step = 3 + (1 - f) * 4
    x += Math.cos(a) * step
    y += Math.sin(a) * step
  }

  return {
    segs,
    life: 0,
    maxLife: 0.3 + Math.random() * 0.7,
    hue: hue + (Math.random() - 0.5) * 30,
    thickness: 0.8 + Math.random() * 1.5,
    branches: Math.random() > 0.6 ? 1 : 0,
  }
}

// ── Particles with trails ───────────────────────────────────────────────
interface Particle {
  x: number; y: number
  vx: number; vy: number
  trail: { x: number; y: number }[]
  life: number; maxLife: number
  size: number; hue: number
  orbit: number; angle: number; speed: number
  spiraling: boolean
}

function makeParticle(cx: number, cy: number): Particle {
  const angle = Math.random() * Math.PI * 2
  const orbit = 14 + Math.random() * 30
  return {
    x: cx + Math.cos(angle) * orbit,
    y: cy + Math.sin(angle) * orbit,
    vx: 0, vy: 0,
    trail: Array.from({ length: TRAIL_LENGTH }, () => ({
      x: cx + Math.cos(angle) * orbit,
      y: cy + Math.sin(angle) * orbit,
    })),
    life: 0,
    maxLife: 0.8 + Math.random() * 2.0,
    size: 0.5 + Math.random() * 1.5,
    hue: 200 + Math.random() * 50,
    orbit,
    angle,
    speed: 0.2 + Math.random() * 0.6,
    spiraling: Math.random() > 0.7,
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
    const rays = makeRays()
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => makeParticle(cx, cy))
    const filaments: Filament[] = []
    let filTimer = 0

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h)
      const t = time / 1000
      const hue = isProcessing ? 270 : isDragging ? 200 : (t * BLOB.HUE_SPEED) % 360
      const pm = isProcessing ? 1.5 : 1.0

      // ── Pulse ─────────────────────────────────────────────────────
      const pp = t * (Math.PI * 2 / (BLOB.BREATH_PERIOD_MS / 1000))
      const pulse = Math.sin(pp)
      const pI = (pulse + 1) * 0.5
      const coreR = BASE_RADIUS + pulse * 2

      // ── Surface morphing ──────────────────────────────────────────
      updateSurface(surface, t)

      // ══════════════════════════════════════════════════════════════
      // LAYER 1 — Gravitational lensing (background distortion)
      // ══════════════════════════════════════════════════════════════
      const lensR = 52
      const lG = ctx.createRadialGradient(cx, cy, coreR, cx, cy, lensR)
      lG.addColorStop(0, `hsla(${hue}, 40%, 50%, 0.06)`)
      lG.addColorStop(0.4, `hsla(${hue}, 35%, 40%, 0.03)`)
      lG.addColorStop(0.7, `hsla(${hue}, 30%, 35%, 0.01)`)
      lG.addColorStop(1, `hsla(${hue}, 25%, 30%, 0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, lensR, 0, Math.PI * 2)
      ctx.fillStyle = lG
      ctx.fill()

      // Chromatic aberration ring
      ctx.beginPath()
      ctx.arc(cx, cy, lensR - 2, 0, Math.PI * 2)
      ctx.strokeStyle = `hsla(${hue + 15}, 50%, 60%, 0.04)`
      ctx.lineWidth = 2
      ctx.stroke()

      // ══════════════════════════════════════════════════════════════
      // LAYER 2 — God rays (volumetric light)
      // ══════════════════════════════════════════════════════════════
      for (const ray of rays) {
        const ra = ray.angle + t * ray.speed
        const flicker = Math.sin(t * 2.5 + ray.phase) * 0.3 + 0.7
        const alpha = ray.bright * flicker * (0.7 + pI * 0.3) * pm
        const len = ray.len * (0.8 + pulse * 0.15) * pm

        // Outer ray (wide, faint)
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(
          cx + Math.cos(ra - ray.width) * len,
          cy + Math.sin(ra - ray.width) * len,
        )
        ctx.lineTo(
          cx + Math.cos(ra + ray.width) * len,
          cy + Math.sin(ra + ray.width) * len,
        )
        ctx.closePath()

        const rG = ctx.createRadialGradient(cx, cy, coreR * 0.5, cx, cy, len)
        rG.addColorStop(0, `hsla(${hue + 10}, 60%, 80%, ${alpha * 0.6})`)
        rG.addColorStop(0.3, `hsla(${hue + 5}, 55%, 70%, ${alpha * 0.3})`)
        rG.addColorStop(0.7, `hsla(${hue}, 50%, 60%, ${alpha * 0.08})`)
        rG.addColorStop(1, `hsla(${hue - 5}, 45%, 50%, 0)`)
        ctx.fillStyle = rG
        ctx.fill()

        // Inner ray (narrow, bright)
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(
          cx + Math.cos(ra - ray.width * 0.3) * len * 0.7,
          cy + Math.sin(ra - ray.width * 0.3) * len * 0.7,
        )
        ctx.lineTo(
          cx + Math.cos(ra + ray.width * 0.3) * len * 0.7,
          cy + Math.sin(ra + ray.width * 0.3) * len * 0.7,
        )
        ctx.closePath()
        ctx.fillStyle = `hsla(${hue + 15}, 65%, 85%, ${alpha * 0.2})`
        ctx.fill()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 3 — Plasma filaments (branching lightning)
      // ══════════════════════════════════════════════════════════════
      filTimer += 1 / 60
      const filInterval = isProcessing ? 0.05 : 0.18
      if (filTimer > filInterval && filaments.length < FILAMENT_MAX) {
        filaments.push(makeFilament(cx, cy, hue))
        filTimer = 0
      }

      for (let f = filaments.length - 1; f >= 0; f--) {
        const fil = filaments[f]
        fil.life += 1 / 60
        if (fil.life >= fil.maxLife) {
          filaments.splice(f, 1)
          continue
        }

        const lifeFrac = fil.life / fil.maxLife
        const alpha = lifeFrac < 0.2 ? lifeFrac / 0.2 : 1 - (lifeFrac - 0.2) / 0.8

        // Bright core
        ctx.beginPath()
        ctx.moveTo(fil.segs[0].x, fil.segs[0].y)
        for (let i = 1; i < fil.segs.length; i++) {
          ctx.lineTo(fil.segs[i].x, fil.segs[i].y)
        }
        ctx.strokeStyle = `hsla(${fil.hue}, 80%, 90%, ${0.8 * alpha})`
        ctx.lineWidth = fil.thickness
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke()

        // Glow
        ctx.beginPath()
        ctx.moveTo(fil.segs[0].x, fil.segs[0].y)
        for (let i = 1; i < fil.segs.length; i++) {
          ctx.lineTo(fil.segs[i].x, fil.segs[i].y)
        }
        ctx.strokeStyle = `hsla(${fil.hue}, 70%, 75%, ${0.25 * alpha})`
        ctx.lineWidth = fil.thickness * 4
        ctx.stroke()

        // Wide halo
        ctx.beginPath()
        ctx.moveTo(fil.segs[0].x, fil.segs[0].y)
        for (let i = 1; i < fil.segs.length; i++) {
          ctx.lineTo(fil.segs[i].x, fil.segs[i].y)
        }
        ctx.strokeStyle = `hsla(${fil.hue}, 60%, 65%, ${0.06 * alpha})`
        ctx.lineWidth = fil.thickness * 10
        ctx.stroke()

        // Branch
        if (fil.branches && fil.segs.length > 4) {
          const bi = Math.floor(fil.segs.length * 0.4)
          const bp = fil.segs[bi]
          const ba = Math.atan2(
            fil.segs[bi + 1].y - bp.y,
            fil.segs[bi + 1].x - bp.x,
          ) + (Math.random() > 0.5 ? 0.8 : -0.8)

          ctx.beginPath()
          ctx.moveTo(bp.x, bp.y)
          ctx.lineTo(bp.x + Math.cos(ba) * 10, bp.y + Math.sin(ba) * 10)
          ctx.strokeStyle = `hsla(${fil.hue}, 75%, 85%, ${0.5 * alpha})`
          ctx.lineWidth = fil.thickness * 0.6
          ctx.stroke()
        }
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 4 — Energy waves (surface ripples)
      // ══════════════════════════════════════════════════════════════
      for (let w = 0; w < WAVE_COUNT; w++) {
        const waveR = coreR + 2 + w * 3
        const wavePhase = t * (1.5 + w * 0.3) + w * 2.1
        const waveAlpha = 0.08 * (1 - w * 0.25) * pm

        ctx.beginPath()
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * Math.PI * 2
          const wobble = Math.sin(a * 6 + wavePhase) * 1.5
          const r = waveR + wobble
          const x = cx + Math.cos(a) * r
          const y = cy + Math.sin(a) * r
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.strokeStyle = `hsla(${hue + 20}, 55%, 70%, ${waveAlpha})`
        ctx.lineWidth = 0.6
        ctx.stroke()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 5 — Stellar body (core)
      // ══════════════════════════════════════════════════════════════
      traceSurface(ctx, surface, cx, cy)
      const bG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR + 6)
      bG.addColorStop(0, `hsla(${hue + 20}, 30%, 98%, 0.75)`)
      bG.addColorStop(0.15, `hsla(${hue + 12}, 45%, 92%, 0.60)`)
      bG.addColorStop(0.35, `hsla(${hue + 5}, 55%, 78%, 0.50)`)
      bG.addColorStop(0.6, `hsla(${hue}, 62%, 60%, 0.55)`)
      bG.addColorStop(0.85, `hsla(${hue - 8}, 68%, 45%, 0.62)`)
      bG.addColorStop(1, `hsla(${hue - 15}, 72%, 32%, 0.70)`)
      ctx.fillStyle = bG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 6 — Corona (atmosphere)
      // ══════════════════════════════════════════════════════════════
      const corR = coreR + 6
      const cG = ctx.createRadialGradient(cx, cy, corR * 0.7, cx, cy, corR + 10)
      cG.addColorStop(0, `hsla(${hue + 10}, 55%, 70%, ${0.18 + pI * 0.08})`)
      cG.addColorStop(0.4, `hsla(${hue + 5}, 50%, 60%, ${0.08 + pI * 0.04})`)
      cG.addColorStop(0.7, `hsla(${hue}, 45%, 50%, ${0.03})`)
      cG.addColorStop(1, `hsla(${hue - 5}, 40%, 40%, 0)`)
      ctx.beginPath()
      ctx.arc(cx, cy, corR + 10, 0, Math.PI * 2)
      ctx.fillStyle = cG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 7 — Particles with trails
      // ══════════════════════════════════════════════════════════════
      for (const p of particles) {
        p.life += 1 / 60
        if (p.life >= p.maxLife) {
          Object.assign(p, makeParticle(cx, cy))
          p.life = 0
          continue
        }

        // Orbit + spiral
        p.angle += p.speed * pm * 0.018
        const lifeFrac = p.life / p.maxLife
        const fadeIn = Math.min(lifeFrac * 4, 1)
        const fadeOut = lifeFrac > 0.65 ? 1 - (lifeFrac - 0.65) / 0.35 : 1
        const alpha = fadeIn * fadeOut

        let px: number, py: number
        if (p.spiraling) {
          // Spiral inward toward core
          const spiralR = p.orbit * (1 - lifeFrac * 0.7)
          px = cx + Math.cos(p.angle) * spiralR
          py = cy + Math.sin(p.angle) * spiralR
        } else {
          const drift = Math.sin(p.life * 1.5 + p.angle) * 3
          px = cx + Math.cos(p.angle) * (p.orbit + drift)
          py = cy + Math.sin(p.angle) * (p.orbit + drift)
        }

        // Update trail
        p.trail.unshift({ x: px, y: py })
        if (p.trail.length > TRAIL_LENGTH) p.trail.pop()

        // Draw trail
        for (let i = 1; i < p.trail.length; i++) {
          const tf = 1 - i / p.trail.length
          const ta = alpha * tf * 0.4
          const tw = p.size * 0.4 * tf
          ctx.beginPath()
          ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y)
          ctx.lineTo(p.trail[i].x, p.trail[i].y)
          ctx.strokeStyle = `hsla(${p.hue}, 65%, 75%, ${ta})`
          ctx.lineWidth = tw
          ctx.lineCap = 'round'
          ctx.stroke()
        }

        // Particle glow
        const pG = ctx.createRadialGradient(px, py, 0, px, py, p.size * 3.5)
        pG.addColorStop(0, `hsla(${p.hue}, 75%, 88%, ${0.55 * alpha})`)
        pG.addColorStop(0.35, `hsla(${p.hue}, 65%, 72%, ${0.18 * alpha})`)
        pG.addColorStop(1, `hsla(${p.hue}, 55%, 55%, 0)`)
        ctx.beginPath()
        ctx.arc(px, py, p.size * 3.5, 0, Math.PI * 2)
        ctx.fillStyle = pG
        ctx.fill()

        // Particle core
        ctx.beginPath()
        ctx.arc(px, py, p.size * 0.45, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, 30%, 98%, ${0.85 * alpha})`
        ctx.fill()
      }

      // ══════════════════════════════════════════════════════════════
      // LAYER 8 — Specular highlight
      // ══════════════════════════════════════════════════════════════
      const spX = cx - 6
      const spY = cy - coreR * 0.4
      const spG = ctx.createRadialGradient(spX, spY, 0, spX, spY, 8)
      spG.addColorStop(0, `hsla(${hue + 30}, 25%, 100%, 0.72)`)
      spG.addColorStop(0.3, `hsla(${hue + 20}, 35%, 96%, 0.30)`)
      spG.addColorStop(0.7, `hsla(${hue + 10}, 45%, 88%, 0.06)`)
      spG.addColorStop(1, `hsla(${hue}, 55%, 80%, 0)`)
      ctx.beginPath()
      ctx.ellipse(spX, spY, 8, 4.5, -0.25, 0, Math.PI * 2)
      ctx.fillStyle = spG
      ctx.fill()

      // ══════════════════════════════════════════════════════════════
      // LAYER 9 — Edge rim
      // ══════════════════════════════════════════════════════════════
      traceSurface(ctx, surface, cx, cy)
      ctx.strokeStyle = `hsla(${hue + 10}, 50%, 72%, 0.12)`
      ctx.lineWidth = 1
      ctx.stroke()

      // ══════════════════════════════════════════════════════════════
      // LAYER 10 — Processing (stellar flare)
      // ══════════════════════════════════════════════════════════════
      if (isProcessing) {
        const pp2 = Math.sin(t * 5) * 0.3 + 0.7

        // Expanding energy rings
        for (let r = 0; r < 3; r++) {
          const ringPhase = (t * 2.5 + r * 0.6) % 2
          const ringAlpha = ringPhase < 1 ? ringPhase : 2 - ringPhase
          const ringR = coreR + 5 + ringPhase * 16

          ctx.beginPath()
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
          ctx.strokeStyle = `hsla(${hue + 15}, 65%, 75%, ${0.10 * ringAlpha * pp2})`
          ctx.lineWidth = 1.2
          ctx.stroke()
        }

        // Extra filaments during processing
        if (filTimer > 0.03 && filaments.length < FILAMENT_MAX + 4) {
          filaments.push(makeFilament(cx, cy, hue + (Math.random() - 0.5) * 20))
          filTimer = 0
        }

        // Plasma prominences (surface eruptions)
        for (let p = 0; p < 2; p++) {
          const promAngle = t * 0.3 + p * Math.PI
          const promLen = 8 + Math.sin(t * 3 + p) * 4
          const px1 = cx + Math.cos(promAngle) * coreR
          const py1 = cy + Math.sin(promAngle) * coreR
          const px2 = cx + Math.cos(promAngle) * (coreR + promLen)
          const py2 = cy + Math.sin(promAngle) * (coreR + promLen)

          const pG = ctx.createLinearGradient(px1, py1, px2, py2)
          pG.addColorStop(0, `hsla(${hue + 10}, 60%, 75%, ${0.25 * pp2})`)
          pG.addColorStop(0.5, `hsla(${hue + 5}, 55%, 65%, ${0.10 * pp2})`)
          pG.addColorStop(1, `hsla(${hue}, 50%, 55%, 0)`)

          ctx.beginPath()
          ctx.moveTo(px1, py1)
          ctx.lineTo(px2, py2)
          ctx.strokeStyle = pG
          ctx.lineWidth = 2.5
          ctx.lineCap = 'round'
          ctx.stroke()
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
