import { useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useConfigStore } from '@/stores/config'
import type { LLMProvider } from '@/stores/config'
import { saveSettings, loadSettings } from '@/lib/api'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

const SPEAKER_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const PROVIDERS: { value: LLMProvider; label: string }[] = [
  { value: 'ollama', label: 'Ollama (local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
]

// Settings keys that are persisted (excludes runtime-only state)
const PERSISTED_KEYS = [
  'llmProvider', 'llmModel', 'apiKey', 'ollamaUrl',
  'temperature', 'maxTokens', 'contextMessages', 'speakerId',
  'quantization', 'blobOpacity', 'repeatPenalty', 'frequencyPenalty',
  'blobSize', 'alwaysOnTop',
] as const

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const store = useConfigStore
  const speakerId = store((s) => s.speakerId)
  const setSpeakerId = store((s) => s.setSpeakerId)
  const llmProvider = store((s) => s.llmProvider)
  const setLlmProvider = store((s) => s.setLlmProvider)
  const llmModel = store((s) => s.llmModel)
  const setLlmModel = store((s) => s.setLlmModel)
  const apiKey = store((s) => s.apiKey)
  const setApiKey = store((s) => s.setApiKey)
  const ollamaUrl = store((s) => s.ollamaUrl)
  const setOllamaUrl = store((s) => s.setOllamaUrl)
  const temperature = store((s) => s.temperature)
  const setTemperature = store((s) => s.setTemperature)
  const maxTokens = store((s) => s.maxTokens)
  const setMaxTokens = store((s) => s.setMaxTokens)
  const contextMessages = store((s) => s.contextMessages)
  const setContextMessages = store((s) => s.setContextMessages)
  const blobOpacity = store((s) => s.blobOpacity)
  const setBlobOpacity = store((s) => s.setBlobOpacity)
  const repeatPenalty = store((s) => s.repeatPenalty)
  const setRepeatPenalty = store((s) => s.setRepeatPenalty)
  const frequencyPenalty = store((s) => s.frequencyPenalty)
  const setFrequencyPenalty = store((s) => s.setFrequencyPenalty)
  const alwaysOnTop = store((s) => s.alwaysOnTop)
  const setAlwaysOnTop = store((s) => s.setAlwaysOnTop)

  const modelRef = useRef<HTMLInputElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  const needsApiKey = llmProvider !== 'ollama'

  const handleSave = useCallback(async () => {
    const state = useConfigStore.getState()
    const toSave: Record<string, unknown> = {}
    for (const key of PERSISTED_KEYS) {
      toSave[key] = state[key]
    }
    await saveSettings(toSave)
  }, [])

  const handleLoad = useCallback(async () => {
    const data = await loadSettings()
    useConfigStore.getState().loadSettings(data as Record<string, unknown>)
  }, [])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="absolute right-0 top-0 bottom-0 w-4/5 z-50 glass-panel rounded-l-2xl flex flex-col overflow-hidden"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 1 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/8 flex-shrink-0">
              <h2 className="text-sm font-semibold text-white/80">Settings</h2>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleLoad}
                  className="px-2.5 py-1 rounded-lg text-xs bg-white/8 text-white/50 hover:bg-white/15 hover:text-white/80 transition-colors"
                  title="Load from disk"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-2.5 py-1 rounded-lg text-xs bg-accent/30 text-white/70 hover:bg-accent/50 transition-colors"
                  title="Save to disk"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

              {/* ── LLM Section ── */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider">LLM</h3>

                {/* Provider */}
                <section>
                  <label className="settings-label">Provider</label>
                  <div className="space-y-1 mt-1.5">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setLlmProvider(p.value)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                          llmProvider === p.value
                            ? 'bg-accent/30 text-white border border-accent/40'
                            : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Model name */}
                <section>
                  <label className="settings-label">Model</label>
                  <input
                    ref={modelRef}
                    type="text"
                    defaultValue={llmModel}
                    placeholder={llmProvider === 'ollama' ? 'qwen:4b' : 'gpt-4o-mini'}
                    onBlur={() => {
                      if (modelRef.current) setLlmModel(modelRef.current.value.trim() || llmModel)
                    }}
                    className="settings-input mt-1.5"
                  />
                  {llmProvider === 'ollama' && (
                    <p className="text-xs text-white/30 mt-1">
                      Run <span className="font-mono text-white/40">ollama list</span> to see available models
                    </p>
                  )}
                </section>

                {/* API Key (cloud providers) */}
                {needsApiKey && (
                  <section>
                    <label className="settings-label">API Key</label>
                    <input
                      ref={apiKeyRef}
                      type="password"
                      defaultValue={apiKey}
                      placeholder="sk-..."
                      onBlur={() => {
                        if (apiKeyRef.current) setApiKey(apiKeyRef.current.value)
                      }}
                      className="settings-input mt-1.5"
                    />
                  </section>
                )}

                {/* Ollama URL */}
                {llmProvider === 'ollama' && (
                  <section>
                    <label className="settings-label">Ollama URL</label>
                    <input
                      ref={urlRef}
                      type="text"
                      defaultValue={ollamaUrl}
                      placeholder="http://localhost:11434"
                      onBlur={() => {
                        if (urlRef.current) setOllamaUrl(urlRef.current.value.trim() || ollamaUrl)
                      }}
                      className="settings-input mt-1.5"
                    />
                  </section>
                )}

                {/* Temperature */}
                <section>
                  <label className="settings-label">
                    Temperature
                    <span className="ml-auto text-white/40 font-mono text-xs">{temperature.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full mt-1.5 accent-accent h-1.5 rounded-full cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-white/25 mt-0.5">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </section>

                {/* Max Tokens */}
                <section>
                  <label className="settings-label">
                    Max Tokens
                    <span className="ml-auto text-white/40 font-mono text-xs">{maxTokens}</span>
                  </label>
                  <input
                    type="range"
                    min={256}
                    max={8192}
                    step={256}
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    className="w-full mt-1.5 accent-accent h-1.5 rounded-full cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-white/25 mt-0.5">
                    <span>Short</span>
                    <span>Long</span>
                  </div>
                </section>

                {/* Repeat Penalty (Ollama) */}
                {llmProvider === 'ollama' && (
                  <>
                    <section>
                      <label className="settings-label">
                        Repeat Penalty
                        <span className="ml-auto text-white/40 font-mono text-xs">{repeatPenalty.toFixed(2)}</span>
                      </label>
                      <input
                        type="range"
                        min={1.0}
                        max={2.0}
                        step={0.05}
                        value={repeatPenalty}
                        onChange={(e) => setRepeatPenalty(parseFloat(e.target.value))}
                        className="w-full mt-1.5 accent-accent h-1.5 rounded-full cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-white/25 mt-0.5">
                        <span>Off (1.0)</span>
                        <span>High (2.0)</span>
                      </div>
                    </section>

                    <section>
                      <label className="settings-label">
                        Frequency Penalty
                        <span className="ml-auto text-white/40 font-mono text-xs">{frequencyPenalty.toFixed(2)}</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1.0}
                        step={0.05}
                        value={frequencyPenalty}
                        onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value))}
                        className="w-full mt-1.5 accent-accent h-1.5 rounded-full cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-white/25 mt-0.5">
                        <span>Off (0)</span>
                        <span>High (1.0)</span>
                      </div>
                    </section>
                  </>
                )}

                {/* Context Messages */}
                <section>
                  <label className="settings-label">
                    Context Messages
                    <span className="ml-auto text-white/40 font-mono text-xs">{contextMessages}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={1}
                    value={contextMessages}
                    onChange={(e) => setContextMessages(parseInt(e.target.value))}
                    className="w-full mt-1.5 accent-accent h-1.5 rounded-full cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-white/25 mt-0.5">
                    <span>None (0)</span>
                    <span>Many (20)</span>
                  </div>
                </section>
              </div>

              {/* ── Blob Section ── */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider">Blob</h3>

                {/* Transparency */}
                <section>
                  <label className="settings-label">
                    Window Opacity
                    <span className="ml-auto text-white/40 font-mono text-xs">{Math.round(blobOpacity * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={blobOpacity}
                    onChange={(e) => setBlobOpacity(parseFloat(e.target.value))}
                    className="w-full mt-1.5 accent-accent h-1.5 rounded-full cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-white/25 mt-0.5">
                    <span>Ghost</span>
                    <span>Solid</span>
                  </div>
                </section>

                {/* Always on Top */}
                <section>
                  <label className="settings-label">Always on Top</label>
                  <button
                    type="button"
                    onClick={() => setAlwaysOnTop(!alwaysOnTop)}
                    className={`mt-1.5 w-full px-3 py-2 rounded-lg text-xs transition-colors ${
                      alwaysOnTop
                        ? 'bg-accent/30 text-white border border-accent/40'
                        : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                    }`}
                  >
                    {alwaysOnTop ? 'Enabled — blob stays above all windows' : 'Disabled — blob can go behind windows'}
                  </button>
                </section>
              </div>

              {/* ── Voice Section ── */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider">Voice</h3>

                {/* Voice Speaker */}
                <section>
                  <label className="settings-label">Speaker ID</label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {SPEAKER_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSpeakerId(id)}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                          speakerId === id
                            ? 'bg-accent text-white'
                            : 'bg-white/8 text-white/60 hover:bg-white/20'
                        }`}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-white/30 mt-1">CSM-1B speaker (0–9)</p>
                </section>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
