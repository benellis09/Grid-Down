import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient

import narration
import routes


class FakeEngine:
    def __init__(self):
        self.calls = []

    def create(self, text, *, voice, speed, lang):
        self.calls.append((text, voice, speed, lang))
        return np.array([0.0, 0.5, -0.5], dtype=np.float32), 24000


class NarrationServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.assets = Path(self.temp.name)
        (self.assets / "kokoro-v1.0.onnx").write_bytes(b"test model")
        (self.assets / "voices-v1.0.bin").write_bytes(b"test voices")
        self.engine = FakeEngine()
        self.service = narration.NarrationService(
            assets_dir=self.assets,
            engine_factory=lambda _model, _voices: self.engine,
        )

    def tearDown(self):
        self.temp.cleanup()

    def test_builds_wav_uses_voice_and_caches_same_text(self):
        first = self.service.synthesize("A quiet road.", "female")
        second = self.service.synthesize("A quiet road.", "female")
        self.assertEqual(first, second)
        self.assertEqual(len(self.engine.calls), 1)
        self.assertEqual(self.engine.calls[0], ("A quiet road.", "af_heart", 0.95, "en-us"))
        with wave.open(__import__("io").BytesIO(first), "rb") as wav:
            self.assertEqual(wav.getnchannels(), 1)
            self.assertEqual(wav.getframerate(), 24000)
            self.assertEqual(wav.getnframes(), 3)

    def test_cache_is_bounded_and_evicts_oldest_item(self):
        self.service.cache_max_bytes = 50
        first = self.service.synthesize("first", "female")
        self.service.synthesize("second", "male")
        self.assertEqual(self.service._cache_bytes, len(first))
        self.assertNotIn(("first", "female"), self.service._cache)
        self.assertIn(("second", "male"), self.service._cache)

    def test_busy_inference_is_rejected(self):
        self.assertTrue(self.service._inference.acquire(blocking=False))
        try:
            with self.assertRaises(narration.NarrationBusy):
                self.service.synthesize("Different request", "male")
        finally:
            self.service._inference.release()

    def test_missing_assets_download_failure_is_friendly(self):
        missing = narration.NarrationService(
            assets_dir=self.assets / "missing",
            engine_factory=lambda *_: self.engine,
        )
        with patch.object(narration, "ASSET_URLS", {name: "https://invalid.example/" + name for name in narration.ASSET_URLS}):
            with self.assertRaises(narration.NarrationUnavailable):
                missing.synthesize("Hello", "female")


class NarrationEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        assets = Path(self.temp.name)
        (assets / "kokoro-v1.0.onnx").write_bytes(b"test model")
        (assets / "voices-v1.0.bin").write_bytes(b"test voices")
        self.previous_narrator = routes.narration.narrator
        routes.narration.narrator = narration.NarrationService(
            assets_dir=assets,
            engine_factory=lambda *_: FakeEngine(),
        )
        with patch.object(routes.db, "init_db"):
            self.client = TestClient(routes.create_app(self.temp.name))

    def tearDown(self):
        self.client.close()
        routes.narration.narrator = self.previous_narrator
        self.temp.cleanup()

    def test_endpoint_returns_audio_wav_and_validation_errors(self):
        response = self.client.post("/api/narration", json={"text": "Welcome home.", "gender": "female"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/wav")
        with wave.open(__import__("io").BytesIO(response.content), "rb") as wav:
            self.assertEqual(wav.getframerate(), 24000)
            self.assertEqual(wav.getnframes(), 3)

        for payload in (
            {"text": "", "gender": "female"},
            {"text": "hello", "gender": "other"},
            {"text": "x" * 6001, "gender": "male"},
        ):
            self.assertEqual(self.client.post("/api/narration", json=payload).status_code, 422)

    def test_endpoint_maps_busy_and_unavailable_to_safe_503(self):
        routes.narration.narrator._inference.acquire(blocking=False)
        try:
            response = self.client.post("/api/narration", json={"text": "Hello", "gender": "male"})
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("secret detail", response.text)
        finally:
            routes.narration.narrator._inference.release()

        routes.narration.narrator.engine_factory = lambda *_: (_ for _ in ()).throw(RuntimeError("secret detail"))
        response = self.client.post("/api/narration", json={"text": "Hello", "gender": "male"})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("secret detail", response.text)


if __name__ == "__main__":
    unittest.main()
