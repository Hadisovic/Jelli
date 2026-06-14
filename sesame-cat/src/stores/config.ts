import { create } from 'zustand'

export type LLMProvider = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'deepseek'
export type VizPreset = 'orb' | 'wave' | 'galaxy' | 'tunnel'

interface ConfigStore {
  llmProvider: LLMProvider
  llmModel: string
  apiKey: string
  ollamaUrl: string
  temperature: number
  maxTokens: number
  speakerId: number
  contextMessages: number
  quantization: 'fp16' | 'int8' | 'int4'
  vizPreset: VizPreset
  expanded: boolean // Chat history panel (Ctrl+Space)
  textboxOpen: boolean // Quick-input textbox (click blob)
  isDragging: boolean // Blob dragging state
  setLlmProvider: (p: LLMProvider) => void
  setLlmModel: (m: string) => void
  setApiKey: (k: string) => void
  setOllamaUrl: (u: string) => void
  setTemperature: (t: number) => void
  setMaxTokens: (t: number) => void
  setSpeakerId: (id: number) => void
  setContextMessages: (n: number) => void
  setQuantization: (q: 'fp16' | 'int8' | 'int4') => void
  setVizPreset: (p: VizPreset) => void
  setExpanded: (v: boolean) => void
  setTextboxOpen: (v: boolean) => void
  setIsDragging: (v: boolean) => void
}

export const useConfigStore = create<ConfigStore>((set) => ({
  llmProvider: 'ollama',
  llmModel: 'qwen:4b',
  apiKey: '',
  ollamaUrl: 'http://localhost:11434',
  temperature: 0.7,
  maxTokens: 2048,
  speakerId: 0,
  contextMessages: 3,
  quantization: 'fp16',
  vizPreset: 'orb',
  expanded: false,
  textboxOpen: false,
  isDragging: false,
  setLlmProvider: (llmProvider) => set({ llmProvider }),
  setLlmModel: (llmModel) => set({ llmModel }),
  setApiKey: (apiKey) => set({ apiKey }),
  setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
  setTemperature: (temperature) => set({ temperature }),
  setMaxTokens: (maxTokens) => set({ maxTokens }),
  setSpeakerId: (speakerId) => set({ speakerId }),
  setContextMessages: (contextMessages) => set({ contextMessages }),
  setQuantization: (quantization) => set({ quantization }),
  setVizPreset: (vizPreset) => set({ vizPreset }),
  setExpanded: (expanded) => set({ expanded }),
  setTextboxOpen: (textboxOpen) => set({ textboxOpen }),
  setIsDragging: (isDragging) => set({ isDragging }),
}))
