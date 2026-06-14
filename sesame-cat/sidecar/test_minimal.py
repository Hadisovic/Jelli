import sys, os
try:
    import pyarrow
except ImportError:
    pass

sys.path.insert(0, r'C:\Files\Sesame')
sys.path.insert(0, r'C:\Files\Sesame\csm')

try:
    import torch
    print(f"torch: {torch.__version__}, CUDA: {torch.cuda.is_available()}")
except Exception as e:
    print(f"torch error: {e}")

try:
    from csm.generator import load_csm_1b
    print("csm.generator.load_csm_1b: OK")
except Exception as e:
    print(f"csm.generator error: {e}")
