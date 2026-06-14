import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { motion, AnimatePresence } from 'motion/react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { stopGeneration, setWindowGeometry } from '@/lib/api'
import { SettingsPanel } from './SettingsPanel'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'

/**
 * ChatWidget — expanded view showing chat history and full input.
 * Toggled via Ctrl+Space keyboard shortcut or programmatically.
 * Different from ChatTextbox which is the quick-input floating textbox.
 */
export function ChatWidget() {
  const expanded = useConfigStore((s) => s.expanded)
  const setExpanded = useConfigStore((s) => s.setExpanded)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const latestRequestId = useChatStore((s) => s.latestRequestId)

  // Drag the expanded chat window via native Tauri drag
  const handleDragMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    invoke('start_dragging').catch(() => {})
  }, [])

  const handleClose = useCallback(() => {
    setExpanded(false)
    setWindowGeometry(0, 0, 140, 140).catch(() => {})
  }, [setExpanded])

  return (
    <AnimatePresence>
      {expanded && (
        <motion.div
          key="chat-panel"
          className="fixed inset-0 z-50"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="glass-panel rounded-t-2xl w-full h-full flex flex-col overflow-hidden">

            {/* ── Header / drag handle ── */}
            <div
              className="h-8 flex items-center justify-between px-3 flex-shrink-0 cursor-grab active:cursor-grabbing"
              onMouseDown={handleDragMouseDown}
            >
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                title="Settings"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1C6.724 1 6.5 1.224 6.5 1.5V2.771C5.496 3.123 4.619 3.743 3.99 4.554L2.838 4.095C2.58 4.001 2.289 4.119 2.195 4.378L1.695 5.622C1.601 5.88 1.719 6.171 1.978 6.265L3.13 6.724C3.044 7.142 3 7.57 3 8C3 8.43 3.044 8.858 3.13 9.276L1.978 9.735C1.719 9.829 1.601 10.12 1.695 10.378L2.195 11.622C2.289 11.88 2.58 11.998 2.838 11.905L3.99 11.446C4.619 12.257 5.496 12.877 6.5 13.229V14.5C6.5 14.776 6.724 15 7 15C7.276 15 7.5 14.776 7.5 14.5V13.229C8.504 12.877 9.381 12.257 10.01 11.446L11.162 11.905C11.42 11.998 11.711 11.88 11.805 11.622L12.305 10.378C12.399 10.12 12.281 9.829 12.022 9.735L10.87 9.276C10.956 8.858 11 8.43 11 8C11 7.57 10.956 7.142 10.87 6.724L12.022 6.265C12.281 6.171 12.399 5.88 12.305 5.622L11.805 4.378C11.711 4.119 11.42 4.001 11.162 4.095L10.01 4.554C9.381 3.743 8.504 3.123 7.5 2.771V1.5C7.5 1.224 7.276 1 7 1ZM7 4C9.209 4 11 5.791 11 8C11 10.209 9.209 12 7 12C4.791 12 3 10.209 3 8C3 5.791 4.791 4 7 4ZM7 5.5C6.172 5.5 5.5 6.172 5.5 7C5.5 7.828 6.172 8.5 7 8.5C7.828 8.5 8.5 7.828 8.5 7C8.5 6.172 7.828 5.5 7 5.5Z" fill="currentColor" />
                </svg>
              </button>

              <div className="w-10 h-1 rounded-full bg-white/20" />

              {isProcessing && latestRequestId && (
                <button
                  type="button"
                  onClick={() => stopGeneration(latestRequestId)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-500/30 text-red-400/70 hover:text-red-400 transition-colors"
                  title="Stop generation"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <rect x="1" y="1" width="10" height="10" rx="1.5" />
                  </svg>
                </button>
              )}

              <button
                type="button"
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                onClick={handleClose}
                onMouseDown={(e) => e.stopPropagation()}
                title="Close (Ctrl+Space)"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* ── Messages ── */}
            <div className="relative flex-1 overflow-hidden">
              <MessageList />
              <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
            </div>

            {/* ── Input ── */}
            <div className="flex-shrink-0 px-4 pb-3">
              <ChatInput />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
