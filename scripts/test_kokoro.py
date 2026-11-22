"""Local CPU feasibility test; does not change the application's narrator."""
import json
import os
from pathlib import Path
import resource
import time
import wave

# Avoid excessive ONNX thread pools on shared hosts.
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")

import numpy as np
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "models" / "kokoro"
SCENE = """The road home. You stop beside a silent gas station as the last daylight fades.
Every pump is dark. Beyond the highway, a thin ribbon of smoke rises from a farmhouse.
Your water bottle is almost empty, and your family is still a hundred and ninety miles away.

A woman stands near the locked store, holding a flashlight that barely glows.
She says the bridge ahead is blocked by abandoned cars. There is a creek behind the station,
but she has not checked whether the water is safe. You look toward the farmhouse again.
Someone there might have clean water, or they might want to be left alone.

The wind carries the smell of rain. Your feet ache inside your boots, and you know you
cannot keep walking all night without resting. You still have a little food, a pocketknife,
and enough daylight to make one careful move. Before you leave, the woman asks whether
you have seen anyone coming from the east. You have not.

What do you do? Option one: Approach the farmhouse and ask for water.
Option two: Search behind the gas station for a safer place to rest.
Option three: Keep moving toward the blocked bridge. Choose when you are ready."""


def main():
    started = time.perf_counter()
    engine = Kokoro(str(ASSETS / "kokoro-v1.0.onnx"), str(ASSETS / "voices-v1.0.bin"))
    print(json.dumps({"model_load_seconds": round(time.perf_counter() - started, 2)}), flush=True)
    for label, text, voice in [
        ("female_sample", "Welcome to Grid Down. Take a breath. The road home begins here.", "af_heart"),
        ("male_sample", "Welcome to Grid Down. Take a breath. The road home begins here.", "am_michael"),
        ("full_scene", SCENE, "af_heart"),
    ]:
        started = time.perf_counter()
        audio, rate = engine.create(text, voice=voice, speed=0.95, lang="en-us")
        elapsed = time.perf_counter() - started
        assert rate == 24000 and audio.size > 0
        assert np.isfinite(audio).all() and np.max(np.abs(audio)) > 0.001
        pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
        destination = ASSETS / f"{label}.wav"
        with wave.open(str(destination), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(rate)
            output.writeframes(pcm)
        with wave.open(str(destination), "rb") as check:
            assert check.getnframes() == len(audio)
        print(json.dumps({"test": label, "voice": voice, "words": len(text.split()),
            "generation_seconds": round(elapsed, 2), "audio_seconds": round(len(audio) / rate, 2),
            "wav_bytes": destination.stat().st_size,
            "peak_process_memory_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)}), flush=True)


if __name__ == "__main__":
    main()
