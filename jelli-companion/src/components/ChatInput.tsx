import { useRef, useCallback, useEffect, useState } from 'react'
import { useChatStore } from '@/stores/chat'
import { useConfigStore } from '@/stores/config'
import { sendChatMessage, generateRequestId, emitUserTyping, emitUserIdle } from '@/lib/api'

const COMMANDS = [
  { value: '/settings', label: '/settings', desc: 'Open settings' },
  { value: '/clear', label: '/clear', desc: 'Clear chat history' },
]

export function ChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const addMessage = useChatStore((s) => s.addMessage)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const setProcessing = useChatStore((s) => s.setProcessing)
  const registerRequest = useChatStore((s) => s.registerRequest)
  const valueRef = useRef('')

  const config = useConfigStore()

  const [showCommands, setShowCommands] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [filteredCommands, setFilteredCommands] = useState(COMMANDS)

  const handleSelectCommand = useCallback((val: string) => {
    if (textareaRef.current) {
      textareaRef.current.value = val
      valueRef.current = val
      setShowCommands(false)
      autoResize()
      textareaRef.current.focus()
    }
  }, [autoResize])

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

    if (text === '/settings') {
      config.setExpanded(true)
      config.setSettingsOpen(true)
      return
    }

    if (text === '/clear') {
      useChatStore.getState().clearMessages()
      return
    }

    addMessage({ text, role: 'user', status: 'sent' })

    setProcessing(true)
    const thinkingId = addMessage({ text: '', role: 'assistant', status: 'thinking' })

    const requestId = generateRequestId()
    registerRequest(requestId, thinkingId)

    const allMessages = useChatStore.getState().messages
      .filter((m) => m.status !== 'thinking')
      .map((m) => ({ role: m.role, content: m.text }))
    // Limit context: keep only the last N message pairs (user + assistant)
    const ctxLimit = config.contextMessages * 2
    const messages = ctxLimit > 0 ? allMessages.slice(-ctxLimit) : allMessages

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
        repeat_penalty: config.repeatPenalty,
        frequency_penalty: config.frequencyPenalty,
      }, config.currentExpression)
    } catch (err) {
      useChatStore.getState().updateMessage(thinkingId, {
        text: `Error: ${err}`,
        status: 'done',
      })
      useChatStore.getState().setProcessing(false)
    }
  }, [addMessage, isProcessing, setProcessing, registerRequest, autoResize, config])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveCommandIndex((prev) => (prev + 1) % filteredCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveCommandIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = filteredCommands[activeCommandIndex]
        if (cmd) {
          handleSelectCommand(cmd.value)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowCommands(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend, showCommands, filteredCommands, activeCommandIndex, handleSelectCommand])

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const val = (e.target as HTMLTextAreaElement).value
    valueRef.current = val
    autoResize()

    if (val.startsWith('/')) {
      const filtered = COMMANDS.filter((c) =>
        c.value.toLowerCase().startsWith(val.toLowerCase())
      )
      setFilteredCommands(filtered)
      setShowCommands(filtered.length > 0)
      setActiveCommandIndex(0)
    } else {
      setShowCommands(false)
    }
  }, [autoResize])

  useEffect(() => {
    if (!isProcessing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isProcessing])

  // Typing detection: emit events so the blob can show yellow curiosity state
  const wasTypingRef = useRef(false)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return

    const checkAndEmit = () => {
      const hasText = (el.value ?? '').trim().length > 0
      if (hasText && !wasTypingRef.current) {
        wasTypingRef.current = true
        emitUserTyping()
      } else if (!hasText && wasTypingRef.current) {
        wasTypingRef.current = false
        emitUserIdle()
      }
    }

    const onFocus = () => checkAndEmit()
    const onBlur = () => {
      if (wasTypingRef.current) {
        wasTypingRef.current = false
        emitUserIdle()
      }
    }
    const onInputHandler = () => checkAndEmit()

    el.addEventListener('focus', onFocus)
    el.addEventListener('blur', onBlur)
    el.addEventListener('input', onInputHandler)
    return () => {
      el.removeEventListener('focus', onFocus)
      el.removeEventListener('blur', onBlur)
      el.removeEventListener('input', onInputHandler)
    }
  }, [])

  return (
    <div className="flex flex-col gap-1.5">
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
      {showCommands && (
        <div className="command-dropdown-below">
          {filteredCommands.map((cmd, idx) => (
            <button
              key={cmd.value}
              type="button"
              className={`command-item-below${idx === activeCommandIndex ? ' active' : ''}`}
              onClick={() => handleSelectCommand(cmd.value)}
            >
              <span className="command-label-below">{cmd.label}</span>
              <span className="command-desc-below">{cmd.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
