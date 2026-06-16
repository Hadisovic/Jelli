import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'
import {
  getWindowPosition,
  setWindowPosition,
  showChatWindow,
  hideChatWindow,
  getScreenSize,
  setChatWindowPosition,
} from '@/lib/api'

const DRAG_THRESHOLD = 6
const CHAT_W = 360
const CHAT_H_COLLAPSED = 56
const CHAT_H_EXPANDED = 250
const AGGRESSIVE_DRAG_MS = 2000

// ── Dark jellyfish palette ─────────────────────────────────────────────────
// Core dark teal colours matching the reference image
const JELLY_DARK   = { r: 30,  g: 80,  b: 90  }  // deep slate-teal body
const JELLY_MID    = { r: 45,  g: 120, b: 130 }  // mid teal
const JELLY_BRIGHT = { r: 80,  g: 190, b: 200 }  // bright accent (rim/glow)
const JELLY_RIM    = { r: 100, g: 220, b: 230 }  // underside rim light

function lerpRGB(a: {r:number,g:number,b:number}, b: {r:number,g:number,b:number}, t: number) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

function toRgba(c: {r:number,g:number,b:number}, a: number) {
  return `rgba(${c.r},${c.g},${c.b},${a})`
}

// Casual idle colour pulse: deep teal ↔ slightly brighter teal
function getJellyBodyColor(breathN: number): {r:number,g:number,b:number} {
  return lerpRGB(JELLY_DARK, JELLY_MID, breathN * 0.6)
}

function lerpToPink(t: number): string {
  const c1 = [0x1E, 0x50, 0x5A]
  const p2 = [0xFF, 0x8C, 0xC8]
  const r = Math.round(c1[0] + (p2[0] - c1[0]) * t)
  const g = Math.round(c1[1] + (p2[1] - c1[1]) * t)
  const b = Math.round(c1[2] + (p2[2] - c1[2]) * t)
  return `rgb(${r},${g},${b})`
}

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
  const dragStartTimeRef = useRef(0)
  const velocityXRef = useRef(0)
  const velocityYRef = useRef(0)
  const lastMovePosRef = useRef<{ x: number; y: number } | null>(null)

  const isHoveredRef = useRef(false)
  const cursorXRef = useRef(0)
  const cursorYRef = useRef(0)
  const pupilXRef = useRef(0)
  const pupilYRef = useRef(0)
  const scaleXRef = useRef(1)
  const scaleYRef = useRef(1)
  const targetScaleXRef = useRef(1)
  const targetScaleYRef = useRef(1)
  const clickBounceRef = useRef(0)
  const aggressiveRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2

    let raf: number
    let lastTime = performance.now()

    // ── Jellyfish geometry ─────────────────────────────────────────────────
    const BODY_RX    = 44   // body half-width
    const BODY_RY    = 34   // body half-height
    const EAR_PEAK   = 6    // side ear bumps
    const DRIP_COUNT = 4    // number of hanging tentacles
    const DRIP_W     = 5    // tentacle max half-width at top
    const DRIP_H     = 16   // tentacle height
    const DRIP_GAP   = 10   // gap between tentacle centres
    const EYE_RADIUS = 8
    const EYE_SPACING = 16
    const EYE_Y_OFF  = -6

    const draw = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05)
      lastTime = time
      const t = time / 1000

      ctx.clearRect(0, 0, w, h)

      const state = isProcessing ? 'thinking' : isDragging ? 'drag' : 'idle'
      const dragElapsed = isDragging ? (time - dragStartTimeRef.current) / 1000 : 0
      const isAggressive = aggressiveRef.current && state === 'drag'
      const dragNorm = Math.min(dragElapsed / (AGGRESSIVE_DRAG_MS / 1000), 1)

      // Breath / float timing
      const breathPhase = t * (Math.PI * 2) / (BLOB.BREATH_PERIOD_MS / 1000)
      const breath  = state === 'drag' ? 0 : Math.sin(breathPhase)
      const breathN = (breath + 1) * 0.5                           // 0..1
      const floatY  = state === 'drag' ? 0 : Math.sin(breathPhase * 0.7) * 2

      // Scale / squish
      if (state === 'drag') {
        const speed = Math.sqrt(velocityXRef.current ** 2 + velocityYRef.current ** 2)
        const stretch = Math.min(speed * 0.005, 0.18)
        targetScaleXRef.current = 1 + stretch + (isAggressive ? 0.06 : 0)
        targetScaleYRef.current = 1 - stretch * 0.5 - (isAggressive ? 0.04 : 0)
      } else if (isHoveredRef.current) {
        targetScaleXRef.current = 1.07
        targetScaleYRef.current = 0.93
      } else {
        targetScaleXRef.current = 1
        targetScaleYRef.current = 1
      }

      if (clickBounceRef.current > 0) {
        clickBounceRef.current -= dt * 1000
        const bf = Math.max(clickBounceRef.current / BLOB.CLICK_BOUNCE_DURATION, 0)
        const bounce = Math.sin(bf * Math.PI * 3) * 0.10 * bf
        targetScaleXRef.current = 1 + bounce
        targetScaleYRef.current = 1 - bounce * 0.6
      }

      scaleXRef.current += (targetScaleXRef.current - scaleXRef.current) * 0.08
      scaleYRef.current += (targetScaleYRef.current - scaleYRef.current) * 0.08

      // Cursor tracking for eyes
      const rect = canvas.getBoundingClientRect()
      const relX = cursorXRef.current - rect.left - cx
      const relY = cursorYRef.current - rect.top - cy
      const dist  = Math.sqrt(relX * relX + relY * relY)
      const tpX = dist > 0 ? (relX / dist) * Math.min(2.5, dist * 0.025) : 0
      const tpY = dist > 0 ? (relY / dist) * Math.min(2.5, dist * 0.025) : 0
      pupilXRef.current += (tpX - pupilXRef.current) * 0.08
      pupilYRef.current += (tpY - pupilYRef.current) * 0.08

      // ── Derive colours ─────────────────────────────────────────────────
      // Idle: body pulses between JELLY_DARK and JELLY_MID on breathN
      // Drag: shift toward pink/magenta
      let bodyC = getJellyBodyColor(breathN)
      let glowC  = lerpRGB(JELLY_BRIGHT, JELLY_MID, 0.5)
      let rimC   = JELLY_RIM

      if (state === 'drag') {
        const pinkC = { r: 255, g: 120, b: 180 }
        const pinkMix = isAggressive ? 0.8 + Math.sin(t * 2) * 0.2 : dragNorm * 0.4
        bodyC = lerpRGB(bodyC, pinkC, pinkMix)
        glowC = lerpRGB(glowC, pinkC, pinkMix * 0.6)
        rimC  = lerpRGB(rimC, pinkC, pinkMix * 0.5)
      } else if (isProcessing) {
        // Thinking: subtle blue-white pulse
        const blueC = { r: 140, g: 200, b: 255 }
        const pMix = 0.3 + Math.sin(t * 3) * 0.15
        bodyC = lerpRGB(bodyC, blueC, pMix)
        glowC = lerpRGB(glowC, blueC, pMix * 0.7)
      }

      // ── Begin draw transform ───────────────────────────────────────────
      ctx.save()
      ctx.translate(cx, cy + floatY)
      ctx.scale(scaleXRef.current, scaleYRef.current)
      ctx.translate(-cx, -cy)

      // ── Ambient outer glow ─────────────────────────────────────────────
      const glowR = Math.max(BODY_RX, BODY_RY) * 1.8
      const glowA = isProcessing
        ? 0.20 + Math.sin(t * 4) * 0.08
        : 0.10 + breathN * 0.06
      const gg = ctx.createRadialGradient(cx, cy, BODY_RY * 0.2, cx, cy, glowR)
      gg.addColorStop(0,   toRgba(glowC, glowA))
      gg.addColorStop(0.45, toRgba(glowC, glowA * 0.25))
      gg.addColorStop(1,   toRgba(glowC, 0))
      ctx.beginPath()
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
      ctx.fillStyle = gg
      ctx.fill()

      // ── Hanging drip tentacles ─────────────────────────────────────────
      // Each tentacle is a teardrop: wide at top, tapers to a sharp point
      const dripStartX = cx - ((DRIP_COUNT - 1) * DRIP_GAP) / 2
      const dripBaseY  = cy + BODY_RY - 2   // anchored just inside body bottom

      for (let i = 0; i < DRIP_COUNT; i++) {
        const dx = dripStartX + i * DRIP_GAP

        // Each tentacle has its own sway phase for organic feel
        const swayAmp   = 1.8 + Math.sin(t * 0.3 + i * 2.1) * 0.4
        const swayPhase = t * 1.1 + i * 0.9
        const sway = Math.sin(swayPhase) * swayAmp

        // Gentle drip-length pulse
        const dripLen = DRIP_H + Math.sin(t * 0.8 + i * 1.5) * 2.5

        const tipX = dx + sway
        const tipY = dripBaseY + dripLen
        const topW = DRIP_W - i % 2 * 1  // slight width variation

        // Draw teardrop tentacle using bezier curve
        ctx.beginPath()
        ctx.moveTo(dx - topW, dripBaseY)
        ctx.bezierCurveTo(
          dx - topW, dripBaseY + dripLen * 0.55,
          tipX - 1,  tipY - 4,
          tipX,      tipY,             // tip point
        )
        ctx.bezierCurveTo(
          tipX + 1,  tipY - 4,
          dx + topW, dripBaseY + dripLen * 0.55,
          dx + topW, dripBaseY,
        )
        ctx.closePath()

        // Tentacle gradient: brighter at top, fades at tip
        const tg = ctx.createLinearGradient(dx, dripBaseY, tipX, tipY)
        tg.addColorStop(0,    toRgba(bodyC, 0.75))
        tg.addColorStop(0.45, toRgba(bodyC, 0.55))
        tg.addColorStop(0.80, toRgba(bodyC, 0.30))
        tg.addColorStop(1,    toRgba(bodyC, 0.05))
        ctx.fillStyle = tg
        ctx.fill()

        // Thin highlight line down centre of tentacle
        ctx.beginPath()
        ctx.moveTo(dx, dripBaseY + 2)
        ctx.quadraticCurveTo(dx + sway * 0.5, dripBaseY + dripLen * 0.5, tipX, tipY)
        ctx.strokeStyle = toRgba(rimC, 0.20)
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // ── Body shape — organic rippling dome ─────────────────────────────
      // Idle ripple: subtle high-freq wobble on the body edge
      ctx.beginPath()
      const steps = 120
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2 - Math.PI / 2
        const cosA = Math.cos(a)
        const sinA = Math.sin(a)

        let rx = BODY_RX
        let ry = BODY_RY

        // Ear / crown bumps at sides
        const earF = Math.pow(Math.max(0, Math.abs(cosA) - 0.62) / 0.38, 2)
        rx += earF * EAR_PEAK

        // Bottom flare
        if (sinA > 0) ry += sinA * 3.0

        // Idle ripple — three superimposed waves at different frequencies
        const ripple = state === 'idle'
          ? Math.sin(a * 3 + t * 2.1) * 0.8
          + Math.sin(a * 5 + t * 1.3 + 1.0) * 0.4
          + Math.sin(a * 7 + t * 0.9 + 2.2) * 0.2
          : 0

        const x = cx + cosA * (rx + ripple * 0.6)
        const y = cy + sinA * (ry + ripple * 0.4)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()

      // Body radial gradient: slightly lighter upper-centre, darker edges
      const bg = ctx.createRadialGradient(
        cx - BODY_RX * 0.10, cy - BODY_RY * 0.20, BODY_RY * 0.05,
        cx,                   cy,                   BODY_RX * 1.0,
      )
      const lightBody = lerpRGB(bodyC, JELLY_MID, 0.35)
      bg.addColorStop(0,    toRgba(lightBody, 0.92))
      bg.addColorStop(0.40, toRgba(bodyC,     0.85))
      bg.addColorStop(0.75, toRgba(bodyC,     0.80))
      bg.addColorStop(1,    toRgba(JELLY_DARK, 0.90))
      ctx.fillStyle = bg
      ctx.fill()

      // Subtle body border
      ctx.strokeStyle = toRgba(JELLY_MID, 0.18)
      ctx.lineWidth = 1.0
      ctx.stroke()

      // ── Underside rim light ────────────────────────────────────────────
      // Bright teal crescent at the very bottom of the body
      const rimY = cy + BODY_RY * 0.55
      const rg = ctx.createRadialGradient(cx, rimY, 0, cx, rimY, BODY_RX * 0.75)
      rg.addColorStop(0,    toRgba(rimC, 0.55 + breathN * 0.12))
      rg.addColorStop(0.40, toRgba(rimC, 0.18))
      rg.addColorStop(1,    toRgba(rimC, 0))
      ctx.beginPath()
      ctx.ellipse(cx, rimY, BODY_RX * 0.70, BODY_RY * 0.28, 0, 0, Math.PI * 2)
      ctx.fillStyle = rg
      ctx.fill()

      // ── Inner depth shadow (top) ───────────────────────────────────────
      const shadowG = ctx.createRadialGradient(cx, cy - BODY_RY * 0.1, 0, cx, cy - BODY_RY * 0.1, BODY_RX * 0.85)
      shadowG.addColorStop(0,   'rgba(0,0,0,0)')
      shadowG.addColorStop(0.7, 'rgba(0,0,0,0)')
      shadowG.addColorStop(1,   'rgba(0,0,0,0.22)')
      ctx.beginPath()
      ctx.ellipse(cx, cy, BODY_RX * 0.90, BODY_RY * 0.88, 0, 0, Math.PI * 2)
      ctx.fillStyle = shadowG
      ctx.fill()

      // ── Eyes ───────────────────────────────────────────────────────────
      const eyeLX = cx - EYE_SPACING / 2
      const eyeRX = cx + EYE_SPACING / 2
      const eyeY  = cy + EYE_Y_OFF

      if (isAggressive) {
        // Spiral eyes when angry
        for (const ex of [eyeLX, eyeRX]) {
          ctx.beginPath()
          ctx.arc(ex, eyeY, EYE_RADIUS, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,0,0,0.92)'
          ctx.fill()
          ctx.beginPath()
          for (let si = 0; si <= 30; si++) {
            const sf = si / 30
            const sa = sf * Math.PI * 2 * 2.5 + t * 4
            const sr = EYE_RADIUS * 0.65 * sf
            const spx = ex + Math.cos(sa) * sr
            const spy = eyeY + Math.sin(sa) * sr
            si === 0 ? ctx.moveTo(spx, spy) : ctx.lineTo(spx, spy)
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.85)'
          ctx.lineWidth = 1.5
          ctx.lineCap = 'round'
          ctx.stroke()
        }
      } else if (state === 'drag') {
        // X eyes when dragging
        for (const ex of [eyeLX, eyeRX]) {
          const dir = ex < cx ? 1 : -1
          ctx.beginPath()
          ctx.arc(ex + dir * 3, eyeY + 2, 5, Math.PI * 1.2, Math.PI * 1.8, false)
          ctx.arc(ex - dir * 3, eyeY + 2, 5, Math.PI * -0.2, Math.PI * 0.3, false)
          ctx.strokeStyle = 'rgba(0,0,0,0.85)'
          ctx.lineWidth = 2.5
          ctx.lineCap = 'round'
          ctx.stroke()
        }
      } else {
        // Normal: solid dark circles (matching reference image)
        for (const ex of [eyeLX, eyeRX]) {
          // Outer eye circle
          ctx.beginPath()
          ctx.arc(ex, eyeY, EYE_RADIUS, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(5,10,12,0.95)'
          ctx.fill()

          // Tiny inner highlight dot
          ctx.beginPath()
          ctx.arc(ex - 2.5, eyeY - 2.5, 2.0, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.70)'
          ctx.fill()

          // Second tiny highlight
          ctx.beginPath()
          ctx.arc(ex + 1.5, eyeY + 1.5, 0.9, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.38)'
          ctx.fill()
        }
      }

      // ── Top specular highlight ─────────────────────────────────────────
      const spX = cx - BODY_RX * 0.15
      const spY = cy - BODY_RY * 0.42
      const sg  = ctx.createRadialGradient(spX, spY, 0, spX, spY, 16)
      sg.addColorStop(0,   'rgba(255,255,255,0.40)')
      sg.addColorStop(0.25,'rgba(255,255,255,0.14)')
      sg.addColorStop(0.6, 'rgba(255,255,255,0.03)')
      sg.addColorStop(1,   'rgba(255,255,255,0)')
      ctx.beginPath()
      ctx.ellipse(spX, spY, 16, 9, -0.3, 0, Math.PI * 2)
      ctx.fillStyle = sg
      ctx.fill()

      // ── Anger mark (aggressive drag only) ─────────────────────────────
      if (isAggressive) {
        const angY = cy - BODY_RY - 16
        const ap   = Math.sin(t * 5) * 0.06 + 0.94
        ctx.save()
        ctx.translate(cx, angY)
        ctx.scale(ap, ap)
        const s = 7
        ctx.strokeStyle = 'rgba(255,140,180,0.80)'
        ctx.lineWidth = 2.2
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke()
        ctx.fillStyle = 'rgba(255,140,180,0.65)'
        for (const [ddx, ddy] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
          ctx.beginPath(); ctx.arc(ddx, ddy, 1.6, 0, Math.PI * 2); ctx.fill()
        }
        ctx.restore()
      }

      // ── Thinking FX ───────────────────────────────────────────────────
      if (isProcessing) {
        const tp = Math.sin(t * 5) * 0.3 + 0.7
        for (let ri = 0; ri < 2; ri++) {
          const rr = Math.max(BODY_RX, BODY_RY) + 8 + ri * 12
          ctx.beginPath()
          ctx.arc(cx, cy, rr, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(100,200,220,${0.10 * tp / (ri + 1)})`
          ctx.lineWidth = ri === 0 ? 2 : 1
          ctx.stroke()
        }
      }

      ctx.restore()
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [isProcessing, isDragging])

  // ── Global cursor tracking ────────────────────────────────────────────

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      cursorXRef.current = e.clientX
      cursorYRef.current = e.clientY
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  // ── Hover ─────────────────────────────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    isHoveredRef.current = true
  }, [])

  const handleMouseLeave = useCallback(() => {
    isHoveredRef.current = false
  }, [])

  // ── Click / Drag ──────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      isPointerDownRef.current = true
      isDraggingRef.current = false
      didDragRef.current = false
      aggressiveRef.current = false
      lastMovePosRef.current = { x: e.screenX, y: e.screenY }
      velocityXRef.current = 0
      velocityYRef.current = 0
      startScreenRef.current = { x: e.screenX, y: e.screenY }

      getWindowPosition()
        .then((wp) => {
          startWindowRef.current = wp
          setBlobScreenPos({ x: wp.x + BLOB.HALF, y: wp.y + BLOB.HALF })
        })
        .catch(() => {})

      const onMove = (me: MouseEvent) => {
        if (!isPointerDownRef.current || !startScreenRef.current || !startWindowRef.current) return
        const dx = me.screenX - startScreenRef.current.x
        const dy = me.screenY - startScreenRef.current.y
        if (!isDraggingRef.current) {
          if (Math.sqrt(dx * dx + dy * dy) <= DRAG_THRESHOLD) return
          isDraggingRef.current = true
          didDragRef.current = true
          dragStartTimeRef.current = performance.now()
          aggressiveRef.current = false
          setIsDragging(true)
        }

        if (lastMovePosRef.current) {
          const vx = me.screenX - lastMovePosRef.current.x
          const vy = me.screenY - lastMovePosRef.current.y
          velocityXRef.current = vx * 0.3 + velocityXRef.current * 0.7
          velocityYRef.current = vy * 0.3 + velocityYRef.current * 0.7
          const speed = Math.sqrt(velocityXRef.current ** 2 + velocityYRef.current ** 2)
          if (speed > 60) {
            aggressiveRef.current = true
          }
        }
        lastMovePosRef.current = { x: me.screenX, y: me.screenY }

        const elapsed = performance.now() - dragStartTimeRef.current
        if (elapsed > AGGRESSIVE_DRAG_MS) {
          aggressiveRef.current = true
        }

        const nx = startWindowRef.current.x + dx
        const ny = startWindowRef.current.y + dy
        setWindowPosition(nx, ny).catch(() => {})
        setBlobScreenPos({ x: nx + BLOB.HALF, y: ny + BLOB.HALF })
        if (useConfigStore.getState().textboxOpen) {
          setChatWindowPosition(nx + BLOB.HALF - CHAT_W * 0.5, ny + BLOB.SIZE + 10).catch(() => {})
        }
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        if (!isPointerDownRef.current) return
        isPointerDownRef.current = false

        aggressiveRef.current = false

        if (!didDragRef.current) {
          clickBounceRef.current = BLOB.CLICK_BOUNCE_DURATION
          const open = useConfigStore.getState().textboxOpen
          if (open) {
            setTextboxOpen(false)
            hideChatWindow().catch(() => {})
          } else {
            Promise.all([getWindowPosition(), getScreenSize()])
              .then(([wp, sc]) => {
                const chatX = Math.max(0, Math.min(wp.x + BLOB.HALF - CHAT_W * 0.5, sc.width - CHAT_W))
                const chatY = Math.max(0, Math.min(wp.y + BLOB.SIZE + 10, sc.height - CHAT_H_COLLAPSED))
                setBlobScreenPos({ x: wp.x + BLOB.HALF, y: wp.y + BLOB.SIZE - BLOB.HALF })
                setTextboxOpen(true)
                showChatWindow(chatX, chatY).catch(() => {})
              })
              .catch(() => {})
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
    },
    [setIsDragging, setTextboxOpen, setBlobScreenPos],
  )

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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    />
  )
}
