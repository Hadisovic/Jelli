#!/usr/bin/env python3
"""Generate test audio with CSM and save as WAV file."""

import json
import sys
import struct
import wave

SAMPLE_RATE = 24000

def generate_and_save(text: str, speaker_id: int, output_path: str):
    try:
        import torch
        from csm.generator import load_csm_1b, generate
    except ImportError as e:
        print(f"Error: CSM not installed. {e}", file=sys.stderr)
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Loading CSM-1B on {device}...", file=sys.stderr)
    sys.stderr.flush()

    model = load_csm_1b(device=device)
    model.eval()

    print(f"Generating audio for: {text}", file=sys.stderr)
    sys.stderr.flush()

    audio_tensor = generate(
        model,
        text=text,
        speaker=speaker_id,
        context=[],
        max_audio_length_ms=30_000,
    )

    if isinstance(audio_tensor, torch.Tensor):
        audio_tensor = audio_tensor.cpu().float().numpy()

    # Convert float32 [-1,1] to int16
    audio_int16 = (audio_tensor * 32767).astype("<i2")

    with wave.open(output_path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio_int16.tobytes())

    duration = len(audio_tensor) / SAMPLE_RATE
    print(f"Saved {output_path} ({len(audio_tensor)} samples, {duration:.1f}s)", file=sys.stderr)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate CSM test audio")
    parser.add_argument("text", nargs="?", default="Hello, this is a test of the Sesame voice system.")
    parser.add_argument("--speaker", type=int, default=0)
    parser.add_argument("--output", "-o", default="test.wav")
    args = parser.parse_args()

    generate_and_save(args.text, args.speaker, args.output)
