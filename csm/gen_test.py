#!/usr/bin/env python3
"""Generate test audio with CSM and save as WAV file.
Run this from the csm/ directory."""

import os
import sys
import torch
import torchaudio

os.environ["NO_TORCH_COMPILE"] = "1"

from generator import load_csm_1b


def generate_and_save(text: str, speaker_id: int, output_path: str):
    device = "cuda" if torch.cuda.is_available() else "cpu"
    sys.stderr.write(f"Loading CSM-1B on {device}...\n")
    sys.stderr.flush()

    generator = load_csm_1b(device)

    sys.stderr.write(f"Generating audio for: {text}\n")
    sys.stderr.flush()

    audio = generator.generate(
        text=text,
        speaker=speaker_id,
        context=[],
        max_audio_length_ms=30_000,
    )

    if isinstance(audio, torch.Tensor):
        audio = audio.cpu().float()

    # Use torchaudio.save to correctly format and write the WAV file
    torchaudio.save(output_path, audio.unsqueeze(0), generator.sample_rate)

    duration = len(audio) / generator.sample_rate
    sys.stderr.write(f"Saved {output_path} ({len(audio)} samples, {duration:.1f}s)\n")
    sys.stderr.flush()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("text", nargs="?", default="Hello, this is a test of the Sesame voice system.")
    parser.add_argument("--speaker", type=int, default=0)
    parser.add_argument("--output", "-o", default="test.wav")
    args = parser.parse_args()
    generate_and_save(args.text, args.speaker, args.output)
