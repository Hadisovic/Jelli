// Cybernetic Static SFX Engine — Preloaded WAV Assets
// Sourced from Vector robot firmware
// Layered over TTS via parallel GainNode — never blocks or interrupts speech.

import { useConfigStore } from '@/stores/config'

import clickWav from '@/assets/sfx/click.wav'
import wakeWav from '@/assets/sfx/wake.wav'
import sadWav from '@/assets/sfx/sad.wav'
import dizzyWav from '@/assets/sfx/dizzy.wav'

let audioCtx: AudioContext | null = null
let sfxGain: GainNode | null = null

let clickBuffer: AudioBuffer | null = null
let wakeBuffer: AudioBuffer | null = null
let sadBuffer: AudioBuffer | null = null
let dizzyBuffer: AudioBuffer | null = null

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext({ sampleRate: 44100 })
    console.log('[SFX] AudioContext initialized. State:', audioCtx.state)
  }
  return audioCtx
}

function getGain(): GainNode {
  if (!sfxGain) {
    const ctx = getCtx()
    sfxGain = ctx.createGain()
    const config = useConfigStore.getState()
    sfxGain.gain.value = config.sfxMuted ? 0 : config.sfxVolume
    sfxGain.connect(ctx.destination)
    console.log('[SFX] Master GainNode initialized. Volume:', sfxGain.gain.value)
  }
  return sfxGain
}

function now(): number {
  return getCtx().currentTime
}

function getVolume(): number {
  const config = useConfigStore.getState()
  return config.sfxMuted ? 0 : config.sfxVolume
}

// ── Debounce tracker ──────────────────────────────────────────
const lastPlayed = new Map<string, number>()
function debounced(key: string, ms: number): boolean {
  const t = performance.now()
  const last = lastPlayed.get(key) ?? 0
  if (t - last < ms) return true
  lastPlayed.set(key, t)
  return false
}

// ── Audio Preloading and Decoding ─────────────────────────────
export async function loadSounds(): Promise<void> {
  console.log('[SFX] Starting preloading of sound assets...')
  const ctx = getCtx()

  async function loadSound(url: string, name: string): Promise<AudioBuffer> {
    console.log(`[SFX] Fetching asset: ${name} from URL: ${url}`)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch ${name} from ${url} (status: ${response.status} ${response.statusText})`)
    }
    const arrayBuffer = await response.arrayBuffer()
    
    // Fallback/callback based decodeAudioData for absolute webview compatibility
    return new Promise((resolve, reject) => {
      ctx.decodeAudioData(
        arrayBuffer,
        (buffer) => {
          console.log(`[SFX] Decoded asset "${name}" successfully. Duration: ${buffer.duration.toFixed(3)}s`)
          resolve(buffer)
        },
        (err) => {
          console.error(`[SFX] Error decoding asset "${name}":`, err)
          reject(err || new Error(`Unknown decoding error for ${name}`))
        }
      )
    })
  }

  // Load each sound individually so a single failure doesn't block the rest
  loadSound(clickWav, 'click')
    .then((buf) => { clickBuffer = buf })
    .catch((err) => console.error('[SFX] Failed to load "click" sound:', err))

  loadSound(wakeWav, 'wake')
    .then((buf) => { wakeBuffer = buf })
    .catch((err) => console.error('[SFX] Failed to load "wake" sound:', err))

  loadSound(sadWav, 'sad')
    .then((buf) => { sadBuffer = buf })
    .catch((err) => console.error('[SFX] Failed to load "sad" sound:', err))

  loadSound(dizzyWav, 'dizzy')
    .then((buf) => { dizzyBuffer = buf })
    .catch((err) => console.error('[SFX] Failed to load "dizzy" sound:', err))
}

// Helper to play a preloaded buffer
function playBuffer(buffer: AudioBuffer | null, name: string, relativeVolume: number): void {
  if (!buffer) {
    console.warn(`[SFX] Playback requested for "${name}", but the sound buffer is not preloaded yet (or failed to load).`)
    return
  }
  const ctx = getCtx()

  const trigger = () => {
    const t = now()
    const vol = getVolume()
    console.log(`[SFX] Playing sound "${name}". Config volume: ${vol}, relative volume: ${relativeVolume}`)
    if (vol === 0) {
      console.log(`[SFX] Playback for "${name}" skipped because SFX volume is muted/0.`)
      return
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer

    const dedicatedGain = ctx.createGain()
    dedicatedGain.gain.value = vol * relativeVolume

    source.connect(dedicatedGain)
    dedicatedGain.connect(getGain())
    source.start(t)
  }

  // Explicitly resume on user interaction to handle autoplay restrictions
  if (ctx.state === 'suspended') {
    console.log('[SFX] AudioContext is suspended. Attempting to resume on user interaction...')
    ctx.resume()
      .then(() => {
        console.log('[SFX] AudioContext resumed successfully.')
        trigger()
      })
      .catch((err) => {
        console.error('[SFX] Failed to resume AudioContext:', err)
      })
  } else {
    trigger()
  }
}

// ═══════════════════════════════════════════════════════════════
// Triggers
// ═══════════════════════════════════════════════════════════════

export function playClick(): void {
  if (debounced('click', 150)) return
  playBuffer(clickBuffer, 'click', 0.3)
}

export function playWake(): void {
  if (debounced('wake', 200)) return
  playBuffer(wakeBuffer, 'wake', 0.25)
}

export function playSuccess(): void {
  playWake()
}

export function playSad(): void {
  if (debounced('sad', 200)) return
  playBuffer(sadBuffer, 'sad', 0.3)
}

export function playError(): void {
  playSad()
}

export function playDizzy(): void {
  if (debounced('dizzy', 200)) return
  playBuffer(dizzyBuffer, 'dizzy', 0.25)
}

// ═══════════════════════════════════════════════════════════════
// Volume Control
// ═══════════════════════════════════════════════════════════════

export function setSfxVolume(value: number): void {
  const masterGain = getGain()
  masterGain.gain.value = value
  console.log('[SFX] Master volume set to:', value)
}

export function setSfxMuted(muted: boolean): void {
  const masterGain = getGain()
  const vol = muted ? 0 : useConfigStore.getState().sfxVolume
  masterGain.gain.value = vol
  console.log('[SFX] Master muted state set to:', muted, 'gain:', vol)
}
