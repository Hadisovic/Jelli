import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

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
): Promise<void> {
  await invoke('send_chat_message', {
    requestId,
    messages,
    config: {
      provider: config.provider,
      model: config.model,
      api_key: config.api_key ?? null,
      api_url: config.api_url ?? null,
      temperature: config.temperature ?? null,
      max_tokens: config.max_tokens ?? null,
      speaker_id: config.speaker_id ?? null,
      quantization: config.quantization ?? null,
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

export async function setWindowGeometry(x: number, y: number, width: number, height: number): Promise<void> {
  await invoke('set_window_geometry', { x, y, width, height })
}

// ── Event Listeners ─────────────────────────────────────────────────────────

export function onLlmToken(handler: EventHandler<LlmTokenPayload>): Promise<UnlistenFn> {
  return listen<LlmTokenPayload>('llm:token', (e) => handler(e.payload))
}

export function onLlmDone(handler: EventHandler<LlmDonePayload>): Promise<UnlistenFn> {
  return listen<LlmDonePayload>('llm:done', (e) => handler(e.payload))
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
