import { useCallback, useEffect, useRef, useState } from "react";

const ENABLED_KEY = "grid-down:voice-input";

// Minimal typings for the Web Speech recognition API, which lib.dom does not ship.
interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResultLike };
}
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const FATAL_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone permission was blocked.",
  "service-not-allowed": "Speech recognition is not allowed in this browser.",
  "audio-capture": "No microphone was found.",
  "language-not-supported": "English speech recognition is not available.",
};

// Continuous listening while enabled. Each final transcript is passed to onTranscript.
export function useVoiceInput(onTranscript: (text: string) => void) {
  const supported = getRecognitionCtor() !== null;

  const [enabled, setEnabledState] = useState<boolean>(
    () => supported && localStorage.getItem(ENABLED_KEY) === "1"
  );
  const [listening, setListening] = useState(false);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keeps the latest callback without restarting the recognizer on every render.
  const callbackRef = useRef(onTranscript);
  useEffect(() => {
    callbackRef.current = onTranscript;
  }, [onTranscript]);

  const setEnabled = useCallback((value: boolean) => {
    setError(null);
    localStorage.setItem(ENABLED_KEY, value ? "1" : "0");
    setEnabledState(value);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    let active = true;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const text = result[0].transcript;
        setLastHeard(text.trim());
        callbackRef.current(text);
      }
    };

    recognition.onerror = (event) => {
      const fatal = FATAL_ERRORS[event.error];
      if (!fatal) return; // no-speech, aborted and network blips recover on their own via onend
      active = false;
      localStorage.setItem(ENABLED_KEY, "0");
      setEnabledState(false);
      setError(fatal);
    };

    // Browsers end a continuous session after silence, so restart it while the toggle is on.
    recognition.onend = () => {
      setListening(false);
      if (!active) return;
      try {
        recognition.start();
      } catch {
        // Already restarting; the next onend will try again.
      }
    };

    try {
      recognition.start();
    } catch {
      active = false;
      setError("Voice input could not start.");
    }

    return () => {
      active = false;
      recognition.onend = null;
      recognition.abort();
      setListening(false);
    };
  }, [enabled]);

  return { supported, enabled, setEnabled, listening, lastHeard, error };
}
