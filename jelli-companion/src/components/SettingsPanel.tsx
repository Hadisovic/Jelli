import { useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useConfigStore } from '@/stores/config'
import type { LLMProvider } from '@/stores/config'

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

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const speakerId = useConfigStore((s) => s.speakerId)
  const setSpeakerId = useConfigStore((s) => s.setSpeakerId)
  const llmProvider = useConfigStore((s) => s.llmProvider)
  const setLlmProvider = useConfigStore((s) => s.setLlmProvider)
  const llmModel = useConfigStore((s) => s.llmModel)
  const setLlmModel = useConfigStore((s) => s.setLlmModel)
  const apiKey = useConfigStore((s) => s.apiKey)
  const setApiKey = useConfigStore((s) => s.setApiKey)
  const ollamaUrl = useConfigStore((s) => s.ollamaUrl)
  const setOllamaUrl = useConfigStore((s) => s.setOllamaUrl)
  const temperature = useConfigStore((s) => s.temperature)
  const setTemperature = useConfigStore((s) => s.setTemperature)

  // Use refs for text inputs to avoid re-render-on-every-keystroke
  const modelRef = useRef<HTMLInputElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  const needsApiKey = llmProvider !== 'ollama'

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

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

              {/* Provider */}
              <section>
                <label className="settings-label">LLM Provider</label>
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
                    Use model names from <span className="font-mono text-white/40">ollama list</span>
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

              {/* Voice Speaker */}
              <section>
                <label className="settings-label">Voice (Speaker ID)</label>
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
