import { useEffect } from 'react'
import { BlobCanvas } from '@/components/BlobCanvas'
import { ChatWidget } from '@/components/ChatWidget'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { startSidecar, stopSidecar, onLlmToken, onLlmDone, onLlmError, onAudioChunk, onAudioDone, onSidecarStatus } from '@/lib/api'
import { audioPlayer } from '@/lib/audio'

function App() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault()
        const expanded = useConfigStore.getState().expanded
        useConfigStore.getState().setExpanded(!expanded)
      }
      if (e.key === 'Escape') {
        useConfigStore.getState().setExpanded(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-start sidecar on mount (guard against HMR respawn)
  useEffect(() => {
    // Module-level flag survives HMR, preventing orphan processes
    if ((window as unknown as Record<string, unknown>)['__sidecarStarted']) return
    ;(window as unknown as Record<string, unknown>)['__sidecarStarted'] = true

    const init = async () => {
      try {
        await startSidecar('python', ['sidecar/csm_sidecar.py'])
      } catch (e) {
        console.warn('[sidecar] Failed to start (CSM not installed yet):', e)
      }
    }
    init()
    return () => {
      ;(window as unknown as Record<string, unknown>)['__sidecarStarted'] = false
      stopSidecar().catch(() => {})
    }
  }, [])


  useEffect(() => {
    const unlisteners: (() => void)[] = []

    onLlmToken(({ request_id, token }) => {
      const msgId = useChatStore.getState().getMessageIdForRequest(request_id)
      if (msgId) {
        useChatStore.getState().appendToMessage(msgId, token)
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    onLlmDone(({ request_id }) => {
      const msgId = useChatStore.getState().getMessageIdForRequest(request_id)
      if (msgId) {
        useChatStore.getState().updateMessage(msgId, { status: 'done' })
        useChatStore.getState().setProcessing(false)
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    onLlmError(({ request_id, message }) => {
      const msgId = useChatStore.getState().getMessageIdForRequest(request_id)
      if (msgId) {
        useChatStore.getState().updateMessage(msgId, {
          text: `Error: ${message}`,
          status: 'done',
        })
        useChatStore.getState().setProcessing(false)
      }
    }).then((unlisten) => unlisteners.push(unlisten))

    onAudioChunk(({ pcm_base64 }) => {
      audioPlayer.enqueueChunk(pcm_base64)
    }).then((unlisten) => unlisteners.push(unlisten))

    onAudioDone(() => {
      // Audio playback continues from queue; no action needed
    }).then((unlisten) => unlisteners.push(unlisten))

    onSidecarStatus(({ status, message }) => {
      console.log(`[sidecar] ${status}${message ? `: ${message}` : ''}`)
    }).then((unlisten) => unlisteners.push(unlisten))

    return () => {
      unlisteners.forEach((fn) => fn())
    }
  }, [])

  return (
    <>
      <BlobCanvas />
      <ChatWidget />
    </>
  )
}

export default App
