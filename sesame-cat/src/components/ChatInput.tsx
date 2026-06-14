import { useRef, useCallback, useEffect } from 'react'
import { useChatStore } from '@/stores/chat'
import { useConfigStore } from '@/stores/config'
import { sendChatMessage, generateRequestId } from '@/lib/api'

export function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const addMessage = useChatStore((s) => s.addMessage)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const setProcessing = useChatStore((s) => s.setProcessing)
  const registerRequest = useChatStore((s) => s.registerRequest)
  const valueRef = useRef('')

  const config = useConfigStore()

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [])

  const handleSend = useCallback(async () => {
    const text = valueRef.current.trim()
    if (!text || isProcessing) return
    valueRef.current = ''
    if (textareaRef.current) {
      textareaRef.current.value = ''
      autoResize()
    }

    addMessage({ text, role: 'user', status: 'sent' })

    setProcessing(true)
    const thinkingId = addMessage({ text: '', role: 'assistant', status: 'thinking' })

    const requestId = generateRequestId()
    registerRequest(requestId, thinkingId)

    const messages = [
      ...useChatStore.getState().messages
        .filter((m) => m.status !== 'thinking')
        .map((m) => ({ role: m.role, content: m.text })),
    ]

    try {
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
    } catch (err) {
      useChatStore.getState().updateMessage(thinkingId, {
        text: `Error: ${err}`,
        status: 'done',
      })
      useChatStore.getState().setProcessing(false)
    }
  }, [addMessage, isProcessing, setProcessing, registerRequest, autoResize, config])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    valueRef.current = (e.target as HTMLTextAreaElement).value
    autoResize()
  }, [autoResize])

  useEffect(() => {
    if (!isProcessing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isProcessing])

  return (
    <div className="glass-panel rounded-xl overflow-hidden">
      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="Message..."
          className="flex-1 bg-transparent text-white/90 placeholder-white/30 outline-none resize-none text-sm leading-5 py-1.5 max-h-[120px]"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={isProcessing}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/80 hover:bg-accent disabled:opacity-30 flex items-center justify-center transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 7L13 1L7 13L5.5 8.5L1 7Z" fill="white" stroke="white" strokeWidth="0.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}
