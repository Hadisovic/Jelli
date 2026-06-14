import { useEffect, useRef, useCallback } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { BLOB } from '@/lib/constants'

function blobNoise(angle: number, time: number, amplitude: number): number {
  const n1 = Math.sin(angle * 2 + time * 0.8) * amplitude
  const n2 = Math.sin(angle * 4 + time * 1.3) * amplitude * 0.5
  const n3 = Math.sin(angle * 7 + time * 2.1) * amplitude * 0.25
  return n1 + n2 + n3
}

export function BlobCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const setExpanded = useConfigStore((s) => s.setExpanded)
  const expanded = useConfigStore((s) => s.expanded)
  const isProcessing = useChatStore((s) => s.isProcessing)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const draw = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // State-based palette selection
      const hue = isProcessing ? 270 : expanded ? 210 : (time / 1000 * BLOB.HUE_SPEED) % 360
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
  }, [expanded, isProcessing])

  const handleClick = useCallback(() => {
    setExpanded(!expanded)
  }, [expanded, setExpanded])

  return (
    <canvas
      ref={canvasRef}
      width={BLOB.SIZE}
      height={BLOB.SIZE}
      className="fixed bottom-5 right-5 z-10 cursor-pointer"
      onClick={handleClick}
    />
  )
}
