import { useRef, useEffect, useCallback, useState } from 'react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { sendChatMessage, hideChatWindow, resizeWindow } from '@/lib/api'

const CHAT_H_EXPANDED = 250

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function ChatTextbox() {
  const addMessage = useChatStore((s) => s.addMessage)
  const setProcessing = useChatStore((s) => s.setProcessing)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const isPlayingAudio = useChatStore((s) => s.isPlayingAudio)
  const registerRequest = useChatStore((s) => s.registerRequest)
  const lastAssistant = useChatStore((s) => {
    for (let i = s.messages.length - 1; i >= 0; i--) {
      if (s.messages[i].role === 'assistant') return s.messages[i]
    }
    return null
  })
  const config = useConfigStore()

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [sendFlash, setSendFlash] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }, [])

  useEffect(() => {
    if (isProcessing) {
      resizeWindow(360, CHAT_H_EXPANDED).catch(() => {})
    }
  }, [isProcessing])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideChatWindow().catch(() => {})
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const root = document.documentElement

    const applyHue = () => {
      const hue = localStorage.getItem('blob-hue')
      const sat = localStorage.getItem('blob-sat')
      const light = localStorage.getItem('blob-light')
      if (hue) {
        root.style.setProperty('--blob-hue', hue)
      }
      if (sat) {
        root.style.setProperty('--blob-sat', sat)
      }
      if (light) {
        root.style.setProperty('--blob-light', light)
      }
    }

    applyHue()
    window.addEventListener('storage', applyHue)
    const interval = setInterval(applyHue, 100)

    return () => {
      window.removeEventListener('storage', applyHue)
      clearInterval(interval)
    }
  }, [])

  const handleSend = useCallback(async () => {
    const text = inputRef.current?.value.trim()
    if (!text || isProcessing) return

    setSendFlash(true)
    setTimeout(() => setSendFlash(false), 600)

    addMessage({ text, role: 'user', status: 'sent' })

    const assistantMsgId = addMessage({
      text: '',
      role: 'assistant',
      status: 'thinking',
    })

    if (inputRef.current) {
      inputRef.current.value = ''
    }
    setProcessing(true)

    try {
      const requestId = generateUUID()
      registerRequest(requestId, assistantMsgId)

      const messages = useChatStore.getState().messages.map((m) => ({
        role: m.role,
        content: m.text,
      }))

      await sendChatMessage(requestId, messages, {
        provider: config.llmProvider,
        model: config.llmModel,
        api_key: config.apiKey || undefined,
        api_url: config.llmProvider === 'ollama' ? config.ollamaUrl : undefined,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        speaker_id: config.speakerId,
        quantization: config.quantization,
      })
    } catch (e) {
      console.error('[ChatTextbox] Failed to send message:', e)
      useChatStore.getState().updateMessage(assistantMsgId, {
        text: `Error: ${(e as Error).message || 'Failed to get response'}`,
        status: 'done',
      })
      setProcessing(false)
    }
  }, [addMessage, setProcessing, registerRequest, config, isProcessing])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isProcessing) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, isProcessing]
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element)?.tagName === 'INPUT') return
    e.preventDefault()
  }, [])

  return (
    <div
      ref={containerRef}
      className="chat-container"
      onContextMenu={handleContextMenu}
    >
      <div ref={panelRef} className={`chat-panel${sendFlash ? ' sending' : ''}`}>
        {lastAssistant?.text && (
          <div className="chat-response">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {lastAssistant.text}
                {(isProcessing || isPlayingAudio) && (
                  <span className="ink-cursor" />
                )}
              </div>
              {isPlayingAudio && (
                <div className="flex-shrink-0 flex gap-[3px] items-center h-4" title="Playing audio">
                  <span className="w-[3px] h-2 rounded-full" style={{ background: 'hsla(var(--blob-hue), 70%, 65%, 0.8)', animation: 'audio-bar 0.6s ease-in-out infinite alternate', animationDelay: '0ms' }} />
                  <span className="w-[3px] h-3 rounded-full" style={{ background: 'hsla(var(--blob-hue), 70%, 65%, 0.8)', animation: 'audio-bar 0.6s ease-in-out infinite alternate', animationDelay: '150ms' }} />
                  <span className="w-[3px] h-2 rounded-full" style={{ background: 'hsla(var(--blob-hue), 70%, 65%, 0.8)', animation: 'audio-bar 0.6s ease-in-out infinite alternate', animationDelay: '300ms' }} />
                </div>
              )}
              {isProcessing && !isPlayingAudio && (
                <div className="flex-shrink-0 flex gap-[3px] items-center h-4" title="Generating">
                  <span className="w-[3px] h-[3px] rounded-full" style={{ background: 'hsla(var(--blob-hue), 60%, 60%, 0.5)', animation: 'thinking-dot 1.2s ease-in-out infinite', animationDelay: '0ms' }} />
                  <span className="w-[3px] h-[3px] rounded-full" style={{ background: 'hsla(var(--blob-hue), 60%, 60%, 0.5)', animation: 'thinking-dot 1.2s ease-in-out infinite', animationDelay: '200ms' }} />
                  <span className="w-[3px] h-[3px] rounded-full" style={{ background: 'hsla(var(--blob-hue), 60%, 60%, 0.5)', animation: 'thinking-dot 1.2s ease-in-out infinite', animationDelay: '400ms' }} />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="chat-input-row">
          <div className="chat-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              placeholder="Say something..."
              className="chat-input"
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
            />
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={isProcessing}
            className="send-btn"
            title="Send (Enter)"
          >
            {isProcessing ? (
              <div className="send-spinner" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
