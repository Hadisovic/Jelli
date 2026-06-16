#!/usr/bin/env python3
"""Test path-based csm import"""
import sys
sys.path.insert(0, 'c:/Files/Sesame')
try:
    import csm
    print(f"csm via path: OK ({csm.__file__})")
    from csm.generator import load_csm_1b
    print("csm.generator.load_csm_1b: OK")
except Exception as e:
    print(f"FAILED: {e}")
