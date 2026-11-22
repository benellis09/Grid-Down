import { useCallback, useEffect, useRef, useState } from "react";
import { pickVoice } from "@/lib/voice";
import type { VoiceGender } from "@/types";

const ENABLED_KEY = "grid-down:read-aloud";
const VOICE_KEY = "grid-down:read-aloud-voice";

function readStoredGender(): VoiceGender {
  return localStorage.getItem(VOICE_KEY) === "male" ? "male" : "female";
}

function splitSentences(text: string): string[] {
  const pieces = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [];
  return pieces.flatMap((piece) => piece.trim().match(/.{1,180}(?:\s|$)|\S{1,180}/g) ?? [])
    .map((piece) => piece.trim()).filter(Boolean);
}

export function useReadAloud() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [enabled, setEnabled] = useState<boolean>(
    () => supported && localStorage.getItem(ENABLED_KEY) === "1"
  );
  const [gender, setGender] = useState<VoiceGender>(readStoredGender);
  const [paused, setPaused] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const genderRef = useRef<VoiceGender>(gender);
  const utterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const speechRunRef = useRef(0);
  const startupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (startupTimer.current !== null) clearTimeout(startupTimer.current);
    startupTimer.current = null;
  }, []);

  const stop = useCallback(() => {
    speechRunRef.current += 1;
    clearTimer();
    if (supported) window.speechSynthesis.cancel();
    utterancesRef.current = [];
    setPaused(false);
    setSpeaking(false);
  }, [supported, clearTimer]);

  useEffect(() => {
    genderRef.current = gender;
    localStorage.setItem(VOICE_KEY, gender);
  }, [gender]);

  useEffect(() => {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  }, [enabled]);

  useEffect(() => {
    if (supported) window.speechSynthesis.getVoices();
    return stop;
  }, [supported, stop]);

  const pause = useCallback(() => {
    if (!supported || !window.speechSynthesis.speaking) return;
    window.speechSynthesis.pause();
    setPaused(true);
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, [supported]);

  const isNarrating = useCallback(() => {
    return supported && window.speechSynthesis.speaking && !window.speechSynthesis.paused;
  }, [supported]);

  const speak = useCallback((text: string) => {
    stop();
    setError(null);
    if (!supported) return;
    const synth = window.speechSynthesis;
    const runId = speechRunRef.current;
    synth.resume();
    const voice = pickVoice(synth.getVoices(), genderRef.current);
    const queue = splitSentences(text).map((piece) => {
      const utterance = new SpeechSynthesisUtterance(piece);
      utterance.lang = voice?.lang ?? "en-US";
      if (voice) utterance.voice = voice;
      utterance.rate = 0.9;
      utterance.pitch = genderRef.current === "male" ? 0.9 : 1.05;
      return utterance;
    });
    utterancesRef.current = queue;

    const fail = (message: string) => {
      if (runId !== speechRunRef.current) return;
      stop();
      setError(message);
    };
    const speakNext = (index: number) => {
      if (runId !== speechRunRef.current) return;
      clearTimer();
      if (index >= queue.length) {
        utterancesRef.current = [];
        setSpeaking(false);
        return;
      }
      const utterance = queue[index];
      // Only show Playing once Chrome confirms that speech has actually started.
      utterance.onstart = () => {
        if (runId !== speechRunRef.current) return;
        clearTimer();
        setSpeaking(true);
      };
      utterance.onend = () => speakNext(index + 1);
      utterance.onerror = (event) => {
        fail(event.error === "not-allowed"
          ? "Chrome blocked narration. Open the app in its own tab, then press Play. Check that site sound is allowed."
          : `Narration failed (${event.error}). Try the other voice and press Play. Check your device's English speech voices.`);
      };
      startupTimer.current = setTimeout(() => {
        fail("Chrome did not start the voice. Open the app in its own tab, allow site sound, then press Play. Try the other voice if needed.");
      }, 8000);
      try {
        synth.speak(utterance);
      } catch {
        fail("The browser could not start narration. Reload the page and press Play again.");
      }
    };
    speakNext(0);
  }, [supported, stop, clearTimer]);

  return { supported, enabled, setEnabled, gender, setGender, speak, stop, speaking, paused, pause, resume, isNarrating, error };
}
