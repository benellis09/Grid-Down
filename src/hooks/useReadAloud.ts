import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceGender } from "@/types";

const ENABLED_KEY = "grid-down:read-aloud";
const VOICE_KEY = "grid-down:read-aloud-voice";

export function useReadAloud() {
  const supported = typeof window !== "undefined" && "Audio" in window;
  const [enabled, setEnabled] = useState(() => supported && localStorage.getItem(ENABLED_KEY) === "1");
  const [gender, setGender] = useState<VoiceGender>(() => localStorage.getItem(VOICE_KEY) === "male" ? "male" : "female");
  const [paused, setPaused] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const runRef = useRef(0);
  const preparingRef = useRef(false);
  const genderRef = useRef(gender);
  const urlRef = useRef<string | null>(null);
  const cacheRef = useRef<{ key: string; blob: Blob } | null>(null);

  useEffect(() => {
    genderRef.current = gender;
    localStorage.setItem(VOICE_KEY, gender);
  }, [gender]);
  useEffect(() => { localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0"); }, [enabled]);

  const stop = useCallback(() => {
    runRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onplaying = audio.onpause = audio.onended = audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    preparingRef.current = false;
    setPreparing(false);
    setSpeaking(false);
    setPaused(false);
    setError(null);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
  }, []);

  const pause = useCallback(() => {
    if (preparingRef.current) { stop(); return; }
    audioRef.current?.pause();
  }, [stop]);

  const resume = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.getAttribute("src")) return;
    const run = runRef.current;
    void audio.play().then(() => {
      if (run === runRef.current) setError(null);
    }).catch(() => {
      if (run === runRef.current) setError("Playback was blocked. Open the app in its own tab and press Play again.");
    });
  }, []);

  useEffect(() => {
    if (!supported) return;
    audioRef.current = new Audio();
    if ("mediaSession" in navigator) {
      for (const [action, handler] of [["play", resume], ["pause", pause], ["stop", stop]] as const) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Optional browser support. */ }
      }
    }
    return () => {
      stop();
      audioRef.current = null;
      if ("mediaSession" in navigator) {
        for (const action of ["play", "pause", "stop"] as const) {
          try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Optional browser support. */ }
        }
      }
    };
  }, [supported, stop, pause, resume]);

  const isNarrating = useCallback(() => preparingRef.current || Boolean(audioRef.current && !audioRef.current.paused && !audioRef.current.ended), []);

  const speak = useCallback((text: string) => {
    stop();
    const audio = audioRef.current;
    if (!supported || !audio) return;
    const run = runRef.current;
    const controller = new AbortController();
    requestRef.current = controller;
    preparingRef.current = true;
    setPreparing(true);
    const key = `${genderRef.current}:${text}`;
    const timer = setTimeout(() => controller.abort(), 300_000);
    void (async () => {
      try {
        let blob = cacheRef.current?.key === key ? cacheRef.current.blob : null;
        if (!blob) {
          let response: Response;
          // A cancelled browser request cannot interrupt CPU synthesis already running.
          // Wait for that work to finish (including StrictMode's mount replay), rather than lose the new scene.
          while (true) {
            response = await fetch("/api/narration", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text, gender: key.slice(0, key.indexOf(":")) }), signal: controller.signal,
            });
            if (response.status !== 503 || !response.headers.has("Retry-After")) break;
            await response.body?.cancel();
            await new Promise<void>((resolve, reject) => {
              if (controller.signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
              const abort = () => { clearTimeout(wait); reject(new DOMException("Aborted", "AbortError")); };
              const wait = setTimeout(() => { controller.signal.removeEventListener("abort", abort); resolve(); }, 2000);
              controller.signal.addEventListener("abort", abort, { once: true });
            });
          }
          if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(typeof body.detail === "string" ? body.detail : "Could not prepare narration. Try again shortly.");
          }
          blob = await response.blob();
          if (!blob.type.startsWith("audio/") || blob.size === 0) throw new Error("The narrator returned invalid audio. Please try again.");
        }
        if (run !== runRef.current) return;
        cacheRef.current = { key, blob };
        urlRef.current = URL.createObjectURL(blob);
        audio.src = urlRef.current;
        audio.onplaying = () => {
          if (run !== runRef.current) return;
          setSpeaking(true); setPaused(false); setError(null);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
        };
        audio.onpause = () => {
          if (run !== runRef.current || audio.ended) return;
          setSpeaking(false); setPaused(true);
          if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
        };
        audio.onended = () => {
          if (run !== runRef.current) return;
          stop(); // Do not advance the story: wait for a choice.
        };
        audio.onerror = () => {
          if (run !== runRef.current) return;
          stop(); setError("This browser could not play the narration. Please press Play to retry.");
        };
        if ("mediaSession" in navigator && "MediaMetadata" in window) {
          navigator.mediaSession.metadata = new MediaMetadata({ title: "Grid Down", artist: "American English narrator", album: "The road home" });
        }
        preparingRef.current = false;
        setPreparing(false);
        try { await audio.play(); }
        catch {
          if (run !== runRef.current) return;
          setPaused(true);
          setError("Narration is ready. Press Play to start audio, then you can lock your screen.");
        }
      } catch (err) {
        if (run !== runRef.current) return;
        stop();
        setError(controller.signal.aborted ? "Narration preparation took too long. Please try again." : err instanceof Error ? err.message : "Could not prepare narration.");
      } finally {
        clearTimeout(timer);
        if (run === runRef.current) requestRef.current = null;
      }
    })();
  }, [supported, stop]);

  return { supported, enabled, setEnabled, gender, setGender, speak, stop, speaking, paused, preparing, pause, resume, isNarrating, error };
}
