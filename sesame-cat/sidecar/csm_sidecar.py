#!/usr/bin/env python3
"""
CSM TTS Sidecar — JSONL IPC over stdin/stdout.

Protocol:
  Input (stdin)  — JSONL: {"type":"tts"|"heartbeat", ...}
  Output (stdout) — JSONL: {"type":"pong"|"audio"|"audio_done"|"error", ...}

Audio chunks are 24 kHz mono PCM float32 arrays.
"""

import json
import sys
import os
os.environ["NO_TORCH_COMPILE"] = "1"
import traceback
from typing import Optional

# ── Path injection: ensure the csm package is findable ───────────────────────
# The csm editable install uses a custom finder that doesn't always work.
# We inject the parent directory of csm/ (for `import csm`) AND the csm/
# directory itself (for csm/generator.py's `from models import Model` sibling import).
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_SESAME_ROOT = os.path.normpath(os.path.join(_THIS_DIR, '..', '..'))  # C:\Files\Sesame
_CSM_PKG_DIR = os.path.join(_SESAME_ROOT, 'csm')                      # C:\Files\Sesame\csm

for _p in [_SESAME_ROOT, _CSM_PKG_DIR]:
    if _p not in sys.path:
        sys.path.insert(0, _p)



# ── Pre-import pyarrow to avoid DLL conflict with CUDA torch ─────────────────
# pyarrow 24.x has a Windows DLL conflict when loaded AFTER CUDA initializes.
# Loading it first at process startup avoids the access violation.
try:
    import pyarrow  # noqa: F401 — side effect import only
except Exception:
    pass  # If pyarrow isn't installed, that's fine — CSM doesn't need it directly

SAMPLE_RATE = 24000

CHUNK_DURATION_MS = 200  # 200ms chunks = ~200ms latency
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)

# ── CSM loader (lazy, model is big) ────────────────────────────────────────

_generator = None  # cached Generator instance

_CSM_AVAILABLE = None  # None=unknown, True=available, False=unavailable


def _check_csm_available() -> bool:
    """Check if CSM can be imported (does NOT load the model)."""
    global _CSM_AVAILABLE
    if _CSM_AVAILABLE is not None:
        return _CSM_AVAILABLE
    try:
        from csm.generator import load_csm_1b  # noqa: F401
        _CSM_AVAILABLE = True
    except (ImportError, Exception):
        _CSM_AVAILABLE = False
    return _CSM_AVAILABLE


def load_csm(quantization: str = "fp16"):
    """Load CSM-1B Generator. Returns Generator instance or raises."""
    global _generator
    if _generator is not None:
        return _generator

    import torch
    from csm.generator import load_csm_1b

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[sidecar] Loading CSM-1B on {device} (quantization={quantization})...", file=sys.stderr)
    sys.stderr.flush()

    # load_csm_1b returns a Generator (not Model directly)
    generator = load_csm_1b(device=device)

    print("[sidecar] CSM-1B loaded successfully", file=sys.stderr)
    sys.stderr.flush()

    _generator = generator
    return generator


def generate_audio(text: str, speaker_id: int, request_id: str):
    """Generate PCM audio chunks from text. Yields lists of float32 samples."""
    if not _check_csm_available():
        # CSM not installed — generate a beep as a test signal
        print(f"[sidecar] CSM not available, using beep fallback for request {request_id}", file=sys.stderr)
        sys.stderr.flush()
        yield _generate_test_beep(text)
        return

    try:
        import torch
        generator = load_csm()

        # generator.generate(text, speaker, context, max_audio_length_ms) → torch.Tensor (1D audio)
        audio_tensor = generator.generate(
            text=text,
            speaker=speaker_id,
            context=[],           # no prior audio context
            max_audio_length_ms=30_000,
        )

        if isinstance(audio_tensor, torch.Tensor):
            audio_np = audio_tensor.cpu().float().numpy()
        else:
            audio_np = audio_tensor

        # Chunk and yield
        for start in range(0, len(audio_np), CHUNK_SIZE):
            chunk = audio_np[start:start + CHUNK_SIZE]
            yield chunk.tolist()

    except Exception as e:
        print(f"[sidecar] CSM generate error: {e}", file=sys.stderr)
        sys.stderr.flush()
        raise


def _generate_test_beep(text: str):
    """Generate a simple test tone when CSM is not available."""
    import math
    duration_ms = min(1000 + len(text) * 50, 5000)
    num_samples = int(SAMPLE_RATE * duration_ms / 1000)
    samples = []
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        # 440Hz tone with envelope
        envelope = max(0, 1 - (i / num_samples) * 0.5)
        samples.append(math.sin(2 * math.pi * 440 * t) * 0.3 * envelope)
    return samples


# ── IPC Loop ───────────────────────────────────────────────────────────────

def send(obj: dict):
    """Write a JSON line to stdout and flush."""
    line = json.dumps(obj, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def handle_tts(text: str, speaker_id: int, request_id: str, quantization: Optional[str]):
    """Generate TTS audio and stream chunks to stdout as JSONL."""
    # Warm up CSM if available (first call triggers model load, which is slow)
    # generate_audio() handles fallback to beep automatically if CSM is unavailable

    try:
        for chunk in generate_audio(text, speaker_id, request_id):
            send({
                "type": "audio",
                "pcm_data": chunk,
                "sample_rate": SAMPLE_RATE,
                "request_id": request_id,
            })
    except Exception as e:
        send({"type": "error", "message": str(e), "request_id": request_id})
        return

    send({"type": "audio_done", "request_id": request_id})



def main():
    # Signal readiness via both stderr (human-readable) and stdout (machine-readable)
    print("[sidecar] Started, waiting for commands...", file=sys.stderr)
    sys.stderr.flush()
    send({"type": "ready", "version": "1.0"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"[sidecar] Invalid JSON: {e}", file=sys.stderr)
            sys.stderr.flush()
            continue

        msg_type = msg.get("type")

        if msg_type == "heartbeat":
            send({"type": "pong"})

        elif msg_type == "tts":
            text = msg.get("text", "")
            speaker_id = msg.get("speaker_id", 0)
            request_id = msg.get("request_id", "unknown")
            quantization = msg.get("quantization")

            if not text:
                send({"type": "error", "message": "empty text", "request_id": request_id})
                continue

            print(f"[sidecar] TTS request {request_id}: speaker={speaker_id}, "
                  f"text={text[:60]}{'...' if len(text) > 60 else ''}",
                  file=sys.stderr)
            sys.stderr.flush()

            try:
                handle_tts(text, speaker_id, request_id, quantization)
            except Exception as e:
                print(f"[sidecar] TTS error: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                sys.stderr.flush()
                send({"type": "error", "message": str(e), "request_id": request_id})

        else:
            print(f"[sidecar] Unknown message type: {msg_type}", file=sys.stderr)
            sys.stderr.flush()


if __name__ == "__main__":
    main()
