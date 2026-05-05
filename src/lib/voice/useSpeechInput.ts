/**
 * Web Speech API — speech-to-text hook.
 *
 * Wraps the browser SpeechRecognition API (or webkitSpeechRecognition on
 * Safari/older Chrome) so the rest of the app never sees the raw API.
 *
 * The hook returns interim transcripts in real-time so the UI can show what
 * is being heard, and calls `onFinal` once the recognition session ends with
 * the best transcript.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API type stubs (not universally available in all TS DOM libs)

interface SpeechRecognitionErrorEventStub extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEventStub extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionStub extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart:   ((ev: Event) => void) | null;
  onend:     ((ev: Event) => void) | null;
  onresult:  ((ev: SpeechRecognitionEventStub) => void) | null;
  onerror:   ((ev: SpeechRecognitionErrorEventStub) => void) | null;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognitionStub;
}

// Augment window for both standard and webkit-prefixed variant
declare global {
  interface Window {
    SpeechRecognition?:       SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface SpeechInputState {
  transcript: string;   // live / running transcript (interim + final)
  listening:  boolean;
  supported:  boolean;
  error:      string | null;
}

export function useSpeechInput(onFinal: (text: string) => void) {
  const [state, setState] = useState<SpeechInputState>({
    transcript: '',
    listening:  false,
    supported:  false,
    error:      null,
  });

  const recognitionRef = useRef<SpeechRecognitionStub | null>(null);
  const onFinalRef     = useRef(onFinal);
  const mounted        = useRef(true);

  // Keep the callback ref current without re-registering the recognition handler
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  useEffect(() => {
    mounted.current = true;
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (SR) setState((s) => ({ ...s, supported: true }));
    return () => {
      mounted.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    if (mounted.current) setState((s) => ({ ...s, listening: false }));
  }, []);

  const start = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    // Abort any existing session
    recognitionRef.current?.abort();

    const rec = new SR();
    rec.lang             = 'en-US';
    rec.continuous       = false;   // stop after natural pause
    rec.interimResults   = true;    // show live transcript
    rec.maxAlternatives  = 1;
    recognitionRef.current = rec;

    // startGuard declared here so both onstart and beginRecognition share it.
    let startGuard: ReturnType<typeof setTimeout>;

    rec.onstart = () => {
      clearTimeout(startGuard);
      if (mounted.current) setState({ transcript: '', listening: true, supported: true, error: null });
    };

    rec.onresult = (e: SpeechRecognitionEventStub) => {
      let interim = '';
      let final   = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final   += r[0].transcript;
        else           interim += r[0].transcript;
      }
      const combined = (final + interim).trim();
      if (mounted.current) setState((s) => ({ ...s, transcript: combined }));
    };

    rec.onend = () => {
      if (!mounted.current) return;
      // Grab the current transcript from state via functional update
      setState((s) => {
        if (s.transcript.trim()) onFinalRef.current(s.transcript.trim());
        return { ...s, listening: false };
      });
    };

    rec.onerror = (e: SpeechRecognitionErrorEventStub) => {
      if (!mounted.current) return;
      // 'no-speech' is normal — don't show it as an error
      const msg = e.error === 'no-speech' ? null : `Microphone error: ${e.error}`;
      setState((s) => ({ ...s, listening: false, error: msg }));
    };

    // Starts the recognition session + arms the safety-net guard.
    const beginRecognition = () => {
      // Guard: if onstart never fires the browser silently blocked us.
      // 30 s gives plenty of time for a user to read a permission dialog.
      startGuard = setTimeout(() => {
        setState((s) => {
          if (s.listening) return s;
          return { ...s, error: 'Microphone error: not-allowed' };
        });
      }, 30_000);
      rec.start();
    };

    // ── Prime mic permission via getUserMedia first ────────────────────────
    // SpeechRecognition.start() can silently fail with 'not-allowed' on
    // Chrome/macOS when the browser has never been added to the macOS
    // Microphone list.  Calling getUserMedia first triggers the full
    // Chrome → macOS permission dialog chain, adds Chrome to the list, and
    // then hands off to SpeechRecognition which works immediately.
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          // Stop all tracks straight away — we only needed the permission grant.
          stream.getTracks().forEach((t) => t.stop());
          beginRecognition();
        })
        .catch(() => {
          // getUserMedia itself was denied — beginRecognition anyway so
          // onerror fires and the UI surfaces a helpful message.
          beginRecognition();
        });
    } else {
      beginRecognition();
    }
  }, []);

  const reset = useCallback(() => {
    setState((s) => ({ ...s, transcript: '', error: null }));
  }, []);

  return { ...state, start, stop, reset };
}
