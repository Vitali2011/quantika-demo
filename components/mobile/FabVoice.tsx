'use client';

import React, { useCallback, useRef, useState } from 'react';
import { haptic } from '@/lib/mobile/haptics';

export type FabVoiceState = 'idle' | 'recording' | 'uploading' | 'done';

export interface FabVoiceProps {
  /** Override the transcribe endpoint (defaults to /api/voice/transcribe). */
  transcribeUrl?: string;
  /** Override the intake endpoint (defaults to /api/intake/email). */
  intakeUrl?: string;
  /** Test seam — replace MediaRecorder factory. */
  recorderFactory?: (stream: MediaStream) => MediaRecorderLike;
  /** Test seam — replace getUserMedia. */
  getUserMedia?: () => Promise<MediaStream>;
  /** Test seam — replace fetch. */
  fetchImpl?: typeof fetch;
  onStateChange?: (state: FabVoiceState) => void;
}

export interface MediaRecorderLike {
  start: () => void;
  stop: () => void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  state?: string;
}

/**
 * Floating action button: tap to start/stop voice recording → Whisper transcribe →
 * forward to the intake pipeline.
 *
 * State machine: idle → recording → uploading → done → idle.
 */
export function FabVoice({
  transcribeUrl = '/api/voice/transcribe',
  intakeUrl = '/api/intake/email',
  recorderFactory,
  getUserMedia,
  fetchImpl,
  onStateChange,
}: FabVoiceProps = {}) {
  const [state, setState] = useState<FabVoiceState>('idle');
  const recorderRef = useRef<MediaRecorderLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const transition = useCallback(
    (next: FabVoiceState) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  const handleStop = useCallback(async () => {
    transition('uploading');
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const f = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    if (!f) {
      transition('idle');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voice.webm');
      const tr = await f(transcribeUrl, { method: 'POST', body: fd });
      const trJson = (await tr.json().catch(() => null)) as { text?: string } | null;
      const text = trJson?.text ?? '';
      if (text) {
        await f(intakeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'voice', body: text }),
        });
      }
      haptic('success');
      transition('done');
      setTimeout(() => transition('idle'), 1500);
    } catch {
      haptic('error');
      transition('idle');
    }
  }, [transition, fetchImpl, transcribeUrl, intakeUrl]);

  const onPress = useCallback(async () => {
    if (state === 'recording') {
      recorderRef.current?.stop();
      return;
    }
    if (state !== 'idle') return;

    haptic('tap');
    try {
      const gum =
        getUserMedia ??
        (() =>
          (
            navigator.mediaDevices as
              | { getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream> }
              | undefined
          )?.getUserMedia({ audio: true }) ?? Promise.reject(new Error('no mic')));
      const stream = await gum();
      const factory =
        recorderFactory ??
        ((s: MediaStream) => new (window as unknown as { MediaRecorder: new (s: MediaStream) => MediaRecorderLike }).MediaRecorder(s));
      const rec = factory(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && (e.data as Blob).size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        void handleStop();
      };
      recorderRef.current = rec;
      rec.start();
      transition('recording');
    } catch {
      haptic('error');
      transition('idle');
    }
  }, [state, getUserMedia, recorderFactory, transition, handleStop]);

  const label =
    state === 'recording'
      ? 'Stop recording'
      : state === 'uploading'
        ? 'Uploading…'
        : state === 'done'
          ? 'Done'
          : 'Start voice intake';

  return (
    <button
      type="button"
      data-testid="fab-voice"
      data-state={state}
      aria-label={label}
      onClick={onPress}
      className={`fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white ${
        state === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-blue-600'
      }`}
      style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 40 }}
    >
      <span aria-hidden style={{ fontSize: 24 }}>
        {state === 'recording' ? '■' : state === 'uploading' ? '…' : state === 'done' ? '✓' : '🎤'}
      </span>
    </button>
  );
}

export default FabVoice;
