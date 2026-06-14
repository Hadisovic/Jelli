import { useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { sendChatMessage } from '@/lib/api'

/**
 * Simple UUID v4 generator using Web Crypto API (no external dependency)
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * ChatTextbox — small floating input that appears above/near the blob when clicked.
 * Sends text to AI on Enter, closes on Escape or click outside.
 */
export function ChatTextbox() {
  const textboxOpen = useConfigStore((s) => s.textboxOpen)
  const setTextboxOpen = useConfigStore((s) => s.setTextboxOpen)
  const addMessage = useChatStore((s) => s.addMessage)
  const setProcessing = useChatStore((s) => s.setProcessing)
  const registerRequest = useChatStore((s) => s.registerRequest)
  const config = useConfigStore()

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-focus when textbox opens
  useEffect(() => {
    if (textboxOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [textboxOpen])

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && textboxOpen) {
        setTextboxOpen(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setTextboxOpen(false)
      }
    }

    if (textboxOpen) {
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('click', handleClickOutside)
      return () => {
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('click', handleClickOutside)
      }
    }
  }, [textboxOpen, setTextboxOpen])

  const handleSend = useCallback(async () => {
    const text = inputRef.current?.value.trim()
    if (!text) return

    // Add user message to chat
    addMessage({
      text,
      role: 'user',
      status: 'sent',
    })

    // Add AI response placeholder
    const assistantMsgId = addMessage({
      text: '',
      role: 'assistant',
      status: 'thinking',
    })

    // Clear input and close textbox
    if (inputRef.current) {
      inputRef.current.value = ''
    }
    setTextboxOpen(false)
    setProcessing(true)

    // Send to LLM
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
      console.error('Failed to send message:', e)
      setProcessing(false)
    }
  }, [addMessage, setProcessing, registerRequest, config])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <AnimatePresence>
      {textboxOpen && (
        <motion.div
          ref={containerRef}
          key="textbox"
          className="fixed bottom-32 right-5 z-30"
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {/* Textbox container with glassmorphism */}
          <div className="glass-panel rounded-2xl p-3 shadow-lg w-80">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                type="text"
                placeholder="Say something..."
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/30 transition-all"
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                onClick={handleSend}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white transition-all"
                title="Send (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M1.5 7l10.5-5v10L1.5 7z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Arrow pointing to blob */}
          <div className="absolute bottom-0 right-6 w-2 h-2 rotate-45 bg-white/20 -translate-y-px" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
