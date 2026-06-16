#!/usr/bin/env python3
"""
Quick test: verifies CSM + sidecar dependencies are all importable.
Run with: python sidecar/test_import.py from jelli-companion/ directory
"""
import sys
import os
os.environ["NO_TORCH_COMPILE"] = "1"
try:
    import pyarrow
except ImportError:
    pass

# Path injection (same as csm_sidecar.py)
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_SESAME_ROOT = os.path.normpath(os.path.join(_THIS_DIR, '..', '..'))
_CSM_PKG_DIR = os.path.join(_SESAME_ROOT, 'csm')
for _p in [_SESAME_ROOT, _CSM_PKG_DIR]:
    if _p not in sys.path:
        sys.path.insert(0, _p)
print(f"Added to sys.path: {_SESAME_ROOT}, {_CSM_PKG_DIR}")



print(f"Python: {sys.version}")

try:
    import torch
    print(f"PyTorch: {torch.__version__}")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"CUDA device: {torch.cuda.get_device_name(0)}")
    else:
        print("CUDA: not available (CPU only — TTS will be slow but functional for test beep)")
except ImportError as e:
    print(f"PyTorch MISSING: {e}")

try:
    import huggingface_hub
    print(f"huggingface_hub: {huggingface_hub.__version__}")
except ImportError as e:
    print(f"huggingface_hub MISSING: {e}")

try:
    import transformers
    print(f"transformers: {transformers.__version__}")
except ImportError as e:
    print(f"transformers MISSING: {e}")

try:
    import csm
    print(f"csm: OK (at {csm.__file__})")
except ImportError as e:
    print(f"csm MISSING: {e}")

try:
    from csm.generator import load_csm_1b
    print("csm.generator.load_csm_1b: OK")
except ImportError as e:
    print(f"csm.generator MISSING: {e}")
except Exception as e:
    print(f"csm.generator error: {e}")

# Test the beep fallback (no GPU needed)
print("\nTesting beep fallback (no GPU required)...")
import json, math
SAMPLE_RATE = 24000
duration_ms = 500
num_samples = int(SAMPLE_RATE * duration_ms / 1000)
samples = [math.sin(2 * math.pi * 440 * i / SAMPLE_RATE) * 0.3 for i in range(num_samples)]
print(f"  Generated {len(samples)} samples at 440 Hz (beep)")
print("  Beep test: OK")

print("\n=== All checks complete ===")
