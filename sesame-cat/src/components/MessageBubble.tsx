import { motion } from 'motion/react'
import type { Message } from '@/stores/chat'
import { springs } from '@/lib/animation-presets'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isThinking = message.status === 'thinking'
  const isStreaming = isThinking && message.text.length > 0
  const showDots = isThinking && message.text.length === 0

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={springs.messageEnter}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-5 ${
          isUser
            ? 'bg-accent/80 text-white rounded-br-md'
            : 'bg-white/10 text-white/90 rounded-bl-md'
        } ${isThinking ? 'glow-thinking' : ''}`}
      >
        {showDots ? (
          /* Pure thinking — no tokens yet */
          <div className="flex items-center gap-1.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          /* Streaming or done — show text with optional cursor */
          <span>
            {message.text}
            {isStreaming && (
              <span className="inline-block w-0.5 h-3.5 bg-white/50 ml-0.5 align-middle animate-pulse" />
            )}
          </span>
        )}
      </div>
    </motion.div>
  )
}
