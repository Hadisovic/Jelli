import React, { useRef, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useConfigStore } from '@/stores/config'
import type { LLMProvider } from '@/stores/config'
import { useMemoryStore } from '@/stores/memory'
import { saveSettings, loadSettings, saveProviderApiKey, loadProviderApiKey } from '@/lib/api'
import { setSfxVolume, setSfxMuted } from '@/lib/sfx'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

const SPEAKER_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const PROVIDERS: { value: LLMProvider; label: string; tag?: string; recommended?: boolean }[] = [
  { value: 'gateway', label: 'Gateway', tag: 'Recommended', recommended: true },
  { value: 'ollama', label: 'Ollama', tag: 'Local' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
]

type SettingsTab = 'llm' | 'blob' | 'voice'
const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'llm',
    label: 'Intelligence',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.5 4.5-3 6-1 1-2 2.5-2 4h-4c0-1.5-1-3-2-4-1.5-1.5-3-3.5-3-6a7 7 0 0 1 7-7z" />
        <path d="M9 21h6" />
        <path d="M12 18v-4" />
      </svg>
    ),
  },
  {
    id: 'blob',
    label: 'Appearance',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
  {
    id: 'voice',
    label: 'Voice',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
]

const PERSISTED_KEYS = [
  'llmProvider', 'llmModel', 'ollamaUrl',
  'temperature', 'maxTokens', 'contextMessages', 'speakerId',
  'quantization', 'blobOpacity', 'repeatPenalty', 'frequencyPenalty',
  'blobSize', 'alwaysOnTop', 'sfxVolume', 'sfxMuted',
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
  const sfxVolume = store((s) => s.sfxVolume)
  const setSfxVolumeState = store((s) => s.setSfxVolume)
  const sfxMuted = store((s) => s.sfxMuted)
  const setSfxMutedState = store((s) => s.setSfxMuted)

  const memoryStore = useMemoryStore
  const longTerm = memoryStore((s) => s.longTerm)
  const memoryInitialized = memoryStore((s) => s.initialized)
  const clearLongTerm = memoryStore((s) => s.clearLongTerm)

  const [activeTab, setActiveTab] = useState<SettingsTab>('llm')
  const [saved, setSaved] = useState(false)
  const [clearingMemory, setClearingMemory] = useState(false)

  const modelRef = useRef<HTMLInputElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<HTMLInputElement>(null)

  const needsApiKey = llmProvider !== 'ollama' && llmProvider !== 'gateway'
  const memoryFactCount = longTerm.facts.length +
    longTerm.projects.length +
    (longTerm.userProfile.name ? 1 : 0) +
    (longTerm.userProfile.nickname ? 1 : 0) +
    (longTerm.userProfile.age ? 1 : 0) +
    Object.keys(longTerm.preferences).length

  const handleSave = useCallback(async () => {
    const state = useConfigStore.getState()
    const toSave: Record<string, unknown> = {}
    for (const key of PERSISTED_KEYS) {
      toSave[key] = state[key]
    }
    if (state.llmProvider !== 'gateway' && state.llmProvider !== 'ollama' && state.apiKey) {
      await saveProviderApiKey(state.llmProvider, state.apiKey)
    }
    await saveSettings(toSave)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [])

  const handleLoad = useCallback(async () => {
    const data = await loadSettings()
    useConfigStore.getState().loadSettings(data as Record<string, unknown>)
    const provider = useConfigStore.getState().llmProvider
    const key = await loadProviderApiKey(provider)
    useConfigStore.getState().setApiKey(key ?? '')
  }, [])

  // Pre-fill API key from the OS vault whenever the panel opens or the provider changes
  React.useEffect(() => {
    if (!open) return
    if (llmProvider === 'gateway' || llmProvider === 'ollama') return
    loadProviderApiKey(llmProvider).then((key) => {
      if (key) useConfigStore.getState().setApiKey(key)
    }).catch(() => {})
  }, [open, llmProvider])

  const handleClearMemory = useCallback(async () => {
    setClearingMemory(true)
    await clearLongTerm()
    setTimeout(() => setClearingMemory(false), 800)
  }, [clearLongTerm])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex flex-col overflow-hidden"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Background */}
          <div className="absolute inset-0 settings-bg" />

          {/* Header */}
          <div className="relative flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="settings-icon-btn"
                aria-label="Close settings"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div>
                <h2 className="text-sm font-semibold text-white/85 leading-none">Jelli Settings</h2>
                <p className="text-[10px] text-white/30 mt-0.5">Configure your companion</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleLoad}
                className="settings-action-btn"
                title="Load saved settings"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleSave}
                className={`settings-action-btn ${saved ? 'settings-action-btn-active' : ''}`}
                title="Save settings to disk"
              >
                {saved ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="relative flex px-4 pb-0 flex-shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`settings-tab ${activeTab === tab.id ? 'settings-tab-active' : ''}`}
              >
                <span className="flex items-center gap-1.5">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-px mx-4 flex-shrink-0 bg-white/5" />

          {/* Content */}
          <div className="relative flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'llm' && (
                <motion.div
                  key="llm"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.18 }}
                  className="p-4 space-y-4"
                >
                  {/* Provider */}
                  <section className="settings-section">
                    <h3 className="settings-section-title">Provider</h3>
                    <div className="grid grid-cols-3 gap-1.5">
                      {PROVIDERS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setLlmProvider(p.value)}
                          className={`settings-provider ${llmProvider === p.value ? 'settings-provider-active' : ''}`}
                        >
                          {llmProvider === p.value && (
                            <span className="absolute top-1.5 right-1.5">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          )}
                          <span className="text-[11px] font-medium leading-tight">{p.label}</span>
                          {p.tag && (
                            <span className={`text-[8px] mt-0.5 ${p.recommended ? 'text-white/35' : 'text-white/20'}`}>{p.tag}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* Gateway Info */}
                  {llmProvider === 'gateway' && (
                    <section className="settings-section">
                      <h3 className="settings-section-title">Failover Chain</h3>
                      <div className="settings-card">
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="flex h-2 w-2 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          <span className="text-[11px] font-medium text-white/55">Active — queries routed securely</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded bg-white/8 text-white/50 font-mono font-medium">1</span>
                          <span className="text-white/45">Groq</span>
                          <span className="text-white/12 mx-0.5">→</span>
                          <span className="px-2 py-0.5 rounded bg-white/5 text-white/35 font-mono font-medium">2</span>
                          <span className="text-white/30">Mistral</span>
                          <span className="text-white/12 mx-0.5">→</span>
                          <span className="px-2 py-0.5 rounded bg-white/5 text-white/35 font-mono font-medium">3</span>
                          <span className="text-white/30">OpenRouter</span>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Model */}
                  {llmProvider !== 'gateway' && (
                    <section className="settings-section">
                      <h3 className="settings-section-title">Model</h3>
                      <div className="settings-card">
                        <label className="settings-label">Model Name</label>
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
                          <p className="text-[10px] text-white/25 mt-1.5">
                            Run <span className="font-mono text-white/35">ollama list</span> for available models
                          </p>
                        )}
                      </div>
                    </section>
                  )}

                  {/* API Key */}
                  {needsApiKey && (
                    <section className="settings-section">
                      <h3 className="settings-section-title">Credentials</h3>
                      <div className="settings-card">
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
                      </div>
                    </section>
                  )}

                  {/* Ollama URL */}
                  {llmProvider === 'ollama' && (
                    <section className="settings-section">
                      <h3 className="settings-section-title">Connection</h3>
                      <div className="settings-card">
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
                      </div>
                    </section>
                  )}

                  {/* Tuning */}
                  <section className="settings-section">
                    <h3 className="settings-section-title">Tuning</h3>
                    <div className="settings-card space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="settings-label">Temperature</label>
                          <span className="settings-value">{temperature.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.1}
                          value={temperature}
                          onChange={(e) => setTemperature(parseFloat(e.target.value))}
                          className="settings-slider"
                        />
                        <div className="settings-range-labels">
                          <span>Precise</span>
                          <span>Creative</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="settings-label">Max Tokens</label>
                          <span className="settings-value">{maxTokens}</span>
                        </div>
                        <input
                          type="range"
                          min={256}
                          max={8192}
                          step={256}
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                          className="settings-slider"
                        />
                        <div className="settings-range-labels">
                          <span>Short replies</span>
                          <span>Long replies</span>
                        </div>
                      </div>

                      {llmProvider === 'ollama' && (
                        <>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="settings-label">Repeat Penalty</label>
                              <span className="settings-value">{repeatPenalty.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={1.0}
                              max={2.0}
                              step={0.05}
                              value={repeatPenalty}
                              onChange={(e) => setRepeatPenalty(parseFloat(e.target.value))}
                              className="settings-slider"
                            />
                            <div className="settings-range-labels">
                              <span>Off</span>
                              <span>High</span>
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="settings-label">Frequency Penalty</label>
                              <span className="settings-value">{frequencyPenalty.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1.0}
                              step={0.05}
                              value={frequencyPenalty}
                              onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value))}
                              className="settings-slider"
                            />
                            <div className="settings-range-labels">
                              <span>Off</span>
                              <span>High</span>
                            </div>
                          </div>
                        </>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="settings-label">Context Messages</label>
                          <span className="settings-value">{contextMessages}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={20}
                          step={1}
                          value={contextMessages}
                          onChange={(e) => setContextMessages(parseInt(e.target.value))}
                          className="settings-slider"
                        />
                        <div className="settings-range-labels">
                          <span>None</span>
                          <span>Many</span>
                        </div>
                        <p className="text-[9px] text-white/18 mt-1.5">How many previous messages to include as context</p>
                      </div>
                    </div>
                  </section>

                  {/* Memory */}
                  <section className="settings-section">
                    <h3 className="settings-section-title">Memory</h3>
                    <div className="settings-card">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 relative">
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${memoryInitialized ? 'bg-teal-400' : 'bg-white/20'}`} />
                          </span>
                          <span className="text-[11px] font-medium text-white/50">
                            {memoryInitialized ? 'Memory active' : 'Loading...'}
                          </span>
                        </div>
                        <span className="text-[10px] text-white/25 font-mono">{memoryFactCount} facts</span>
                      </div>
                      <p className="text-[10px] text-white/25 mb-3 leading-relaxed">
                        Jelli remembers facts about you across conversations. Stored locally on this device.
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled
                          className="settings-card-btn flex-1 opacity-40 cursor-not-allowed"
                          title="Coming soon"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          View Memory
                        </button>
                        <button
                          type="button"
                          onClick={handleClearMemory}
                          disabled={clearingMemory || memoryFactCount === 0}
                          className="settings-card-btn settings-card-btn-danger"
                        >
                          {clearingMemory ? (
                            <span className="animate-spin w-2.5 h-2.5 border border-current border-t-transparent rounded-full" />
                          ) : (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          )}
                          Clear
                        </button>
                      </div>
                    </div>
                  </section>
                </motion.div>
              )}

              {activeTab === 'blob' && (
                <motion.div
                  key="blob"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.18 }}
                  className="p-4 space-y-4"
                >
                  {/* Blob Preview */}
                  <section className="settings-section">
                    <h3 className="settings-section-title">Preview</h3>
                    <div className="settings-card flex flex-col items-center py-5">
                      <div className="blob-preview-ring">
                        <div className="blob-preview-core" />
                      </div>
                      <p className="text-[10px] text-white/25 mt-3">Current appearance</p>
                    </div>
                  </section>

                  {/* Opacity */}
                  <section className="settings-section">
                    <h3 className="settings-section-title">Window</h3>
                    <div className="settings-card">
                      <div className="flex items-center justify-between mb-1">
                        <label className="settings-label">Opacity</label>
                        <span className="settings-value">{Math.round(blobOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={1.0}
                        step={0.05}
                        value={blobOpacity}
                        onChange={(e) => setBlobOpacity(parseFloat(e.target.value))}
                        className="settings-slider"
                      />
                      <div className="settings-range-labels">
                        <span>Ghost</span>
                        <span>Solid</span>
                      </div>
                    </div>
                  </section>

                  {/* Always on Top */}
                  <section className="settings-section">
                    <div className="settings-card">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-medium text-white/50">Always on Top</span>
                          <p className="text-[9px] text-white/20 mt-0.5">
                            {alwaysOnTop ? 'Stays above all windows' : 'Can go behind windows'}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={alwaysOnTop}
                          onClick={() => setAlwaysOnTop(!alwaysOnTop)}
                          className={`settings-toggle ${alwaysOnTop ? 'settings-toggle-on' : ''}`}
                        >
                          <motion.div
                            className="settings-toggle-thumb"
                            animate={{ x: alwaysOnTop ? 20 : 2 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          />
                        </button>
                      </div>
                    </div>
                  </section>
                </motion.div>
              )}

              {activeTab === 'voice' && (
                <motion.div
                  key="voice"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.18 }}
                  className="p-4 space-y-4"
                >
                  {/* Speaker ID */}
                  <section className="settings-section">
                    <h3 className="settings-section-title">Voice</h3>
                    <div className="settings-card">
                      <p className="text-[10px] text-white/30 mb-3">
                        Choose a voice for TTS output
                      </p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {SPEAKER_IDS.map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setSpeakerId(id)}
                            className={`settings-provider justify-center !py-2.5 ${speakerId === id ? 'settings-provider-active' : ''}`}
                          >
                            {speakerId === id && (
                              <span className="absolute top-1 right-1">
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                            )}
                            <span className="text-[11px] font-medium">{id}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Sound Effects */}
                  <section className="settings-section">
                    <h3 className="settings-section-title">Sound Effects</h3>
                    <div className="settings-card space-y-4">
                      {/* Volume */}
                      <div>
                        <label className="settings-label">
                          SFX Volume
                          <span className="ml-auto text-white/40 font-mono text-xs">{Math.round(sfxVolume * 100)}%</span>
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={sfxVolume}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            setSfxVolumeState(v)
                            if (!sfxMuted) setSfxVolume(v)
                          }}
                          className="w-full mt-1.5 accent-accent h-1.5 rounded-full cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-white/25 mt-0.5">
                          <span>Mute</span>
                          <span>Loud</span>
                        </div>
                      </div>

                      {/* Mute Toggle */}
                      <div>
                        <label className="settings-label">Mute All SFX</label>
                        <button
                          type="button"
                          onClick={() => {
                            const newMuted = !sfxMuted
                            setSfxMutedState(newMuted)
                            setSfxMuted(newMuted)
                          }}
                          className={`mt-1.5 w-full px-3 py-2 rounded-lg text-xs transition-colors ${
                            sfxMuted
                              ? 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
                              : 'bg-accent/30 text-white border border-accent/40'
                          }`}
                        >
                          {sfxMuted ? 'Muted — no sounds will play' : 'Active — sounds play on interactions'}
                        </button>
                      </div>
                    </div>
                  </section>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
