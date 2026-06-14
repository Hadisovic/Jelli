import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'motion/react'
import { useChatStore } from '@/stores/chat'
import { MessageBubble } from './MessageBubble'

export function MessageList() {
  const messages = useChatStore((s) => s.messages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-2">
      <AnimatePresence mode="popLayout">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  )
}
