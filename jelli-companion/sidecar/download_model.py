#!/usr/bin/env python3
"""
Pre-download CSM model weights from HuggingFace.
Run AFTER installing CUDA torch:
  python sidecar/download_model.py

Models needed:
  - sesame/csm-1b  (~4.15 GB, gated - requires HF auth)
  - moshi mimi weights (auto-downloaded by moshi loader)
  - meta-llama/Llama-3.2-1B tokenizer (gated - requires HF auth + accepted license)
"""
import sys
import os
os.environ["NO_TORCH_COMPILE"] = "1"
try:
    import pyarrow
except ImportError:
    pass

# Path injection
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_SESAME_ROOT = os.path.normpath(os.path.join(_THIS_DIR, '..', '..'))
_CSM_PKG_DIR = os.path.join(_SESAME_ROOT, 'csm')
for _p in [_SESAME_ROOT, _CSM_PKG_DIR]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Check CUDA
import torch
print(f"PyTorch: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"CUDA device: {torch.cuda.get_device_name(0)}")
    print(f"CUDA memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
else:
    print("WARNING: CUDA not available. CSM will run on CPU (very slow).")
    answer = input("Continue anyway? [y/N]: ")
    if answer.lower() != 'y':
        sys.exit(1)

print("\nStep 1: Download Llama-3.2-1B tokenizer (for CSM text encoding)...")
try:
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-3.2-1B")
    print("  OK: Llama-3.2-1B tokenizer downloaded")
except Exception as e:
    print(f"  FAILED: {e}")
    print("  Make sure you have accepted the Llama-3.2-1B license at:")
    print("  https://huggingface.co/meta-llama/Llama-3.2-1B")
    sys.exit(1)

print("\nStep 2: Download CSM-1B model (sesame/csm-1b)...")
print("  This is a ~4.15 GB download. Please wait...")
try:
    from csm.generator import load_csm_1b
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"  Loading on {device}...")
    generator = load_csm_1b(device=device)
    print(f"  OK: CSM-1B model loaded on {device}")
    print(f"  Sample rate: {generator.sample_rate} Hz")
except Exception as e:
    print(f"  FAILED: {e}")
    print("  Make sure you have accepted the CSM-1B license at:")
    print("  https://huggingface.co/sesame/csm-1b")
    sys.exit(1)

print("\nStep 3: Test generation (short phrase)...")
try:
    audio = generator.generate(
        text="Hello.",
        speaker=0,
        context=[],
        max_audio_length_ms=3000,
    )
    print(f"  OK: Generated {audio.shape[0]} samples ({audio.shape[0]/generator.sample_rate:.2f}s)")
    
    # Save to WAV for verification
    import torchaudio
    wav_path = os.path.join(_THIS_DIR, "_test_output.wav")
    torchaudio.save(wav_path, audio.unsqueeze(0).cpu(), generator.sample_rate)
    print(f"  Saved test audio to: {wav_path}")
except Exception as e:
    print(f"  FAILED: {e}")
    sys.exit(1)

print("\n=== CSM model ready! ===")
print("You can now use the sidecar with real CSM TTS voice.")
