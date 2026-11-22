"""On-demand, CPU-only Kokoro narration with serialized inference and a bounded cache."""

from __future__ import annotations

from collections import OrderedDict
import io
import os
from pathlib import Path
import tempfile
import threading
import wave

import httpx
import numpy as np


ASSETS_DIR = Path(__file__).resolve().parent / "models" / "kokoro"
ASSET_URLS = {
    "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}
ASSET_MAX_BYTES = {"kokoro-v1.0.onnx": 500 * 1024 * 1024, "voices-v1.0.bin": 100 * 1024 * 1024}
CACHE_MAX_BYTES = 32 * 1024 * 1024
VOICES = {"female": "af_heart", "male": "am_michael"}


class NarrationBusy(Exception):
    """A different request is already using the single Kokoro inference engine."""


class NarrationUnavailable(Exception):
    """The engine or model assets could not be prepared or used."""


class NarrationService:
    def __init__(self, assets_dir: Path = ASSETS_DIR, engine_factory=None, cache_max_bytes: int = CACHE_MAX_BYTES):
        self.assets_dir = Path(assets_dir)
        self.engine_factory = engine_factory or self._create_engine
        self.cache_max_bytes = cache_max_bytes
        self._engine = None
        self._inference = threading.BoundedSemaphore(1)
        self._cache_lock = threading.Lock()
        self._cache: OrderedDict[tuple[str, str], bytes] = OrderedDict()
        self._cache_bytes = 0

    @staticmethod
    def _create_engine(model_path: Path, voices_path: Path):
        # Avoid oversubscribing shared CPU hosts; initialize the ONNX runtime lazily.
        os.environ.setdefault("OMP_NUM_THREADS", "2")
        os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")
        from kokoro_onnx import Kokoro

        return Kokoro(str(model_path), str(voices_path))

    def _download_asset(self, filename: str) -> Path:
        destination = self.assets_dir / filename
        if destination.is_file() and destination.stat().st_size:
            return destination
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        temporary_path = None
        try:
            with httpx.stream(
                "GET",
                ASSET_URLS[filename],
                timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0),
                follow_redirects=True,
            ) as response:
                response.raise_for_status()
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > ASSET_MAX_BYTES[filename]:
                    raise ValueError("asset exceeds size limit")
                descriptor, temporary = tempfile.mkstemp(prefix=f".{filename}.", suffix=".tmp", dir=self.assets_dir)
                temporary_path = Path(temporary)
                total = 0
                with os.fdopen(descriptor, "wb") as output:
                    for chunk in response.iter_bytes():
                        total += len(chunk)
                        if total > ASSET_MAX_BYTES[filename]:
                            raise ValueError("asset exceeds size limit")
                        output.write(chunk)
                    output.flush()
                    os.fsync(output.fileno())
            if total == 0:
                raise ValueError("empty asset")
            os.replace(temporary_path, destination)
            return destination
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)

    def _get_engine(self):
        if self._engine is not None:
            return self._engine
        try:
            model_path = self._download_asset("kokoro-v1.0.onnx")
            voices_path = self._download_asset("voices-v1.0.bin")
            self._engine = self.engine_factory(model_path, voices_path)
            return self._engine
        except Exception as exc:
            raise NarrationUnavailable("Narration is temporarily unavailable") from exc

    @staticmethod
    def _wav_bytes(audio, sample_rate: int) -> bytes:
        samples = np.asarray(audio)
        if samples.size == 0 or sample_rate <= 0 or not np.isfinite(samples).all():
            raise ValueError("invalid audio generated")
        pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype("<i2").tobytes()
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(pcm)
        return output.getvalue()

    def synthesize(self, text: str, gender: str) -> bytes:
        key = (text, gender)
        with self._cache_lock:
            cached = self._cache.get(key)
            if cached is not None:
                self._cache.move_to_end(key)
                return cached

        if not self._inference.acquire(blocking=False):
            # A concurrent request may have populated this exact key since the first check.
            with self._cache_lock:
                cached = self._cache.get(key)
                if cached is not None:
                    self._cache.move_to_end(key)
                    return cached
            raise NarrationBusy("Narration is busy; try again shortly")

        try:
            with self._cache_lock:
                cached = self._cache.get(key)
                if cached is not None:
                    self._cache.move_to_end(key)
                    return cached
            try:
                engine = self._get_engine()
                audio, sample_rate = engine.create(text, voice=VOICES[gender], speed=0.95, lang="en-us")
                result = self._wav_bytes(audio, sample_rate)
            except NarrationUnavailable:
                raise
            except Exception as exc:
                raise NarrationUnavailable("Narration is temporarily unavailable") from exc

            if len(result) <= self.cache_max_bytes:
                with self._cache_lock:
                    while self._cache and self._cache_bytes + len(result) > self.cache_max_bytes:
                        _, evicted = self._cache.popitem(last=False)
                        self._cache_bytes -= len(evicted)
                    self._cache[key] = result
                    self._cache_bytes += len(result)
            return result
        finally:
            self._inference.release()


narrator = NarrationService()
