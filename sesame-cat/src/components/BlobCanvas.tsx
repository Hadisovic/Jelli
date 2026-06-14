import { useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'

const DRAG_THRESHOLD = 5 // px — distinguish click from drag

function blobNoise(angle: number, time: number, amplitude: number): number {
  const n1 = Math.sin(angle * 2 + time * 0.8) * amplitude
  const n2 = Math.sin(angle * 4 + time * 1.3) * amplitude * 0.5
  const n3 = Math.sin(angle * 7 + time * 2.1) * amplitude * 0.25
  return n1 + n2 + n3
}

export function BlobCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const setTextboxOpen = useConfigStore((s) => s.setTextboxOpen)
  const textboxOpen = useConfigStore((s) => s.textboxOpen)
  const isDragging = useConfigStore((s) => s.isDragging)
  const setIsDragging = useConfigStore((s) => s.setIsDragging)
  const isProcessing = useChatStore((s) => s.isProcessing)

  const dragStartPos = useRef({ x: 0, y: 0 })
  const hasMoved = useRef(false)

  // Draw animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const draw = (time: number) => {
      // Clear canvas with transparency (not white/black)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // State-based palette: processing → blue, dragging → cyan, idle → purple
      const hue = isProcessing ? 270 : isDragging ? 200 : textboxOpen ? 210 : (time / 1000 * BLOB.HUE_SPEED) % 360
      const breath = Math.sin(time / 1000 * (Math.PI * 2 / (BLOB.BREATH_PERIOD_MS / 1000))) * BLOB.BREATH_AMPLITUDE
      const radius = BLOB.RADIUS + breath

      const cx = canvas.width / 2
      const cy = canvas.height / 2

      ctx.beginPath()
      const segments = 64
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2
        const noise = blobNoise(angle, time / 1000, BLOB.NOISE_AMPLITUDE)
        const r = radius + noise
        const x = cx + Math.cos(angle) * r
        const y = cy + Math.sin(angle) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()

      // Glassmorphism Gradient
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius + BLOB.NOISE_AMPLITUDE)
      grad.addColorStop(0, `hsla(${hue}, 50%, 60%, 0.1)`)
      grad.addColorStop(0.4, `hsla(${hue}, 55%, 55%, 0.3)`)
      grad.addColorStop(1, `hsla(${hue}, 65%, 45%, 0.6)`)

      ctx.fillStyle = grad
      ctx.fill()

      // Thinking glow
      if (isProcessing) {
        ctx.beginPath()
        ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2)
        ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.4)`
        ctx.lineWidth = 3
        ctx.stroke()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [textboxOpen, isProcessing, isDragging])

  // Handle blob interaction: distinguish click from drag
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return // Left mouse button only
    e.preventDefault()
    
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    hasMoved.current = false
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStartPos.current) return
    
    const dx = Math.abs(e.clientX - dragStartPos.current.x)
    const dy = Math.abs(e.clientY - dragStartPos.current.y)
    
    // If moved beyond threshold, treat as drag
    if (!hasMoved.current && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
      hasMoved.current = true
      setIsDragging(true)
      invoke('start_dragging').catch(() => {})
    }
  }, [setIsDragging])

  const handleMouseUp = useCallback(() => {
    // If not moved significantly, treat as click
    if (!hasMoved.current) {
      setTextboxOpen(!textboxOpen)
    }
    setIsDragging(false)
    hasMoved.current = false
    dragStartPos.current = { x: 0, y: 0 }
  }, [textboxOpen, setTextboxOpen, setIsDragging])

  return (
    <canvas
      ref={canvasRef}
      width={BLOB.SIZE}
      height={BLOB.SIZE}
      className="fixed top-1/2 left-1/2 z-20 cursor-grab active:cursor-grabbing"
      style={{
        transform: 'translate(-50%, -50%)',
        touchAction: 'none',
        backgroundColor: 'transparent',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  )
}
