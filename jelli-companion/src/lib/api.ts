import { invoke } from '@tauri-apps/api/core'
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event'
import { getSystemPrompt, FEW_SHOT_MESSAGES } from './system-prompt'
import type { BlobExpression } from '@/stores/config'
import { formatMemoryContext } from './memory'
import { useMemoryStore } from '@/stores/memory'

export interface ChatMessage {
  role: string
  content: string
}

export interface ProviderConfig {
  provider: string
  model: string
  api_key?: string
  api_url?: string
  temperature?: number
  max_tokens?: number
  speaker_id?: number
  quantization?: string
  repeat_penalty?: number
  frequency_penalty?: number
  memory_context?: string
}

export interface LlmTokenPayload {
  request_id: string
  token: string
}

export interface LlmDonePayload {
  request_id: string
}

export interface LlmErrorPayload {
  request_id: string
  message: string
}

export interface AudioChunkPayload {
  request_id: string
  pcm_base64: string
  sample_rate: number
}

export interface AudioDonePayload {
  request_id: string
}

export interface SidecarStatusPayload {
  status: string
  message?: string
}

export type EventHandler<T> = (payload: T) => void

// ── LLM Commands ────────────────────────────────────────────────────────────

let requestCounter = 0
export function generateRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`
}

export async function sendChatMessage(
  requestId: string,
  messages: ChatMessage[],
  config: ProviderConfig,
  expression?: BlobExpression,
): Promise<void> {
  const systemMsg: ChatMessage = { role: 'system', content: getSystemPrompt(expression) }
  const augmented = [systemMsg, ...FEW_SHOT_MESSAGES, ...messages]
  const isGateway = config.provider === 'gateway'
  // Read memory directly from the store — immune to system-prompt text changes
  const memoryContext = isGateway
    ? (formatMemoryContext(useMemoryStore.getState().getMemoryState()) || undefined)
    : undefined
  await invoke('send_chat_message', {
    requestId,
    messages: isGateway ? messages : augmented,
    config: {
      provider: config.provider,
      model: config.model,
      api_key: config.api_key ?? null,
      api_url: config.api_url ?? null,
      temperature: config.temperature ?? null,
      max_tokens: config.max_tokens ?? null,
      speaker_id: config.speaker_id ?? null,
      quantization: config.quantization ?? null,
      repeat_penalty: config.repeat_penalty ?? null,
      frequency_penalty: config.frequency_penalty ?? null,
      memory_context: memoryContext ?? null,
    },
  })
}

export async function stopGeneration(requestId: string): Promise<void> {
  await invoke('stop_generation', { requestId })
}

// ── Sidecar Commands ────────────────────────────────────────────────────────

export async function startSidecar(path: string, args: string[] = []): Promise<void> {
  await invoke('start_sidecar', { path, args })
}

export async function checkSidecarHealth(): Promise<boolean> {
  return await invoke('check_sidecar_health')
}

export async function stopSidecar(): Promise<void> {
  await invoke('stop_sidecar')
}

export async function sendTts(requestId: string, text: string, speakerId: number, quantization: string = 'fp16'): Promise<void> {
  await invoke('send_tts', { requestId, text, speakerId, quantization })
}

// ── Window Commands ────────────────────────────────────────────────────────

export async function getWindowPosition(): Promise<{ x: number; y: number }> {
  const [x, y] = await invoke<[number, number]>('get_window_position')
  return { x, y }
}

export async function setWindowPosition(x: number, y: number): Promise<void> {
  await invoke('set_window_position', { x, y })
}

export async function resizeWindow(width: number, height: number): Promise<void> {
  await invoke('resize_window', { width, height })
}

export async function setWindowGeometry(x: number, y: number, width: number, height: number): Promise<void> {
  await invoke('set_window_geometry', { x, y, width, height })
}

export async function getScreenSize(): Promise<{ width: number; height: number }> {
  const [width, height] = await invoke<[number, number]>('get_screen_size')
  return { width, height }
}

export async function getScreenInfo(): Promise<{ x: number; y: number; width: number; height: number }> {
  const [[x, y], [width, height]] = await invoke<[[number, number], [number, number]]>('get_screen_info')
  return { x, y, width, height }
}

export async function showChatWindow(x: number, y: number): Promise<void> {
  await invoke('show_chat_window', { x, y })
}

export async function getCursorPosition(): Promise<{ x: number; y: number }> {
  const [x, y] = await invoke<[number, number]>('get_cursor_position')
  return { x, y }
}

export async function hideChatWindow(): Promise<void> {
  await invoke('hide_chat_window')
}

export async function setChatWindowPosition(x: number, y: number): Promise<void> {
  await invoke('set_chat_window_position', { x, y })
}

export async function getWindowLabel(): Promise<string> {
  return await invoke<string>('get_window_label')
}

// ── Settings Persistence ─────────────────────────────────────────────────────

export async function saveSettings(settings: Record<string, unknown>): Promise<void> {
  await invoke('save_settings', { settings })
}

export async function loadSettings(): Promise<Record<string, unknown>> {
  return await invoke<Record<string, unknown>>('load_settings')
}

export async function saveProviderApiKey(provider: string, apiKey: string): Promise<void> {
  await invoke('set_provider_api_key', { provider, apiKey })
}

export async function loadProviderApiKey(provider: string): Promise<string | null> {
  return await invoke<string | null>('get_provider_api_key', { provider })
}

export interface LlmClearPayload {
  request_id: string
}

// ── Event Listeners ─────────────────────────────────────────────────────────

export function onLlmToken(handler: EventHandler<LlmTokenPayload>): Promise<UnlistenFn> {
  return listen<LlmTokenPayload>('llm:token', (e) => handler(e.payload))
}

export function onLlmDone(handler: EventHandler<LlmDonePayload>): Promise<UnlistenFn> {
  return listen<LlmDonePayload>('llm:done', (e) => handler(e.payload))
}

export function onLlmClear(handler: EventHandler<LlmClearPayload>): Promise<UnlistenFn> {
  return listen<LlmClearPayload>('llm:clear', (e) => handler(e.payload))
}

export function onLlmError(handler: EventHandler<LlmErrorPayload>): Promise<UnlistenFn> {
  return listen<LlmErrorPayload>('llm:error', (e) => handler(e.payload))
}

export function onAudioChunk(handler: EventHandler<AudioChunkPayload>): Promise<UnlistenFn> {
  return listen<AudioChunkPayload>('audio:chunk', (e) => handler(e.payload))
}

export function onAudioDone(handler: EventHandler<AudioDonePayload>): Promise<UnlistenFn> {
  return listen<AudioDonePayload>('audio:done', (e) => handler(e.payload))
}

export function onSidecarStatus(handler: EventHandler<SidecarStatusPayload>): Promise<UnlistenFn> {
  return listen<SidecarStatusPayload>('sidecar:status', (e) => handler(e.payload))
}

// ── User Typing Events ──────────────────────────────────────────────────────

export function emitUserTyping(): Promise<void> {
  return emit('user:typing')
}

export function emitUserIdle(): Promise<void> {
  return emit('user:idle')
}

export function onUserTyping(handler: () => void): Promise<UnlistenFn> {
  return listen('user:typing', () => handler())
}

export function onUserIdle(handler: () => void): Promise<UnlistenFn> {
  return listen('user:idle', () => handler())
}

// ── Expression Sync Events (cross-window) ───────────────────────────────────

export function emitExpressionChanged(expression: string): Promise<void> {
  return emit('expression:changed', { expression })
}

export function onExpressionChanged(handler: (expression: string) => void): Promise<UnlistenFn> {
  return listen<{ expression: string }>('expression:changed', (e) => handler(e.payload.expression))
}

// ── Open Settings Events ───────────────────────────────────────────────────

export function emitOpenSettings(): Promise<void> {
  return emit('ui:open-settings')
}

export function onOpenSettings(handler: () => void): Promise<UnlistenFn> {
  return listen('ui:open-settings', () => handler())
}

// ── Chat Window Visibility Events ───────────────────────────────────────────

export function emitShowChatWindow(): Promise<void> {
  return emit('ui:show-chat-window')
}

export function onShowChatWindow(handler: () => void): Promise<UnlistenFn> {
  return listen('ui:show-chat-window', () => handler())
}

export function emitHideChatWindow(): Promise<void> {
  return emit('ui:hide-chat-window')
}

export function onHideChatWindow(handler: () => void): Promise<UnlistenFn> {
  return listen('ui:hide-chat-window', () => handler())
}
