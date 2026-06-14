import { create } from 'zustand'

export interface Message {
  id: string
  text: string
  role: 'user' | 'assistant'
  timestamp: number
  status: 'sending' | 'sent' | 'thinking' | 'done'
}

interface ChatState {
  messages: Message[]
  isProcessing: boolean
  pendingRequests: Record<string, string>
  latestRequestId: string | null
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => string
  updateMessage: (id: string, updates: Partial<Message>) => void
  appendToMessage: (id: string, text: string) => void
  removeMessage: (id: string) => void
  clearMessages: () => void
  setProcessing: (v: boolean) => void
  registerRequest: (requestId: string, messageId: string) => void
  getMessageIdForRequest: (requestId: string) => string | undefined
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isProcessing: false,
  pendingRequests: {},
  latestRequestId: null,
  addMessage: (msg) => {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    set((s) => ({
      messages: [...s.messages, { ...msg, id, timestamp: Date.now() }],
    }))
    return id
  },
  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),
  appendToMessage: (id, text) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, text: m.text + text } : m
      ),
    })),
  removeMessage: (id) =>
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
  clearMessages: () => set({ messages: [], pendingRequests: {}, latestRequestId: null }),
  setProcessing: (v) => set({ isProcessing: v }),
  registerRequest: (requestId, messageId) =>
    set((s) => ({
      pendingRequests: { ...s.pendingRequests, [requestId]: messageId },
      latestRequestId: requestId,
    })),
  getMessageIdForRequest: (requestId) => get().pendingRequests[requestId],
}))
