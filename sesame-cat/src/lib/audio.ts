export class AudioPlayer {
  private ctx: AudioContext | null = null
  private sampleRate: number = 24000
  private queue: Float32Array[] = []
  private playing = false
  private source: AudioBufferSourceNode | null = null
  private gain: GainNode | null = null

  private getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: this.sampleRate })
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  enqueueChunk(pcmBase64: string): void {
    const bytes = this.base64ToBytes(pcmBase64)
    const samples = new Float32Array(bytes.byteLength / 4)
    const view = new DataView(bytes)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getFloat32(i * 4, true)
    }
    this.queue.push(samples)
    if (!this.playing) {
      this.playNext()
    }
  }

  private async playNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.playing = false
      return
    }
    this.playing = true
    const samples = this.queue.shift()!
    const ctx = this.getContext()
    const buffer = ctx.createBuffer(1, samples.length, this.sampleRate)
    buffer.getChannelData(0).set(samples)

    this.source = ctx.createBufferSource()
    this.source.buffer = buffer
    this.gain = ctx.createGain()
    this.gain.gain.value = 1.0
    this.source.connect(this.gain)
    this.gain.connect(ctx.destination)
    this.source.start()
    this.source.onended = () => this.playNext()
  }

  stop(): void {
    this.source?.stop()
    this.source?.disconnect()
    this.source = null
    this.queue = []
    this.playing = false
  }

  clear(): void {
    this.queue = []
    this.playing = false
  }

  private base64ToBytes(base64: string): ArrayBuffer {
    const binaryStr = atob(base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return bytes.buffer
  }
}

export const audioPlayer = new AudioPlayer()
