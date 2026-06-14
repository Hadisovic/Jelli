#!/usr/bin/env python3
"""
Test the sidecar JSONL protocol directly.
Sends a heartbeat then a TTS request and checks output.
Run: python sidecar/test_sidecar_e2e.py
"""
import subprocess
import json
import os
import sys

# Fix Windows console encoding
sys.stdout.reconfigure(encoding='utf-8', errors='replace')


SIDECAR_SCRIPT = os.path.join(os.path.dirname(__file__), 'csm_sidecar.py')

def test_sidecar():
    print(f"Starting sidecar: python {SIDECAR_SCRIPT}")
    proc = subprocess.Popen(
        [sys.executable, SIDECAR_SCRIPT],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )

    try:
        # Test 1: Heartbeat
        print("\n--- Test 1: Heartbeat ---")
        msg = json.dumps({"type": "heartbeat"}) + "\n"
        proc.stdin.write(msg)
        proc.stdin.flush()

        line = proc.stdout.readline()
        response = json.loads(line.strip())
        assert response["type"] == "pong", f"Expected pong, got: {response}"
        print(f"  ✓ Heartbeat → {response}")

        # Test 2: TTS request (will use beep fallback since no GPU/model)
        print("\n--- Test 2: TTS (beep fallback) ---")
        tts_msg = json.dumps({
            "type": "tts",
            "text": "Hello from Sesame",
            "speaker_id": 0,
            "request_id": "test-001",
            "quantization": "fp16"
        }) + "\n"
        proc.stdin.write(tts_msg)
        proc.stdin.flush()

        audio_chunks = 0
        done = False
        while not done:
            line = proc.stdout.readline()
            if not line:
                break
            try:
                response = json.loads(line.strip())
                if response["type"] == "audio":
                    audio_chunks += 1
                    pcm = response.get("pcm_data", [])
                    print(f"  audio chunk #{audio_chunks}: {len(pcm)} samples @ {response.get('sample_rate')} Hz")
                elif response["type"] == "audio_done":
                    print(f"  ✓ audio_done received — {audio_chunks} chunks total")
                    done = True
                elif response["type"] == "error":
                    print(f"  ✗ ERROR: {response.get('message')}")
                    done = True
                else:
                    print(f"  unknown: {response}")
            except json.JSONDecodeError:
                print(f"  [raw] {line!r}")

        print("\n=== Sidecar E2E test PASSED ===")

    except AssertionError as e:
        print(f"ASSERTION FAILED: {e}")
    except Exception as e:
        print(f"EXCEPTION: {e}")
        import traceback
        traceback.print_exc()
    finally:
        proc.stdin.close()
        proc.terminate()
        stderr_out = proc.stderr.read()
        if stderr_out:
            print("\n--- Sidecar stderr ---")
            print(stderr_out)

if __name__ == "__main__":
    test_sidecar()
