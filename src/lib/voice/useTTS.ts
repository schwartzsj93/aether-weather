/**
 * Text-to-Speech hook — ElevenLabs first, browser synthesis fallback.
 *
 * ElevenLabs path  (set VITE_ELEVENLABS_API_KEY):
 *   • Voice: "Daniel" — British English male, smooth and authoritative.
 *   • Stability 0.55 / similarity 0.85 for clear, Bond-like delivery.
 *   • Streams audio via Blob URL → <audio> element.
 *
 * Browser fallback  (always available):
 *   • Picks the best British male voice in priority order: Daniel (macOS),
 *     Google UK English Male (Chrome), Microsoft George (Windows), then
 *     any en-GB voice, then any en voice.
 *   • Rate 0.88, Pitch 0.82 — deliberate, low, Bond-ish.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ElevenLabs "Daniel" — calm, British English male
const EL_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9';
const EL_MODEL    = 'eleven_turbo_v2'; // fastest EL model, low latency

// Browser voice preference list (name substring match, en locale)
const PREFERRED_VOICES = [
  'Daniel',               // macOS / iOS — best option
  'Google UK English Male',
  'Microsoft George',
  'Oliver',               // macOS alternate
  'Arthur',               // macOS alternate
];

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  for (const name of PREFERRED_VOICES) {
    const v = voices.find((v) => v.name.includes(name) && v.lang.startsWith('en'));
    if (v) return v;
  }
  return voices.find((v) => v.lang === 'en-GB')
    ?? voices.find((v) => v.lang.startsWith('en'))
    ?? null;
}

export interface TTSState {
  speaking:       boolean;
  supported:      boolean;
  usingElevenLabs: boolean;
}

export function useTTS() {
  const elevenKey = (import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined)?.trim() ?? '';

  const [state, setState] = useState<TTSState>({
    speaking:        false,
    supported:       typeof window !== 'undefined' && 'speechSynthesis' in window,
    usingElevenLabs: !!elevenKey,
  });

  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const mounted    = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Chrome defers voice loading — trigger eagerly
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
    return () => {
      mounted.current = false;
      audioRef.current?.pause();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (mounted.current) setState((s) => ({ ...s, speaking: false }));
  }, []);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      if (!text.trim()) return;
      stop();
      if (mounted.current) setState((s) => ({ ...s, speaking: true }));

      // ── ElevenLabs ────────────────────────────────────────────────────────
      if (elevenKey) {
        try {
          const res = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE_ID}/stream`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key':   elevenKey,
              },
              body: JSON.stringify({
                text,
                model_id: EL_MODEL,
                voice_settings: {
                  stability:         0.55,
                  similarity_boost:  0.85,
                  style:             0.28,
                  use_speaker_boost: true,
                },
              }),
            },
          );

          if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);

          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;

          return new Promise<void>((resolve) => {
            audio.onended = () => {
              URL.revokeObjectURL(url);
              if (mounted.current) setState((s) => ({ ...s, speaking: false }));
              resolve();
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              if (mounted.current) setState((s) => ({ ...s, speaking: false }));
              resolve();
            };
            audio.play().catch(resolve);
          });
        } catch (err) {
          console.warn('[TTS] ElevenLabs unavailable, falling back to browser synthesis:', err);
          // fall through to browser synthesis below
        }
      }

      // ── Browser Speech Synthesis ──────────────────────────────────────────
      return new Promise<void>((resolve) => {
        if (!('speechSynthesis' in window)) {
          if (mounted.current) setState((s) => ({ ...s, speaking: false }));
          resolve();
          return;
        }

        const utt   = new SpeechSynthesisUtterance(text);
        const voice = pickVoice();
        if (voice) utt.voice = voice;

        utt.lang   = 'en-GB';
        utt.rate   = 0.88;   // deliberate, unhurried — Bond never rushes
        utt.pitch  = 0.82;   // authoritative low register
        utt.volume = 1;

        utt.onend = () => {
          if (mounted.current) setState((s) => ({ ...s, speaking: false }));
          resolve();
        };
        utt.onerror = () => {
          if (mounted.current) setState((s) => ({ ...s, speaking: false }));
          resolve();
        };

        // Chrome bug: speechSynthesis.speak() can silently fail if called
        // immediately after cancel(). A minimal delay fixes it.
        setTimeout(() => speechSynthesis.speak(utt), 50);
      });
    },
    [stop, elevenKey],
  );

  return { ...state, speak, stop };
}
