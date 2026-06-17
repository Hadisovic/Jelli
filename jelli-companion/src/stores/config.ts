import { create } from 'zustand'

export type LLMProvider = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'deepseek'
export type VizPreset = 'orb' | 'wave' | 'galaxy' | 'tunnel'
export type BlobExpression = 'idle' | 'annoyed' | 'dizzy' | 'sleepy' | 'happy' | 'surprised' | 'shy' | 'mad' | 'typing' | 'thinking'

interface ConfigStore {
  llmProvider: LLMProvider
  llmModel: string
  apiKey: string
  ollamaUrl: string
  temperature: number
  maxTokens: number
  contextMessages: number
  speakerId: number
  quantization: 'fp16' | 'int8' | 'int4'
  vizPreset: VizPreset
  expanded: boolean
  textboxOpen: boolean
  isDragging: boolean
  blobScreenPos: { x: number; y: number } | null
  // ── New settings ──
  blobOpacity: number
  repeatPenalty: number
  frequencyPenalty: number
  blobSize: number
  alwaysOnTop: boolean
  currentExpression: BlobExpression
  // ── Setters ──
  setLlmProvider: (p: LLMProvider) => void
  setLlmModel: (m: string) => void
  setApiKey: (k: string) => void
  setOllamaUrl: (u: string) => void
  setTemperature: (t: number) => void
  setMaxTokens: (t: number) => void
  setContextMessages: (n: number) => void
  setSpeakerId: (id: number) => void
  setQuantization: (q: 'fp16' | 'int8' | 'int4') => void
  setVizPreset: (p: VizPreset) => void
  setExpanded: (v: boolean) => void
  setTextboxOpen: (v: boolean) => void
  setIsDragging: (v: boolean) => void
  setBlobScreenPos: (pos: { x: number; y: number } | null) => void
  setBlobOpacity: (v: number) => void
  setRepeatPenalty: (v: number) => void
  setFrequencyPenalty: (v: number) => void
  setBlobSize: (v: number) => void
  setAlwaysOnTop: (v: boolean) => void
  setCurrentExpression: (e: BlobExpression) => void
  // Bulk loader
  loadSettings: (s: Partial<ConfigStore>) => void
}

export const useConfigStore = create<ConfigStore>((set) => ({
  llmProvider: 'ollama',
  llmModel: 'qwen:4b',
  apiKey: '',
  ollamaUrl: 'http://localhost:11434',
  temperature: 0.7,
  maxTokens: 2048,
  contextMessages: 3,
  speakerId: 0,
  quantization: 'fp16',
  vizPreset: 'orb',
  expanded: false,
  textboxOpen: false,
  isDragging: false,
  blobScreenPos: null,
  blobOpacity: 1.0,
  repeatPenalty: 1.15,
  frequencyPenalty: 0.1,
  blobSize: 200,
  alwaysOnTop: true,
  currentExpression: 'idle',
  setLlmProvider: (llmProvider) => set({ llmProvider }),
  setLlmModel: (llmModel) => set({ llmModel }),
  setApiKey: (apiKey) => set({ apiKey }),
  setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
  setTemperature: (temperature) => set({ temperature }),
  setMaxTokens: (maxTokens) => set({ maxTokens }),
  setContextMessages: (contextMessages) => set({ contextMessages }),
  setSpeakerId: (speakerId) => set({ speakerId }),
  setQuantization: (quantization) => set({ quantization }),
  setVizPreset: (vizPreset) => set({ vizPreset }),
  setExpanded: (expanded) => set({ expanded }),
  setTextboxOpen: (textboxOpen) => set({ textboxOpen }),
  setIsDragging: (isDragging) => set({ isDragging }),
  setBlobScreenPos: (blobScreenPos) => set({ blobScreenPos }),
  setBlobOpacity: (blobOpacity) => set({ blobOpacity }),
  setRepeatPenalty: (repeatPenalty) => set({ repeatPenalty }),
  setFrequencyPenalty: (frequencyPenalty) => set({ frequencyPenalty }),
  setBlobSize: (blobSize) => set({ blobSize }),
  setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
  setCurrentExpression: (currentExpression) => set({ currentExpression }),
  loadSettings: (s) => set((prev) => ({
    ...prev,
    ...s,
    // Prevent runtime-only state from being overwritten
    expanded: prev.expanded,
    textboxOpen: prev.textboxOpen,
    isDragging: prev.isDragging,
    blobScreenPos: prev.blobScreenPos,
  })),
}))
