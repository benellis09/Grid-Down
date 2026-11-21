import { useCallback, useEffect, useRef, useState } from "react";
import { pickVoice } from "@/lib/voice";
import type { VoiceGender } from "@/types";

const ENABLED_KEY = "grid-down:read-aloud";
const VOICE_KEY = "grid-down:read-aloud-voice";

function readStoredGender(): VoiceGender {
  return localStorage.getItem(VOICE_KEY) === "male" ? "male" : "female";
}

export function useReadAloud() {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const [enabled, setEnabled] = useState<boolean>(
    () => supported && localStorage.getItem(ENABLED_KEY) === "1"
  );
  const [gender, setGender] = useState<VoiceGender>(readStoredGender);
  const [paused, setPaused] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Refs keep speak() stable, so changing voice or loading voices does not re-read the scene.
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const genderRef = useRef<VoiceGender>(gender);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    genderRef.current = gender;
    localStorage.setItem(VOICE_KEY, gender);
  }, [gender]);

  useEffect(() => {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  }, [enabled]);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      voicesRef.current = synth.getVoices();
    };
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => {
      synth.removeEventListener("voiceschanged", loadVoices);
      synth.cancel();
    };
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setPaused(false);
    setSpeaking(false);
  }, [supported]);

  // Pausing only has an effect while a scene is actually being narrated.
  const pause = useCallback(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (!synth.speaking || synth.paused) return;
    synth.pause();
    setPaused(true);
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.resume();
    setPaused(false);
  }, [supported]);

  // True while the narrator is reading aloud (not paused). Choices made during this window are ignored.
  const isNarrating = useCallback(() => {
    if (!supported) return false;
    const synth = window.speechSynthesis;
    return synth.speaking && !synth.paused;
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      // A cancel while paused can leave the queue paused, so clear it before the next scene.
      synth.resume();
      setPaused(false);

      const currentGender = genderRef.current;
      const voice = pickVoice(voicesRef.current, currentGender);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang ?? "en-US";
      if (voice) utterance.voice = voice;
      utterance.rate = 0.9;
      utterance.pitch = currentGender === "male" ? 0.9 : 1.05;
      utterance.onend = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null;
          setSpeaking(false);
        }
      };
      utterance.onerror = () => {
        if (utteranceRef.current === utterance) {
          utteranceRef.current = null;
          setSpeaking(false);
        }
      };

      // Hold a reference so the browser does not garbage-collect the utterance mid-sentence.
      utteranceRef.current = utterance;
      setSpeaking(true);
      synth.speak(utterance);
    },
    [supported]
  );

  return { supported, enabled, setEnabled, gender, setGender, speak, stop, speaking, paused, pause, resume, isNarrating };
}
